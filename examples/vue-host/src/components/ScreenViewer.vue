<script setup lang="ts">
import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useScreenSessionStore } from '../composables/use-stores';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';
import { showToast } from '../lib/toast';
import { createHostResourcePort } from '../screen/host-data-channel';
import { loadHostRuntime } from '../screen/host-runtime';
import { screenSessionStore } from '../store/screen-session-store';

const route = useRoute();
const router = useRouter();
const host = ref<HTMLDivElement | null>(null);
const stage = ref<HTMLDivElement | null>(null);
const viewer = shallowRef<BaseScreenViewerElement | null>(null);
const session = useScreenSessionStore();

const screenName = ref('');
const clock = ref(formatClock(new Date()));
const canvasWidth = ref(1920);
const canvasHeight = ref(1080);
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const fullscreen = ref(false);

// 缩放只影响 frame，工具栏是 host 的另一个子节点，不随大屏一起放大。
const frameStyle = computed(() => ({
  width: `${canvasWidth.value}px`,
  height: `${canvasHeight.value}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}));

const logger = createLogger('screen-viewer');

let unsubscribeSession: (() => void) | undefined;
let resizeObserver: ResizeObserver | undefined;
let clockTimer: number | undefined;
let disposed = false;

function updateFit(): void {
  const element = host.value;
  if (element === null) return;
  // clientWidth 在刚挂载时可能还是 0；退回到视口尺寸，避免 scale 变成 0。
  const width = element.clientWidth || window.innerWidth;
  const height = element.clientHeight || window.innerHeight;
  const next = Math.min(width / canvasWidth.value, height / canvasHeight.value);
  scale.value = next > 0 ? next : 1;
  offsetX.value = (width - canvasWidth.value * scale.value) / 2;
  offsetY.value = (height - canvasHeight.value * scale.value) / 2;
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement === null) {
      await host.value?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error: unknown) {
    logger.warn('fullscreen request failed', error);
    showToast('当前浏览器不允许进入全屏。', 'error');
  }
}

function onFullscreenChange(): void {
  fullscreen.value = document.fullscreenElement !== null;
  updateFit();
}

onMounted(() => {
  const screenId = route.params.screenId;
  const container = stage.value;
  if (typeof screenId !== 'string' || container === null) {
    showToast('缺少大屏 ID。', 'error');
    return;
  }
  screenSessionStore.getState().begin(screenId);
  unsubscribeSession = screenSessionStore.subscribe((state, previous) => {
    if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
  });

  resizeObserver = new ResizeObserver(() => updateFit());
  if (host.value !== null) resizeObserver.observe(host.value);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  clockTimer = window.setInterval(() => {
    clock.value = formatClock(new Date());
  }, 1000);
  updateFit();

  void (async () => {
    const runtime = await loadHostRuntime();
    if (disposed) return;

    const result = await api.getScreen(screenId);
    if (disposed) return;
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      return;
    }

    const canvas = result.data.screen.document.canvas;
    canvasWidth.value = canvas.width;
    canvasHeight.value = canvas.height;
    screenName.value = result.data.screen.name;
    updateFit();

    // 查看器只读播放：configure 只接收目录、数据通道与贡献索引，不接收项目适配器。
    const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
    container.append(element);
    viewer.value = element;

    const configured = element.configure({
      catalog: runtime.catalog,
      runtimeContributions: runtime.runtimeContributions,
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
    // 图表在拿到数据后才会撑开 canvas，下一帧再算一次缩放最稳。
    requestAnimationFrame(() => updateFit());
    logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
  })().catch((error: unknown) => {
    if (disposed) return;
    logger.error('viewer bootstrap failed', error);
    screenSessionStore.getState().failedToLoad('查看器初始化失败，请返回列表重试。');
  });
});

onBeforeUnmount(() => {
  disposed = true;
  unsubscribeSession?.();
  resizeObserver?.disconnect();
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.clearInterval(clockTimer);
  viewer.value?.remove();
  viewer.value = null;
  screenSessionStore.getState().reset();
  logger.debug('view released');
});

function formatClock(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
</script>

<template>
  <div ref="host" class="viewer-stage">
    <div class="viewer-stage__frame" :style="frameStyle">
      <div ref="stage" class="viewer-stage__screen" />
    </div>
    <div class="viewer-bar">
      <span class="viewer-bar__name">{{ screenName || '数据大屏' }}</span>
      <span class="viewer-bar__clock">{{ clock }}</span>
      <button type="button" class="button" @click="toggleFullscreen">
        {{ fullscreen ? '退出全屏' : '全屏' }}
      </button>
      <button type="button" class="button" @click="router.push('/')">返回列表</button>
    </div>
  </div>
</template>
