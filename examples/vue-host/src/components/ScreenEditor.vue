<script setup lang="ts">
import type {
  BaseScreenDesignerElement,
  BaseScreenDesignerMountOptions,
  BaseScreenMountDiagnosticContext,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  ScreenProjectState,
} from '@base-screen/sdk';
import type { ScreenDiagnostic } from '@base-screen/sdk/contracts';
import { BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT } from '@base-screen/sdk/designer';
import { BaseScreenDesigner } from '@base-screen/vue';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';
import { showToast } from '../lib/toast';
import { createHostAssetLibrary, HOST_ASSET_LIBRARY_GROUP_ID } from '../screen/asset-library';
import { loadVueDesignerRuntime } from '../screen/composition-runtime';
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
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';

interface DesignerStage {
  readonly screenId: string;
  readonly runtime: BaseScreenRuntime;
  readonly mountOptions: BaseScreenDesignerMountOptions;
}

const route = useRoute();
const router = useRouter();
const logger = createLogger('screen-editor');
// 装配就绪的快照：端口必须在 configure 时一次提交，备齐后组件才会挂载（未就绪传 null）。
const stage = shallowRef<DesignerStage | null>(null);
// shallowRef：不代理设计器实例（自定义元素内部状态无需 Vue 响应式）。
const designer = shallowRef<BaseScreenDesignerElement | null>(null);

let alarms: ReturnType<typeof createHostAlarmController> | undefined;
let disposed = false;
let lastError: string | undefined;

function notifyError(message: string): void {
  if (disposed || message === lastError) return;
  lastError = message;
  showToast(message, 'error');
}

// 保存由用户显式触发（顶栏「保存」/ Ctrl+S，经宿主 project adapter）；宿主不订阅文档变化，
// 也不在离开前隐式落盘——未保存的改动随页面卸载丢弃。三端逐条对等。

async function loadAlarmBindings(screenId: string): Promise<HostAlarmBindings> {
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
}

onMounted(() => {
  const screenId = route.params.screenId;
  if (typeof screenId !== 'string') {
    showToast('缺少大屏 ID。', 'error');
    return;
  }
  void (async () => {
    // 1) 插件 manager 激活（全站单例；失败时清缓存供下次重试）
    const runtime = await loadVueDesignerRuntime();
    if (disposed) return;

    // 2) 告警端口：必须在 configure 前注入，首快照最多等 800ms（超时先按基础样式渲染，
    //    快照到达后由失效 API 补齐）。绑定按 screenId 从宿主读取。
    const alarmBindings = await loadAlarmBindings(screenId);
    if (disposed) return;
    const controller = createHostAlarmController({
      apiBase: resolveApiBase(),
      bindings: alarmBindings,
      onInvalidate: (componentIds) => designer.value?.refreshConditionalStyles(componentIds),
    });
    alarms = controller;
    await controller.ready(800);
    if (disposed) return;

    // 3) 宿主条件样式的作者口：引擎在组件检查器渲染通用表单，保存后热更新端口。
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
      onSaved: (bindings) => controller.setBindings(bindings),
    });
    // 数据集与来源目录通道同理一并提交，否则设计器的数据源面板与变量面板会退化。
    const datasetPort = createHostDatasetPort({ api, logger });

    stage.value = {
      screenId,
      runtime,
      mountOptions: {
        projectId: screenId,
        projectAdapter: createRestProjectAdapter(screenId),
        toolMaterialTypes: TOOL_MATERIAL_TYPES,
        resourcePort: createHostResourcePort(),
        datasetPort,
        hostCatalogPort: createHostCatalogPort({
          clock: () => new Date(),
          noticeSource: () => datasetPort.snapshot().alarms,
          logger,
        }),
        conditionalStylePort: controller.port,
        hostConditionalStyleAuthoring: alarmStyleAuthoring,
        // 返回按钮由基座顶栏渲染，宿主只负责点击后跳回自己的路由。
        backButton: true,
        hostResourceSelectionButton: true,
        leftPanelGroups: [{ id: HOST_ASSET_LIBRARY_GROUP_ID, label: '素材库', icon: 'image' }],
      },
    };
  })().catch((error: unknown) => {
    if (disposed) return;
    alarms?.stop();
    logger.error('editor bootstrap failed', error);
    notifyError('设计器初始化失败，请返回列表重试。');
  });
});

onBeforeUnmount(() => {
  disposed = true;
  alarms?.stop();
  logger.debug('edit view released');
});

/**
 * 挂载就绪：组合层已完成 configure 与项目 load，这里只做宿主侧接线。
 * 顺序由组合层保证（load 在前），因此意图处理器可以安全绑在这里——提案要对着当前文档试算。
 * 返回的清理函数由挂载句柄在 dispose 时执行，路由切换与页面卸载都覆盖。
 */
function onDesignerMounted(
  handle: BaseScreenMountHandle<BaseScreenDesignerElement>,
): (() => void) | undefined {
  const current = stage.value;
  if (current === null) return undefined;
  const element = handle.element;
  const { screenId } = current;
  designer.value = element;

  // handle.on 登记的事件监听随句柄释放自动移除，宿主不再手写 add/remove 配对。
  handle.on(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, () => {
    void router.push('/');
  });
  // 右栏书写面接到示例智能体；catalog 读函数而非快照——在线物料上下架会整体替换它。
  element.setIntentHandler(
    createHostIntentHandler({
      designer: element,
      screenId,
      catalog: () => current.runtime.catalog,
    }),
  );
  handle.onDispose(() => element.setIntentHandler(undefined));
  element.setIntentReferenceCatalog(createHostIntentReferenceCatalog({ api, screenId, logger }));
  handle.onDispose(() => element.setIntentReferenceCatalog(undefined));
  const assetLibrary = createHostAssetLibrary({ designer: element, screenId });
  handle.onDispose(() => assetLibrary.dispose());
  element.append(assetLibrary.element);

  return () => {
    if (designer.value === element) designer.value = null;
  };
}

/** 初始状态和后续保存/重载状态均来自同一项目会话，不补请求或维护平行状态机。 */
function onProjectState(state: ScreenProjectState): void {
  if (disposed) return;
  if (state.phase === 'conflict') {
    notifyError('文档已被其他会话更新，请刷新页面重新加载。');
  } else if (state.phase === 'ready') {
    lastError = undefined;
  }
}

function onDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
  context: BaseScreenMountDiagnosticContext | undefined,
): void {
  if (disposed) return;
  if (diagnostics.length === 0) {
    lastError = undefined;
    return;
  }
  logger.error('designer composition failed', { diagnostics, context });
  if (context?.instanceAvailable) {
    notifyError('物料目录更新失败，当前设计器仍可继续使用。');
  } else {
    alarms?.stop();
    notifyError('设计器加载失败，请查看控制台日志。');
  }
}
</script>

<template>
  <!--
    组合层组件内部创建并挂载 `<base-screen-designer>`，宿主只给挂载点：尺寸交给
    `.stage` 与 `.stage > *` 的 CSS（占满视口）；`class` 会透传到组件根节点，
    因此与 React 端是同一套布局契约。

    装配未就绪时 `runtime` / `mountOptions` 都是 null：组件自己不挂载，也不需要宿主
    写 `v-if` 或占位节点——根节点一直是那个 `.stage`。
  -->
  <BaseScreenDesigner
    class="stage"
    :runtime="stage?.runtime ?? null"
    :mount-options="stage?.mountOptions ?? null"
    :on-mounted="onDesignerMounted"
    :on-project-state="onProjectState"
    :on-diagnostics="onDiagnostics"
  />
</template>
