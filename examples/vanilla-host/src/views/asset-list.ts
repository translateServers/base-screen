import { createAppShell } from '../components/app-shell';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import {
  ASSET_ACCEPTED_TYPES,
  ASSET_TEXT,
  assetContentPath,
  assetScopeLabel,
  formatAssetBytes,
  readAssetRefScreens,
  validateAssetFile,
} from '../lib/asset-model';
import { el } from '../lib/dom';
import { formatDateTime } from '../lib/format';
import { createLogger } from '../lib/logger';
import type { Route, ViewModule } from '../router';
import { clearAssetReturn, readAssetReturn } from '../screen/asset-return';
import type { HostAssetShape } from '../types';

/**
 * 宿主素材后台页：公共素材的长期管理入口。
 *
 * 设计器左栏只做消费 + 临时上传；这里的上传只产生公共素材。临时素材按来源筛选查看，
 * 可删除未引用项，删除保护与列表引用数由后端计算。
 */
const logger = createLogger('asset-list');

type AssetScope = 'public' | 'temporary';

interface PageState {
  status: 'loading' | 'ready' | 'error';
  scope: AssetScope;
  query: string;
  items: readonly HostAssetShape[];
  error: string | null;
  result: { readonly ok: boolean; readonly message: string } | null;
  pendingDeleteId: string | null;
  uploading: boolean;
}

