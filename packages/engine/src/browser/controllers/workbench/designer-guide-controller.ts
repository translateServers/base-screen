import type { ScreenDocument } from '@base-screen/contracts';
import type { DesignerCanvasAidsState } from '../../viewport/designer-canvas-aids.js';
import {
  clientPointToDesignerCanvasPoint,
  getDesignerCanvasBounds,
} from '../../viewport/designer-canvas-coordinates.js';
import type { DesignerGuideSnapPreview } from '../../viewport/designer-canvas-snap-preview.js';
import {
  type DesignerGuideAxis,
  DesignerGuideOverlay,
} from '../../viewport/designer-guide-overlay.js';
import { renderDesignerRulers } from '../../viewport/designer-ruler-renderer.js';

interface DesignerGuideCallbacks {
  readonly getCanvas: () => HTMLDivElement | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getRoot: () => ShadowRoot | null;
  readonly getSnapState: () => {
    readonly canvasAids: DesignerCanvasAidsState;
    readonly enabled: boolean;
    readonly preview: DesignerGuideSnapPreview | undefined;
  };
  readonly getZoom: () => number;
  readonly invalidateSnap: () => void;
  readonly onLostPointerCapture: (event: PointerEvent) => void;
  readonly renderStatus: () => void;
}

type GuideDrag = {
  readonly axis: DesignerGuideAxis;
  readonly guideIndex: number | undefined;
  readonly pointerId: number;
  /** 拖拽起始坐标，用于区分点击与真实拖拽。 */
  readonly value: number;
};

const DESIGNER_GUIDE_DOUBLE_CLICK_MS = 500;
const DESIGNER_GUIDE_DRAG_THRESHOLD = 3;

export class DesignerGuideController {
  readonly #overlay = new DesignerGuideOverlay();
  #guides: { x: number[]; y: number[] } = { x: [], y: [] };
  #visible = true;
  #drag: GuideDrag | undefined;
  #lastPointerDown:
    | { readonly axis: DesignerGuideAxis; readonly index: number; readonly time: number }
    | undefined;
  #preview: { readonly axis: DesignerGuideAxis; readonly value: number } | undefined;
  #captureTarget: HTMLDivElement | undefined;
  #connectedCanvas: HTMLDivElement | undefined;
  #canvasListeners: readonly { readonly type: string; readonly listener: EventListener }[] = [];
  #resizeObserver: ResizeObserver | undefined;

  constructor(private readonly callbacks: DesignerGuideCallbacks) {}

  get guides(): { readonly x: readonly number[]; readonly y: readonly number[] } {
    return this.#guides;
  }

  get visible(): boolean {
    return this.#visible;
  }

  isConnected(canvas: HTMLDivElement): boolean {
    return this.#connectedCanvas === canvas;
  }

