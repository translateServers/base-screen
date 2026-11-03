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
import { createHostAlarmController, type HostAlarmBindings } from '../screen/host-alarm-controller';
import {
  createHostAlarmStyleAuthoring,
  parseHostAlarmBindings,
} from '../screen/host-alarm-style-authoring';
import { createHostCatalogPort } from '../screen/host-catalog-port';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createHostDatasetPort } from '../screen/host-dataset-port';
import { createHostIntentHandler } from '../screen/host-intent';
import { createHostIntentReferenceCatalog } from '../screen/host-intent-reference';
import { loadHostRuntime } from '../screen/host-runtime';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';
import { useScreenSessionStore } from '../store/screen-session-store';
import { showToast } from './toast';

const logger = createLogger('screen-editor');

/**
 * 设计器嵌入页：设计器是 DOM 节点而非 React 组件——用 ref 拿容器后 appendChild，
 * 并在 effect 内完成 configure / load。顺序不可颠倒：画布与渲染器在元素 connected
 * 时才建立。这一页不叠宿主布局：占满视口，返回入口与保存状态都由基座顶栏提供。
 *
 * 保存是显式的：引擎顶栏「保存」（Ctrl+S）经宿主 project adapter 落盘；宿主不订阅
 * 文档变化、也不在离开前隐式保存——未保存的改动随页面卸载丢弃。三端逐条对等。
 */
export function ScreenEditorPage(): React.ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);

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
    // 素材库左栏 + 统一选择桥（ADR-0089）：宿主自己的上传/目录/删除保护。
    let assetLibrary: HostAssetLibraryHandle | undefined;
    let detach: (() => void) | undefined;
    let disposed = false;

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

      const onBack = (): void => {
        navigate('/');
      };
      element.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);

      // 保存由用户显式触发（顶栏「保存」/ Ctrl+S，经宿主 project adapter）；冲突面板由引擎
      // 渲染，宿主只把冲突转成 toast。宿主不订阅文档变化，也不在离开前隐式落盘。
      const onConflict = (): void => {
        useScreenSessionStore.getState().conflicted();
      };
      element.addEventListener('base-screen-project-conflict', onConflict);

      detach = (): void => {
        element.removeEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);
        element.removeEventListener('base-screen-project-conflict', onConflict);
        element.setIntentHandler(undefined);
        element.setIntentReferenceCatalog(undefined);
        runtime.bindDesigner(null);
      };

      const loaded = await element.load(screenId);
      if (!loaded.ok) {
        logger.error('designer load failed', loaded.diagnostics);
        useScreenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
        return;
      }
      useScreenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);

      // 示例接线：把右栏书写面接到示例智能体（整屏 `POST /agent/candidate`、选中组件
      // `POST /agent/edit`）。必须在 load 成功之后绑定——
      // 提案要对着当前文档试算，文档没到时提交只会被引擎拒绝。解绑在 detach 里做，
      // 页面走了之后不会再有请求回来改一块已经不在的设计器。
      element.setIntentHandler(
        createHostIntentHandler({
          designer: element,
          screenId,
          // 读函数而不是快照：在线物料包上下架会整体替换 runtime.catalog。
          catalog: () => runtime.catalog,
        }),
      );
      // 引用目录：素材 + 数据集拍平成一份清单交给引擎，选择器与 chip 都在引擎侧。
      element.setIntentReferenceCatalog(
        createHostIntentReferenceCatalog({ api, screenId, logger }),
      );

      assetLibrary = createHostAssetLibrary({ designer: element, screenId });
      element.append(assetLibrary.element);
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('editor bootstrap failed', error);
      useScreenSessionStore.getState().failedToLoad('设计器初始化失败，请返回列表重试。');
    });

    return () => {
      disposed = true;
      detach?.();
      unsubscribeSession();
      assetLibrary?.dispose();
      assetLibrary = undefined;
      alarms?.stop();
      alarms = undefined;
      designer?.remove();
      designer = undefined;
      useScreenSessionStore.getState().reset();
      logger.debug('edit view released');
    };
  }, [screenId, navigate]);

  return <div className="stage" ref={stageRef} />;
}