export const assetListView: ViewModule = {
  async mount(container, _route: Route = { name: 'assets' }): Promise<() => void> {
    const main = el('div', { class: 'shell__main' });
    const shell = createAppShell(main, 'assets');
    container.append(shell.root);

    const state: PageState = {
      status: 'loading',
      scope: 'public',
      query: '',
      items: [],
      error: null,
      result: null,
      pendingDeleteId: null,
      uploading: false,
    };
    let disposed = false;

    const searchInput = el('input', {
      class: 'field ds-toolbar__search',
      attrs: {
        type: 'search',
        placeholder: ASSET_TEXT.searchPlaceholder,
        'aria-label': '搜索素材',
        'data-asset-admin-search': '',
      },
    });
    searchInput.addEventListener('input', () => {
      state.query = searchInput.value;
      render();
    });

    const scopeFilters = el(
      'div',
      { class: 'ds-toolbar__filters', attrs: { role: 'group', 'aria-label': '按来源筛选' } },
      (['public', 'temporary'] as const).map((scope) => {
        const button = el('button', {
          class: 'button ds-filter',
          text: scope === 'public' ? ASSET_TEXT.scopePublic : ASSET_TEXT.scopeTemporary,
          attrs: { type: 'button', 'data-asset-admin-scope': scope },
        });
        button.addEventListener('click', () => {
          if (state.scope === scope) return;
          state.scope = scope;
          state.pendingDeleteId = null;
          state.result = null;
          state.status = 'loading';
          void load();
        });
        return button;
      }),
    );

    const uploadInput = el('input', {
      class: 'asset-admin-upload-input',
      attrs: {
        type: 'file',
        accept: ASSET_ACCEPTED_TYPES,
        multiple: '',
        hidden: '',
        'data-asset-admin-upload': '',
      },
    });
    uploadInput.addEventListener('change', () => {
      const files = Array.from(uploadInput.files ?? []);
      uploadInput.value = '';
      void uploadFiles(files);
    });
    const uploadLabel = el(
      'label',
      {
        class: 'button button--primary asset-admin-upload',
        attrs: { 'data-asset-admin-upload-label': '' },
      },
      [document.createTextNode(ASSET_TEXT.publicUpload), uploadInput],
    );

    const returnTarget = readAssetReturn();
    const header = el('header', { class: 'list-header' }, [
      el('div', { class: 'list-header__title' }, [
        el('h1', { text: ASSET_TEXT.adminTitle }),
        el('p', { class: 'list-header__subtitle', text: ASSET_TEXT.adminDescription }),
      ]),
      el('div', { class: 'ds-toolbar' }, [
        ...(returnTarget === null
          ? []
          : [
              el('a', {
                class: 'button ds-return-link',
                text: '返回大屏',
                attrs: { href: returnTarget.href, 'data-asset-admin-return': '' },
                on: { click: () => clearAssetReturn() },
              }),
            ]),
        searchInput,
        scopeFilters,
        el('button', {
          class: 'button',
          text: ASSET_TEXT.refresh,
          on: { click: () => void load() },
        }),
        uploadLabel,
      ]),
    ]);

    const meta = el('div', { class: 'ds-meta' });
    const resultStrip = el('div');
    const listHost = el('div');
    const page = el('div', { class: 'page ds-page asset-admin-page' }, [
      header,
      meta,
      resultStrip,
      listHost,
    ]);
    main.append(page);

    const visibleItems = (): readonly HostAssetShape[] => {
      const normalized = state.query.trim().toLocaleLowerCase();
      return normalized.length === 0
        ? state.items
        : state.items.filter((asset) => asset.name.toLocaleLowerCase().includes(normalized));
    };

    const renderMeta = (): void => {
      const visible = visibleItems().length;
      meta.replaceChildren(
        el('span', {
          text: `共 ${visible} 条`,
          attrs: { 'data-asset-admin-total': '' },
        }),
      );
    };

    const renderResult = (): void => {
      resultStrip.replaceChildren();
      if (state.result === null) return;
      resultStrip.append(
        el('p', {
          class: `ds-result ds-result--${state.result.ok ? 'ok' : 'error'}`,
          text: state.result.message,
          attrs: {
            role: 'status',
            'data-asset-admin-result': state.result.ok ? 'ok' : 'error',
          },
        }),
      );
    };

    const renderFilters = (): void => {
      for (const button of scopeFilters.querySelectorAll<HTMLButtonElement>(
        '[data-asset-admin-scope]',
      )) {
        const active = button.dataset.assetAdminScope === state.scope;
        button.classList.toggle('ds-filter--active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      uploadLabel.style.display = state.scope === 'public' ? '' : 'none';
    };

    const renderList = (): void => {
      listHost.replaceChildren();
      if (state.status === 'error') {
        listHost.append(
          el('div', { class: 'error-banner', attrs: { role: 'alert' } }, [
            el('span', {
              class: 'error-banner__message',
              text: state.error ?? ASSET_TEXT.loadFailed,
            }),
            el('button', {
              class: 'button',
              text: ASSET_TEXT.retry,
              on: { click: () => void load() },
            }),
          ]),
        );
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
      const items = visibleItems();
      if (items.length === 0) {
        const empty = el('p', {
          class: 'empty-state',
          text:
            state.items.length === 0
              ? state.scope === 'public'
                ? ASSET_TEXT.emptyPublic
                : ASSET_TEXT.emptyTemporary
              : ASSET_TEXT.emptyFiltered,
          attrs: { 'data-asset-admin-empty': '' },
        });
        listHost.append(empty);
        return;
      }

      const head = el('tr', {}, [
        el('th', { text: '素材', attrs: { scope: 'col' } }),
        el('th', { text: '来源', attrs: { scope: 'col' } }),
        el('th', { text: '类型', attrs: { scope: 'col' } }),
        el('th', { text: '大小', attrs: { scope: 'col' } }),
        el('th', { text: ASSET_TEXT.inUse, attrs: { scope: 'col' } }),
        el('th', { text: '上传时间', attrs: { scope: 'col' } }),
        el('th', { text: '过期时间', attrs: { scope: 'col' } }),
        el('th', { text: '操作', attrs: { scope: 'col' } }),
      ]);
      const body = el(
        'tbody',
        {},
        items.map((asset) => renderRow(asset)),
      );
      listHost.append(
        el('div', { class: 'ds-table-wrap' }, [
          el('table', { class: 'ds-table asset-admin-table' }, [el('thead', {}, [head]), body]),
        ]),
      );
    };

    const renderRow = (asset: HostAssetShape): HTMLElement => {
      const source = el('td', {}, [
        el('span', { class: 'asset-admin-source' }, [
          el('span', {
            class: `ds-badge ${asset.temporary ? 'ds-badge--draft' : 'ds-badge--builtin'}`,
            text: assetScopeLabel(asset),
          }),
          ...(asset.temporary && asset.screenId !== null
            ? [
                el('small', {
                  class: 'asset-admin-scope-detail',
                  text: `大屏 ${asset.screenId}`,
                }),
              ]
            : []),
        ]),
      ]);

      const actions = el('td', { class: 'ds-actions' });
      if (state.pendingDeleteId === asset.id) {
        actions.append(
          el('button', {
            class: 'button button--danger ds-action',
            text: '确认删除',
            attrs: { type: 'button', 'data-asset-admin-confirm': '' },
            on: { click: () => void deleteAsset(asset) },
          }),
          el('button', {
            class: 'button ds-action',
            text: '取消',
            attrs: { type: 'button', 'data-asset-admin-cancel': '' },
            on: {
              click: () => {
                state.pendingDeleteId = null;
                renderList();
              },
            },
          }),
        );
      } else {
        actions.append(
          el('button', {
            class: 'button ds-action',
            text: ASSET_TEXT.remove,
            attrs: { type: 'button', 'data-asset-admin-delete': '' },
            on: {
              click: () => {
                state.pendingDeleteId = asset.id;
                state.result = null;
                renderList();
              },
            },
          }),
        );
      }

      return el(
        'tr',
        {
          attrs: {
            'data-asset-admin-row': '',
            'data-asset-id': asset.id,
            'data-asset-scope': asset.temporary ? 'temporary' : 'public',
          },
        },
        [
          el('td', {}, [
            el('span', { class: 'asset-admin-name' }, [
              el('img', {
                class: 'asset-admin-thumb',
                attrs: { src: `${resolveApiBase()}${assetContentPath(asset)}`, alt: '' },
              }),
              el('span', { class: 'asset-admin-name-text', text: asset.name }),
            ]),
          ]),
          source,
          el('td', { text: asset.mimeType }),
          el('td', { text: formatAssetBytes(asset.byteSize) }),
          el('td', { text: String(asset.referenceCount) }),
          el('td', { text: formatDateTime(asset.createdAt) }),
          el('td', {
            text: asset.expiresAt === null ? '—' : formatDateTime(asset.expiresAt),
          }),
          actions,
        ],
      );
    };

    const render = (): void => {
      renderMeta();
      renderResult();
      renderFilters();
      renderList();
    };

    async function load(): Promise<void> {
      if (state.status !== 'ready') state.status = 'loading';
      state.error = null;
      render();
      const response = await api.listAssets(
        state.scope === 'temporary' ? { scope: 'temporary' } : {},
      );
      if (disposed) return;
      if (response.ok === false) {
        state.status = 'error';
        state.error = response.error.message;
        render();
        return;
      }
      state.items = response.data.assets;
      state.status = 'ready';
      render();
    }

    async function uploadFiles(files: readonly File[]): Promise<void> {
      if (files.length === 0 || state.uploading || state.scope !== 'public') return;
      const accepted: File[] = [];
      const rejected: string[] = [];
      for (const file of files) {
        const reason = validateAssetFile(file);
        if (reason === null) accepted.push(file);
        else rejected.push(`${file.name}：${reason}`);
      }
      if (accepted.length === 0) {
        state.result = { ok: false, message: rejected.join('；') };
        renderResult();
        return;
      }
      state.uploading = true;
      let uploaded = 0;
      for (const file of accepted) {
        const response = await api.uploadAsset(file);
        if (disposed) return;
        if (response.ok) uploaded += 1;
        else rejected.push(`${file.name}：${response.error.message}`);
      }
      state.uploading = false;
      await load();
      if (disposed) return;
      state.result = {
        ok: rejected.length === 0,
        message: `已上传 ${uploaded}/${accepted.length} 张公共素材。${
          rejected.length === 0 ? '' : ` ${rejected.join('；')}`
        }`,
      };
      render();
      if (uploaded > 0) showToast(`已上传 ${uploaded} 张公共素材`, 'success');
    }

    async function deleteAsset(asset: HostAssetShape): Promise<void> {
      const response = await api.deleteAsset(asset.id);
      if (disposed) return;
      state.pendingDeleteId = null;
      if (response.ok === false) {
        if (response.error.code === 'ASSET_IN_USE') {
          const screens = readAssetRefScreens(response.error.payload);
          state.result = {
            ok: false,
            message:
              screens.length > 0
                ? `该素材仍被这些大屏引用：${screens.join('、')}。先替换引用后再删除。`
                : response.error.message,
          };
        } else {
          state.result = { ok: false, message: `删除失败：${response.error.message}` };
        }
        render();
        return;
      }
      state.result = { ok: true, message: `已删除「${asset.name}」。` };
      await load();
      if (disposed) return;
      render();
      showToast(`已删除「${asset.name}」`, 'success');
    }

    render();
    await load();

    return () => {
      disposed = true;
      shell.root.remove();
      logger.debug('asset view released');
    };
  },
};
