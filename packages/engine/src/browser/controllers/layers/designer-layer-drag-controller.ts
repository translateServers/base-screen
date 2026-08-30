import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentTransaction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createReparentTransaction } from '../../../common/operations/element/designer-layout-operations.js';

interface DesignerLayerDragControllerCallbacks {
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly onDropTargetChange: () => void;
}

export class DesignerLayerDragController {
  #draggedLayerId: string | undefined;
  #dropTargetId: string | null | undefined;

  constructor(private readonly callbacks: DesignerLayerDragControllerCallbacks) {}

  get dropTargetId(): string | null | undefined {
    return this.#dropTargetId;
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
    const document = this.callbacks.getDocument();
    if (
      document === undefined ||
      parentId === undefined ||
      componentIds.length === 0 ||
      !this.canReparent(componentIds, parentId)
    ) {
      return false;
    }
    event.preventDefault();
    const result = this.callbacks.executeTransaction(
      createReparentTransaction(componentIds, parentId),
    );
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
    return true;
  }

  clear(): void {
    this.#draggedLayerId = undefined;
    this.setDropTarget(undefined);
  }

  reset(): void {
    this.#draggedLayerId = undefined;
    this.#dropTargetId = undefined;
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
      applyScreenDocumentTransaction(document, createReparentTransaction(componentIds, parentId)).ok
    );
  }

  private setDropTarget(parentId: string | null | undefined): void {
    if (this.#dropTargetId === parentId) return;
    this.#dropTargetId = parentId;
    this.callbacks.onDropTargetChange();
  }
}

function getLayerRow(target: EventTarget | null): string | undefined {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    : undefined;
}

function getDropParent(target: EventTarget | null): string | null | undefined {
  if (!(target instanceof Element)) return undefined;
  const row = target.closest<HTMLElement>('[data-layer-id]');
  if (row !== null) return row.dataset.layerId;
  return target.closest<HTMLElement>('[data-layer-root]') === null ? undefined : null;
}
