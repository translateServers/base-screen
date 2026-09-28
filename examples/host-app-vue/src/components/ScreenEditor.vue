<script setup lang="ts">
import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useScreenSessionStore } from '../composables/use-stores';
import { createLogger } from '../lib/logger';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { registerHostMaterials, TOOL_MATERIAL_TYPES } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';
import ErrorBanner from './ErrorBanner.vue';

const AUTOSAVE_DEBOUNCE_MS = 1200;

const route = useRoute();
const router = useRouter();
const stage = ref<HTMLDivElement | null>(null);
// shallowRef：不代理设计器实例（自定义元素内部状态无需 Vue 响应式）。
const designer = shallowRef<BaseScreenDesignerElement | null>(null);
// 会话状态来自 zustand 状态机。
const session = useScreenSessionStore();

const logger = createLogger('screen-editor');

let saveTimer: number | undefined;
let saving = false;
let onConflict: (() => void) | undefined;
let onDirtyChange: ((event: Event) => void) | undefined;

function scheduleAutosave(): void {
  if (saving) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void (async () => {
      const instance = designer.value;
      if (instance === null) return;
      saving = true;
      screenSessionStore.getState().saving();
      const result = await instance.save();
      saving = false;
      if (result.ok) {
        screenSessionStore.getState().saved(result.value.revision);
      } else {
        logger.warn('autosave failed', result.diagnostics);
        screenSessionStore.getState().failed('将继续自动重试');
      }
    })();
  }, AUTOSAVE_DEBOUNCE_MS);
}

onMounted(() => {
  const screenId = route.params.screenId;
  const container = stage.value;
  if (typeof screenId !== 'string' || container === null) {
    screenSessionStore.getState().failedToLoad('缺少大屏 ID。');
    return;
  }
  screenSessionStore.getState().begin(screenId);

  const catalog = registerHostMaterials();
  // 设计器是 DOM 节点而非 Vue 组件：创建后 appendChild，再 configure / load。
  // 顺序不可颠倒——画布与渲染器在元素 connected 时才建立。
  const element = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
  element.style.display = 'block';
  element.style.width = '100%';
  element.style.height = '100%';
  container.append(element);
  designer.value = element;

  const configured = element.configure({
    catalog,
    projectAdapter: createRestProjectAdapter(screenId),
    toolMaterialTypes: TOOL_MATERIAL_TYPES,
  });
  if (!configured.ok) {
    logger.error('designer configure failed', configured.diagnostics);
    screenSessionStore.getState().failedToLoad('设计器配置失败，请查看控制台日志。');
    return;
  }

  // 宿主数据通道：host-resource dataSource -> 共享后端 mock 指标。
  element.resourcePort = createHostResourcePort();

  onConflict = (): void => {
    screenSessionStore.getState().conflicted();
  };
  element.addEventListener('base-screen-project-conflict', onConflict);

  onDirtyChange = (event: Event): void => {
    const detail = (event as CustomEvent<{ dirty: boolean }>).detail;
    if (detail.dirty) {
      screenSessionStore.getState().dirty();
      scheduleAutosave();
    }
  };
  element.addEventListener('base-screen-dirty-change', onDirtyChange);

  void (async () => {
    const loaded = await element.load(screenId);
    if (!loaded.ok) {
      logger.error('designer load failed', loaded.diagnostics);
      screenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
      return;
    }
    screenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);
  })();
});

onBeforeUnmount(() => {
  const element = designer.value;
  if (element !== null && onConflict !== undefined) {
    element.removeEventListener('base-screen-project-conflict', onConflict);
  }
  if (element !== null && onDirtyChange !== undefined) {
    element.removeEventListener('base-screen-dirty-change', onDirtyChange);
  }
  window.clearTimeout(saveTimer);
  element?.remove();
  designer.value = null;
  screenSessionStore.getState().reset();
  logger.debug('edit view released');
});
</script>

<template>
  <div class="page">
    <div class="stage__toolbar">
      <button type="button" class="button" @click="router.push('/')">返回列表</button>
      <button
        type="button"
        class="button"
        @click="router.push(`/screens/${String(route.params.screenId)}/view`)"
      >
        查看
      </button>
      <span class="stage__status">{{ session.message }}</span>
    </div>
    <ErrorBanner
      v-if="session.error !== null"
      :message="session.error"
      @retry="router.push('/')"
    />
    <div ref="stage" class="stage stage--edit" />
  </div>
</template>
