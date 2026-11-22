import { createAppShell } from '../components/app-shell';
import { showToast } from '../components/toast';
import { el } from '../lib/dom';
import { formatDateTime } from '../lib/format';
import { goToAtomicComponent, goToEdit, goToFragmentComponent } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import {
  ATOMIC_COMPONENT_TEMPLATES,
  type AtomicComponentItem,
  type ComponentItem,
  type ComponentLibrarySnapshot,
  clearComponentReturn,
  createAtomicComponentType,
  createFragmentId,
  deleteAtomicComponent,
  deleteFragment,
  loadComponentLibrary,
  readComponentReturn,
  saveAtomicDraft,
  saveFragmentDefinition,
  setAtomicVisibility,
} from '../screen/component-library';
import { renderCover, renderFragmentCover } from '../screen/component-preview';
import { loadHostRuntime } from '../screen/host-runtime';
import type { ComponentScreenReferenceShape } from '../types';

/**
 * 组件库（ADR-0106 §2.2 / brief P1）：案例项目的一级页面，与大屏、数据源、素材同级。
 *
 * 原子组件与组合同库混排（ADR-0100 决议 3），按类型 / 状态筛选；删除被引用的原子组件由后端阻断，
 * 页面列出引用它的大屏并建议下架。编辑在两个全页编辑器里进行，这一页只做浏览与管理。
 */
type KindFilter = 'all' | 'atomic' | 'fragment';
type StatusFilter = 'all' | 'listed' | 'unlisted' | 'unpublished' | 'draft';
type Layout = 'grid' | 'list';

const KIND_FILTERS: readonly { readonly id: KindFilter; readonly label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'atomic', label: '原子组件' },
  { id: 'fragment', label: '组合' },
];
const STATUS_FILTERS: readonly { readonly id: StatusFilter; readonly label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'listed', label: '已上架' },
  { id: 'unlisted', label: '已下架' },
  { id: 'unpublished', label: '未发布' },
  { id: 'draft', label: '有未发布改动' },
];
const LAYOUT_KEY = 'base-screen.host.component-library.layout';

interface PageState {
  status: 'loading' | 'ready' | 'error';
  error: string;
  snapshot: ComponentLibrarySnapshot | undefined;
  query: string;
  kind: KindFilter;
  statusFilter: StatusFilter;
  layout: Layout;
  pendingDelete: string | undefined;
  blocked: { readonly key: string; readonly references: readonly ComponentScreenReferenceShape[] } | undefined;
  busy: string | undefined;
}

