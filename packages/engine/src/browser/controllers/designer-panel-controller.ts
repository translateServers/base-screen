import type {
  ScreenComponentNode,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenParseResult,
} from '@base-screen/contracts';
import type {
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenInteractionAction,
  ScreenInteractionState,
} from '@base-screen/core';
import { getScreenSelectionBounds, isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  type BaseScreenClipboard,
  createClipboard,
  createPasteTransaction,
} from '../../common/operations/designer-clipboard.js';
import { roundScreenGeometry } from '../../common/operations/designer-geometry.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createAlignmentTransaction,
  createDistributionTransaction,
  createGroupTransaction,
  createUngroupTransaction,
} from '../../common/operations/designer-layout-operations.js';
import {
  createDesignerQuickStyleTransaction,
  type DesignerQuickStyleAction,
} from '../../common/operations/designer-quick-style.js';
import { removeComponentCommands } from '../../common/operations/designer-remove-operations.js';
import { selectedComponents } from '../../common/operations/designer-selection.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type BaseScreenMaterialLibraryGrouping,
  hasMaterialLibraryGroup,
  materialLibraryGroupMaterialTypes,
} from '../../material-library-grouping.js';
import {
  type BaseScreenResolvedMaterialLibraryItem,
  createInitialDataSourceForMaterialLibraryItem,
} from '../../material-library-items.js';
import type { DesignerDescriptorDatasetFields } from '../dom/designer-descriptor-dom.js';
import {
  createDescriptorArrayTransaction,
  createDescriptorFieldTransaction,
} from '../dom/designer-descriptor-operations.js';
import {
  applyDesignerInspectorFilters,
  type DesignerInspectorDensity,
  renderDesignerInspectorContext,
} from '../dom/designer-inspector-chrome-dom.js';
import {
  applyDesignerInspectorSearchStyle,
  captureDesignerInspectorSearchStyle,
  closeDesignerInspectorSearchMenus,
  type DesignerInspectorSearchClipboard,
  designerInspectorSectionDisclosure,
} from '../dom/designer-inspector-search-dom.js';
import { renderMaterialLibraryGroupNavigation } from '../dom/designer-material-library-group-dom.js';
import {
  createCanvasBackgroundStopTransaction,
  createDataSourceTransaction,
  createDesignerCanvasBackgroundDrafts,
  createDesignerCanvasPresentationSettings,
  createInitialDataSource,
  createMultiSelectionTransaction,
  createPropertyTransaction,
  createStyleRuleClickTransaction,
  createStyleRuleEditTransaction,
  type DesignerCanvasBackgroundDrafts,
  type DesignerCanvasPresentationSettings,
  renderDesignerDataPanel,
  renderDesignerProperties,
} from '../dom/designer-panel-dom.js';
import {
  DesignerInspectorScrollGuard,
  isInspectorFormControlTarget,
} from './designer-inspector-scroll-guard.js';

export interface DesignerPanelControllerCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getMaterialLibraryItems?: () => readonly BaseScreenResolvedMaterialLibraryItem[];
  readonly getMaterialLibraryGrouping?: () => BaseScreenMaterialLibraryGrouping | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[];
  readonly getGroupMaterialType: () => string | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly redo: () => ScreenParseResult<ScreenDocument>;
  readonly setZoom: (zoom: number) => void;
  readonly undo: () => ScreenParseResult<ScreenDocument>;
  readonly getZoom: () => number;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly isMaterialAvailable?: (type: string) => boolean;
  readonly requestMaterialLibraryAction?: (action: 'retry' | 'reload' | 'details') => void;
  /** 画布背景图宿主选择按钮点击（ADR-0046）：由宿主接管（打开图片选择弹出框），返回是否已有文档。 */
  readonly requestCanvasBackgroundImage?: () => boolean;
  readonly requestCanvasPresentationAction?: (
    action: 'capture-thumbnail' | 'upload-thumbnail',
  ) => void;
  readonly onCanvasPresentationChange?: (settings: DesignerCanvasPresentationSettings) => void;
  /** 画布背景图宿主选择按钮是否渲染（ADR-0049）：默认隐藏，仅宿主配置后显示。 */
  readonly isCanvasBackgroundImageButtonVisible?: () => boolean;
  readonly selectInspectorTab?: (tab: 'appearance' | 'data' | 'interaction') => void;
}

// 搜索输入渲染防抖窗口（ADR-0042）：快速连续输入合并为一次渲染，避免每键一次布局失效。
export const MATERIAL_SEARCH_DEBOUNCE_MS = 120;
const INSPECTOR_DENSITY_STORAGE_KEY = 'base-screen.designer.inspector-density';
const INSPECTOR_GROUPS_STORAGE_KEY = 'base-screen.designer.inspector-groups';
const MAX_INSPECTOR_GROUP_PREFERENCES = 200;

export class DesignerPanelController {
  #clipboard: BaseScreenClipboard | undefined;
  #pasteCount = 0;
  #materialFilter: 'all' | 'favorite' | 'recent' = 'all';
  #materialSearch = '';
  #materialCategory: string | undefined;
  #materialGroupId: string | undefined;
  #materialSearchTimer: ReturnType<typeof setTimeout> | undefined;
  #inspectorDensity: DesignerInspectorDensity = 'basic';
  #inspectorSearch = '';
  #inspectorSearchOpen = false;
  #inspectorSearchClipboard: DesignerInspectorSearchClipboard | undefined;
  #inspectorPreferenceRestored = false;
  #inspectorGroupPreferenceRestored = false;
  readonly #inspectorGroupPreferences = new Map<string, boolean>();
  readonly #favoriteMaterials = new Set<string>();
  readonly #recentMaterials: string[] = [];
  readonly #canvasBackgroundDrafts: DesignerCanvasBackgroundDrafts =
    createDesignerCanvasBackgroundDrafts();
  readonly #canvasPresentation: DesignerCanvasPresentationSettings =
    createDesignerCanvasPresentationSettings();
  /** 检查器点击滚动守卫：控件 pointerdown 后窗口内的浏览器原生滚动会被还原。 */
  readonly #clickScrollGuard = new DesignerInspectorScrollGuard();

  constructor(private readonly callbacks: DesignerPanelControllerCallbacks) {}

  clearClipboard(): void {
    this.#clipboard = undefined;
    this.#pasteCount = 0;
  }

