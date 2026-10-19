import { createAppShell } from '../components/app-shell';
import { openConfirmDelete, openDeleteBlocked } from '../components/datasource-dialogs';
import { openDatasourceDrawer } from '../components/datasource-drawer';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import {
  catalogHint,
  DATASOURCE_TEXT,
  DATASOURCE_TYPE_OPTIONS,
  type DatasourceItem,
  type DatasourceRefScreen,
  type DatasourceType,
  displayDatasetId,
  isWritableType,
  statusLabel,
  statusTone,
  testResultLabel,
  typeLabel,
} from '../lib/datasource-model';
import { el } from '../lib/dom';
import { formatDateTime } from '../lib/format';
import { createLogger } from '../lib/logger';
import type { Route, ViewModule } from '../router';

/**
 * 数据源管理页（PRD §10.2 / A25–A27、A33）。
 *
 * 与 React / Vue 同构：同一组 `data-ds-*` 属性、同一份模型文案与校验、同样"看 body.ok
 * 判业务成败"。列表整体重绘（页面级），抽屉由 `datasource-drawer.ts` 自己管理子树。
 */

const logger = createLogger('datasource-list');
const SEARCH_DEBOUNCE_MS = 200;

interface PageState {
  status: 'loading' | 'ready' | 'error';
  items: readonly DatasourceItem[];
  total: number;
  visibleCount: number;
  error: string | null;
  type: DatasourceType | 'all';
  query: string;
  result: { readonly datasetId: string; readonly ok: boolean; readonly message: string } | null;
}