  connect(canvas: HTMLDivElement | undefined): void {
    if (canvas === undefined || this.#connectedCanvas === canvas) return;
    this.disconnect();
    this.#connectedCanvas = canvas;
    this.#canvasListeners = [
      {
        type: 'pointerdown',
        listener: (event) => this.onCanvasPointerDown(event as PointerEvent),
      },
      { type: 'dblclick', listener: (event) => this.onDoubleClick(event as MouseEvent) },
      {
        type: 'lostpointercapture',
        listener: (event) => this.callbacks.onLostPointerCapture(event as PointerEvent),
      },
    ];
    for (const { type, listener } of this.#canvasListeners) canvas.addEventListener(type, listener);
    this.observeRulerResize();
  }

  disconnect(): void {
    this.releaseDrag();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    if (this.#connectedCanvas !== undefined) {
      for (const { type, listener } of this.#canvasListeners) {
        this.#connectedCanvas.removeEventListener(type, listener);
      }
    }
    this.#canvasListeners = [];
    this.#connectedCanvas = undefined;
    this.#overlay.disconnect();
  }

  observeRulerResize(): void {
    if (this.#resizeObserver !== undefined || globalThis.ResizeObserver === undefined) return;
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const observer = new ResizeObserver(() => this.renderRulers());
    for (const ruler of root.querySelectorAll<HTMLElement>('.ruler-horizontal, .ruler-vertical')) {
      observer.observe(ruler);
    }
    this.#resizeObserver = observer;
  }

  onPointerDown(event: PointerEvent): boolean {
    if (!isPrimaryPointer(event)) return false;
    const target = event.target as HTMLElement | null;
    const ruler = target?.closest<HTMLElement>('.ruler');
    const axis = ruler?.classList.contains('ruler-horizontal')
      ? 'y'
      : ruler?.classList.contains('ruler-vertical')
        ? 'x'
        : undefined;
    const canvas = this.callbacks.getCanvas();
    if (axis === undefined || canvas === undefined) return false;
    // 保持焦点在 viewport，避免 blur 中断参考线拖拽。
    event.preventDefault();
    this.startDrag(axis, undefined, event, canvas);
    return true;
  }

  onPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const value = this.dragValue(event, drag.axis, canvas);
    if (
      this.#lastPointerDown?.axis === drag.axis &&
      this.#lastPointerDown.index === drag.guideIndex &&
      Math.abs(value - drag.value) * Math.max(this.callbacks.getZoom(), Number.EPSILON) >=
        DESIGNER_GUIDE_DRAG_THRESHOLD
    ) {
      this.#lastPointerDown = undefined;
    }
    this.#preview = { axis: drag.axis, value };
    this.render();
  }

  onPointerUp(event: PointerEvent): void {
    const drag = this.#drag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const value = this.dragValue(event, drag.axis, canvas);
    if (drag.guideIndex !== undefined) {
      if (this.isWithinCanvas(drag.axis, value)) this.#guides[drag.axis][drag.guideIndex] = value;
      else this.#guides[drag.axis].splice(drag.guideIndex, 1);
    } else if (this.isWithinCanvas(drag.axis, value)) {
      this.#guides[drag.axis].push(value);
    }
    this.callbacks.invalidateSnap();
    this.releaseDrag();
    this.#preview = undefined;
    this.render();
  }

  onDoubleClick(event: MouseEvent): void {
    const root = this.callbacks.getRoot();
    const target = event.composedPath?.()[0] ?? event.target;
    const candidates: readonly (Element | EventTarget)[] =
      root !== null && typeof root.elementsFromPoint === 'function'
        ? root.elementsFromPoint(event.clientX, event.clientY)
        : [];
    for (const hit of [...candidates, target]) {
      const element = hit as { closest?: (selector: string) => HTMLElement | null } | null;
      const guide = element?.closest?.('[data-canvas-guide]');
      const axis = guide?.dataset.axis;
      const index = Number(guide?.dataset.guideIndex);
      if ((axis !== 'x' && axis !== 'y') || !Number.isInteger(index)) continue;
      this.#guides[axis].splice(index, 1);
      this.callbacks.invalidateSnap();
      event.stopImmediatePropagation();
      this.render();
      return;
    }
  }

  isDraggingPointer(pointerId: number): boolean {
    return this.#drag?.pointerId === pointerId;
  }

  resetTransient(): void {
    this.releaseDrag();
    this.#lastPointerDown = undefined;
    this.#preview = undefined;
  }

  clear(): void {
    this.resetTransient();
    this.#guides = { x: [], y: [] };
    this.callbacks.invalidateSnap();
    this.render();
  }

  toggleVisible(): void {
    this.#visible = !this.#visible;
    this.render();
    this.callbacks.renderStatus();
  }

  render(): void {
    const root = this.callbacks.getRoot();
    const canvas = this.callbacks.getCanvas();
    if (root === null || canvas === undefined) return;
    const snap = this.callbacks.getSnapState();
    const canvasSize = this.callbacks.getDocument()?.canvas;
    this.#overlay.render({
      canvas,
      canvasAids: snap.canvasAids,
      canvasSize:
        canvasSize === undefined
          ? undefined
          : { height: canvasSize.height, width: canvasSize.width },
      drag: this.#drag,
      guidePreview: this.#preview,
      guides: this.#guides,
      guidesVisible: this.#visible,
      root,
      snapEnabled: snap.enabled,
      snapPreview: snap.preview,
      zoom: this.callbacks.getZoom(),
    });
  }

  renderRulers(): void {
    const root = this.callbacks.getRoot();
    const canvas = this.callbacks.getCanvas();
    if (root === null || canvas === undefined) return;
    renderDesignerRulers({ canvas, root, zoom: this.callbacks.getZoom() });
  }

  private onCanvasPointerDown(event: PointerEvent): void {
    if (!isPrimaryPointer(event)) return;
    const target = event.target as HTMLElement | null;
    const guide = target?.closest<HTMLElement>('[data-canvas-guide]');
    const axis = guide?.dataset.axis;
    const index = Number(guide?.dataset.guideIndex);
    const canvas = this.callbacks.getCanvas();
    if ((axis !== 'x' && axis !== 'y') || !Number.isInteger(index) || canvas === undefined) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const previous = this.#lastPointerDown;
    this.#lastPointerDown = { axis, index, time: event.timeStamp };
    if (
      previous?.axis === axis &&
      previous.index === index &&
      event.timeStamp - previous.time <= DESIGNER_GUIDE_DOUBLE_CLICK_MS
    ) {
      this.#lastPointerDown = undefined;
      this.#guides[axis].splice(index, 1);
      this.callbacks.invalidateSnap();
      this.render();
      return;
    }
    this.startDrag(axis, index, event, canvas);
  }

  private startDrag(
    axis: DesignerGuideAxis,
    guideIndex: number | undefined,
    event: PointerEvent,
    canvas: HTMLDivElement,
  ): void {
    canvas.setPointerCapture(event.pointerId);
    this.#captureTarget = canvas;
    const value = this.dragValue(event, axis, canvas);
    this.#drag = { axis, guideIndex, pointerId: event.pointerId, value };
    this.#preview = { axis, value };
    this.render();
  }

  private releaseDrag(pointerId?: number): void {
    const drag = this.#drag;
    if (drag === undefined || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    const captureTarget = this.#captureTarget;
    this.#drag = undefined;
    this.#captureTarget = undefined;
    if (captureTarget?.hasPointerCapture(drag.pointerId)) {
      captureTarget.releasePointerCapture(drag.pointerId);
    }
  }

  private dragValue(event: PointerEvent, axis: DesignerGuideAxis, canvas: HTMLDivElement): number {
    const point = clientPointToDesignerCanvasPoint(
      event,
      getDesignerCanvasBounds(canvas),
      this.callbacks.getZoom(),
    );
    return axis === 'x' ? point.x : point.y;
  }

  private isWithinCanvas(axis: DesignerGuideAxis, value: number): boolean {
    const canvas = this.callbacks.getDocument()?.canvas;
    const limit = axis === 'x' ? canvas?.width : canvas?.height;
    return limit !== undefined && Number.isFinite(value) && value >= 0 && value <= limit;
  }
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}