  /** 清理挂起的搜索防抖计时器（元素 disconnect 时由宿主调用，避免对脱离 DOM 的面板渲染）。 */
  dispose(): void {
    if (this.#materialSearchTimer !== undefined) {
      clearTimeout(this.#materialSearchTimer);
      this.#materialSearchTimer = undefined;
    }
    this.#clickScrollGuard.dispose();
  }

  /**
   * 检查器表单控件 pointerdown：浏览器会把被裁剪的控件原生滚入视口（mousedown
   * preventDefault 无法取消），导致点击 checkbox/select 时面板滚动条跳动。
   * 在此武装滚动守卫，把窗口内的该滚动恢复回点击前的位置。
   */
  onPointerDown(event: PointerEvent): void {
    if (!isPrimaryPointer(event)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !isInspectorFormControlTarget(target)) return;
    const pane = findInspectorScrollContainer(target);
    if (pane === undefined) return;
    this.#clickScrollGuard.begin(pane);
  }

  get hasClipboard(): boolean {
    return this.#clipboard !== undefined;
  }

  refreshMaterialLibrary(layout: HTMLElement | null): void {
    const grouping = this.materialLibraryGrouping;
    if (
      this.#materialGroupId !== undefined &&
      (grouping === undefined || !hasMaterialLibraryGroup(grouping, this.#materialGroupId))
    ) {
      this.#materialGroupId = undefined;
    }
    if (layout === null) return;
    renderMaterialLibraryGroupNavigation(layout, grouping, this.#materialGroupId);
    this.renderMaterials(layout);
  }

  get canGroup(): boolean {
    return this.isGroupAvailable();
  }

  get canUngroup(): boolean {
    return this.isUngroupAvailable();
  }

  get canAlign(): boolean {
    return this.isAlignmentAvailable();
  }

  get canDistribute(): boolean {
    return this.isDistributionAvailable();
  }

  copy(): void {
    const document = this.callbacks.getDocument();
    if (document === undefined) return;
    this.#clipboard = createClipboard(document, this.interaction.selectedComponentIds) ?? undefined;
    this.#pasteCount = 0;
  }

  paste(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined || this.#clipboard === undefined)
      return failure('Clipboard is empty.');
    this.#pasteCount++;
    const transaction = createPasteTransaction(document, this.#clipboard, {
      x: this.#pasteCount * 20,
      y: this.#pasteCount * 20,
    });
    const result = this.callbacks.executeTransaction(transaction);
    if (result.ok) {
      const componentIds = transaction.commands.flatMap((command) =>
        command.type === 'add-component' ? [command.component.id] : [],
      );
      this.select(componentIds);
    }
    return result;
  }

  duplicate(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined || this.interaction.selectedComponentIds.length === 0)
      return failure('Nothing to duplicate.');
    this.copy();
    if (this.#clipboard === undefined) return failure('Nothing to duplicate.');
    const transaction = createPasteTransaction(document, this.#clipboard, { x: 0, y: 0 });
    const result = this.callbacks.executeTransaction(transaction);
    if (result.ok) {
      const componentIds = transaction.commands.flatMap((command) =>
        command.type === 'add-component' ? [command.component.id] : [],
      );
      this.select(componentIds);
    }
    return result;
  }

  private updateSelectionStatus(
    property: 'locked' | 'hidden',
    value: boolean,
  ): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    const components =
      document === undefined
        ? []
        : selectedComponents(document, this.interaction.selectedComponentIds);
    if (document === undefined || components.length === 0) {
      return failure('Selection status is unavailable.');
    }
    return this.callbacks.executeTransaction({
      commands: components.map((component) => ({
        type: 'update-components' as const,
        componentIds: [component.id],
        patch: { status: { ...component.status, [property]: value } },
      })),
    });
  }

  private deleteSelection(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined) return failure('Nothing to delete.');
    const componentIds = selectedComponents(document, this.interaction.selectedComponentIds)
      .filter((component) => !isScreenComponentEffectivelyLocked(document, component.id))
      .map((component) => component.id);
    if (componentIds.length === 0) return failure('Nothing to delete.');
    const result = this.callbacks.executeTransaction({
      commands: removeComponentCommands(document, componentIds),
    });
    if (result.ok) this.select([]);
    return result;
  }

  private applyQuickStyle(button: HTMLButtonElement, action: DesignerQuickStyleAction): void {
    const transaction = createDesignerQuickStyleTransaction(
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
      action,
    );
    if (transaction === undefined) return;
    if (!transaction.ok) {
      this.callbacks.emitDiagnostics(transaction.diagnostics);
      return;
    }
    const result = this.callbacks.executeTransaction(transaction.value);
    if (result.ok) {
      for (const control of button.parentElement?.querySelectorAll<HTMLButtonElement>(
        `[data-quick-${button.dataset.quickStyle !== undefined ? 'style' : 'config'}]`,
      ) ?? []) {
        control.ariaPressed = String(control === button);
      }
    }
    this.report(result);
  }

  group(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    const entry = this.groupEntry;
    const selected =
      document === undefined
        ? []
        : selectedComponents(document, this.interaction.selectedComponentIds);
    const bounds = getScreenSelectionBounds(selected);
    if (!this.canGroup || document === undefined || entry === undefined || bounds === null) {
      return failure('Grouping is unavailable.');
    }
    const group: ScreenComponentNode = {
      id: nextComponentId(document, entry.manifest.type),
      type: entry.manifest.type,
      name: entry.manifest.name,
      parentId: selected[0]?.parentId ?? null,
      position: {
        x: roundScreenGeometry(bounds.left),
        y: roundScreenGeometry(bounds.top),
      },
      size: {
        width: roundScreenGeometry(bounds.right - bounds.left),
        height: roundScreenGeometry(bounds.bottom - bounds.top),
      },
      rotation: 0,
      zIndex: Math.max(...selected.map((component) => component.zIndex)) + 1,
      status: { locked: false, hidden: false },
      props: entry.manifest.defaultProps,
      style: entry.manifest.defaultStyle,
      dataSource: createInitialDataSource(entry.manifest),
    };
    const result = this.callbacks.executeTransaction(
      createGroupTransaction(document, group, this.interaction.selectedComponentIds),
    );
    if (result.ok) this.select([group.id]);
    return result;
  }

  ungroup(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    const groupId = this.interaction.focusedComponentId;
    if (document === undefined || groupId === null || !this.canUngroup) {
      return failure('Ungrouping is unavailable.');
    }
    const childIds = document.components
      .filter((component) => component.parentId === groupId)
      .map((component) => component.id);
    const result = this.callbacks.executeTransaction(createUngroupTransaction(document, groupId));
    if (result.ok) this.select(childIds);
    return result;
  }

  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined || !this.canAlign) return failure('Alignment is unavailable.');
    return this.callbacks.executeTransaction(
      createAlignmentTransaction(document, this.interaction.selectedComponentIds, alignment),
    );
  }

  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined || !this.canDistribute)
      return failure('Distribution is unavailable.');
    return this.callbacks.executeTransaction(
      createDistributionTransaction(document, this.interaction.selectedComponentIds, distribution),
    );
  }

  render(properties: HTMLElement | undefined, dataPanel?: HTMLElement): void {
    // 预挂载滚动守卫监听：稳定位置在用户首次交互前就绪（浏览器会在 pointerdown
    // 派发前把被裁剪控件滚入视口，首次点击无法靠按下时刻快照恢复）。
    const propertiesPane = properties?.parentElement;
    if (propertiesPane !== null && propertiesPane !== undefined) {
      this.#clickScrollGuard.ensureListeners(propertiesPane);
    }
    const dataFlowContent = dataPanel?.querySelector<HTMLElement>(
      '.designer-datav-data-flow-content',
    );
    if (dataFlowContent !== null && dataFlowContent !== undefined) {
      this.#clickScrollGuard.ensureListeners(dataFlowContent);
    }
    if (properties !== undefined) {
      renderDesignerProperties(
        properties,
        this.callbacks.getDocument(),
        this.interaction,
        this.callbacks.getCatalog(),
        this.callbacks.getDatasetFields,
        this.callbacks.isCanvasBackgroundImageButtonVisible?.() ?? false,
        this.#canvasBackgroundDrafts,
        this.#canvasPresentation,
      );
    }
    renderDesignerDataPanel(
      dataPanel,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
      this.callbacks.getResourcePort() !== undefined,
      this.callbacks.getRuntimeContributions(),
      this.callbacks.getDatasetFields,
    );
  }

  captureInspectorGroupPreferences(root: ShadowRoot | HTMLElement | null): void {
    if (root === null) return;
    let persistenceTarget: HTMLElement | undefined;
    for (const section of root.querySelectorAll<HTMLElement>(
      '[data-inspector-search-kind="section"][data-inspector-search-key]',
    )) {
      const pane = section.closest<HTMLElement>('[data-inspector-pane]');
      const preferenceKey = this.inspectorGroupPreferenceKey(section, pane);
      const details = designerInspectorSectionDisclosure(section);
      if (preferenceKey === undefined || details === null) continue;
      const searchState = details.dataset.inspectorSearchWasOpen;
      const open = searchState === undefined ? details.open : searchState === 'true';
      this.#inspectorGroupPreferences.set(preferenceKey, open);
      persistenceTarget ??= section;
    }
    if (persistenceTarget !== undefined) {
      this.persistInspectorGroupPreferences(persistenceTarget);
    }
  }

  refreshInspectorUi(root: ShadowRoot | HTMLElement | null): void {
    if (root === null) return;
    this.restoreInspectorPreference(root);
    renderDesignerInspectorContext(
      root.querySelector<HTMLElement>('[data-inspector-context]'),
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
    );
    const inspector = root.querySelector<HTMLElement>('[data-right-panel]');
    if (inspector?.dataset.inspectorContextKind === 'canvas') {
      this.#inspectorSearch = '';
      this.#inspectorSearchOpen = false;
      const input = root.querySelector<HTMLInputElement>('[data-inspector-search]');
      if (input !== null) input.value = '';
    }
    inspector?.toggleAttribute('data-inspector-search-open', this.#inspectorSearchOpen);
    const searchWorkspace = root.querySelector<HTMLElement>('[data-inspector-search-workspace]');
    if (searchWorkspace !== null) searchWorkspace.hidden = !this.#inspectorSearchOpen;
    this.applyInspectorGroupPreferences(root);
    applyDesignerInspectorFilters(root, {
      density: this.#inspectorDensity,
      query: this.#inspectorSearch,
    });
  }

  onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const searchLaunch = target.closest<HTMLButtonElement>('[data-inspector-search-launch]');
    if (searchLaunch !== null) {
      const root = searchLaunch.getRootNode() as ShadowRoot;
      this.#inspectorSearchOpen = true;
      this.refreshInspectorUi(root);
      root.querySelector<HTMLInputElement>('[data-inspector-search]')?.focus();
      return;
    }
    const searchClose = target.closest<HTMLButtonElement>('[data-inspector-search-close]');
    if (searchClose !== null) {
      const root = searchClose.getRootNode() as ShadowRoot;
      const input = root.querySelector<HTMLInputElement>('[data-inspector-search]');
      if (input !== null) input.value = '';
      this.#inspectorSearch = '';
      this.#inspectorSearchOpen = false;
      this.refreshInspectorUi(root);
      root.querySelector<HTMLButtonElement>('[data-inspector-search-launch]')?.focus();
      return;
    }
    const copyTarget = target.closest<HTMLButtonElement>('[data-inspector-search-copy-target]');
    const copyKey = copyTarget?.dataset.inspectorSearchCopyTarget;
    if (copyTarget !== null && copyTarget !== undefined && copyKey !== undefined) {
      const root = copyTarget.getRootNode() as ShadowRoot;
      this.#inspectorSearchClipboard = captureDesignerInspectorSearchStyle(root, copyKey);
      closeDesignerInspectorSearchMenus(root);
      return;
    }
    const pasteTarget = target.closest<HTMLButtonElement>('[data-inspector-search-paste-target]');
    const pasteKey = pasteTarget?.dataset.inspectorSearchPasteTarget;
    if (
      pasteTarget !== null &&
      pasteTarget !== undefined &&
      pasteKey !== undefined &&
      this.#inspectorSearchClipboard !== undefined
    ) {
      const root = pasteTarget.getRootNode() as ShadowRoot;
      applyDesignerInspectorSearchStyle(root, pasteKey, this.#inspectorSearchClipboard);
      closeDesignerInspectorSearchMenus(root);
      return;
    }
    const density = target.closest<HTMLButtonElement>('button[data-inspector-density]')?.dataset
      .inspectorDensity;
    if (density === 'basic' || density === 'all') {
      this.#inspectorDensity = density;
      this.persistInspectorPreference(target, density);
      this.refreshInspectorUi(target.getRootNode() as ShadowRoot);
      return;
    }
    const groupSummary = target.closest<HTMLElement>('summary');
    if (groupSummary !== null) {
      const details = groupSummary.closest<HTMLDetailsElement>('details');
      const section = groupSummary.closest<HTMLElement>('[data-inspector-search-key]');
      const pane = groupSummary.closest<HTMLElement>('[data-inspector-pane]');
      const preferenceKey = this.inspectorGroupPreferenceKey(section, pane);
      if (details !== null && preferenceKey !== undefined) {
        // The summary's default toggle runs after click dispatch, so `details.open` still
        // describes the previous state here. Persist the intended next state directly;
        // reading it in a microtask races the browser's default action in Chromium.
        this.#inspectorGroupPreferences.set(preferenceKey, !details.open);
        this.persistInspectorGroupPreferences(groupSummary);
      }
    }
    const searchResult = target.closest<HTMLButtonElement>('[data-inspector-search-target]');
    const searchTab = searchResult?.dataset.inspectorSearchTab;
    if (
      searchResult !== null &&
      searchResult !== undefined &&
      (searchTab === 'appearance' || searchTab === 'data' || searchTab === 'interaction')
    ) {
      this.callbacks.selectInspectorTab?.(searchTab);
      const root = searchResult.getRootNode() as ShadowRoot;
      const key = searchResult.dataset.inspectorSearchTarget;
      const field = [...root.querySelectorAll<HTMLElement>('[data-inspector-search-key]')].find(
        (item) => item.dataset.inspectorSearchKey === key,
      );
      const inspectorSearch = root.querySelector<HTMLInputElement>('[data-inspector-search]');
      if (inspectorSearch !== null) inspectorSearch.value = '';
      this.#inspectorSearch = '';
      this.#inspectorSearchOpen = false;
      this.refreshInspectorUi(root);
      field?.scrollIntoView({ block: 'center' });
      field?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
      field?.classList.add('inspector-search-highlight');
      setTimeout(() => field?.classList.remove('inspector-search-highlight'), 900);
      return;
    }
    const clearSearch = target.closest<HTMLButtonElement>('[data-material-search-clear]');
    if (clearSearch !== null) {
      this.clearMaterialSearch(clearSearch.closest<HTMLElement>('.designer'));
      return;
    }
    const allMaterialGroups = target.closest<HTMLButtonElement>('[data-material-group-all]');
    if (allMaterialGroups !== null) {
      this.selectMaterialGroup(undefined, allMaterialGroups.closest<HTMLElement>('.designer'));
      return;
    }
    const materialGroup =
      target.closest<HTMLButtonElement>('[data-material-group]')?.dataset.materialGroup ??
      target.closest<HTMLButtonElement>('[data-material-group-breadcrumb]')?.dataset
        .materialGroupBreadcrumb;
    if (materialGroup !== undefined) {
      this.selectMaterialGroup(materialGroup, target.closest<HTMLElement>('.designer'));
      return;
    }
    const favorite = target.closest<HTMLButtonElement>('[data-material-favorite]');
    if (favorite?.dataset.materialFavorite !== undefined) {
      this.toggleMaterialFavorite(favorite.dataset.materialFavorite);
      this.renderMaterials(favorite.closest<HTMLElement>('.designer'));
      return;
    }
    const filter =
      target.closest<HTMLButtonElement>('[data-material-filter]')?.dataset.materialFilter;
    if (filter === 'all' || filter === 'favorite' || filter === 'recent') {
      this.#materialFilter = filter;
      this.renderMaterials(target.closest<HTMLElement>('.designer'));
      return;
    }
    const category = target.closest<HTMLButtonElement>('[data-material-category-filter]')?.dataset
      .materialCategoryFilter;
    if (category !== undefined) {
      this.#materialCategory = this.#materialCategory === category ? undefined : category;
      this.renderMaterials(target.closest<HTMLElement>('.designer'));
      return;
    }
    const libraryAction = target.closest<HTMLButtonElement>('[data-material-library-action]')
      ?.dataset.materialLibraryAction;
    if (libraryAction === 'retry' || libraryAction === 'reload' || libraryAction === 'details') {
      this.callbacks.requestMaterialLibraryAction?.(libraryAction);
      return;
    }
    const paletteStopAction = target.closest<HTMLButtonElement>(
      '[data-canvas-background-stop-action]',
    );
    if (paletteStopAction !== null) {
      const action = paletteStopAction.dataset.canvasBackgroundStopAction;
      if (action === 'add' || action === 'remove') {
        const transaction = createCanvasBackgroundStopTransaction(
          this.callbacks.getDocument(),
          this.#canvasBackgroundDrafts,
          action,
          Number(paletteStopAction.dataset.canvasBackgroundStopIndex),
        );
        if (transaction?.ok) this.report(this.callbacks.executeTransaction(transaction.value));
        else if (transaction !== undefined) this.callbacks.emitDiagnostics(transaction.diagnostics);
      }
      return;
    }
    const backgroundImageAction = target.closest<HTMLButtonElement>(
      '[data-canvas-background-image-action]',
    );
    if (backgroundImageAction !== null) {
      this.callbacks.requestCanvasBackgroundImage?.();
      return;
    }
    const canvasPresentationAction = target.closest<HTMLButtonElement>(
      '[data-canvas-setting-action]',
    )?.dataset.canvasSettingAction;
    if (
      canvasPresentationAction === 'capture-thumbnail' ||
      canvasPresentationAction === 'upload-thumbnail'
    ) {
      this.callbacks.requestCanvasPresentationAction?.(canvasPresentationAction);
      return;
    }
    const scaleButton = target.closest<HTMLButtonElement>('[data-canvas-setting="scaleMode"]');
    if (scaleButton !== null) {
      const value = scaleButton.dataset.canvasSettingValue;
      if (
        value === 'fill' ||
        value === 'fit' ||
        value === 'width' ||
        value === 'height' ||
        value === 'original' ||
        value === 'none'
      ) {
        this.#canvasPresentation.scaleMode = value;
        this.callbacks.onCanvasPresentationChange?.(this.#canvasPresentation);
        for (const control of scaleButton.parentElement?.querySelectorAll<HTMLButtonElement>(
          '[data-canvas-setting="scaleMode"]',
        ) ?? []) {
          control.ariaPressed = String(control === scaleButton);
        }
      }
      return;
    }
    const quickStyle = target.closest<HTMLButtonElement>('[data-quick-style]');
    if (quickStyle !== null) {
      const value = Number(quickStyle.dataset.quickStyle);
      if (Number.isInteger(value)) {
        this.applyQuickStyle(quickStyle, { kind: 'preset', value });
      }
      return;
    }
    const quickConfig = target.closest<HTMLButtonElement>('[data-quick-config]');
    if (quickConfig !== null) {
      const action = quickStyleActionFromButton(quickConfig);
      if (action !== undefined) this.applyQuickStyle(quickConfig, action);
      return;
    }
    const materialCard = target.closest<HTMLElement>('[data-material-type]');
    if (materialCard?.dataset.materialType !== undefined) {
      const itemId = materialCard.dataset.materialItemId ?? materialCard.dataset.materialType;
      this.addMaterial(itemId);
      this.recordRecentMaterial(itemId);
      this.renderMaterials(materialCard.closest<HTMLElement>('.designer'));
      return;
    }
    const arrayButton = target.closest<HTMLButtonElement>('[data-descriptor-array-action]');
    if (arrayButton !== null && arrayButton.dataset.descriptorArrayAction !== undefined) {
      const transaction = createDescriptorArrayTransaction(
        arrayButton,
        this.callbacks.getDocument(),
        this.interaction,
        this.callbacks.getCatalog(),
      );
      if (transaction !== undefined) {
        if (transaction.ok) {
          this.report(this.callbacks.executeTransaction(transaction.value));
        } else {
          this.callbacks.emitDiagnostics(transaction.diagnostics);
        }
      }
      return;
    }
    // 条件样式规则增删（ADR-0058）：按钮事务与字段编辑共用同一校验与提交通道。
    const styleRuleAction =
      target.closest<HTMLElement>('[data-style-rule-add]') ??
      target.closest<HTMLElement>('[data-style-rule-remove]');
    if (styleRuleAction !== null) {
      const transaction = createStyleRuleClickTransaction(
        styleRuleAction,
        this.callbacks.getDocument(),
        this.interaction,
        this.callbacks.getCatalog(),
      );
      if (transaction !== undefined) {
        if (transaction.ok) {
          this.report(this.callbacks.executeTransaction(transaction.value));
        } else {
          this.callbacks.emitDiagnostics(transaction.diagnostics);
        }
      }
      return;
    }
    if (!(target instanceof HTMLElement)) return;
    switch (target.dataset.action) {
      case 'undo':
        return this.report(this.callbacks.undo());
      case 'redo':
        return this.report(this.callbacks.redo());
      case 'copy':
        this.copy();
        return;
      case 'paste':
        return this.report(this.paste());
      case 'group':
        return this.report(this.group());
      case 'ungroup':
        return this.report(this.ungroup());
      case 'lock':
        return this.report(this.updateSelectionStatus('locked', true));
      case 'unlock':
        return this.report(this.updateSelectionStatus('locked', false));
      case 'hide':
        return this.report(this.updateSelectionStatus('hidden', true));
      case 'show':
        return this.report(this.updateSelectionStatus('hidden', false));
      case 'duplicate':
        return this.report(this.duplicate());
      case 'delete':
        return this.report(this.deleteSelection());
      case 'align-left':
      case 'align-center':
      case 'align-right':
      case 'align-top':
      case 'align-middle':
      case 'align-bottom':
        return this.report(this.align(target.dataset.action.slice(6) as BaseScreenAlignment));
      case 'distribute-horizontal':
        return this.report(this.distribute('horizontal'));
      case 'distribute-vertical':
        return this.report(this.distribute('vertical'));
      case 'zoom-in':
        this.callbacks.setZoom(this.callbacks.getZoom() * 1.2);
        return;
      case 'zoom-out':
        this.callbacks.setZoom(this.callbacks.getZoom() / 1.2);
    }
  }

  onDragStart(event: DragEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const materialType = target.closest<HTMLElement>('[data-material-type]')?.dataset.materialType;
    const itemId = target.closest<HTMLElement>('[data-material-type]')?.dataset.materialItemId;
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

  onPropertyChange(event: Event): void {
    const target = event.target;
    if (isInspectorFormControlTarget(target)) {
      const pane = findInspectorScrollContainer(target as HTMLElement);
      if (pane !== undefined) this.#clickScrollGuard.preserve(pane);
    }
    const canvasSetting = (target as { readonly dataset?: DOMStringMap } | null)?.dataset
      ?.canvasSetting;
    if (canvasSetting !== undefined) {
      this.updateCanvasPresentationSetting(target, canvasSetting);
      return;
    }
    const multiProperty = (target as { readonly dataset?: DOMStringMap } | null)?.dataset
      ?.multiProperty;
    if (multiProperty !== undefined && target !== null) {
      // 多选批量编辑（ADR-0053）：data-multi-property 控件走独立事务通道。
      const multiTransaction = createMultiSelectionTransaction(
        target,
        this.callbacks.getDocument(),
        this.interaction,
        this.callbacks.getCatalog(),
      );
      if (multiTransaction !== undefined) {
        if (multiTransaction.ok) {
          setDraftValidity(target, true);
          this.report(this.callbacks.executeTransaction(multiTransaction.value));
        } else {
          setDraftValidity(target, false);
          this.callbacks.emitDiagnostics(multiTransaction.diagnostics);
        }
        return;
      }
    }
    const arrayTransaction = createDescriptorArrayTransaction(
      event.target,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
    );
    if (arrayTransaction !== undefined) {
      if (arrayTransaction.ok) {
        this.report(this.callbacks.executeTransaction(arrayTransaction.value));
      } else {
        this.callbacks.emitDiagnostics(arrayTransaction.diagnostics);
      }
      return;
    }
    const descriptorTransaction = createDescriptorFieldTransaction(
      event.target,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
    );
    if (descriptorTransaction !== undefined) {
      if (descriptorTransaction.ok) {
        setDraftValidity(event.target, true);
        this.report(this.callbacks.executeTransaction(descriptorTransaction.value));
      } else {
        setDraftValidity(event.target, false);
        this.callbacks.emitDiagnostics(descriptorTransaction.diagnostics);
      }
      return;
    }
    const dataTransaction = createDataSourceTransaction(
      event.target,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
      this.callbacks.getResourcePort() !== undefined,
      this.callbacks.getRuntimeContributions(),
    );
    if (dataTransaction !== undefined) {
      if (dataTransaction.ok) {
        setDraftValidity(event.target, true);
        this.report(this.callbacks.executeTransaction(dataTransaction.value));
      } else {
        setDraftValidity(event.target, false);
        this.callbacks.emitDiagnostics(dataTransaction.diagnostics);
      }
      return;
    }
    // 条件样式字段编辑（ADR-0058）：data-style-rule-* 控件走独立事务通道。
    const styleRuleTransaction = createStyleRuleEditTransaction(
      event.target,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
    );
    if (styleRuleTransaction !== undefined) {
      if (styleRuleTransaction.ok) {
        setDraftValidity(event.target, true);
        this.report(this.callbacks.executeTransaction(styleRuleTransaction.value));
      } else {
        setDraftValidity(event.target, false);
        this.callbacks.emitDiagnostics(styleRuleTransaction.diagnostics);
      }
      return;
    }
    const transaction = createPropertyTransaction(
      event.target,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
      this.#canvasBackgroundDrafts,
    );
    if (transaction !== undefined) {
      if (transaction.ok) {
        setDraftValidity(event.target, true);
        this.report(this.callbacks.executeTransaction(transaction.value));
      } else {
        setDraftValidity(event.target, false);
        this.callbacks.emitDiagnostics(transaction.diagnostics);
      }
      return;
    }
    if (isDesignerDraft(event.target)) {
      setDraftValidity(event.target, false);
      this.callbacks.emitDiagnostics([invalidDraftDiagnostic()]);
    }
  }

  onInput(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return false;
    }
    if (target.dataset.inspectorSearch !== undefined) {
      this.#inspectorSearchOpen = true;
      this.#inspectorSearch = target.value.trim().toLocaleLowerCase();
      this.refreshInspectorUi(target.getRootNode() as ShadowRoot);
      return true;
    }
    if (target.dataset.materialSearch === undefined) return false;
    // 防抖（ADR-0042）：窗口内再次输入重置计时器，触发时统一更新搜索状态并渲染一次。
    if (this.#materialSearchTimer !== undefined) {
      clearTimeout(this.#materialSearchTimer);
    }
    const layout = target.closest<HTMLElement>('.designer');
    this.#materialSearchTimer = setTimeout(() => {
      this.#materialSearchTimer = undefined;
      this.#materialSearch = target.value.trim().toLocaleLowerCase();
      this.renderMaterials(layout);
    }, MATERIAL_SEARCH_DEBOUNCE_MS);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && !event.isComposing) {
      const search = event.target;
      if (
        search instanceof HTMLInputElement &&
        search.dataset.inspectorSearch !== undefined &&
        (this.#inspectorSearch !== '' || search.value !== '')
      ) {
        event.preventDefault();
        search.value = '';
        this.#inspectorSearch = '';
        this.refreshInspectorUi(search.getRootNode() as ShadowRoot);
        search.focus();
        return true;
      }
      if (search instanceof HTMLInputElement && search.dataset.inspectorSearch !== undefined) {
        event.preventDefault();
        const root = search.getRootNode() as ShadowRoot;
        this.#inspectorSearchOpen = false;
        this.refreshInspectorUi(root);
        root.querySelector<HTMLButtonElement>('[data-inspector-search-launch]')?.focus();
        return true;
      }
      if (
        search instanceof HTMLInputElement &&
        search.dataset.materialSearch !== undefined &&
        (this.#materialSearch !== '' || search.value !== '')
      ) {
        event.preventDefault();
        this.clearMaterialSearch(search.closest<HTMLElement>('.designer'));
        return true;
      }
    }
    const materialCard =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>('[data-material-type]')
        : undefined;
    if (materialCard !== null && materialCard !== undefined) {
      // 控件级键优先于命令通道：Enter 直接添加物料，不触发全局「进入组内」命令（ADR-0006）；
      // Space 保持空格抓手语义，不在此劫持。方向键走卡片网格 roving focus。
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        const type = materialCard.dataset.materialType;
        if (type !== undefined) {
          const itemId = materialCard.dataset.materialItemId ?? type;
          this.addMaterial(itemId);
          this.recordRecentMaterial(itemId);
          this.renderMaterials(materialCard.closest<HTMLElement>('.designer'));
        }
        return true;
      }
      if (this.navigateMaterialGrid(materialCard, event)) return true;
    }
    if (
      event.key === 'Enter' &&
      !event.isComposing &&
      !isTextArea(event.target) &&
      isDesignerDraft(event.target)
    ) {
      event.preventDefault();
      this.onPropertyChange(event);
      return true;
    }
    if (
      event.altKey ||
      event.isComposing ||
      !(event.ctrlKey || event.metaKey) ||
      isEditable(event.target)
    ) {
      return false;
    }
    if (event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copy();
      return true;
    }
    if (event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.report(this.paste());
      return true;
    }
    return false;
  }

  private updateCanvasPresentationSetting(target: EventTarget | null, setting: string): void {
    if (!(target instanceof HTMLInputElement)) return;
    if (setting === 'opacity') {
      const value = Number(target.value);
      if (!Number.isFinite(value)) return;
      this.#canvasPresentation.opacity = Math.min(1, Math.max(0, value));
      this.callbacks.onCanvasPresentationChange?.(this.#canvasPresentation);
      const root = target.getRootNode() as ShadowRoot | Document;
      for (const control of root.querySelectorAll<HTMLInputElement>(
        '[data-canvas-setting="opacity"]',
      )) {
        control.value = String(this.#canvasPresentation.opacity);
      }
      return;
    }
    if (setting === 'backgroundAutoFill') {
      this.#canvasPresentation.backgroundAutoFill = target.checked;
    } else if (setting === 'disableComponentLoading') {
      this.#canvasPresentation.disableComponentLoading = target.checked;
    }
    this.callbacks.onCanvasPresentationChange?.(this.#canvasPresentation);
  }

  private restoreInspectorPreference(root: ShadowRoot | HTMLElement): void {
    if (this.#inspectorPreferenceRestored) return;
    this.#inspectorPreferenceRestored = true;
    try {
      const stored = root.ownerDocument.defaultView?.localStorage.getItem(
        INSPECTOR_DENSITY_STORAGE_KEY,
      );
      if (stored === 'basic' || stored === 'all') this.#inspectorDensity = stored;
    } catch {
      // Sandboxed hosts may deny storage; basic mode is the safe default.
    }
  }

  private persistInspectorPreference(target: Element, density: DesignerInspectorDensity): void {
    try {
      target.ownerDocument.defaultView?.localStorage.setItem(
        INSPECTOR_DENSITY_STORAGE_KEY,
        density,
      );
    } catch {
      // Preference persistence is optional.
    }
  }

  private applyInspectorGroupPreferences(root: ShadowRoot | HTMLElement): void {
    this.restoreInspectorGroupPreferences(root);
    for (const section of root.querySelectorAll<HTMLElement>('[data-inspector-search-key]')) {
      const pane = section.closest<HTMLElement>('[data-inspector-pane]');
      const preferenceKey = this.inspectorGroupPreferenceKey(section, pane);
      const open =
        preferenceKey === undefined
          ? undefined
          : this.#inspectorGroupPreferences.get(preferenceKey);
      const details = designerInspectorSectionDisclosure(section);
      if (details !== null && open !== undefined) details.open = open;
    }
  }

  private restoreInspectorGroupPreferences(root: ShadowRoot | HTMLElement): void {
    if (this.#inspectorGroupPreferenceRestored) return;
    this.#inspectorGroupPreferenceRestored = true;
    try {
      const stored = root.ownerDocument.defaultView?.localStorage.getItem(
        INSPECTOR_GROUPS_STORAGE_KEY,
      );
      if (stored === null || stored === undefined) return;
      const entries = Object.entries(JSON.parse(stored) as Record<string, unknown>).slice(
        -MAX_INSPECTOR_GROUP_PREFERENCES,
      );
      for (const [key, value] of entries) {
        if (typeof value === 'boolean') this.#inspectorGroupPreferences.set(key, value);
      }
    } catch {
      // Sandboxed hosts or malformed preferences fall back to descriptor defaults.
    }
  }

  private persistInspectorGroupPreferences(target: Element): void {
    try {
      const entries = [...this.#inspectorGroupPreferences.entries()].slice(
        -MAX_INSPECTOR_GROUP_PREFERENCES,
      );
      target.ownerDocument.defaultView?.localStorage.setItem(
        INSPECTOR_GROUPS_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(entries)),
      );
    } catch {
      // Preference persistence is optional.
    }
  }

  private inspectorGroupPreferenceKey(
    section: HTMLElement | null,
    pane: HTMLElement | null,
  ): string | undefined {
    const sectionKey = section?.dataset.inspectorSearchKey;
    const tab = pane?.dataset.inspectorPane;
    if (sectionKey === undefined || tab === undefined) return undefined;
    const document = this.callbacks.getDocument();
    const focusedId = this.interaction.focusedComponentId;
    const context =
      section?.dataset.inspectorPreferenceContext ??
      (focusedId === null
        ? this.interaction.selectedComponentIds.length > 1
          ? 'multi'
          : 'canvas'
        : (document?.components.find((component) => component.id === focusedId)?.type ?? 'canvas'));
    return `${context}|${tab}|${sectionKey}`;
  }

  private addMaterial(itemId: string): void {
    const document = this.callbacks.getDocument();
    const item = this.materialLibraryItem(itemId);
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
      id: nextComponentId(document, manifest.type),
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

  private selectMaterialGroup(groupId: string | undefined, layout: HTMLElement | null): void {
    const grouping = this.materialLibraryGrouping;
    if (
      grouping === undefined ||
      (groupId !== undefined && !hasMaterialLibraryGroup(grouping, groupId))
    ) {
      return;
    }
    this.#materialGroupId = groupId;
    if (layout === null) return;
    renderMaterialLibraryGroupNavigation(layout, grouping, this.#materialGroupId);
    this.renderMaterials(layout);
  }

  private clearMaterialSearch(layout: HTMLElement | null): void {
    if (this.#materialSearchTimer !== undefined) {
      clearTimeout(this.#materialSearchTimer);
      this.#materialSearchTimer = undefined;
    }
    if (layout === null) return;
    const input = layout.querySelector<HTMLInputElement>('[data-material-search]');
    if (input !== null) input.value = '';
    this.#materialSearch = '';
    this.renderMaterials(layout);
    input?.focus();
  }

  // 可见卡片间的方向键 roving focus：Arrow 线性移动，Home/End 到首尾；Enter/Space 走原生按钮语义。
  private navigateMaterialGrid(current: HTMLButtonElement, event: KeyboardEvent): boolean {
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

  private toggleMaterialFavorite(type: string): void {
    if (this.#favoriteMaterials.has(type)) this.#favoriteMaterials.delete(type);
    else this.#favoriteMaterials.add(type);
  }

  private recordRecentMaterial(type: string): void {
    const index = this.#recentMaterials.indexOf(type);
    if (index >= 0) this.#recentMaterials.splice(index, 1);
    this.#recentMaterials.unshift(type);
    this.#recentMaterials.splice(12);
  }

  private renderMaterials(layout: HTMLElement | null): void {
    if (layout === null) return;
    const grouping = this.materialLibraryGrouping;
    const groupedTypes =
      grouping === undefined || this.#materialGroupId === undefined
        ? undefined
        : new Set(materialLibraryGroupMaterialTypes(grouping, this.#materialGroupId));
    for (const card of layout.querySelectorAll<HTMLElement>('[data-material-card]')) {
      const itemId = card.dataset.materialCard;
      const item = itemId === undefined ? undefined : this.materialLibraryItem(itemId);
      const materialType = item?.materialType ?? card.dataset.materialType;
      const category = item?.manifest.category ?? card.dataset.materialCategory ?? '';
      const searchable =
        `${item?.manifest.name ?? ''} ${materialType ?? ''} ${category} ${item?.manifest.keywords.join(' ') ?? ''}`.toLocaleLowerCase();
      const included =
        itemId !== undefined &&
        (this.#materialFilter === 'all' ||
          (this.#materialFilter === 'favorite' && this.#favoriteMaterials.has(itemId)) ||
          (this.#materialFilter === 'recent' && this.#recentMaterials.includes(itemId))) &&
        searchable.includes(this.#materialSearch) &&
        (groupedTypes === undefined ||
          (materialType !== undefined && groupedTypes.has(materialType))) &&
        (grouping !== undefined ||
          this.#materialCategory === undefined ||
          category === this.#materialCategory);
      card.hidden = !included;
      const favorite = card.querySelector<HTMLButtonElement>('[data-material-favorite]');
      if (favorite !== null && itemId !== undefined) {
        favorite.ariaPressed = String(this.#favoriteMaterials.has(itemId));
      }
    }
    const clear = layout.querySelector<HTMLButtonElement>('[data-material-search-clear]');
    if (clear !== null) clear.hidden = this.#materialSearch === '';
    for (const control of layout.querySelectorAll<HTMLButtonElement>('[data-material-filter]')) {
      control.ariaPressed = String(control.dataset.materialFilter === this.#materialFilter);
    }
    for (const control of layout.querySelectorAll<HTMLButtonElement>(
      '[data-material-category-filter]',
    )) {
      control.ariaPressed = String(
        control.dataset.materialCategoryFilter === this.#materialCategory,
      );
    }
    const empty = layout.querySelector<HTMLElement>('[data-material-search-empty]');
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

  private isGroupAvailable(): boolean {
    const document = this.callbacks.getDocument();
    const selected =
      document === undefined
        ? []
        : selectedComponents(document, this.interaction.selectedComponentIds);
    return (
      this.groupEntry !== undefined &&
      this.groupEntry.manifest.designCapabilities.children &&
      selected.length >= 2 &&
      selected.every((component) => !isScreenComponentEffectivelyLocked(document!, component.id)) &&
      new Set(selected.map((component) => component.parentId)).size === 1
    );
  }

  private isUngroupAvailable(): boolean {
    const document = this.callbacks.getDocument();
    const group = document?.components.find(
      (component) => component.id === this.interaction.focusedComponentId,
    );
    return (
      document !== undefined &&
      this.interaction.selectedComponentIds.length === 1 &&
      group !== undefined &&
      !isScreenComponentEffectivelyLocked(document, group.id) &&
      document.components.some((component) => component.parentId === group.id)
    );
  }

  private isAlignmentAvailable(): boolean {
    return (
      this.callbacks.getDocument() !== undefined &&
      this.interaction.selectedComponentIds.length >= 2
    );
  }

  private isDistributionAvailable(): boolean {
    return (
      this.callbacks.getDocument() !== undefined &&
      this.interaction.selectedComponentIds.length >= 3
    );
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private get interaction(): ScreenInteractionState {
    return this.callbacks.getInteraction();
  }

  private get materialLibraryGrouping(): BaseScreenMaterialLibraryGrouping | undefined {
    return this.callbacks.getMaterialLibraryGrouping?.();
  }

  private materialLibraryItem(id: string): BaseScreenResolvedMaterialLibraryItem | undefined {
    const projected = this.callbacks.getMaterialLibraryItems?.().find((item) => item.id === id);
    if (projected !== undefined) return projected;
    const entry = this.callbacks.getCatalog()?.get(id);
    return entry === undefined
      ? undefined
      : { id, materialType: entry.manifest.type, manifest: entry.manifest };
  }

  private get groupEntry() {
    const type = this.callbacks.getGroupMaterialType();
    return type === undefined ? undefined : this.callbacks.getCatalog()?.get(type);
  }
}

export const MATERIAL_DRAG_TYPE = 'application/x-base-screen-material';
export const MATERIAL_LIBRARY_ITEM_DRAG_TYPE = 'application/x-base-screen-material-library-item';

function quickStyleActionFromButton(
  button: HTMLButtonElement,
): DesignerQuickStyleAction | undefined {
  const kind = button.dataset.quickConfig;
  const value = button.dataset.quickConfigValue;
  if (kind === 'colors' && value !== undefined) return { kind, value };
  if (kind === 'text' && (value === '12' || value === '14' || value === '16')) {
    return { kind, value: Number(value) as 12 | 14 | 16 };
  }
  if (kind === 'info' && (value === 'simple' || value === 'common' || value === 'detailed')) {
    return { kind, value };
  }
  return undefined;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function failure(message: string): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message }],
  };
}

function isDesignerDraft(target: EventTarget | null): boolean {
  const dataset = (target as { readonly dataset?: DOMStringMap } | null)?.dataset;
  return (
    dataset !== undefined &&
    (dataset.property !== undefined ||
      dataset.prop !== undefined ||
      dataset.canvasProperty !== undefined ||
      dataset.dataSourceType !== undefined ||
      dataset.dataSourceField !== undefined ||
      dataset.multiProperty !== undefined ||
      dataset.styleRulePath !== undefined ||
      dataset.styleRuleOperator !== undefined ||
      dataset.styleRuleValue !== undefined ||
      dataset.styleRuleStyle !== undefined)
  );
}

function isTextArea(target: EventTarget | null): boolean {
  return (target as { readonly tagName?: string } | null)?.tagName === 'TEXTAREA';
}

function invalidDraftDiagnostic(): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'CORE_COMMAND_INVALID',
    path: [],
    message: DESIGNER_UI_TEXT.panel.fieldValueInvalid,
  };
}

function setDraftValidity(target: EventTarget | null, valid: boolean): void {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLSelectElement) &&
    !(target instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  target.ariaInvalid = String(!valid);
  const message = target.parentElement?.querySelector<HTMLElement>('[data-field-message]');
  if (message !== null && message !== undefined) {
    message.textContent = valid ? '' : DESIGNER_UI_TEXT.panel.enterValidValue;
  }
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}

const INSPECTOR_SCROLL_CONTAINER_SELECTOR = '.inspector-pane, .designer-datav-data-flow-content';

/** 找到控件所属的检查器滚动容器（外观/数据面板的滚动容器或数据流内容容器）。 */
function findInspectorScrollContainer(control: HTMLElement): HTMLElement | undefined {
  return control.closest<HTMLElement>(INSPECTOR_SCROLL_CONTAINER_SELECTOR) ?? undefined;
}
