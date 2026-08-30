import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenAlignment,
  BaseScreenDistribution,
} from '../../common/operations/designer-layout-operations.js';
import type { DesignerPanelControllerCallbacks } from './panel/designer-panel-controller-callbacks.js';
import { DesignerPanelInspectorController } from './panel/designer-panel-inspector-controller.js';
import {
  DesignerPanelMaterialController,
  MATERIAL_DRAG_TYPE,
  MATERIAL_LIBRARY_ITEM_DRAG_TYPE,
  MATERIAL_SEARCH_DEBOUNCE_MS,
} from './panel/designer-panel-material-controller.js';
import { DesignerPanelPropertyController } from './panel/designer-panel-property-controller.js';
import { DesignerPanelSelectionController } from './panel/designer-panel-selection-controller.js';

export type { DesignerPanelControllerCallbacks } from './panel/designer-panel-controller-callbacks.js';
export { MATERIAL_DRAG_TYPE, MATERIAL_LIBRARY_ITEM_DRAG_TYPE, MATERIAL_SEARCH_DEBOUNCE_MS };

/**
 * Stable facade for Designer panel interactions.
 *
 * State and behavior live in focused collaborators so Inspector chrome, material browsing,
 * property transactions, and selection commands can evolve independently.
 */
export class DesignerPanelController {
  readonly #inspector: DesignerPanelInspectorController;
  readonly #materials: DesignerPanelMaterialController;
  readonly #properties: DesignerPanelPropertyController;
  readonly #selection: DesignerPanelSelectionController;

  constructor(callbacks: DesignerPanelControllerCallbacks) {
    this.#inspector = new DesignerPanelInspectorController(callbacks);
    this.#materials = new DesignerPanelMaterialController(callbacks);
    this.#properties = new DesignerPanelPropertyController(callbacks);
    this.#selection = new DesignerPanelSelectionController(callbacks);
  }

  clearClipboard(): void {
    this.#selection.clearClipboard();
  }

  dispose(): void {
    this.#materials.dispose();
    this.#inspector.dispose();
  }

  onPointerDown(event: PointerEvent): void {
    this.#inspector.onPointerDown(event);
  }

  get hasClipboard(): boolean {
    return this.#selection.hasClipboard;
  }

  refreshMaterialLibrary(layout: HTMLElement | null): void {
    this.#materials.refresh(layout);
  }

  get canGroup(): boolean {
    return this.#selection.canGroup;
  }

  get canUngroup(): boolean {
    return this.#selection.canUngroup;
  }

  get canAlign(): boolean {
    return this.#selection.canAlign;
  }

  get canDistribute(): boolean {
    return this.#selection.canDistribute;
  }

  copy(): void {
    this.#selection.copy();
  }

  paste(): ScreenParseResult<ScreenDocument> {
    return this.#selection.paste();
  }

  duplicate(): ScreenParseResult<ScreenDocument> {
    return this.#selection.duplicate();
  }

  group(): ScreenParseResult<ScreenDocument> {
    return this.#selection.group();
  }

  ungroup(): ScreenParseResult<ScreenDocument> {
    return this.#selection.ungroup();
  }

  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument> {
    return this.#selection.align(alignment);
  }

  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument> {
    return this.#selection.distribute(distribution);
  }

  render(properties: HTMLElement | undefined, dataPanel?: HTMLElement): void {
    this.#inspector.prepareRender(properties, dataPanel);
    this.#properties.render(properties, dataPanel);
  }

  captureInspectorGroupPreferences(root: ShadowRoot | HTMLElement | null): void {
    this.#inspector.captureGroupPreferences(root);
  }

  refreshInspectorUi(root: ShadowRoot | HTMLElement | null): void {
    this.#inspector.refresh(root);
  }

  onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.#inspector.onClick(target)) return;
    if (this.#materials.onClick(target)) return;
    if (this.#properties.onClick(target)) return;
    if (target instanceof HTMLElement) this.#selection.onClick(target);
  }

  onDragStart(event: DragEvent): boolean {
    return this.#materials.onDragStart(event);
  }

  onPropertyChange(event: Event): void {
    this.#inspector.preservePropertyScroll(event.target);
    this.#properties.onPropertyChange(event);
  }

  onInput(event: Event): boolean {
    return this.#inspector.onInput(event.target) || this.#materials.onInput(event.target);
  }

  onKeyDown(event: KeyboardEvent): boolean {
    return (
      this.#inspector.onKeyDown(event) ||
      this.#materials.onKeyDown(event) ||
      this.#properties.onKeyDown(event) ||
      this.#selection.onKeyDown(event)
    );
  }
}
