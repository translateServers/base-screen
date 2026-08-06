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
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createAlignmentTransaction,
  createDistributionTransaction,
  createGroupTransaction,
  createUngroupTransaction,
} from '../../common/operations/designer-layout-operations.js';
import { selectedComponents } from '../../common/operations/designer-selection.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  createDataSourceTransaction,
  createPropertyTransaction,
  renderDesignerDataPanel,
  renderDesignerProperties,
} from '../dom/designer-panel-dom.js';

export interface DesignerPanelControllerCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
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
}

export class DesignerPanelController {
  #clipboard: BaseScreenClipboard | undefined;
  #pasteCount = 0;
  #materialFilter: 'all' | 'favorite' | 'recent' = 'all';
  #materialSearch = '';
  readonly #favoriteMaterials = new Set<string>();
  readonly #recentMaterials: string[] = [];

  constructor(private readonly callbacks: DesignerPanelControllerCallbacks) {}

  clearClipboard(): void {
    this.#clipboard = undefined;
    this.#pasteCount = 0;
  }

  get hasClipboard(): boolean {
    return this.#clipboard !== undefined;
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
      position: { x: bounds.left, y: bounds.top },
      size: { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top },
      rotation: 0,
      zIndex: Math.max(...selected.map((component) => component.zIndex)) + 1,
      status: { locked: false, hidden: false },
      props: entry.manifest.defaultProps,
      style: entry.manifest.defaultStyle,
      dataSource: null,
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
    if (properties !== undefined) {
      renderDesignerProperties(
        properties,
        this.callbacks.getDocument(),
        this.interaction,
        this.callbacks.getCatalog(),
      );
    }
    renderDesignerDataPanel(
      dataPanel,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
      this.callbacks.getResourcePort() !== undefined,
      this.callbacks.getRuntimeContributions(),
    );
  }

  onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
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
    const materialCard = target.closest<HTMLElement>('[data-material-type]');
    if (materialCard?.dataset.materialType !== undefined) {
      this.addMaterial(materialCard.dataset.materialType);
      this.recordRecentMaterial(materialCard.dataset.materialType);
      this.renderMaterials(materialCard.closest<HTMLElement>('.designer'));
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
    if (materialType === undefined) return false;
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.setData(MATERIAL_DRAG_TYPE, materialType);
      event.dataTransfer.effectAllowed = 'copy';
    }
    return true;
  }

  onPropertyChange(event: Event): void {
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
    const transaction = createPropertyTransaction(
      event.target,
      this.callbacks.getDocument(),
      this.interaction,
      this.callbacks.getCatalog(),
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
    if (!(target instanceof HTMLInputElement) || target.dataset.materialSearch === undefined) {
      return false;
    }
    this.#materialSearch = target.value.trim().toLocaleLowerCase();
    this.renderMaterials(target.closest<HTMLElement>('.designer'));
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
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

  private addMaterial(type: string): void {
    const document = this.callbacks.getDocument();
    const entry = this.callbacks.getCatalog()?.get(type);
    if (document === undefined || entry === undefined) return;
    const index = document.components.length;
    const component: ScreenComponentNode = {
      id: nextComponentId(document, entry.manifest.type),
      type: entry.manifest.type,
      name: entry.manifest.name,
      parentId: null,
      position: { x: 64 + index * 16, y: 64 + index * 16 },
      size: entry.manifest.defaultSize,
      rotation: 0,
      zIndex: index,
      status: { locked: false, hidden: false },
      props: entry.manifest.defaultProps,
      style: entry.manifest.defaultStyle,
      dataSource: null,
    };
    const result = this.callbacks.executeCommand({ type: 'add-component', component });
    result.ok ? this.select([component.id]) : this.callbacks.emitDiagnostics(result.diagnostics);
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
    for (const card of layout.querySelectorAll<HTMLElement>('[data-material-card]')) {
      const type = card.dataset.materialCard;
      const entry = type === undefined ? undefined : this.callbacks.getCatalog()?.get(type);
      const searchable = `${entry?.manifest.name ?? ''} ${type ?? ''}`.toLocaleLowerCase();
      const included =
        type !== undefined &&
        (this.#materialFilter === 'all' ||
          (this.#materialFilter === 'favorite' && this.#favoriteMaterials.has(type)) ||
          (this.#materialFilter === 'recent' && this.#recentMaterials.includes(type))) &&
        searchable.includes(this.#materialSearch);
      card.hidden = !included;
      const favorite = card.querySelector<HTMLButtonElement>('[data-material-favorite]');
      if (favorite !== null && type !== undefined) {
        const active = this.#favoriteMaterials.has(type);
        favorite.ariaPressed = String(active);
        favorite.textContent = active ? '★' : '☆';
      }
    }
    for (const control of layout.querySelectorAll<HTMLButtonElement>('[data-material-filter]')) {
      control.ariaPressed = String(control.dataset.materialFilter === this.#materialFilter);
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

  private get groupEntry() {
    const type = this.callbacks.getGroupMaterialType();
    return type === undefined ? undefined : this.callbacks.getCatalog()?.get(type);
  }
}

export const MATERIAL_DRAG_TYPE = 'application/x-base-screen-material';

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
      dataset.dataSourceField !== undefined)
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
