import type { ScreenComponentNode } from '@base-screen/contracts';
import { nextMaterialComponentId } from '../../../common/operations/material-component/material-component.js';
import {
  type BaseScreenMaterialLibraryGrouping,
  hasMaterialLibraryGroup,
  materialLibraryGroupMaterialTypes,
} from '../../../common/operations/material-library/material-library-grouping.js';
import {
  type BaseScreenResolvedMaterialLibraryItem,
  createInitialDataSourceForMaterialLibraryItem,
} from '../../../common/operations/material-library/material-library-items.js';
import { DesignerMaterialGroupNavigationController } from './designer-material-group-navigation-controller.js';
import type { DesignerPanelControllerCallbacks } from './designer-panel-controller-callbacks.js';

export const MATERIAL_DRAG_TYPE = 'application/x-base-screen-material';
export const MATERIAL_LIBRARY_ITEM_DRAG_TYPE = 'application/x-base-screen-material-library-item';
// 搜索输入渲染防抖窗口（ADR-0042）：快速连续输入合并为一次渲染，避免每键一次布局失效。
export const MATERIAL_SEARCH_DEBOUNCE_MS = 120;

/** Owns material-library browsing, filtering, keyboard navigation, and add/drag intents. */
export class DesignerPanelMaterialController {
  #filter: 'all' | 'favorite' | 'recent' = 'all';
  #search = '';
  #category: string | undefined;
  #groupId: string | undefined;
  #searchTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #favorites = new Set<string>();
  readonly #recents: string[] = [];
  readonly #navigation = new DesignerMaterialGroupNavigationController((groupId, layout) =>
    this.selectGroup(groupId, layout),
  );

  constructor(private readonly callbacks: DesignerPanelControllerCallbacks) {}

  dispose(): void {
    this.#navigation.dispose();
    if (this.#searchTimer !== undefined) {
      clearTimeout(this.#searchTimer);
      this.#searchTimer = undefined;
    }
  }

  refresh(layout: HTMLElement | null): void {
    const grouping = this.grouping;
    if (
      this.#groupId !== undefined &&
      (grouping === undefined || !hasMaterialLibraryGroup(grouping, this.#groupId))
    ) {
      this.#groupId = undefined;
    }
    if (layout === null) {
      this.#navigation.dispose();
      return;
    }
    this.#navigation.refresh(layout, grouping, this.#groupId);
    this.render(layout);
  }

  onClick(target: Element): boolean {
    if (this.#navigation.onClick(target)) return true;
    const reset = target.closest<HTMLElement>('[data-material-library-reset]');
    if (reset?.dataset.materialLibraryReset !== undefined) {
      this.#filter = 'all';
      this.#category = undefined;
      this.#groupId = undefined;
      const layout = reset.closest<HTMLElement>('.designer');
      if (layout !== null) this.#navigation.refresh(layout, this.grouping, undefined);
      this.clearSearch(layout);
      const grid = layout?.querySelector<HTMLElement>('[data-material-grid]');
      if (grid != null) grid.scrollTop = 0;
      return true;
    }
    const clearSearch = target.closest<HTMLButtonElement>('[data-material-search-clear]');
    if (clearSearch !== null) {
      this.clearSearch(clearSearch.closest<HTMLElement>('.designer'));
      return true;
    }
    const favorite = target.closest<HTMLButtonElement>('[data-material-favorite]');
    if (favorite?.dataset.materialFavorite !== undefined) {
      this.toggleFavorite(favorite.dataset.materialFavorite);
      this.render(favorite.closest<HTMLElement>('.designer'));
      return true;
    }
    const filter =
      target.closest<HTMLButtonElement>('[data-material-filter]')?.dataset.materialFilter;
    if (filter === 'all' || filter === 'favorite' || filter === 'recent') {
      this.#filter = filter;
      this.render(target.closest<HTMLElement>('.designer'));
      return true;
    }
    const category = target.closest<HTMLButtonElement>('[data-material-category-filter]')?.dataset
      .materialCategoryFilter;
    if (category !== undefined) {
      this.#category = this.#category === category ? undefined : category;
      this.render(target.closest<HTMLElement>('.designer'));
      return true;
    }
    const libraryAction = target.closest<HTMLButtonElement>('[data-material-library-action]')
      ?.dataset.materialLibraryAction;
    if (libraryAction === 'retry' || libraryAction === 'reload' || libraryAction === 'details') {
      this.callbacks.requestMaterialLibraryAction?.(libraryAction);
      return true;
    }
    const materialCard = target.closest<HTMLElement>('[data-material-type]');
    if (materialCard?.dataset.materialType === undefined) return false;
    const itemId = materialCard.dataset.materialItemId ?? materialCard.dataset.materialType;
    this.add(itemId);
    this.recordRecent(itemId);
    this.render(materialCard.closest<HTMLElement>('.designer'));
    return true;
  }

  onDragStart(event: DragEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const material = target.closest<HTMLElement>('[data-material-type]');
    const materialType = material?.dataset.materialType;
    const itemId = material?.dataset.materialItemId;
    if (
      materialType === undefined ||
      this.callbacks.isMaterialAvailable?.(materialType) === false
    ) {
      return false;
    }
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.setData(MATERIAL_DRAG_TYPE, materialType);
      if (itemId !== undefined) event.dataTransfer.setData(MATERIAL_LIBRARY_ITEM_DRAG_TYPE, itemId);
      event.dataTransfer.effectAllowed = 'copy';
    }
    return true;
  }

  onInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement) || target.dataset.materialSearch === undefined) {
      return false;
    }
    if (this.#searchTimer !== undefined) clearTimeout(this.#searchTimer);
    const layout = target.closest<HTMLElement>('.designer');
    this.#searchTimer = setTimeout(() => {
      this.#searchTimer = undefined;
      this.#search = target.value.trim().toLocaleLowerCase();
      this.render(layout);
    }, MATERIAL_SEARCH_DEBOUNCE_MS);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (this.#navigation.onKeyDown(event)) return true;
    const search = event.target;
    if (
      event.key === 'Escape' &&
      !event.isComposing &&
      search instanceof HTMLInputElement &&
      search.dataset.materialSearch !== undefined &&
      (this.#search !== '' || search.value !== '')
    ) {
      event.preventDefault();
      this.clearSearch(search.closest<HTMLElement>('.designer'));
      return true;
    }
    const materialCard =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>('[data-material-type]')
        : undefined;
    if (materialCard === null || materialCard === undefined) return false;
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      const type = materialCard.dataset.materialType;
      if (type !== undefined) {
        const itemId = materialCard.dataset.materialItemId ?? type;
        this.add(itemId);
        this.recordRecent(itemId);
        this.render(materialCard.closest<HTMLElement>('.designer'));
      }
      return true;
    }
    return this.navigateGrid(materialCard, event);
  }

  private add(itemId: string): void {
    const document = this.callbacks.getDocument();
    const item = this.libraryItem(itemId);
    const entry =
      item === undefined ? undefined : this.callbacks.getCatalog()?.get(item.materialType);
    if (
      document === undefined ||
      item === undefined ||
      entry === undefined ||
      this.callbacks.isMaterialAvailable?.(item.materialType) === false
    ) {
      return;
    }
    const index = document.components.length;
    const manifest = item.manifest;
    const component: ScreenComponentNode = {
      id: nextMaterialComponentId(document, manifest.type),
      type: manifest.type,
      name: manifest.name,
      parentId: null,
      position: { x: 64 + index * 16, y: 64 + index * 16 },
      size: manifest.defaultSize,
      rotation: 0,
      zIndex: index,
      status: { locked: false, hidden: false },
      props: manifest.defaultProps,
      style: manifest.defaultStyle,
      dataSource: createInitialDataSourceForMaterialLibraryItem(item),
    };
    const result = this.callbacks.executeCommand({ type: 'add-component', component });
    result.ok ? this.select([component.id]) : this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private selectGroup(groupId: string | undefined, layout: HTMLElement | null): void {
    const grouping = this.grouping;
    if (
      grouping === undefined ||
      (groupId !== undefined && !hasMaterialLibraryGroup(grouping, groupId))
    ) {
      return;
    }
    const changed = this.#groupId !== groupId;
    this.#groupId = groupId;
    if (layout === null) return;
    this.#navigation.refresh(layout, grouping, this.#groupId);
    this.render(layout);
    const grid = layout.querySelector<HTMLElement>('[data-material-grid]');
    if (changed && grid !== null) grid.scrollTop = 0;
  }

  private clearSearch(layout: HTMLElement | null): void {
    if (this.#searchTimer !== undefined) {
      clearTimeout(this.#searchTimer);
      this.#searchTimer = undefined;
    }
    if (layout === null) return;
    const input = layout.querySelector<HTMLInputElement>('[data-material-search]');
    if (input !== null) input.value = '';
    this.#search = '';
    this.render(layout);
    input?.focus();
  }

  private navigateGrid(current: HTMLButtonElement, event: KeyboardEvent): boolean {
    const layout = current.closest<HTMLElement>('.designer');
    if (layout === null) return false;
    const cards = [
      ...layout.querySelectorAll<HTMLButtonElement>('button[data-material-type]'),
    ].filter(
      (card) =>
        !card.disabled && card.closest<HTMLElement>('[data-material-card]')?.hidden !== true,
    );
    const index = cards.indexOf(current);
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : undefined;
    let next: HTMLButtonElement | undefined;
    if (delta !== undefined) next = cards[index + delta];
    else if (event.key === 'Home') next = cards[0];
    else if (event.key === 'End') next = cards.at(-1);
    if (next === undefined) return false;
    event.preventDefault();
    next.focus();
    return true;
  }

  private toggleFavorite(id: string): void {
    if (this.#favorites.has(id)) this.#favorites.delete(id);
    else this.#favorites.add(id);
  }

  private recordRecent(id: string): void {
    const index = this.#recents.indexOf(id);
    if (index >= 0) this.#recents.splice(index, 1);
    this.#recents.unshift(id);
    this.#recents.splice(12);
  }

  private render(layout: HTMLElement | null): void {
    if (layout === null) return;
    const grouping = this.grouping;
    const groupedTypes =
      grouping === undefined || this.#groupId === undefined
        ? undefined
        : new Set(materialLibraryGroupMaterialTypes(grouping, this.#groupId));
    for (const card of layout.querySelectorAll<HTMLElement>('[data-material-card]')) {
      const itemId = card.dataset.materialCard;
      const item = itemId === undefined ? undefined : this.libraryItem(itemId);
      const materialType = item?.materialType ?? card.dataset.materialType;
      const category = item?.manifest.category ?? card.dataset.materialCategory ?? '';
      const searchable =
        `${item?.manifest.name ?? ''} ${materialType ?? ''} ${category} ${item?.manifest.keywords.join(' ') ?? ''}`.toLocaleLowerCase();
      const included =
        itemId !== undefined &&
        (this.#filter === 'all' ||
          (this.#filter === 'favorite' && this.#favorites.has(itemId)) ||
          (this.#filter === 'recent' && this.#recents.includes(itemId))) &&
        searchable.includes(this.#search) &&
        (groupedTypes === undefined ||
          (materialType !== undefined && groupedTypes.has(materialType))) &&
        (grouping !== undefined || this.#category === undefined || category === this.#category);
      card.hidden = !included;
      const favorite = card.querySelector<HTMLButtonElement>('[data-material-favorite]');
      if (favorite !== null && itemId !== undefined) {
        favorite.ariaPressed = String(this.#favorites.has(itemId));
      }
    }
    const clear = layout.querySelector<HTMLButtonElement>('[data-material-search-clear]');
    if (clear !== null) clear.hidden = this.#search === '';
    for (const control of layout.querySelectorAll<HTMLButtonElement>('[data-material-filter]')) {
      control.ariaPressed = String(control.dataset.materialFilter === this.#filter);
    }
    for (const control of layout.querySelectorAll<HTMLButtonElement>(
      '[data-material-category-filter]',
    )) {
      control.ariaPressed = String(control.dataset.materialCategoryFilter === this.#category);
    }
    const empty = layout.querySelector<HTMLElement>('[data-material-search-empty]');
    const reset = layout.querySelector<HTMLElement>('[data-material-library-reset]');
    if (reset !== null)
      reset.hidden =
        this.#search === '' &&
        this.#filter === 'all' &&
        this.#groupId === undefined &&
        (grouping !== undefined || this.#category === undefined);
    if (empty !== null) {
      empty.hidden = [...layout.querySelectorAll<HTMLElement>('[data-material-card]')].some(
        (card) => !card.hidden,
      );
    }
  }

  private select(componentIds: readonly string[]): void {
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds,
      focusedComponentId: componentIds.at(-1) ?? null,
    });
  }

  private get grouping(): BaseScreenMaterialLibraryGrouping | undefined {
    return this.callbacks.getMaterialLibraryGrouping?.();
  }

  private libraryItem(id: string): BaseScreenResolvedMaterialLibraryItem | undefined {
    const projected = this.callbacks.getMaterialLibraryItems?.().find((item) => item.id === id);
    if (projected !== undefined) return projected;
    const entry = this.callbacks.getCatalog()?.get(id);
    return entry === undefined
      ? undefined
      : { id, materialType: entry.manifest.type, manifest: entry.manifest };
  }
}
