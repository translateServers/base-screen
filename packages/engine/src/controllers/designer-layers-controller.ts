import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  isScreenComponentEffectivelyLocked,
  type ScreenComponentPatch,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createDesignerLayerView, renderDesignerLayers } from '../dom/designer-layers-dom.js';
import { createReparentTransaction } from '../operations/designer-layout-operations.js';

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
  #draggedLayerId: string | undefined;

  constructor(private readonly callbacks: DesignerLayersControllerCallbacks) {}

  render(layers: HTMLElement | undefined): void {
    if (layers === undefined) return;
    const view = createDesignerLayerView(this.callbacks.getDocument(), this.callbacks.getCatalog());
    renderDesignerLayers(
      layers,
      view,
      this.callbacks.getInteraction().focusedComponentId,
      this.#search,
      (id, direction) => this.canMove(id, direction),
    );
    if (view.diagnostics.length > 0) this.callbacks.emitDiagnostics(view.diagnostics);
  }

  onClick(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const select = target.closest<HTMLElement>('[data-layer-select]');
    if (select !== null) {
      this.select(select.dataset.layerSelect!);
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

  onChange(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return false;
    if (target.dataset.layerSearch !== undefined) {
      this.#search = target.value;
      this.render(target.closest<HTMLElement>('[data-layers]') ?? undefined);
      return true;
    }
    const id = target.dataset.layerRename;
    if (id === undefined) return false;
    this.update(id, { name: target.value });
    return true;
  }

  onDragStart(event: DragEvent): boolean {
    const row = getLayerRow(event.target);
    const document = this.callbacks.getDocument();
    if (row === undefined || document === undefined || document.components.length > 50)
      return false;
    this.#draggedLayerId = row;
    event.dataTransfer?.setData('text/plain', row);
    if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move';
    return true;
  }

  onDragOver(event: DragEvent): boolean {
    const parentId = getLayerRow(event.target);
    if (
      this.#draggedLayerId === undefined ||
      parentId === undefined ||
      parentId === this.#draggedLayerId
    )
      return false;
    if (!this.canReparent(this.draggedSelection(), parentId)) return false;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
    return true;
  }

  onDrop(event: DragEvent): boolean {
    const parentId = getLayerRow(event.target);
    const componentIds = this.draggedSelection();
    this.#draggedLayerId = undefined;
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
  }

  private select(componentId: string): void {
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
    const component = document.components.find((item) => item.id === componentId)!;
    const siblings = getSiblingIds(document, component.parentId);
    const index = siblings.indexOf(componentId);
    const neighbor = document.components.find(
      (item) => item.id === siblings[index + (direction === 'up' ? -1 : 1)],
    )!;
    this.report(
      this.callbacks.executeTransaction({
        commands: [
          {
            type: 'update-components',
            componentIds: [component.id],
            patch: { zIndex: neighbor.zIndex },
          },
          {
            type: 'update-components',
            componentIds: [neighbor.id],
            patch: { zIndex: component.zIndex },
          },
        ],
      }),
    );
  }

  private update(componentId: string, patch: ScreenComponentPatch): void {
    this.report(
      this.callbacks.executeTransaction({
        commands: [{ type: 'update-components', componentIds: [componentId], patch }],
      }),
    );
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

  private canReparent(componentIds: readonly string[], parentId: string): boolean {
    const document = this.callbacks.getDocument();
    const parent = document?.components.find((component) => component.id === parentId);
    return (
      document !== undefined &&
      parent !== undefined &&
      document.components.length <= 50 &&
      this.callbacks.getCatalog()?.get(parent.type)?.manifest.designCapabilities.children ===
        true &&
      applyScreenDocumentTransaction(
        document,
        createReparentTransaction(document, componentIds, parentId),
      ).ok
    );
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }
}

function getLayerRow(target: EventTarget | null): string | undefined {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    : undefined;
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
