import { showToast } from '../components/toast';
import { el } from '../lib/dom';
import { formatDateTime, formatNumber } from '../lib/format';
import { createLogger } from '../lib/logger';
import { goToEdit, goToView } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { screensStore } from '../store/screens-store';
import type { ScreenSummaryShape } from '../types';

const logger = createLogger('screen-list');

export const screenListView: ViewModule = {
  async mount(container, _route: Route = { name: 'list' }): Promise<() => void> {
    // 订阅 store（zustand/vanilla 的 subscribe 收到新状态），渲染只读快照。
    const unsubscribe = screensStore.subscribe((state) => {
      render(container, state.status, state.screens, state.error);
    });
    const state = screensStore.getState();
    render(container, state.status, state.screens, state.error);
    await screensStore.getState().load();

    return () => {
      unsubscribe();
      logger.debug('list view released');
    };
  },
};

function render(
  container: HTMLElement,
  status: ReturnType<typeof screensStore.getState>['status'],
  screens: readonly ScreenSummaryShape[],
  error: string | null,
): void {
  if (status === 'error') {
    renderError(container, error ?? '加载失败', () => void screensStore.getState().load());
    return;
  }
  if (status === 'idle' || status === 'loading') {
    renderLoading(container);
    return;
  }
  renderList(container, screens);
}

function renderLoading(container: HTMLElement): void {
  container.replaceChildren();
  container.append(
    el('header', { class: 'list-header' }, [el('h1', { text: '大屏管家' })]),
    el('div', { class: 'screen-grid' }, [skeletonCard(), skeletonCard(), skeletonCard()]),
  );
}

function skeletonCard(): HTMLElement {
  return el('article', {
    class: 'screen-card screen-card--skeleton',
    attrs: { 'aria-hidden': 'true' },
  });
}

function renderError(container: HTMLElement, message: string, retry: () => void): void {
  container.replaceChildren();
  const banner = el('div', { class: 'error-banner', attrs: { role: 'alert' } });
  banner.append(
    el('span', { class: 'error-banner__message', text: message }),
    el('button', { class: 'button', text: '重试', on: { click: retry } }),
  );
  container.append(
    el('header', { class: 'list-header' }, [el('h1', { text: '大屏管家' })]),
    banner,
  );
}

function renderList(container: HTMLElement, screens: readonly ScreenSummaryShape[]): void {
  container.replaceChildren();
  const header = el('header', { class: 'list-header' });
  header.append(
    el('h1', { text: '大屏管家' }),
    el('button', {
      class: 'button button--primary',
      text: '新建大屏',
      on: { click: () => void createScreen() },
    }),
  );

  if (screens.length === 0) {
    container.append(
      header,
      el('p', { class: 'empty-state', text: '还没有大屏，点击右上角「新建大屏」开始。' }),
    );
    return;
  }

  const grid = el('div', { class: 'screen-grid' });
  for (const screen of screens) {
    grid.append(renderCard(screen));
  }
  container.append(header, grid);
}

function renderCard(screen: ScreenSummaryShape): HTMLElement {
  const card = el('article', { class: 'screen-card' });
  card.append(
    el('h2', { class: 'screen-card__name', text: screen.name }),
    el('dl', { class: 'screen-card__meta' }, [
      el('div', {}, [
        el('dt', { text: '版本' }),
        el('dd', { text: formatNumber(screen.revision) }),
      ]),
      el('div', {}, [
        el('dt', { text: '更新于' }),
        el('dd', { text: formatDateTime(screen.updatedAt) }),
      ]),
    ]),
    el('footer', { class: 'screen-card__actions' }, [
      el('button', { class: 'button', text: '编辑', on: { click: () => goToEdit(screen.id) } }),
      el('button', { class: 'button', text: '查看', on: { click: () => goToView(screen.id) } }),
      el('button', {
        class: 'button button--danger',
        text: '删除',
        on: {
          click: () => {
            if (!window.confirm(`确认删除「${screen.name}」？该操作不可撤销。`)) return;
            void removeScreen(screen.id, screen.name);
          },
        },
      }),
    ]),
  );
  return card;
}

async function createScreen(): Promise<void> {
  const name = window.prompt('新大屏名称', '未命名大屏');
  if (name === null) return;
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    showToast('名称不能为空', 'error');
    return;
  }
  const id = await screensStore.getState().create(trimmed);
  if (id === null) {
    showToast(`新建失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
    return;
  }
  showToast(`已创建「${trimmed}」`, 'success');
  goToEdit(id);
}

async function removeScreen(id: string, name: string): Promise<void> {
  const removed = await screensStore.getState().remove(id);
  if (!removed) {
    showToast(`删除失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
    return;
  }
  showToast(`已删除「${name}」`, 'success');
}
