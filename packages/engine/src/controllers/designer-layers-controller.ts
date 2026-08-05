import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenComponentPatch,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createDesignerLayerView,
  DESIGNER_LAYER_PAGE_SIZE,
  renderDesignerLayers,
} from '../dom/designer-layers-dom.js';
import {
  createReparentTransaction,
  createSiblingReorderTransaction,
} from '../operations/designer-layout-operations.js';

export interface DesignerLayersControllerCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerLayersController {
  #search = '';
  #collapsed = new Set<string>();
  #dropTargetId: string | null | undefined;
  #draggedLayerId: string | undefined;
  #layers: HTMLElement | undefined;
  #renameDrafts = new Map<string, string>();
  #renderLimit = DESIGNER_LAYER_PAGE_SIZE;

  constructor(private readonly callbacks: DesignerLayersControllerCallbacks) {}

  render(layers: HTMLElement | undefined): void {
    if (layers === undefined) return;
    this.#layers = layers;
    const view = createDesignerLayerView(this.callbacks.getDocument(), this.callbacks.getCatalog());
    renderDesignerLayers(layers, view, {
      interaction: this.callbacks.getInteraction(),
      search: this.#search,
      collapsed: this.#collapsed,
      dropTargetId: this.#dropTargetId,
      renameDrafts: this.#renameDrafts,
      renderLimit: this.#renderLimit,
      canMove: (id, direction) => this.canMove(id, direction),
    });
    if (view.diagnostics.length > 0) this.callbacks.emitDiagnostics(view.diagnostics);
  }

  onClick(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const showMore = target.closest<HTMLElement>('[data-layer-show-more]');
    if (showMore !== null) {
      this.#renderLimit += DESIGNER_LAYER_PAGE_SIZE;
      this.render(showMore.closest<HTMLElement>('[data-layers]') ?? this.#layers);
      return true;
    }
    const select = target.closest<HTMLElement>('[data-layer-select]');
    if (select !== null) {
      this.select(select.dataset.layerSelect!, event);
      return true;
    }
    const collapse = target.closest<HTMLElement>('[data-layer-collapse]');
    if (collapse?.dataset.layerCollapse !== undefined) {
      const id = collapse.dataset.layerCollapse;
      if (this.#collapsed.has(id)) this.#collapsed.delete(id);
      else this.#collapsed.add(id);
      this.render(collapse.closest<HTMLElement>('[data-layers]') ?? undefined);
      return true;
    }
    const toggle = target.closest<HTMLElement>('[data-layer-toggle]');
    if (toggle !== null) {
      this.toggle(toggle.dataset.layerId!, toggle.dataset.layerToggle!);
      return true;
    }
    const move = target.closest<HTMLElement>('[data-layer-move]');
    if (move !== null) {
      this.move(move.dataset.layerId!, move.dataset.layerMove as 'up' | 'down');
      return true;
    }
    return false;
  }

  onInput(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return false;
    if (target.dataset.layerSearch !== undefined) {
      this.#search = target.value;
      this.#renderLimit = DESIGNER_LAYER_PAGE_SIZE;
      this.render(target.closest<HTMLElement>('[data-layers]') ?? undefined);
      return true;
    }
    const id = target.dataset.layerRename;
    if (id === undefined) return false;
    this.#renameDrafts.set(id, target.value);
    return true;
  }

  onChange(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return false;
    if (target.dataset.layerSearch !== undefined) return true;
    const id = target.dataset.layerRename;
    if (id === undefined) return false;
    this.commitRename(id, target.value);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.layerRename === undefined) {
      return false;
    }
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === target.dataset.layerRename);
    if (component === undefined) return false;
    if (event.key === 'Escape') {
      this.#renameDrafts.delete(component.id);
      target.value = component.name;
      event.preventDefault();
      return true;
    }
    if (event.key !== 'Enter' || event.isComposing) return false;
    event.preventDefault();
    this.commitRename(component.id, target.value);
    return true;
  }