export const datasourceListView: ViewModule = {
  async mount(container, _route: Route = { name: 'datasources' }): Promise<() => void> {
    const main = el('div', { class: 'shell__main' });
    const shell = createAppShell(main, 'datasources');
    container.append(shell.root);

    const state: PageState = {
      status: 'loading',
      items: [],
      total: 0,
      visibleCount: 0,
      error: null,
      type: 'all',
      query: '',
      result: null,
    };

    const searchInput = el('input', {
      class: 'field ds-toolbar__search',
      attrs: {
        type: 'search',
        placeholder: DATASOURCE_TEXT.searchPlaceholder,
        'aria-label': '搜索数据源',
        'data-ds-search': '',
      },
    });
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    searchInput.addEventListener('input', () => {
      state.query = searchInput.value;
      if (searchTimer !== null) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        void load();
      }, SEARCH_DEBOUNCE_MS);
    });

    const filters = el(
      'div',
      { class: 'ds-toolbar__filters', attrs: { role: 'group', 'aria-label': '按类型筛选' } },
      DATASOURCE_TYPE_OPTIONS.map((option) => {
        const button = el('button', {
          class: 'button ds-filter',
          text: option.label,
          attrs: { type: 'button', 'data-ds-filter': option.value },
        });
        button.setAttribute('aria-pressed', String(state.type === option.value));
        button.addEventListener('click', () => {
          if (state.type === option.value) return;
          state.type = option.value;
          void load();
        });
        return button;
      }),
    );

    const header = el('header', { class: 'list-header' }, [
      el('div', { class: 'list-header__title' }, [
        el('h1', { text: DATASOURCE_TEXT.pageTitle }),
        el('p', { class: 'list-header__subtitle', text: DATASOURCE_TEXT.pageDescription }),
      ]),
      el('div', { class: 'ds-toolbar' }, [
        searchInput,
        filters,
        el('button', {
          class: 'button',
          text: DATASOURCE_TEXT.refresh,
          on: { click: () => void load() },
        }),
        el('button', {
          class: 'button button--primary',
          text: DATASOURCE_TEXT.createButton,
          attrs: { 'data-ds-create': '' },
          on: { click: () => openDrawer({}) },
        }),
      ]),
    ]);

    const meta = el('div', { class: 'ds-meta' });
    const resultStrip = el('div');
    const listHost = el('div');
    const page = el('div', { class: 'page ds-page' }, [header, meta, resultStrip, listHost]);
    main.append(page);

    let drawerClose: (() => void) | null = null;

    const openDrawer = (options: {
      readonly datasetId?: string;
      readonly autoPreview?: boolean;
    }): void => {
      drawerClose?.();
      drawerClose = openDatasourceDrawer({
        datasetId: options.datasetId,
        autoPreview: options.autoPreview,
        onClose: () => {
          drawerClose = null;
        },
        onSaved: () => {
          drawerClose = null;
          void load();
        },
      });
    };

    const renderMeta = (): void => {
      meta.replaceChildren(
        el('span', { text: `共 ${state.total} 条`, attrs: { 'data-ds-total': '' } }),
      );
      const hint = catalogHint(state.total, state.visibleCount);
      if (hint !== null) {
        meta.append(
          el('span', { class: 'ds-meta__hint', text: hint, attrs: { 'data-ds-catalog-hint': '' } }),
        );
      }
    };

    const renderResult = (): void => {
      resultStrip.replaceChildren();
      if (state.result === null) return;
      const item = state.items.find((entry) => entry.datasetId === state.result?.datasetId);
      resultStrip.append(
        el('p', {
          class: `ds-result ds-result--${state.result.ok ? 'ok' : 'error'}`,
          text: `${testResultLabel(state.result.ok, state.result.message, undefined)}${
            item === undefined ? '' : ` · ${item.name}`
          }`,
          attrs: { role: 'status', 'data-ds-result': state.result.ok ? 'ok' : 'error' },
        }),
      );
    };

    const renderList = (): void => {
      listHost.replaceChildren();
      if (state.status === 'error') {
        const banner = el('div', { class: 'error-banner', attrs: { role: 'alert' } }, [
          el('span', {
            class: 'error-banner__message',
            text: state.error ?? DATASOURCE_TEXT.loadFailed,
          }),
          el('button', {
            class: 'button',
            text: DATASOURCE_TEXT.retry,
            on: { click: () => void load() },
          }),
        ]);
        listHost.append(banner);
        return;
      }
      if (state.status === 'loading') {
        const grid = el('div', { class: 'screen-grid' });
        for (let index = 0; index < 3; index += 1) {
          grid.append(el('article', { class: 'screen-card screen-card--skeleton' }));
        }
        listHost.append(grid);
        return;
      }
      if (state.items.length === 0) {
        const empty = el('p', { class: 'empty-state', attrs: { 'data-ds-empty': '' } });
        if (state.query.trim() === '' && state.type === 'all') {
          empty.textContent = DATASOURCE_TEXT.emptyList;
        } else {
          empty.append(
            document.createTextNode(
              `${DATASOURCE_TEXT.emptyFiltered}。${DATASOURCE_TEXT.emptyFilteredHint} `,
            ),
            el('button', {
              class: 'button ds-empty__reset',
              text: DATASOURCE_TEXT.clearFilters,
              on: {
                click: () => {
                  state.query = '';
                  state.type = 'all';
                  searchInput.value = '';
                  void load();
                },
              },
            }),
          );
        }
        listHost.append(empty);
        return;
      }

      const head = el('tr', {}, [
        el('th', { text: '名称', attrs: { scope: 'col' } }),
        el('th', { text: '类型', attrs: { scope: 'col' } }),
        el('th', { text: '状态', attrs: { scope: 'col' } }),
        el('th', { text: '连接摘要', attrs: { scope: 'col' } }),
        el('th', { text: '引用', attrs: { scope: 'col' } }),
        el('th', { text: '更新时间', attrs: { scope: 'col' } }),
        el('th', { text: '操作', attrs: { scope: 'col' } }),
      ]);
      const body = el(
        'tbody',
        {},
        state.items.map((item) => renderRow(item)),
      );
      listHost.append(
        el('div', { class: 'ds-table-wrap' }, [
          el('table', { class: 'ds-table' }, [el('thead', {}, [head]), body]),
        ]),
      );
    };

    const renderRow = (item: DatasourceItem): HTMLElement => {
      const actions = el('td', { class: 'ds-actions' });
      if (isWritableType(item.type)) {
        actions.append(
          el('button', {
            class: 'button ds-action',
            text: DATASOURCE_TEXT.edit,
            attrs: { 'data-ds-action': 'edit' },
            on: { click: () => openDrawer({ datasetId: item.datasetId }) },
          }),
          el('button', {
            class: 'button ds-action',
            text: DATASOURCE_TEXT.test,
            attrs: { 'data-ds-action': 'test' },
            on: { click: () => void testStored(item) },
          }),
          el('button', {
            class: 'button ds-action',
            text: DATASOURCE_TEXT.preview,
            attrs: { 'data-ds-action': 'preview' },
            on: { click: () => openDrawer({ datasetId: item.datasetId, autoPreview: true }) },
          }),
          el('button', {
            class: 'button button--danger ds-action',
            text: DATASOURCE_TEXT.remove,
            attrs: { 'data-ds-action': 'delete' },
            on: { click: () => void askDelete(item) },
          }),
        );
      } else {
        // 内置只读：没有编辑/删除，但「测试连接」要能点（A34）
        actions.append(
          el('button', {
            class: 'button ds-action',
            text: DATASOURCE_TEXT.view,
            attrs: { 'data-ds-action': 'view' },
            on: { click: () => openDrawer({ datasetId: item.datasetId }) },
          }),
          el('button', {
            class: 'button ds-action',
            text: DATASOURCE_TEXT.test,
            attrs: { 'data-ds-action': 'test' },
            on: { click: () => void testStored(item) },
          }),
        );
      }

      const nameCell = el('td', {}, [
        el('span', { class: 'ds-name', text: item.name }),
        el('code', {
          class: 'ds-id',
          text: displayDatasetId(item.datasetId, 32),
          attrs: { title: item.datasetId },
        }),
      ]);
      if (item.description !== null) {
        nameCell.append(el('span', { class: 'ds-desc', text: item.description }));
      }

      return el(
        'tr',
        {
          attrs: {
            'data-ds-row': '',
            'data-type': item.type,
            'data-status': item.status,
            'data-dataset-id': item.datasetId,
          },
        },
        [
          nameCell,
          el('td', { text: typeLabel(item.type) }),
          el('td', {}, [
            el('span', {
              class: `ds-badge ds-badge--${statusTone(item.status)}`,
              text: statusLabel(item.status),
              attrs: { title: item.lastTest?.message ?? '' },
            }),
          ]),
          el('td', { class: 'ds-summary', text: item.configSummary }),
          el('td', { text: String(item.refCount) }),
          el('td', { text: formatDateTime(item.updatedAt) }),
          actions,
        ],
      );
    };

    const renderFiltersState = (): void => {
      for (const button of filters.querySelectorAll<HTMLButtonElement>('[data-ds-filter]')) {
        const active = button.dataset.dsFilter === state.type;
        button.classList.toggle('ds-filter--active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    };

    const render = (): void => {
      renderMeta();
      renderResult();
      renderFiltersState();
      renderList();
    };

    async function load(): Promise<void> {
      if (state.status !== 'ready') state.status = 'loading';
      render();
      const response = await api.listDatasources({
        type: state.type,
        query: state.query,
        limit: 100,
      });
      if (response.ok === false) {
        state.status = 'error';
        state.error = response.error.message;
        render();
        return;
      }
      state.items = response.data.items;
      state.total = response.data.total;
      state.visibleCount = response.data.catalogVisibleCount;
      state.status = 'ready';
      state.error = null;
      render();
    }

    async function testStored(item: DatasourceItem): Promise<void> {
      const response = await api.testDatasourceStored(item.datasetId);
      if (response.ok === false) {
        state.result = { datasetId: item.datasetId, ok: false, message: response.error.message };
        render();
        showToast(`${DATASOURCE_TEXT.testFailed}：${response.error.message}`, 'error');
        return;
      }
      state.result = {
        datasetId: item.datasetId,
        ok: response.data.ok,
        message: response.data.message,
      };
      render();
      showToast(
        testResultLabel(response.data.ok, response.data.message, response.data.rowCount),
        response.data.ok ? 'success' : 'error',
      );
      // 测试会落库存状态（ready/error），刷新一次让徽标跟上
      await load();
    }

    async function askDelete(item: DatasourceItem): Promise<void> {
      if (item.refCount === 0) {
        openConfirmDelete(item.name, () => {
          void deleteItem(item);
        });
        return;
      }
      const response = await api.deleteDatasource(item.datasetId);
      if (response.ok === false) {
        if (response.error.code === 'DATASOURCE_IN_USE') {
          openDeleteBlocked(item.name, readRefScreens(response.error.payload));
          return;
        }
        showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
        return;
      }
      showToast(`已删除「${item.name}」`, 'success');
      await load();
    }

    async function deleteItem(item: DatasourceItem): Promise<void> {
      const response = await api.deleteDatasource(item.datasetId);
      if (response.ok === false) {
        if (response.error.code === 'DATASOURCE_IN_USE') {
          openDeleteBlocked(item.name, readRefScreens(response.error.payload));
          return;
        }
        showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
        return;
      }
      showToast(`已删除「${item.name}」`, 'success');
      await load();
    }

    render();
    await load();

    return () => {
      if (searchTimer !== null) clearTimeout(searchTimer);
      drawerClose?.();
      shell.root.remove();
      logger.debug('datasource view released');
    };
  },
};

/** 409 的 `refScreens` 来自错误体（过滤器透传的附加字段）。 */
function readRefScreens(
  payload: Readonly<Record<string, unknown>> | undefined,
): readonly DatasourceRefScreen[] {
  const raw = payload?.refScreens;
  if (Array.isArray(raw) === false) return [];
  const screens: DatasourceRefScreen[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    screens.push({
      id: record.id,
      name: record.name,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    });
  }
  return screens;
}
