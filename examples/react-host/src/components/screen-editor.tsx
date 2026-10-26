import {
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  type BaseScreenDesignerElement,
} from '@base-screen/sdk/designer';
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';
import {
  createHostAssetLibrary,
  HOST_ASSET_LIBRARY_GROUP_ID,
  type HostAssetLibraryHandle,
} from '../screen/asset-library';
import { createBlueprintCanvas } from '../screen/blueprint-canvas';
import { rememberDatasourceReturn } from '../screen/datasource-return';
import { createHostAlarmController, type HostAlarmBindings } from '../screen/host-alarm-controller';
import {
  createHostAlarmStyleAuthoring,
  parseHostAlarmBindings,
} from '../screen/host-alarm-style-authoring';
import { createHostCatalogPort } from '../screen/host-catalog-port';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createHostDatasetPort } from '../screen/host-dataset-port';
import { createHostResourceAuthoringPanel } from '../screen/host-resource-authoring';
import { loadHostRuntime } from '../screen/host-runtime';
import {
  createOnlineMaterialPanel,
  type OnlineMaterialPanelHandle,
} from '../screen/online-materials';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';
import { useScreenSessionStore } from '../store/screen-session-store';
import { showToast } from './toast';

const logger = createLogger('screen-editor');

const AUTOSAVE_DEBOUNCE_MS = 1200;
const AUTOSAVE_RETRY_MS = 5000;
const AUTOSAVE_RETRY_MAX_MS = 60000;

/**
 * 设计器嵌入页：设计器是 DOM 节点而非 React 组件——用 ref 拿容器后 appendChild，
 * 并在 effect 内完成 configure / load。顺序不可颠倒：画布与渲染器在元素 connected
 * 时才建立。这一页不叠宿主布局：占满视口，返回入口与保存状态都由基座顶栏提供。
 *
 * 保存策略与另外两个前端逐条对等：脏后 1.2s 防抖保存；保存在飞行期间再次变脏则落定后
 * 补一次；失败按 5s 起指数退避自动重试；冲突即停止自动保存；返回按钮先落地再路由。
 */