  onDragStart(event: DragEvent): boolean {
    const row = getLayerRow(event.target);
    const document = this.callbacks.getDocument();
    if (row === undefined || document === undefined) return false;
    if (
      isScreenComponentEffectivelyHidden(document, row) ||
      isScreenComponentEffectivelyLocked(document, row)
    ) {
      return false;
    }
    this.#draggedLayerId = row;
    this.setDropTarget(undefined);
    event.dataTransfer?.setData('text/plain', row);
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.effectAllowed = 'move';
    }
    return true;
  }

  onDragOver(event: DragEvent): boolean {
    const parentId = getDropParent(event.target);
    if (
      this.#draggedLayerId === undefined ||
      parentId === undefined ||
      parentId === this.#draggedLayerId
    ) {
      this.setDropTarget(undefined);
      return false;
    }
    if (!this.canReparent(this.draggedSelection(), parentId)) {
      this.setDropTarget(undefined);
      return false;
    }
    event.preventDefault();
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.setDropTarget(parentId);
    return true;
  }

  onDrop(event: DragEvent): boolean {
    const parentId = getDropParent(event.target);
    const componentIds = this.draggedSelection();
    this.#draggedLayerId = undefined;
    this.setDropTarget(undefined);
    if (
      parentId === undefined ||
      componentIds.length === 0 ||
      !this.canReparent(componentIds, parentId)
    ) {
      return false;
    }
    event.preventDefault();
    this.report(
      this.callbacks.executeTransaction(
        createReparentTransaction(this.callbacks.getDocument()!, componentIds, parentId),
      ),
    );
    return true;
  }

  clearDrag(): void {
    this.#draggedLayerId = undefined;
    this.setDropTarget(undefined);
  }

  clearSessionState(): void {
    this.#search = '';
    this.#collapsed.clear();
    this.#draggedLayerId = undefined;
    this.#dropTargetId = undefined;
    this.#renameDrafts.clear();
    this.#renderLimit = DESIGNER_LAYER_PAGE_SIZE;
    this.render(this.#layers);
  }

  private select(componentId: string, event: Event): void {
    const modifiers = event as MouseEvent;
    if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId });
      return;
    }
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
  }

  private toggle(componentId: string, property: string): void {
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === componentId);
    if (component === undefined || (property !== 'hidden' && property !== 'locked')) return;
    this.update(componentId, {
      status: { ...component.status, [property]: !component.status[property] },
    });
  }

  private move(componentId: string, direction: 'up' | 'down'): void {
    if (!this.canMove(componentId, direction)) return;
    const document = this.callbacks.getDocument()!;
    const transaction = createSiblingReorderTransaction(document, componentId, direction);
    if (transaction !== undefined) this.report(this.callbacks.executeTransaction(transaction));
  }

  private update(componentId: string, patch: ScreenComponentPatch): void {
    this.report(
      this.callbacks.executeTransaction({
        commands: [{ type: 'update-components', componentIds: [componentId], patch }],
      }),
    );
  }

  private commitRename(componentId: string, name: string): void {
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === componentId);
    if (component === undefined || component.name === name) {
      this.#renameDrafts.delete(componentId);
      return;
    }
    const result = this.callbacks.executeTransaction({
      commands: [{ type: 'update-components', componentIds: [componentId], patch: { name } }],
    });
    if (result.ok) this.#renameDrafts.delete(componentId);
    else this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private canMove(componentId: string, direction: 'up' | 'down'): boolean {
    const document = this.callbacks.getDocument();
    const component = document?.components.find((item) => item.id === componentId);
    if (
      document === undefined ||
      component === undefined ||
      isScreenComponentEffectivelyLocked(document, componentId)
    ) {
      return false;
    }
    const siblings = getSiblingIds(document, component.parentId);
    const neighborId = siblings[siblings.indexOf(componentId) + (direction === 'up' ? -1 : 1)];
    return neighborId !== undefined && !isScreenComponentEffectivelyLocked(document, neighborId);
  }

  private draggedSelection(): readonly string[] {
    if (this.#draggedLayerId === undefined) return [];
    const selected = this.callbacks.getInteraction().selectedComponentIds;
    return selected.includes(this.#draggedLayerId) ? selected : [this.#draggedLayerId];
  }

  private canReparent(componentIds: readonly string[], parentId: string | null): boolean {
    const document = this.callbacks.getDocument();
    const sources =
      document === undefined
        ? []
        : componentIds.map((componentId) =>
            document.components.find((component) => component.id === componentId),
          );
    const parent =
      parentId === null
        ? undefined
        : document?.components.find((component) => component.id === parentId);
    return (
      document !== undefined &&
      componentIds.length > 0 &&
      new Set(componentIds).size === componentIds.length &&
      sources.every(
        (component) =>
          component !== undefined &&
          !isScreenComponentEffectivelyHidden(document, component.id) &&
          !isScreenComponentEffectivelyLocked(document, component.id),
      ) &&
      (parentId === null ||
        (parent !== undefined &&
          !isScreenComponentEffectivelyHidden(document, parentId) &&
          !isScreenComponentEffectivelyLocked(document, parentId) &&
          this.callbacks.getCatalog()?.get(parent.type)?.manifest.designCapabilities.children ===
            true)) &&
      applyScreenDocumentTransaction(
        document,
        createReparentTransaction(document, componentIds, parentId),
      ).ok
    );
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private setDropTarget(parentId: string | null | undefined): void {
    if (this.#dropTargetId === parentId) return;
    this.#dropTargetId = parentId;
    this.render(this.#layers);
  }
}

function getLayerRow(target: EventTarget | null): string | undefined {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    : undefined;
}

function getDropParent(target: EventTarget | null): string | null | undefined {
  if (!(target instanceof HTMLElement)) return undefined;
  const row = target.closest<HTMLElement>('[data-layer-id]');
  if (row !== null) return row.dataset.layerId;
  return target.closest<HTMLElement>('[data-layer-root]') === null ? undefined : null;
}

function getSiblingIds(document: ScreenDocument, parentId: string | null): readonly string[] {
  return document.components
    .filter((component) => component.parentId === parentId)
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex ||
        document.components.indexOf(left) - document.components.indexOf(right),
    )
    .map((component) => component.id);
}
