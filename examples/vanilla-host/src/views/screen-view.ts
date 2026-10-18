import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { createHostResourcePort } from '../screen/host-data-channel';
import { loadHostRuntime } from '../screen/host-runtime';
import { screenSessionStore } from '../store/screen-session-store';

const logger = createLogger('screen-view');

/**
 * 查看页：DataV 式等比缩放。frame 保持 canonical 像素尺寸，由 transform 适配视口；
 * 工具栏与 frame 平级，不随大屏一起放大。
 */
export const screenView: ViewModule = {
  async mount(container, route: Route): Promise<() => void> {
    if (route.name !== 'view') {
      showToast('缺少大屏 ID。', 'error');
      return () => {};
    }
    const screenId = route.id;
    const session = screenSessionStore.getState();
    session.begin(screenId);

    const host = el('div', { class: 'viewer-stage' });
    const frame = el('div', { class: 'viewer-stage__frame' });
    const stage = el('div', { class: 'viewer-stage__screen' });
    frame.append(stage);
    const nameLabel = el('span', { class: 'viewer-bar__name', text: '数据大屏' });
    const clockLabel = el('span', { class: 'viewer-bar__clock', text: formatClock(new Date()) });
    const fullscreenButton = el('button', {
      class: 'button',
      text: '全屏',
      on: { click: () => void toggleFullscreen() },
    });
    const backButton = el('button', {
      class: 'button',
      text: '返回列表',
      on: { click: () => goToList() },
    });
    const bar = el('div', { class: 'viewer-bar' }, [
      nameLabel,
      clockLabel,
      fullscreenButton,
      backButton,
    ]);
    host.append(frame, bar);
    container.append(host);

    const canvas = { width: 1920, height: 1080 };
    const updateFit = (): void => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      const scale = Math.max(0.0001, Math.min(width / canvas.width, height / canvas.height));
      frame.style.width = `${canvas.width}px`;
      frame.style.height = `${canvas.height}px`;
      frame.style.transform = `translate(${(width - canvas.width * scale) / 2}px, ${
        (height - canvas.height * scale) / 2
      }px) scale(${scale})`;
    };
    const observer = new ResizeObserver(() => updateFit());
    observer.observe(host);
    const onFullscreenChange = (): void => {
      fullscreenButton.textContent = document.fullscreenElement === null ? '全屏' : '退出全屏';
      updateFit();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    const clockTimer = window.setInterval(() => {
      clockLabel.textContent = formatClock(new Date());
    }, 1000);
    updateFit();

    const toggleFullscreen = async (): Promise<void> => {
      try {
        if (document.fullscreenElement === null) {
          await host.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error: unknown) {
        logger.warn('fullscreen request failed', error);
        showToast('当前浏览器不允许进入全屏。', 'error');
      }
    };

    const unsubscribe = screenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    let viewer: BaseScreenViewerElement | undefined;
    const cleanup = (): void => {
      unsubscribe();
      observer.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.clearInterval(clockTimer);
      viewer?.remove();
      viewer = undefined;
      host.remove();
      screenSessionStore.getState().reset();
      logger.debug('view released');
    };

    const runtime = await loadHostRuntime();
    if (!host.isConnected) {
      cleanup();
      return () => {};
    }

    const result = await api.getScreen(screenId);
    if (!host.isConnected) {
      cleanup();
      return () => {};
    }
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      return cleanup;
    }

    canvas.width = result.data.screen.document.canvas.width;
    canvas.height = result.data.screen.document.canvas.height;
    nameLabel.textContent = result.data.screen.name;
    updateFit();

    const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
    stage.append(element);
    viewer = element;

    const configured = element.configure({
      catalog: runtime.catalog,
      runtimeContributions: runtime.runtimeContributions,
      instanceId: `host-app-vanilla:${screenId}`,
      mode: 'viewer',
      resourcePort: createHostResourcePort(),
    });
    if (!configured.ok) {
      logger.error('viewer configure failed', configured.diagnostics);
      screenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
      element.remove();
      return cleanup;
    }

    element.document = result.data.screen.document;
    screenSessionStore
      .getState()
      .loaded(result.data.screen.name, String(result.data.screen.revision));
    requestAnimationFrame(() => updateFit());
    logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
    return cleanup;
  },
};

function formatClock(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
