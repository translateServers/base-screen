import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { createErrorBanner } from '../components/error-banner';
import { api } from '../lib/api';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { createHostResourcePort } from '../screen/host-data-channel';
import { registerHostMaterials } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';

const logger = createLogger('screen-view');

export const screenView: ViewModule = {
  async mount(container, route: Route): Promise<() => void> {
    if (route.name !== 'view') {
      container.append(createErrorBanner('缺少大屏 ID。', () => goToList()));
      return () => {};
    }
    const screenId = route.id;
    const session = screenSessionStore.getState();
    session.begin(screenId);

    const catalog = registerHostMaterials();
    const status = el('p', { class: 'stage__status', text: session.message });
    const toolbar = el('div', { class: 'stage__toolbar' }, [
      el('button', { class: 'button', text: '返回列表', on: { click: () => goToList() } }),
      el('button', {
        class: 'button button--primary',
        text: '编辑',
        on: {
          click: () => {
            window.location.hash = `#/screens/${screenId}/edit`;
          },
        },
      }),
      status,
    ]);
    const stage = el('div', { class: 'stage stage--view' });
    const banner = el('div', { class: 'stage__banner-host' });
    container.append(toolbar, banner, stage);

    const unsubscribe = screenSessionStore.subscribe((state) => {
      status.textContent = state.message;
      banner.replaceChildren(
        ...(state.error === null ? [] : [createErrorBanner(state.error, () => goToList())]),
      );
    });

    const result = await api.getScreen(screenId);
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      unsubscribe();
      return () => {};
    }

    // 查看器只读播放：configure 只接收目录与数据通道，不接收项目适配器。
    const viewer = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
    viewer.style.display = 'block';
    viewer.style.width = '100%';
    viewer.style.height = '100%';
    stage.append(viewer);

    const configured = viewer.configure({
      catalog,
      instanceId: `host-app-vanilla:${screenId}`,
      mode: 'viewer',
      resourcePort: createHostResourcePort(),
    });
    if (!configured.ok) {
      logger.error('viewer configure failed', configured.diagnostics);
      screenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
      viewer.remove();
      unsubscribe();
      return () => {};
    }

    viewer.document = result.data.screen.document;
    screenSessionStore
      .getState()
      .loaded(result.data.screen.name, String(result.data.screen.revision));
    logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });

    return () => {
      unsubscribe();
      viewer.remove();
      logger.debug('view released');
    };
  },
};
