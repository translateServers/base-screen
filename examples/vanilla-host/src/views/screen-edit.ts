import {
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  type BaseScreenDesignerElement,
} from '@base-screen/sdk/designer';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import {
  createHostAssetLibrary,
  HOST_ASSET_LIBRARY_GROUP_ID,
  type HostAssetLibraryHandle,
} from '../screen/asset-library';
import { rememberAssetReturn } from '../screen/asset-return';
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
import { createHostIntentHandler } from '../screen/host-intent';
import { createHostResourceAuthoringPanel } from '../screen/host-resource-authoring';
import { loadHostRuntime } from '../screen/host-runtime';
import {
  createOnlineMaterialPanel,
  type OnlineMaterialPanelHandle,
} from '../screen/online-materials';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';

const logger = createLogger('screen-edit');

/**
 * 编辑页。清理函数在插件运行时激活前就交给路由：激活是异步的，若等它完成再返回
 * cleanup，加载期间换路由会把设计器和监听留在页面上。
 *
 * 保存是显式的：引擎顶栏「保存」（Ctrl+S）经宿主 project adapter 落盘；宿主不订阅
 * 文档变化、也不在离开前隐式保存——未保存的改动随页面卸载丢弃。三端逐条对等。
 */
export const screenEditView: ViewModule = {
  mount(container, route: Route): () => void {
    if (route.name !== 'edit') {
      showToast('缺少大屏 ID。', 'error');
      return () => {};
    }
    const screenId = route.id;
    const session = screenSessionStore.getState();
    session.begin(screenId);
    const unsubscribe = screenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    const stage = el('div', { class: 'stage' });
    const datasourcesButton = el('button', {
      class: 'button editor-datasource-link',
      text: '数据源',
      attrs: { type: 'button', 'data-editor-datasources': '' },
    });
    const assetsButton = el('button', {
      class: 'button editor-datasource-link editor-assets-link',
      text: '素材',
      attrs: { type: 'button', 'data-editor-assets': '' },
    });
    container.append(stage, datasourcesButton, assetsButton);

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
      const runtime = await loadHostRuntime();
      if (disposed) return;

      // 1) 先创建并挂载设计器：画布与渲染器在元素 connected 时才建立。
      const element = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
      // 宿主编排画布作为设计器的 light DOM 子节点，经公开 slot 进入蓝图工作台。
      element.append(createBlueprintCanvas());
      stage.append(element);
      designer = element;
      runtime.bindDesigner(element);

      // 告警端口必须在 configure 前注入；首快照最多等 800ms，超时先按基础样式渲染。
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

      // 2) 挂载后再 configure / load；数据通道必须在 configure 内提交。
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
        // 组合的编辑期形态：多个原子物料成组后整体移动/缩放/旋转。
        groupMaterialType: 'base.container',
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
        unsubscribe();
        return;
      }

      const onBack = (): void => {
        goToList();
      };
      element.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);

      const onDatasources = (): void => {
        rememberDatasourceReturn(`#/screens/${screenId}/edit`);
        window.location.hash = '#/datasources';
      };
      const onAssets = (): void => {
        rememberAssetReturn(`#/screens/${screenId}/edit`);
        window.location.hash = '#/assets';
      };
      datasourcesButton.addEventListener('click', onDatasources);
      assetsButton.addEventListener('click', onAssets);

      // 保存由用户显式触发（顶栏「保存」/ Ctrl+S，经宿主 project adapter）；冲突面板由引擎
      // 渲染，宿主只把冲突转成 toast。宿主不订阅文档变化，也不在离开前隐式落盘。
      const onConflict = (): void => {
        screenSessionStore.getState().conflicted();
      };
      element.addEventListener('base-screen-project-conflict', onConflict);

      detach = (): void => {
        datasourcesButton.removeEventListener('click', onDatasources);
        assetsButton.removeEventListener('click', onAssets);
        element.removeEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);
        element.removeEventListener('base-screen-project-conflict', onConflict);
        element.setIntentHandler(undefined);
        runtime.bindDesigner(null);
      };

      const loaded = await element.load(screenId);
      if (!loaded.ok) {
        logger.error('designer load failed', loaded.diagnostics);
        screenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
        return;
      }
      screenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);

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

      resourceAuthoring = createHostResourceAuthoringPanel({ designer: element });
      // 浮动面板挂 body：不能塞进框架根节点（Vue 的 fragment anchor 会被打乱）。
      document.body.append(resourceAuthoring.element);
      assetLibrary = createHostAssetLibrary({ designer: element, screenId });
      element.append(assetLibrary.element);
      onlineMaterials = createOnlineMaterialPanel({ designer: element, runtime });
      document.body.append(onlineMaterials.element);
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('editor bootstrap failed', error);
      screenSessionStore.getState().failedToLoad('设计器初始化失败，请返回列表重试。');
    });

    // 3) 清理：先阻断异步 bootstrap 的后续步骤，再拆监听。
    return () => {
      disposed = true;
      detach?.();
      unsubscribe();
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
      datasourcesButton.remove();
      assetsButton.remove();
      stage.remove();
      screenSessionStore.getState().reset();
      logger.debug('edit view released');
    };
  },
};
