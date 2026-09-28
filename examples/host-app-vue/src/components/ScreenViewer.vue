<script setup lang="ts">
import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useScreenSessionStore } from '../composables/use-stores';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';
import { createHostResourcePort } from '../screen/host-data-channel';
import { registerHostMaterials } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';
import ErrorBanner from './ErrorBanner.vue';

const route = useRoute();
const router = useRouter();
const stage = ref<HTMLDivElement | null>(null);
const viewer = shallowRef<BaseScreenViewerElement | null>(null);
const session = useScreenSessionStore();

const logger = createLogger('screen-viewer');

onMounted(() => {
  const screenId = route.params.screenId;
  const container = stage.value;
  if (typeof screenId !== 'string' || container === null) {
    screenSessionStore.getState().failedToLoad('缺少大屏 ID。');
    return;
  }
  screenSessionStore.getState().begin(screenId);

  void (async () => {
    const catalog = registerHostMaterials();
    const result = await api.getScreen(screenId);
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      return;
    }

    // 查看器只读播放：configure 只接收目录与数据通道，不接收项目适配器。
    const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
    element.style.display = 'block';
    element.style.width = '100%';
    element.style.height = '100%';
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
  viewer.value?.remove();
  viewer.value = null;
  screenSessionStore.getState().reset();
  logger.debug('view released');
});
</script>

<template>
  <div class="page">
    <div class="stage__toolbar">
      <button type="button" class="button" @click="router.push('/')">返回列表</button>
      <button
        type="button"
        class="button button--primary"
        @click="router.push(`/screens/${String(route.params.screenId)}/edit`)"
      >
        编辑
      </button>
      <span class="stage__status">{{ session.message }}</span>
    </div>
    <ErrorBanner
      v-if="session.error !== null"
      :message="session.error"
      @retry="router.push('/')"
    />
    <div ref="stage" class="stage stage--view" />
  </div>
</template>
