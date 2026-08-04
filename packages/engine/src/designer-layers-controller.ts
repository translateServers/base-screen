import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyLocked,
  type ScreenComponentPatch,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createDesignerLayerView, renderDesignerLayers } from './designer-layers-dom.js';

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

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }
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