export function ScreenEditorPage(): React.ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);
  const datasourcesRef = useRef<() => void>(() => {});

  useEffect(() => {
    const stage = stageRef.current;
    if (screenId === undefined || stage === null) return;
    const session = useScreenSessionStore.getState();
    session.begin(screenId);

    const unsubscribeSession = useScreenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    let designer: BaseScreenDesignerElement | undefined;
    let alarms: ReturnType<typeof createHostAlarmController> | undefined;
    // 宿主资源作者面：host-resource 的创建/改绑入口（数据面板对它只读）。
    let resourceAuthoring: ReturnType<typeof createHostResourceAuthoringPanel> | undefined;
    // 素材库左栏 + 统一选择桥（ADR-0089）：宿主自己的上传/目录/删除保护。
    let assetLibrary: HostAssetLibraryHandle | undefined;
    // 在线物料（ADR-0090）：宿主生成/审核 ESM，发布后热刷新 catalog。
    let onlineMaterials: OnlineMaterialPanelHandle | undefined;
    let detach: (() => void) | undefined;
    let disposed = false;
    let saveTimer: number | undefined;

    const loadAlarmBindings = async (): Promise<HostAlarmBindings> => {
      const result = await api.getScreenAlarmBindings(screenId);
      if (!result.ok) {
        logger.warn('alarm bindings unavailable', result.error);
        return {};
      }
      const parsed = parseHostAlarmBindings(result.data.bindings);
      if (parsed === undefined) {
        logger.warn('alarm bindings malformed', result.data.bindings);
        return {};
      }
      return parsed;
    };

    const clearSaveTimer = (): void => {
      window.clearTimeout(saveTimer);
    };

    void (async () => {
      // 插件元素注册与 manager 激活都在这一层；失败时清缓存供下次重试。
      const runtime = await loadHostRuntime();
      if (disposed) return;

      // 尺寸交给 .stage / .stage > * 的 CSS（占满视口），宿主不再内联写百分比宽高。
      const element = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
      // 宿主编排画布作为设计器的 light DOM 子节点，经公开 slot 进入蓝图工作台。
      element.append(createBlueprintCanvas());
      stage.append(element);
      designer = element;
      runtime.bindDesigner(element);

      // 告警端口必须在 configure 前注入；首快照最多等 800ms，超时先按基础样式渲染，
      // 快照到达后由失效 API 补齐。画布与预览共用同一个端口。
      // 绑定按 screenId 从宿主读取：页面里配过什么，打开就是什么。
      const alarmBindings = await loadAlarmBindings();
      if (disposed) return;
      alarms = createHostAlarmController({
        apiBase: resolveApiBase(),
        bindings: alarmBindings,
        onInvalidate: (componentIds) => element.refreshConditionalStyles(componentIds),
      });
      await alarms.ready(800);
      if (disposed) return;

      // 宿主条件样式的作者口：引擎在组件检查器渲染通用表单，保存后热更新端口。
      const alarmStyleAuthoring = createHostAlarmStyleAuthoring({
        initialBindings: alarmBindings,
        save: async (bindings) => {
          const result = await api.updateScreenAlarmBindings(screenId, bindings);
          if (!result.ok) return { ok: false, message: result.error.message };
          const parsed = parseHostAlarmBindings(result.data.bindings);
          if (parsed === undefined) {
            return { ok: false, message: '业务系统返回的告警绑定格式无效。' };
          }
          return { ok: true, bindings: parsed };
        },
        onSaved: (bindings) => alarms?.setBindings(bindings),
      });

      // 宿主数据通道必须在 configure 内提交：renderer 在 configure 时建立，
      // 之后再赋 `resourcePort` 会被按「初始化后不可更换端口」拒绝。
      // 数据集与来源目录通道同理一并提交，否则设计器的数据源面板与变量面板会退化。
      const datasetPort = createHostDatasetPort({ api, logger });
      const configured = element.configure({
        catalog: runtime.catalog,
        pluginCatalog: runtime.pluginCatalog,
        pluginPanels: runtime.pluginPanels,
        inspectorControls: runtime.inspectorControls,
        runtimeContributions: runtime.runtimeContributions,
        pluginCommandPort: runtime.pluginCommandPort,
        projectAdapter: createRestProjectAdapter(screenId),
        toolMaterialTypes: TOOL_MATERIAL_TYPES,
        resourcePort: createHostResourcePort(),
        datasetPort,
        hostCatalogPort: createHostCatalogPort({
          clock: () => new Date(),
          noticeSource: () => datasetPort.snapshot().alarms,
          logger,
        }),
        conditionalStylePort: alarms.port,
        hostConditionalStyleAuthoring: alarmStyleAuthoring,
        // 组合的编辑期形态：多个原子物料成组后整体移动/缩放/旋转。缺了这行，顶栏「编辑 → 成组」
        // 与图层面板的成组按钮都不可用。
        groupMaterialType: 'base.container',
        // 返回按钮由基座顶栏渲染，宿主只负责点击后跳回自己的路由。
        backButton: true,
        hostResourceSelectionButton: true,
        leftPanelGroups: [{ id: HOST_ASSET_LIBRARY_GROUP_ID, label: '素材库', icon: 'image' }],
      });
      if (!configured.ok) {
        logger.error('designer configure failed', configured.diagnostics);
        session.failedToLoad('设计器配置失败，请查看控制台日志。');
        element.remove();
        designer = undefined;
        runtime.bindDesigner(null);
        unsubscribeSession();
        return;
      }

      // 飞行中的那一次保存：定时器与「返回前 flush」共用同一份，避免并发 PUT。
      let saveFlight: Promise<boolean> | undefined;
      let retryDelayMs = AUTOSAVE_RETRY_MS;
      // 引擎只在脏态翻转时发事件，之后连续编辑不再通知，因此宿主自己记脏位。
      let dirty = false;
      let conflicted = false;
      let leaving = false;

      const scheduleSave = (delay: number): void => {
        if (leaving || conflicted) return;
        clearSaveTimer();
        saveTimer = window.setTimeout(() => {
          if (dirty) void runSave();
        }, delay);
      };

      const runSave = (): Promise<boolean> => {
        if (saveFlight !== undefined) return saveFlight;
        const flight = persist().finally(() => {
          if (saveFlight === flight) saveFlight = undefined;
        });
        saveFlight = flight;
        return flight;
      };

      datasourcesRef.current = (): void => {
        leaving = true;
        clearSaveTimer();
        void (async () => {
          await runSave();
          if (dirty && !conflicted) await runSave();
          rememberDatasourceReturn(`#/screens/${screenId}/edit`);
          navigate('/datasources');
        })();
      };

      /** 把当前文档 PUT 到宿主；返回是否已无未保存改动。 */
      const persist = async (): Promise<boolean> => {
        if (conflicted || !dirty) return true;
        // 脏位只由引擎事件清除：飞行期间的再次编辑不会发事件（引擎侧脏态没翻转），
        // 保存成功时引擎发现文档与快照不一致就保持 dirty，正好由下面的补排接住。
        useScreenSessionStore.getState().saving();
        const result = await element.save();
        if (result.ok) {
          useScreenSessionStore.getState().saved(result.value.revision);
          retryDelayMs = AUTOSAVE_RETRY_MS;
          if (dirty) scheduleSave(AUTOSAVE_DEBOUNCE_MS);
          return !dirty;
        }
        if (conflicted) return false;
        logger.warn('autosave failed', result.diagnostics);
        useScreenSessionStore.getState().failed(`${Math.round(retryDelayMs / 1000)} 秒后自动重试`);
        scheduleSave(retryDelayMs);
        // 退避在排期之后推进：文案与实际延时必须是同一个数。
        retryDelayMs = Math.min(retryDelayMs * 2, AUTOSAVE_RETRY_MAX_MS);
        return false;
      };

      const onBack = (): void => {
        leaving = true;
        clearSaveTimer();
        void (async () => {
          // 移除元素会取消在飞行的项目请求，因此必须先落地再路由。
          await runSave();
          if (dirty && !conflicted) await runSave();
          navigate('/');
        })();
      };
      element.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);

      // 冲突意味着 revision 已过期，自动重试只会再冲突一次；停掉自动保存，由用户重载。
      const onConflict = (): void => {
        conflicted = true;
        clearSaveTimer();
        useScreenSessionStore.getState().conflicted();
      };
      element.addEventListener('base-screen-project-conflict', onConflict);

      const onDirtyChange = (event: Event): void => {
        const detail = (event as CustomEvent<{ dirty: boolean }>).detail;
        dirty = detail.dirty;
        if (!detail.dirty) {
          // 撤销回基线也会走到这里：未触发的退避延时要归零，否则下次失败从上一次的高度起跳。
          retryDelayMs = AUTOSAVE_RETRY_MS;
          return;
        }
        useScreenSessionStore.getState().dirty();
        scheduleSave(AUTOSAVE_DEBOUNCE_MS);
      };
      element.addEventListener('base-screen-dirty-change', onDirtyChange);

      detach = (): void => {
        element.removeEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);
        element.removeEventListener('base-screen-project-conflict', onConflict);
        element.removeEventListener('base-screen-dirty-change', onDirtyChange);
        runtime.bindDesigner(null);
      };

      const loaded = await element.load(screenId);
      if (!loaded.ok) {
        logger.error('designer load failed', loaded.diagnostics);
        useScreenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
        return;
      }
      useScreenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);

      resourceAuthoring = createHostResourceAuthoringPanel({ designer: element });
      // 浮动面板挂 body：不能塞进框架根节点（Vue 的 fragment anchor 会被打乱）。
      document.body.append(resourceAuthoring.element);
      assetLibrary = createHostAssetLibrary({ designer: element });
      element.append(assetLibrary.element);
      onlineMaterials = createOnlineMaterialPanel({ designer: element, runtime });
      document.body.append(onlineMaterials.element);
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('editor bootstrap failed', error);
      useScreenSessionStore.getState().failedToLoad('设计器初始化失败，请返回列表重试。');
    });

    return () => {
      disposed = true;
      datasourcesRef.current = () => {};
      detach?.();
      unsubscribeSession();
      clearSaveTimer();
      resourceAuthoring?.dispose();
      resourceAuthoring = undefined;
      assetLibrary?.dispose();
      assetLibrary = undefined;
      onlineMaterials?.dispose();
      onlineMaterials = undefined;
      alarms?.stop();
      alarms = undefined;
      designer?.remove();
      designer = undefined;
      useScreenSessionStore.getState().reset();
      logger.debug('edit view released');
    };
  }, [screenId, navigate]);

  return (
    <>
      <div className="stage" ref={stageRef} />
      <button
        type="button"
        className="button editor-datasource-link"
        data-editor-datasources=""
        onClick={() => datasourcesRef.current()}
      >
        数据源
      </button>
    </>
  );
}