export const componentListView: ViewModule = {
  mount(container, _route: Route = { name: 'components' }): () => void {
    const main = el('div', { class: 'shell__main' });
    container.append(createAppShell(main, 'components').root);
    const controller = new AbortController();

    const state: PageState = {
      status: 'loading',
      error: '',
      snapshot: undefined,
      query: '',
      kind: 'all',
      statusFilter: 'all',
      layout: readLayout(),
      pendingDelete: undefined,
      blocked: undefined,
      busy: undefined,
    };

    const search = el('input', {
      class: 'field ds-toolbar__search',
      attrs: {
        type: 'search',
        placeholder: '搜索名称、分类、关键词',
        'aria-label': '搜索组件',
        'data-component-search': '',
      },
      on: {
        input: (event) => {
          state.query = (event.target as HTMLInputElement).value;
          renderBody();
        },
      },
    });
    const kindFilters = filterGroup('按类型筛选', KIND_FILTERS, () => state.kind, (id) => {
      state.kind = id;
      renderBody();
    });
    const statusFilters = filterGroup('按状态筛选', STATUS_FILTERS, () => state.statusFilter, (id) => {
      state.statusFilter = id;
      renderBody();
    });
    const layoutToggle = filterGroup(
      '视图',
      [
        { id: 'grid' as const, label: '卡片' },
        { id: 'list' as const, label: '列表' },
      ],
      () => state.layout,
      (id) => {
        state.layout = id;
        writeLayout(id);
        renderBody();
      },
    );

    const returnTarget = readComponentReturn();
    const header = el('header', { class: 'list-header' }, [
      el('div', { class: 'list-header__title' }, [
        el('h1', { text: '组件库' }),
        el('p', {
          class: 'list-header__subtitle',
          text: '在线制作原子组件与组合；发布后出现在所有大屏的物料库里',
        }),
      ]),
      el('div', { class: 'ds-toolbar' }, [
        ...(returnTarget === null
          ? []
          : [
              el('a', {
                class: 'button ds-return-link',
                text: '返回大屏',
                attrs: { href: returnTarget.href, 'data-component-return': '' },
                on: { click: () => clearComponentReturn() },
              }),
            ]),
        el('button', {
          class: 'button',
          text: '新建组合',
          attrs: { 'data-component-new-fragment': '' },
          on: { click: () => goToFragmentComponent(undefined) },
        }),
        el('button', {
          class: 'button button--primary',
          text: '新建原子组件',
          attrs: { 'data-component-new-atomic': '' },
          on: { click: () => openTemplatePicker() },
        }),
      ]),
    ]);
    const toolbar = el('div', { class: 'ds-toolbar component-library__filters' }, [
      search,
      kindFilters.element,
      statusFilters.element,
      el('span', { class: 'component-library__spacer' }),
      layoutToggle.element,
    ]);
    const meta = el('div', { class: 'ds-meta' });
    const notices = el('div');
    const body = el('div', { class: 'component-library__body' });
    main.append(
      el('div', { class: 'page ds-page component-library' }, [header, toolbar, meta, notices, body]),
    );

    // ———————— 数据 ————————

    let catalog: Awaited<ReturnType<typeof loadHostRuntime>>['catalog'] | undefined;

    const load = async (): Promise<void> => {
      state.status = 'loading';
      renderBody();
      const [result, runtime] = await Promise.all([
        loadComponentLibrary(controller.signal),
        loadHostRuntime().catch(() => undefined),
      ]);
      if (controller.signal.aborted) return;
      catalog = runtime?.catalog;
      if (!result.ok) {
        state.status = 'error';
        state.error = result.diagnostics[0]?.message ?? '组件库读取失败。';
      } else {
        state.status = 'ready';
        state.snapshot = result.value;
      }
      renderBody();
    };

    const items = (): readonly ComponentItem[] => {
      const snapshot = state.snapshot;
      if (snapshot === undefined) return [];
      const query = state.query.trim().toLocaleLowerCase();
      const all: ComponentItem[] = [
        ...(state.kind === 'fragment' ? [] : snapshot.atomic),
        ...(state.kind === 'atomic' ? [] : snapshot.fragments),
      ];
      return all.filter((item) => {
        if (state.statusFilter !== 'all') {
          if (item.kind === 'fragment') return false;
          if (state.statusFilter === 'draft' ? !item.hasDraft : item.status !== state.statusFilter) {
            return false;
          }
        }
        if (query === '') return true;
        return [item.name, item.category, ...item.keywords].some((text) =>
          text.toLocaleLowerCase().includes(query),
        );
      });
    };

    // ———————— 渲染 ————————

    const renderBody = (): void => {
      kindFilters.sync();
      statusFilters.sync();
      layoutToggle.sync();
      statusFilters.element.hidden = state.kind === 'fragment';
      notices.replaceChildren();
      const warnings = state.snapshot?.warnings ?? [];
      if (warnings.length > 0) {
        notices.append(
          el('ul', { class: 'component-library__warnings', attrs: { role: 'status' } }, [
            ...warnings.map((text) => el('li', { text })),
          ]),
        );
      }
      if (state.status === 'error') {
        meta.replaceChildren();
        body.replaceChildren(
          el('div', { class: 'error-banner', attrs: { role: 'alert' } }, [
            el('span', { class: 'error-banner__message', text: state.error }),
            el('button', { class: 'button', text: '重试', on: { click: () => void load() } }),
          ]),
        );
        return;
      }
      if (state.status === 'loading') {
        meta.replaceChildren(el('span', { text: '正在读取…' }));
        body.replaceChildren(
          el(
            'div',
            { class: 'component-grid' },
            Array.from({ length: 6 }, () =>
              el('article', { class: 'component-card component-card--skeleton', attrs: { 'aria-hidden': 'true' } }),
            ),
          ),
        );
        return;
      }
      const visible = items();
      const snapshot = state.snapshot;
      meta.replaceChildren(
        el('span', {
          text: `原子组件 ${snapshot?.atomic.length ?? 0} · 组合 ${snapshot?.fragments.length ?? 0}`,
          attrs: { 'data-component-total': '' },
        }),
        ...(visible.length === (snapshot?.atomic.length ?? 0) + (snapshot?.fragments.length ?? 0)
          ? []
          : [el('span', { class: 'ds-meta__hint', text: `筛选后 ${visible.length} 个` })]),
      );
      if (visible.length === 0) {
        const nothing = (snapshot?.atomic.length ?? 0) === 0 && state.query === '' && state.kind !== 'fragment';
        body.replaceChildren(
          el('div', { class: 'empty-state component-library__empty', attrs: { 'data-component-empty': '' } }, [
            el('p', {
              text: nothing ? '还没有在线组件。从一个模板开始，几分钟就能做出第一个。' : '没有符合条件的组件。',
            }),
            ...(nothing
              ? [
                  el('button', {
                    class: 'button button--primary',
                    text: '从模板新建',
                    on: { click: () => openTemplatePicker() },
                  }),
                ]
              : [
                  el('button', {
                    class: 'button',
                    text: '清除筛选',
                    on: {
                      click: () => {
                        state.query = '';
                        search.value = '';
                        state.kind = 'all';
                        state.statusFilter = 'all';
                        renderBody();
                      },
                    },
                  }),
                ]),
          ]),
        );
        return;
      }
      body.replaceChildren(state.layout === 'grid' ? renderGrid(visible) : renderTable(visible));
    };

    const renderGrid = (visible: readonly ComponentItem[]): HTMLElement => {
      const grid = el('div', { class: 'component-grid' });
      for (const item of visible) grid.append(renderCard(item));
      return grid;
    };

    const renderCard = (item: ComponentItem): HTMLElement => {
      const key = itemKey(item);
      const cover = el('button', {
        class: 'component-cover',
        attrs: { type: 'button', 'aria-label': `编辑「${item.name}」` },
        on: { click: () => openItem(item) },
      });
      paintCover(cover, item);
      const card = el(
        'article',
        { class: 'component-card', attrs: { 'data-component-key': key } },
        [
          cover,
          el('div', { class: 'component-card__body' }, [
            el('div', { class: 'component-card__head' }, [
              el('h2', { class: 'component-card__name', text: item.name }),
              ...badges(item),
            ]),
            el('p', { class: 'component-card__meta', text: metaLine(item) }),
            renderActions(item),
            ...blockedNotice(key),
          ]),
        ],
      );
      return card;
    };

    const renderTable = (visible: readonly ComponentItem[]): HTMLElement => {
      const rows = visible.map((item) =>
        el('tr', { attrs: { 'data-component-key': itemKey(item) } }, [
          el('td', {}, [
            el('button', {
              class: 'component-table__name',
              text: item.name,
              attrs: { type: 'button' },
              on: { click: () => openItem(item) },
            }),
          ]),
          el('td', {}, badges(item)),
          el('td', { text: item.category }),
          el('td', {
            text: item.kind === 'atomic' ? `${item.references.length} 张大屏` : '—',
          }),
          el('td', { text: item.updatedAt === '' ? '预置' : formatDateTime(item.updatedAt) }),
          el('td', { class: 'ds-actions' }, [renderActions(item), ...blockedNotice(itemKey(item))]),
        ]),
      );
      return el('div', { class: 'ds-table-wrap' }, [
        el('table', { class: 'ds-table component-table' }, [
          el('thead', {}, [
            el('tr', {}, [
              ...['名称', '类型与状态', '分类', '引用', '更新于', '操作'].map((label) =>
                el('th', { text: label, attrs: { scope: 'col' } }),
              ),
            ]),
          ]),
          el('tbody', {}, rows),
        ]),
      ]);
    };

    const paintCover = (cover: HTMLElement, item: ComponentItem): void => {
      if (item.kind === 'fragment') {
        renderFragmentCover(cover, item.definition, catalog);
        return;
      }
      void renderCover(cover, item.working);
    };

    const renderActions = (item: ComponentItem): HTMLElement => {
      const key = itemKey(item);
      const actions = el('div', { class: 'component-card__actions' });
      const disabled = state.busy !== undefined;
      if (state.pendingDelete === key) {
        actions.append(
          el('span', {
            class: 'component-card__confirm',
            text: item.kind === 'fragment' ? '已插入大屏的组合不受影响' : '删除后不可恢复',
          }),
          el('button', {
            class: 'button button--danger',
            text: '确认删除',
            attrs: { 'data-component-confirm-delete': '' },
            on: { click: () => void remove(item) },
          }),
          el('button', {
            class: 'button',
            text: '取消',
            on: {
              click: () => {
                state.pendingDelete = undefined;
                renderBody();
              },
            },
          }),
        );
        return actions;
      }
      const preset = item.kind === 'fragment' && item.preset;
      actions.append(
        el('button', {
          class: 'button',
          text: preset ? '查看' : '编辑',
          on: { click: () => openItem(item) },
        }),
      );
      if (item.kind === 'atomic' && item.pkg !== undefined) {
        const listed = item.status === 'listed';
        actions.append(
          button(listed ? '下架' : '上架', disabled, () => void toggleVisibility(item, !listed)),
        );
      }
      actions.append(button('复制', disabled, () => void duplicate(item)));
      if (!preset) {
        actions.append(
          el('button', {
            class: 'button button--danger',
            text: '删除',
            attrs: disabled ? { disabled: '' } : {},
            on: {
              click: () => {
                state.pendingDelete = key;
                state.blocked = undefined;
                renderBody();
              },
            },
          }),
        );
      }
      return actions;
    };

    const blockedNotice = (key: string): HTMLElement[] => {
      const blocked = state.blocked;
      if (blocked === undefined || blocked.key !== key) return [];
      return [
        el('div', { class: 'component-card__blocked', attrs: { role: 'alert' } }, [
          el('p', {
            text: `仍被 ${blocked.references.length} 张大屏引用，不能删除。可以先下架：物料库不再显示，已有大屏照常渲染。`,
          }),
          el(
            'ul',
            { class: 'ds-ref-list' },
            blocked.references.map((screen) =>
              el('li', { class: 'ds-ref-list__item' }, [
                el('button', {
                  class: 'ds-ref-list__link',
                  text: screen.name,
                  attrs: { type: 'button' },
                  on: { click: () => goToEdit(screen.id) },
                }),
              ]),
            ),
          ),
        ]),
      ];
    };

    // ———————— 操作 ————————

    const openItem = (item: ComponentItem): void => {
      if (item.kind === 'atomic') goToAtomicComponent(item.type);
      else goToFragmentComponent(item.id);
    };

    const withBusy = async (key: string, work: () => Promise<void>): Promise<void> => {
      if (state.busy !== undefined) return;
      state.busy = key;
      renderBody();
      try {
        await work();
      } finally {
        state.busy = undefined;
        if (!controller.signal.aborted) renderBody();
      }
    };

    const toggleVisibility = (item: AtomicComponentItem, visible: boolean): Promise<void> =>
      withBusy(item.type, async () => {
        if (item.pkg === undefined) return;
        const result = await setAtomicVisibility(item.pkg, visible);
        if (!result.ok) {
          showToast(`${visible ? '上架' : '下架'}失败：${result.message}`, 'error');
          return;
        }
        showToast(
          visible ? `「${item.name}」已上架` : `「${item.name}」已下架：已有大屏照常渲染`,
          'success',
        );
        await load();
      });

    const duplicate = (item: ComponentItem): Promise<void> =>
      withBusy(itemKey(item), async () => {
        if (item.kind === 'atomic') {
          if (item.working === undefined) {
            showToast('源码无法读取，不能复制。', 'error');
            return;
          }
          const name = `${item.name} 副本`;
          const type = createAtomicComponentType(item.type.slice('host.online.'.length));
          const saved = await saveAtomicDraft({
            type,
            source: { ...item.working, spec: { ...item.working.spec, type, name } },
            revision: 0,
          });
          if (!saved.ok) {
            showToast(`复制失败：${saved.message}`, 'error');
            return;
          }
          goToAtomicComponent(type);
          return;
        }
        const id = createFragmentId();
        const saved = await saveFragmentDefinition({
          definition: { ...item.definition, id, name: `${item.name} 副本` },
          revision: undefined,
        });
        if (!saved.ok) {
          showToast(`复制失败：${saved.message}`, 'error');
          return;
        }
        goToFragmentComponent(id);
      });

    const remove = (item: ComponentItem): Promise<void> =>
      withBusy(itemKey(item), async () => {
        state.pendingDelete = undefined;
        if (item.kind === 'fragment') {
          const result = await deleteFragment(item.id);
          if (!result.ok) {
            showToast(`删除失败：${result.message}`, 'error');
            return;
          }
          showToast(`已删除组合「${item.name}」`, 'success');
          await load();
          return;
        }
        const result = await deleteAtomicComponent(item);
        if (!result.ok) {
          if (result.code === 'MATERIAL_IN_USE') {
            state.blocked = { key: itemKey(item), references: result.references ?? [] };
          } else {
            showToast(`删除失败：${result.message}`, 'error');
          }
          return;
        }
        showToast(`已删除「${item.name}」`, 'success');
        await load();
      });

    const openTemplatePicker = (): void => {
      const overlay = el('div', { class: 'ds-overlay', attrs: { 'data-component-templates': '' } });
      const close = (): void => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      };
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') close();
      };
      const choices = ATOMIC_COMPONENT_TEMPLATES.map((template) =>
        el(
          'button',
          {
            class: 'component-template',
            attrs: { type: 'button', 'data-component-template': template.id },
            on: {
              click: () => {
                close();
                goToAtomicComponent(undefined, template.id);
              },
            },
          },
          [
            el('span', { class: 'component-template__cover' }),
            el('strong', { text: template.name }),
            el('span', { class: 'component-template__hint', text: template.hint }),
          ],
        ),
      );
      overlay.append(
        el('div', { class: 'ds-dialog component-template-dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': '选择模板' } }, [
          el('h2', { class: 'ds-dialog__title', text: '从模板新建原子组件' }),
          el('p', { class: 'ds-desc', text: '模板都已符合组件范式；进入编辑器后可以改可调项、数据与代码。' }),
          el('div', { class: 'component-template-grid' }, choices),
          el('div', { class: 'ds-dialog__actions' }, [
            el('button', { class: 'button', text: '取消', on: { click: close } }),
          ]),
        ]),
      );
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
      });
      document.addEventListener('keydown', onKey);
      document.body.append(overlay);
      // 模板封面用真实渲染：与组件库卡片同一条预览路径。
      ATOMIC_COMPONENT_TEMPLATES.forEach((template, index) => {
        const coverBox = choices[index]?.querySelector<HTMLElement>('.component-template__cover');
        if (coverBox !== null && coverBox !== undefined) {
          void renderCover(coverBox, template.build('host.online.template-preview'));
        }
      });
      choices[0]?.focus();
    };

    void load();
    return () => {
      controller.abort();
      for (const overlay of document.querySelectorAll('[data-component-templates]')) overlay.remove();
    };
  },
};

