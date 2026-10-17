import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { showToast } from '../components/toast';
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
      showToast('缺少大屏 ID。', 'error');
      return () => {};
    }
    const screenId = route.id;
    const session = screenSessionStore.getState();
    session.begin(screenId);

    const catalog = registerHostMaterials();
    // 查看器没有自带顶栏，返回入口与状态文案仍归宿主：一条浮在视口右上角的窄条，
    // 不参与页面布局，因此不会与基座的测量互相影响。
    const status = el('span', { class: 'embed-bar__status', text: session.message });
    const bar = el('div', { class: 'embed-bar' }, [
      el('button', { class: 'button', text: '返回列表', on: { click: () => goToList() } }),
      status,
    ]);
    // 尺寸交给 .stage / .stage > * 的 CSS（占满视口），宿主不再内联写百分比宽高。
    const stage = el('div', { class: 'stage' });
    container.append(stage, bar);

    const unsubscribe = screenSessionStore.subscribe((state, previous) => {
      status.textContent = state.message;
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    const result = await api.getScreen(screenId);
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      unsubscribe();
      return () => {};
    }

    // 查看器只读播放：configure 只接收目录与数据通道，不接收项目适配器。
    const viewer = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
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
      bar.remove();
      logger.debug('view released');
    };
  },
};
