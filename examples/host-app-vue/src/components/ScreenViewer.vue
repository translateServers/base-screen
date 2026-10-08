<script setup lang="ts">
import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useScreenSessionStore } from '../composables/use-stores';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';
import { showToast } from '../lib/toast';
import { createHostResourcePort } from '../screen/host-data-channel';
import { registerHostMaterials } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';

const route = useRoute();
const router = useRouter();
const stage = ref<HTMLDivElement | null>(null);
const viewer = shallowRef<BaseScreenViewerElement | null>(null);
// 查看器没有自带顶栏，所以这一页的返回入口和状态文案仍归宿主。
const session = useScreenSessionStore();

const logger = createLogger('screen-viewer');

let unsubscribeSession: (() => void) | undefined;

onMounted(() => {
  const screenId = route.params.screenId;
  const container = stage.value;
  if (typeof screenId !== 'string' || container === null) {
    showToast('缺少大屏 ID。', 'error');
    return;
  }
  screenSessionStore.getState().begin(screenId);
  // 窄条只显示状态文案，详细原因仍按 error 变化各提示一次。
  unsubscribeSession = screenSessionStore.subscribe((state, previous) => {
    if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
  });

  void (async () => {
    const catalog = registerHostMaterials();
    const result = await api.getScreen(screenId);
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      return;
    }

    // 查看器只读播放：configure 只接收目录与数据通道，不接收项目适配器。
    const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
    container.append(element);
    viewer.value = element;

    const configured = element.configure({
      catalog,
      instanceId: `host-app-vue:${screenId}`,
      mode: 'viewer',
      resourcePort: createHostResourcePort(),
    });
    if (!configured.ok) {
      logger.error('viewer configure failed', configured.diagnostics);
      screenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
      element.remove();
      return;
    }

    element.document = result.data.screen.document;
    screenSessionStore
      .getState()
      .loaded(result.data.screen.name, String(result.data.screen.revision));
    logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
  })();
});

onBeforeUnmount(() => {
  unsubscribeSession?.();
  viewer.value?.remove();
  viewer.value = null;
  screenSessionStore.getState().reset();
  logger.debug('view released');
});
</script>

<template>
  <div ref="stage" class="stage" />
  <div class="embed-bar">
    <button type="button" class="button" @click="router.push('/')">返回列表</button>
    <span class="embed-bar__status">{{ session.message }}</span>
  </div>
</template>