function itemKey(item: ComponentItem): string {
  return item.kind === 'atomic' ? `atomic:${item.type}` : `fragment:${item.id}`;
}

function badges(item: ComponentItem): HTMLElement[] {
  const kind = el('span', {
    class: `ds-badge component-badge component-badge--${item.kind}`,
    text: item.kind === 'atomic' ? '原子' : '组合',
  });
  if (item.kind === 'fragment') {
    return item.preset ? [kind, el('span', { class: 'ds-badge ds-badge--draft', text: '预置' })] : [kind];
  }
  const status =
    item.status === 'listed'
      ? el('span', { class: 'ds-badge ds-badge--ready', text: '已上架' })
      : item.status === 'unlisted'
        ? el('span', { class: 'ds-badge ds-badge--draft', text: '已下架' })
        : el('span', { class: 'ds-badge ds-badge--draft', text: '未发布' });
  return item.hasDraft && item.status !== 'unpublished'
    ? [kind, status, el('span', { class: 'ds-badge component-badge--changed', text: '有未发布改动' })]
    : [kind, status];
}

function metaLine(item: ComponentItem): string {
  const parts = [item.category];
  if (item.kind === 'atomic') parts.push(`被 ${item.references.length} 张大屏引用`);
  else if (!item.preset) parts.push('插入后展开，不随修改更新');
  if (item.updatedAt !== '') parts.push(formatDateTime(item.updatedAt));
  return parts.join(' · ');
}

function button(text: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  return el('button', {
    class: 'button',
    text,
    attrs: disabled ? { type: 'button', disabled: '' } : { type: 'button' },
    on: { click: onClick },
  });
}

function filterGroup<T extends string>(
  label: string,
  options: readonly { readonly id: T; readonly label: string }[],
  current: () => T,
  select: (id: T) => void,
): { readonly element: HTMLElement; sync(): void } {
  const buttons = options.map((option) =>
    el('button', {
      class: 'button ds-filter',
      text: option.label,
      attrs: { type: 'button', 'data-filter-value': option.id },
      on: { click: () => select(option.id) },
    }),
  );
  const element = el(
    'div',
    { class: 'ds-toolbar__filters', attrs: { role: 'group', 'aria-label': label } },
    buttons,
  );
  return {
    element,
    sync() {
      buttons.forEach((item, index) => {
        const active = options[index]?.id === current();
        item.classList.toggle('ds-filter--active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    },
  };
}

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function writeLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // 只是少了一次记忆。
  }
}
