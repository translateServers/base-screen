import type { DesignerSnapTranslation } from '../../viewport/designer-canvas-aids.js';
import {
  clientPointToDesignerCanvasPoint,
  type DesignerClientPoint,
  getDesignerCanvasBounds,
} from '../../viewport/designer-canvas-coordinates.js';
import type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';

export interface DesignerGesturePoint {
  readonly x: number;
  readonly y: number;
}

/** Shared canvas coordinates, snapping, and pointer-capture lifecycle for gesture states. */
export class DesignerGestureEnvironment {
  #canvas: HTMLDivElement | undefined;
  #selectSuppression: string | null = null;

  constructor(private readonly callbacks: DesignerGestureCallbacks) {}

  get canvas(): HTMLDivElement | undefined {
    return this.#canvas;
  }

  setCanvas(canvas: HTMLDivElement | undefined): void {
    this.#canvas = canvas;
    if (canvas === undefined) this.#selectSuppression = null;
  }

  canvasPoint(point: DesignerClientPoint): DesignerGesturePoint {
    const bounds = getDesignerCanvasBounds(this.#canvas!);
    return clientPointToDesignerCanvasPoint(point, bounds, this.callbacks.getViewport().zoom);
  }

  snapCanvasPoint(
    event: PointerEvent | DragEvent,
    excludedComponentIds: readonly string[] = [],
  ): DesignerGesturePoint {
    return this.snapPoint(this.canvasPoint(event), excludedComponentIds);
  }

  snapPoint(
    point: DesignerGesturePoint,
    excludedComponentIds: readonly string[] = [],
  ): DesignerGesturePoint {
    const snapped = this.callbacks.snapCanvasPoint(point, excludedComponentIds);
    this.callbacks.renderSnapPreview?.(snapped);
    return snapped;
  }

  snapSelection(
    bounds: {
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
      readonly top: number;
    },
    offset: DesignerGesturePoint,
    excludedComponentIds: readonly string[],
  ): DesignerSnapTranslation {
    const snapped = this.callbacks.snapCanvasSelection(bounds, offset, excludedComponentIds);
    this.callbacks.renderSnapPreview?.(snapped);
    return snapped;
  }

  clearSnapPreview(): void {
    this.callbacks.renderSnapPreview?.(undefined);
  }

  capturePointer(pointerId: number): void {
    try {
      this.#canvas?.setPointerCapture(pointerId);
    } catch {
      // Synthetic or detached pointers cannot capture; the gesture remains valid while events arrive.
    }
    this.suppressSelection();
  }

  releasePointer(pointerId: number): void {
    if (this.#canvas?.hasPointerCapture(pointerId)) {
      this.#canvas.releasePointerCapture(pointerId);
    }
    this.restoreSelection();
  }

  private suppressSelection(): void {
    const canvas = this.#canvas;
    if (canvas === undefined || this.#selectSuppression !== null) return;
    this.#selectSuppression = canvas.style.userSelect;
    canvas.style.userSelect = 'none';
  }

  private restoreSelection(): void {
    const canvas = this.#canvas;
    if (canvas === undefined || this.#selectSuppression === null) return;
    canvas.style.userSelect = this.#selectSuppression;
    this.#selectSuppression = null;
  }
}
