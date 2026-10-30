<script setup lang="ts">
import {
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  type BaseScreenDesignerElement,
} from '@base-screen/sdk/designer';
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';
import { showToast } from '../lib/toast';
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
import { type HostRuntime, loadHostRuntime } from '../screen/host-runtime';
import {
  createOnlineMaterialPanel,
  type OnlineMaterialPanelHandle,
} from '../screen/online-materials';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';

const route = useRoute();
const router = useRouter();
const stage = ref<HTMLDivElement | null>(null);
// shallowRef：不代理设计器实例（自定义元素内部状态无需 Vue 响应式）。
const designer = shallowRef<BaseScreenDesignerElement | null>(null);
const logger = createLogger('screen-editor');

let onBack: (() => void) | undefined;
let onConflict: (() => void) | undefined;
let unsubscribeSession: (() => void) | undefined;
let runtime: HostRuntime | undefined;
let alarms: ReturnType<typeof createHostAlarmController> | undefined;
// 宿主资源作者面：host-resource 的创建/改绑入口（数据面板对它只读）。
let resourceAuthoring: ReturnType<typeof createHostResourceAuthoringPanel> | undefined;
// 素材库左栏 + 统一选择桥（ADR-0089）：宿主自己的上传/目录/删除保护。
let assetLibrary: HostAssetLibraryHandle | undefined;
// 在线物料（ADR-0090）：宿主生成/审核 ESM，发布后热刷新 catalog。
let onlineMaterials: OnlineMaterialPanelHandle | undefined;
// 运行时的激活是异步的；await 期间路由可能已经切走，configure 必须能被取消。
let disposed = false;

// 保存由用户显式触发（顶栏「保存」/ Ctrl+S，经宿主 project adapter）；宿主不订阅文档变化，
// 也不在离开前隐式落盘——未保存的改动随页面卸载丢弃。三端逐条对等。
function goDatasources(): void {
  const screenId = typeof route.params.screenId === 'string' ? route.params.screenId : '';
  rememberDatasourceReturn(`#/screens/${screenId}/edit`);
  void router.push('/datasources');
}

function goAssets(): void {
  const screenId = typeof route.params.screenId === 'string' ? route.params.screenId : '';
  rememberAssetReturn(`#/screens/${screenId}/edit`);
  void router.push('/assets');
}

onMounted(() => {
  const screenId = route.params.screenId;
  const container = stage.value;
  if (typeof screenId !== 'string' || container === null) {
    showToast('缺少大屏 ID。', 'error');
    return;
  }
  screenSessionStore.getState().begin(screenId);
  // 会话状态仍由 store 这台状态机持有，但宿主不再渲染状态文案（基座顶栏已显示项目名与
  // 保存状态），只在 error 变化的那一次把它转成 toast。
  unsubscribeSession = screenSessionStore.subscribe((state, previous) => {
    if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
  });

  const loadAlarmBindings = async (id: string): Promise<HostAlarmBindings> => {
    const result = await api.getScreenAlarmBindings(id);
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
    // 插件元素注册与 manager 激活都在这条 Promise 里；失败时清缓存供下次重试。
    const host = await loadHostRuntime();
    if (disposed) return;
    runtime = host;

    // 设计器是 DOM 节点而非 Vue 组件：创建后 appendChild，再 configure / load。
    // 顺序不可颠倒——画布与渲染器在元素 connected 时才建立。尺寸交给 .stage 与 .stage > *
    // 的 CSS（占满视口），宿主不再内联写百分比宽高。
    const element = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
    // 宿主编排画布作为设计器的 light DOM 子节点，经公开 slot 进入蓝图工作台。
    element.append(createBlueprintCanvas());
    container.append(element);
    designer.value = element;
    host.bindDesigner(element);

    // 告警端口必须在 configure 前注入；首快照最多等 800ms，超时先按基础样式渲染。
    // 绑定按 screenId 从宿主读取：页面里配过什么，打开就是什么。
    const alarmBindings = await loadAlarmBindings(screenId);
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
      catalog: host.catalog,
      pluginCatalog: host.pluginCatalog,
      pluginPanels: host.pluginPanels,
      inspectorControls: host.inspectorControls,
      runtimeContributions: host.runtimeContributions,
      pluginCommandPort: host.pluginCommandPort,
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
      screenSessionStore.getState().failedToLoad('设计器配置失败，请查看控制台日志。');
      element.remove();
      designer.value = null;
      host.bindDesigner(null);
      unsubscribeSession?.();
      unsubscribeSession = undefined;
      return;
    }

    onBack = (): void => {
      void router.push('/');
    };
    element.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);

    // 冲突面板由引擎渲染；宿主只把冲突转成 toast，不参与重试或落盘。
    onConflict = (): void => {
      screenSessionStore.getState().conflicted();
    };
    element.addEventListener('base-screen-project-conflict', onConflict);

    const loaded = await element.load(screenId);
    if (!loaded.ok) {
      logger.error('designer load failed', loaded.diagnostics);
      screenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
      return;
    }
    screenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);

    // 示例接线：把右栏书写面接到示例智能体（整屏 `POST /agent/candidate`、选中组件
    // `POST /agent/edit`）。必须在 load 成功之后绑定——
    // 提案要对着当前文档试算，文档没到时提交只会被引擎拒绝。解绑在卸载里做，
    // 页面走了之后不会再有请求回来改一块已经不在的设计器。
    element.setIntentHandler(
      createHostIntentHandler({
        designer: element,
        screenId,
        // 读函数而不是快照：在线物料包上下架会整体替换 host.catalog。
        catalog: () => host.catalog,
      }),
    );

    resourceAuthoring = createHostResourceAuthoringPanel({ designer: element });
    // 浮动面板挂 body：不能塞进框架根节点（Vue 的 fragment anchor 会被打乱）。
    document.body.append(resourceAuthoring.element);
    assetLibrary = createHostAssetLibrary({ designer: element, screenId });
    element.append(assetLibrary.element);
    onlineMaterials = createOnlineMaterialPanel({ designer: element, runtime: host });
    document.body.append(onlineMaterials.element);
  })().catch((error: unknown) => {
    if (disposed) return;
    logger.error('editor bootstrap failed', error);
    screenSessionStore.getState().failedToLoad('设计器初始化失败，请返回列表重试。');
  });
});

onBeforeUnmount(() => {
  disposed = true;
  const element = designer.value;
  if (element !== null && onBack !== undefined) {
    element.removeEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);
  }
  if (element !== null && onConflict !== undefined) {
    element.removeEventListener('base-screen-project-conflict', onConflict);
  }
  alarms?.stop();
  alarms = undefined;
  resourceAuthoring?.dispose();
  resourceAuthoring = undefined;
  assetLibrary?.dispose();
  assetLibrary = undefined;
  onlineMaterials?.dispose();
  onlineMaterials = undefined;
  unsubscribeSession?.();
  element?.setIntentHandler(undefined);
  element?.remove();
  designer.value = null;
  runtime?.bindDesigner(null);
  screenSessionStore.getState().reset();
  logger.debug('edit view released');
});
</script>

<template>
  <div ref="stage" class="stage" />
  <button
    type="button"
    class="button editor-datasource-link"
    data-editor-datasources=""
    @click="goDatasources"
  >
    数据源
  </button>
  <button
    type="button"
    class="button editor-datasource-link editor-assets-link"
    data-editor-assets=""
    @click="goAssets"
  >
    素材
  </button>
</template>
