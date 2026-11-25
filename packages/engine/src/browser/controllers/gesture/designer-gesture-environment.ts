import type {
  DesignerSelectionSnapBounds,
  DesignerSnapPoint,
  DesignerSnapTranslation,
} from '../../viewport/designer-canvas-aids.js';
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

/** Holding Ctrl / Cmd during a gesture bypasses snapping (Figma, Excalidraw, tldraw). */
export function isDesignerSnapBypassed(event: {
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}): boolean {
  return event.ctrlKey === true || event.metaKey === true;
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

  /** Snap the pointer and preview the guides through the snapped point. */
  snapCanvasPoint(
    event: PointerEvent | DragEvent,
    excludedComponentIds: readonly string[] = [],
  ): DesignerGesturePoint {
    const snapped = this.resolveCanvasPoint(event, excludedComponentIds);
    this.callbacks.renderSnapPreview?.(isDesignerSnapBypassed(event) ? undefined : snapped);
    return snapped;
  }

  /** Snap the pointer without previewing: the gesture previews the geometry it derives. */
  resolveCanvasPoint(
    event: PointerEvent | DragEvent,
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapPoint {
    const point = this.canvasPoint(event);
    return isDesignerSnapBypassed(event)
      ? point
      : this.callbacks.snapCanvasPoint(point, excludedComponentIds);
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
    bounds: DesignerSelectionSnapBounds,
    offset: DesignerGesturePoint,
    excludedComponentIds: readonly string[],
    event?: { readonly ctrlKey?: boolean; readonly metaKey?: boolean },
  ): DesignerSnapTranslation {
    if (event !== undefined && isDesignerSnapBypassed(event)) {
      this.clearSnapPreview();
      return { x: offset.x, y: offset.y };
    }
    const snapped = this.callbacks.snapCanvasSelection(bounds, offset, excludedComponentIds);
    this.callbacks.renderSnapPreview?.(snapped);
    return snapped;
  }

  /**
   * Preview the guides of derived geometry (a resized box, a drawn rectangle) after its pointer
   * snapped; `undefined` clears the preview. `snapped` keeps the attached line highlighted.
   */
  previewGeometry(
    bounds: DesignerSelectionSnapBounds | undefined,
    excludedComponentIds: readonly string[],
    snapped: DesignerSnapPoint,
  ): void {
    if (bounds === undefined) {
      this.clearSnapPreview();
      return;
    }
    const guides = this.callbacks.snapCanvasGuides?.(bounds, excludedComponentIds);
    this.callbacks.renderSnapPreview?.({
      x: snapped.x,
      y: snapped.y,
      ...(snapped.snappedX === undefined ? {} : { snappedX: snapped.snappedX }),
      ...(snapped.snappedY === undefined ? {} : { snappedY: snapped.snappedY }),
      ...(guides === undefined ? {} : { guides }),
    });
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
