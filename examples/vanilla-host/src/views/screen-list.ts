import { createAppShell } from '../components/app-shell';
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
    // 列表是宿主自有页面，所以由它自己套外壳；嵌入基座的编辑/查看页不套。
    const main = el('div', { class: 'shell__main' });
    const shell = createAppShell(main);
    container.append(shell.root);

    // 新建与删除都走页面内控件：window.prompt / window.confirm 在嵌入式浏览器里会被直接
    // 抑制并返回 null，那样点按钮就只剩「没有反应」。头部只建一次，列表重渲染时不会丢掉
    // 正在输入的名称。
    const nameInput = el('input', {
      class: 'field',
      attrs: { type: 'text', placeholder: '新大屏名称', 'aria-label': '新大屏名称' },
    });
    const topicInput = el('input', {
      class: 'field',
      attrs: {
        type: 'text',
        placeholder: '一句话描述，例如：华东渠道库存与周转的经营会大屏',
        'aria-label': '一句话生成大屏的主题',
      },
    });
    const generateButton = el('button', {
      class: 'button',
      attrs: { type: 'submit' },
      text: '智能生成',
    });
    const header = el('header', { class: 'list-header' }, [
      el('div', { class: 'list-header__title' }, [
        el('h1', { text: '数据可视化工作台' }),
        el('p', { class: 'list-header__subtitle', text: 'BASE SCREEN · 成品大屏示例' }),
      ]),
      el('div', { class: 'list-header__actions' }, [
        el(
          'form',
          {
            class: 'create-screen',
            on: {
              submit: (event: Event) => {
                event.preventDefault();
                void createScreen(nameInput);
              },
            },
          },
          [
            nameInput,
            el('button', {
              class: 'button button--primary',
              attrs: { type: 'submit' },
              text: '新建大屏',
            }),
          ],
        ),
        el(
          'form',
          {
            class: 'create-screen create-screen--generate',
            on: {
              submit: (event: Event) => {
                event.preventDefault();
                void generateFromTopic(topicInput, generateButton);
              },
            },
          },
          [topicInput, generateButton],
        ),
      ]),
    ]);
    const body = el('div');
    main.append(el('div', { class: 'page' }, [header, body]));

    // 删除的二次确认按卡片展开，同一时刻只有一份待确认 id。
    let pendingDeleteId: string | null = null;

    const render = (): void => {
      const state = screensStore.getState();
      renderBody(body, state.status, state.screens, state.error, {
        onRetry: () => void screensStore.getState().load(),
        isPendingDelete: (id) => id === pendingDeleteId,
        askRemove: (id) => {
          pendingDeleteId = id;
          render();
        },
        cancelRemove: () => {
          pendingDeleteId = null;
          render();
        },
        remove: (screen) => {
          pendingDeleteId = null;
          void removeScreen(screen).then(render);
        },
      });
    };

    // 订阅 store（zustand/vanilla 的 subscribe 收到新状态），渲染只读快照。
    const unsubscribe = screensStore.subscribe(render);
    render();
    await screensStore.getState().load();

    return () => {
      unsubscribe();
      shell.root.remove();
      logger.debug('list view released');
    };
  },
};

interface ListHandlers {
  readonly onRetry: () => void;
  readonly isPendingDelete: (id: string) => boolean;
  readonly askRemove: (id: string) => void;
  readonly cancelRemove: () => void;
  readonly remove: (screen: ScreenSummaryShape) => void;
}

