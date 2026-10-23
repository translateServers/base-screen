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
import { createBlueprintCanvas } from '../screen/blueprint-canvas';
import { rememberDatasourceReturn } from '../screen/datasource-return';
import { DEMO_ALARM_BINDINGS } from '../screen/host-alarm-bindings';
import { createHostAlarmController } from '../screen/host-alarm-controller';
import { createHostCatalogPort } from '../screen/host-catalog-port';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createHostDatasetPort } from '../screen/host-dataset-port';
import { type HostRuntime, loadHostRuntime } from '../screen/host-runtime';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';

const AUTOSAVE_DEBOUNCE_MS = 1200;
const AUTOSAVE_RETRY_MS = 5000;
const AUTOSAVE_RETRY_MAX_MS = 60000;

const route = useRoute();
const router = useRouter();
const stage = ref<HTMLDivElement | null>(null);
// shallowRef：不代理设计器实例（自定义元素内部状态无需 Vue 响应式）。
const designer = shallowRef<BaseScreenDesignerElement | null>(null);
const logger = createLogger('screen-editor');

let saveTimer: number | undefined;
// 飞行中的那一次保存：定时器与「返回前 flush」共用同一份，避免并发 PUT。
let saveFlight: Promise<boolean> | undefined;
let retryDelayMs = AUTOSAVE_RETRY_MS;
// 引擎只在脏态翻转时发事件，之后连续编辑不再通知，因此宿主自己记脏位。
let dirty = false;
let conflicted = false;
let leaving = false;
let onBack: (() => void) | undefined;
let onConflict: (() => void) | undefined;
let onDirtyChange: ((event: Event) => void) | undefined;
let unsubscribeSession: (() => void) | undefined;
let runtime: HostRuntime | undefined;
let alarms: ReturnType<typeof createHostAlarmController> | undefined;
// 运行时的激活是异步的；await 期间路由可能已经切走，configure 必须能被取消。
let disposed = false;

function clearSaveTimer(): void {
  window.clearTimeout(saveTimer);
}

function scheduleSave(delay: number): void {
  if (leaving || conflicted) return;
  clearSaveTimer();
  saveTimer = window.setTimeout(() => {
    if (dirty) void runSave();
  }, delay);
}

function runSave(): Promise<boolean> {
  if (saveFlight !== undefined) return saveFlight;
  const flight = persist().finally(() => {
    if (saveFlight === flight) saveFlight = undefined;
  });
  saveFlight = flight;
  return flight;
}

function goDatasources(): void {
  leaving = true;
  clearSaveTimer();
  void (async () => {
    await runSave();
    if (dirty && !conflicted) await runSave();
    const screenId = typeof route.params.screenId === 'string' ? route.params.screenId : '';
    rememberDatasourceReturn(`#/screens/${screenId}/edit`);
    void router.push('/datasources');
  })();
}

/** 把当前文档 PUT 到宿主；返回是否已无未保存改动。 */
async function persist(): Promise<boolean> {
  const instance = designer.value;
  if (instance === null || conflicted || !dirty) return true;
  // 脏位只由引擎事件清除：飞行期间的再次编辑不会发事件（引擎侧脏态没翻转），
  // 保存成功时引擎发现文档与快照不一致就保持 dirty，正好由下面的补排接住。
  screenSessionStore.getState().saving();
  const result = await instance.save();
  if (result.ok) {
    screenSessionStore.getState().saved(result.value.revision);
    retryDelayMs = AUTOSAVE_RETRY_MS;
    if (dirty) scheduleSave(AUTOSAVE_DEBOUNCE_MS);
    return !dirty;
  }
  if (conflicted) return false;
  logger.warn('autosave failed', result.diagnostics);
  screenSessionStore.getState().failed(`${Math.round(retryDelayMs / 1000)} 秒后自动重试`);
  scheduleSave(retryDelayMs);
  // 退避在排期之后推进：文案与实际延时必须是同一个数。
  retryDelayMs = Math.min(retryDelayMs * 2, AUTOSAVE_RETRY_MAX_MS);
  return false;
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
    alarms = createHostAlarmController({
      apiBase: resolveApiBase(),
      bindings: DEMO_ALARM_BINDINGS,
      onInvalidate: (componentIds) => element.refreshConditionalStyles(componentIds),
    });
    await alarms.ready(800);
    if (disposed) return;

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
      // 组合的编辑期形态：多个原子物料成组后整体移动/缩放/旋转。缺了这行，顶栏「编辑 → 成组」
      // 与图层面板的成组按钮都不可用。
      groupMaterialType: 'base.container',
      // 返回按钮由基座顶栏渲染，宿主只负责点击后跳回自己的路由。
      backButton: true,
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
      leaving = true;
      clearSaveTimer();
      void (async () => {
        // 移除元素会取消在飞行的项目请求，因此必须先落地再路由。
        await runSave();
        if (dirty && !conflicted) await runSave();
        router.push('/');
      })();
    };
    element.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);

    // 冲突意味着 revision 已过期，自动重试只会再冲突一次；停掉自动保存，由用户重载。
    onConflict = (): void => {
      conflicted = true;
      clearSaveTimer();
      screenSessionStore.getState().conflicted();
    };
    element.addEventListener('base-screen-project-conflict', onConflict);

    onDirtyChange = (event: Event): void => {
      const detail = (event as CustomEvent<{ dirty: boolean }>).detail;
      dirty = detail.dirty;
      if (!detail.dirty) {
        // 撤销回基线也会走到这里：未触发的退避延时要归零，否则下次失败从上一次的高度起跳。
        retryDelayMs = AUTOSAVE_RETRY_MS;
        return;
      }
      screenSessionStore.getState().dirty();
      scheduleSave(AUTOSAVE_DEBOUNCE_MS);
    };
    element.addEventListener('base-screen-dirty-change', onDirtyChange);

    const loaded = await element.load(screenId);
    if (!loaded.ok) {
      logger.error('designer load failed', loaded.diagnostics);
      screenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
      return;
    }
    screenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);
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
  if (element !== null && onDirtyChange !== undefined) {
    element.removeEventListener('base-screen-dirty-change', onDirtyChange);
  }
  alarms?.stop();
  alarms = undefined;
  unsubscribeSession?.();
  clearSaveTimer();
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
</template>