function renderBody(
  body: HTMLElement,
  status: ReturnType<typeof screensStore.getState>['status'],
  screens: readonly ScreenSummaryShape[],
  error: string | null,
  handlers: ListHandlers,
): void {
  body.replaceChildren();
  if (status === 'error') {
    body.append(createErrorBanner(error ?? '加载失败', handlers.onRetry));
    return;
  }
  if (status === 'idle' || status === 'loading') {
    body.append(
      el('div', { class: 'screen-grid' }, [skeletonCard(), skeletonCard(), skeletonCard()]),
    );
    return;
  }
  if (screens.length === 0) {
    body.append(
      el('p', { class: 'empty-state', text: '还没有大屏，输入名称后点「新建大屏」开始。' }),
    );
    return;
  }
  const grid = el('div', { class: 'screen-grid' });
  for (const screen of screens) {
    grid.append(renderCard(screen, handlers));
  }
  body.append(grid);
}

function createErrorBanner(message: string, retry: () => void): HTMLElement {
  const banner = el('div', { class: 'error-banner', attrs: { role: 'alert' } });
  banner.append(
    el('span', { class: 'error-banner__message', text: message }),
    el('button', { class: 'button', text: '重试', on: { click: retry } }),
  );
  return banner;
}

function skeletonCard(): HTMLElement {
  return el('article', {
    class: 'screen-card screen-card--skeleton',
    attrs: { 'aria-hidden': 'true' },
  });
}

function renderCard(screen: ScreenSummaryShape, handlers: ListHandlers): HTMLElement {
  const actions = el('footer', { class: 'screen-card__actions' }, [
    el('button', { class: 'button', text: '编辑', on: { click: () => goToEdit(screen.id) } }),
    el('button', { class: 'button', text: '查看', on: { click: () => goToView(screen.id) } }),
  ]);
  if (handlers.isPendingDelete(screen.id)) {
    actions.append(
      el('span', { class: 'screen-card__confirm', text: '删除后不可撤销' }),
      el('button', {
        class: 'button button--danger',
        text: '确认删除',
        on: { click: () => handlers.remove(screen) },
      }),
      el('button', { class: 'button', text: '取消', on: { click: handlers.cancelRemove } }),
    );
  } else {
    actions.append(
      el('button', {
        class: 'button button--danger',
        text: '删除',
        on: { click: () => handlers.askRemove(screen.id) },
      }),
    );
  }

  return el('article', { class: 'screen-card' }, [
    el('div', { class: 'screen-cover' }, [
      el('span', { class: 'screen-cover__mark', text: 'DATA SCREEN' }),
      el('span', { class: 'screen-cover__badge', text: '1920 × 1080' }),
      el('h2', { class: 'screen-card__name', text: screen.name }),
    ]),
    el('div', { class: 'screen-card__body' }, [
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
      actions,
    ]),
  ]);
}

async function createScreen(nameInput: HTMLInputElement): Promise<void> {
  const trimmed = nameInput.value.trim();
  if (trimmed.length === 0) {
    showToast('请先填写大屏名称', 'error');
    return;
  }
  const id = await screensStore.getState().create(trimmed);
  if (id === null) {
    showToast(`新建失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
    return;
  }
  nameInput.value = '';
  showToast(`已创建「${trimmed}」`, 'success');
  goToEdit(id);
}

async function generateFromTopic(
  topicInput: HTMLInputElement,
  button: HTMLButtonElement,
): Promise<void> {
  const topic = topicInput.value.trim();
  if (topic.length === 0) {
    showToast('请先描述要生成的大屏主题', 'error');
    return;
  }
  // 生成会在后端新建一张屏，重复提交会得到多张重复的屏，所以生成期间整体锁住。
  button.disabled = true;
  button.textContent = '生成中…';
  try {
    const id = await screensStore.getState().generate(topic);
    if (id === null) {
      showToast(`生成失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
      return;
    }
    topicInput.value = '';
    showToast('已生成，正在打开编辑页', 'success');
    goToEdit(id);
  } finally {
    button.disabled = false;
    button.textContent = '智能生成';
  }
}

async function removeScreen(screen: ScreenSummaryShape): Promise<void> {
  const removed = await screensStore.getState().remove(screen.id);
  if (!removed) {
    showToast(`删除失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
    return;
  }
  showToast(`已删除「${screen.name}」`, 'success');
}
