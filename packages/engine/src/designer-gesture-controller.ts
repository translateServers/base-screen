import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  isScreenComponentEffectivelyLocked,
  queryScreenComponentsInRect,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenViewportState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { selectedComponents } from './designer-selection.js';
import {
  type BaseScreenTransformHandle,
  createTransformTransaction,
  resizeScreenComponents,
  rotateScreenComponents,
} from './designer-transform.js';

interface Drag {
  readonly componentId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startX: number;
  readonly startY: number;
  readonly element: HTMLElement;
}

interface Transform {
  readonly pointerId: number;
  readonly kind: 'resize' | 'rotate';
  readonly handle: BaseScreenTransformHandle | undefined;
  readonly start: Point;
  readonly components: readonly ScreenComponentNode[];
}

interface Marquee {
  readonly pointerId: number;
  readonly start: Point;
  readonly union: boolean;
  readonly contain: boolean;
}

interface Pan {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DesignerGestureCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => {
    readonly selectedComponentIds: readonly string[];
    readonly focusedComponentId: string | null;
  };
  readonly getViewport: () => ScreenViewportState;
  readonly panBy: (delta: Point) => void;
  readonly isHandActive: () => boolean;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly reportTransaction: (transaction: ScreenDocumentTransaction) => void;
  readonly renderSelection: () => void;
}

export class DesignerGestureController {
  #canvas: HTMLDivElement | undefined;
  #drag: Drag | undefined;
  #transform: Transform | undefined;
  #marquee: Marquee | undefined;
  #pan: Pan | undefined;

  constructor(private readonly callbacks: DesignerGestureCallbacks) {}

  connect(canvas: HTMLDivElement): void {
    this.#canvas = canvas;
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => this.cancel());
  }

  cancel(): void {
    this.cancelDrag();
    this.cancelTransform();
    this.cancelMarquee();
    this.cancelPan();
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    if (!(target instanceof HTMLElement) || document === undefined || canvas === undefined) {
      return;
    }
    if (this.callbacks.isHandActive()) {
      canvas.setPointerCapture(event.pointerId);
      this.#pan = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      return;
    }
    const transformHandle = target.closest<HTMLElement>('[data-transform-handle]');
    if (transformHandle !== null) {
      this.startTransform(
        event,
        transformHandle.dataset.transformHandle as BaseScreenTransformHandle,
      );
      return;
    }
    if (target.closest<HTMLElement>('[data-transform-rotate]') !== null) {
      this.startTransform(event, undefined);
      return;
    }
    const material = target.closest<HTMLElement>('[data-base-screen-component-id]');
    const componentId = material?.dataset.baseScreenComponentId;
    if (componentId === undefined || material === null) {
      canvas.setPointerCapture(event.pointerId);
      this.#marquee = {
        pointerId: event.pointerId,
        start: this.canvasPointFromPointer(event),
        union: event.shiftKey,
        contain: event.altKey,
      };
      this.renderMarquee(this.#marquee.start, this.#marquee.start);
      return;
    }
    const component = document.components.find((item) => item.id === componentId);
    if (component === undefined) {
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId });
      return;
    }
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
    if (isScreenComponentEffectivelyLocked(document, componentId)) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    this.#drag = {
      componentId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: component.position.x,
      startY: component.position.y,
      element: material,
    };
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.#pan !== undefined && event.pointerId === this.#pan.pointerId) {
      this.callbacks.panBy({
        x: event.clientX - this.#pan.startClientX,
        y: event.clientY - this.#pan.startClientY,
      });
      this.#pan = { ...this.#pan, startClientX: event.clientX, startClientY: event.clientY };
      return;
    }
    if (this.#marquee !== undefined && event.pointerId === this.#marquee.pointerId) {
      this.renderMarquee(this.#marquee.start, this.canvasPointFromPointer(event));
      return;
    }
    if (this.#transform !== undefined && event.pointerId === this.#transform.pointerId) {
      this.renderTransformPreview(event);
      return;
    }
    if (this.#drag === undefined || event.pointerId !== this.#drag.pointerId) {
      return;
    }
    const x = (event.clientX - this.#drag.startClientX) / this.callbacks.getViewport().zoom;
    const y = (event.clientY - this.#drag.startClientY) / this.callbacks.getViewport().zoom;
    this.#drag.element.style.translate = `${x}px ${y}px`;
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.#pan !== undefined && event.pointerId === this.#pan.pointerId) {
      this.cancelPan();
      return;
    }
    if (this.#marquee !== undefined && event.pointerId === this.#marquee.pointerId) {
      const marquee = this.#marquee;
      const end = this.canvasPointFromPointer(event);
      this.cancelMarquee();
      const rect = normalizedRect(marquee.start, end);
      if (rect.width < 1 || rect.height < 1) {
        this.callbacks.reduceSelection({ type: 'clear-selection' });
        return;
      }
      const document = this.callbacks.getDocument();
      if (document === undefined) {
        return;
      }
      const ids = queryScreenComponentsInRect(
        document,
        rect,
        marquee.contain ? 'contain' : 'intersect',
      );
      const interaction = this.callbacks.getInteraction();
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds: marquee.union ? [...interaction.selectedComponentIds, ...ids] : ids,
        focusedComponentId: ids.at(-1) ?? (marquee.union ? interaction.focusedComponentId : null),
      });
      return;
    }
    if (this.#transform !== undefined && event.pointerId === this.#transform.pointerId) {
      const transform = this.#transform;
      const after = this.transformComponents(transform, event);
      this.cancelTransform();
      this.callbacks.reportTransaction(createTransformTransaction(transform.components, after));
      return;
    }
    if (this.#drag === undefined || event.pointerId !== this.#drag.pointerId) {
      return;
    }
    const drag = this.#drag;
    const zoom = this.callbacks.getViewport().zoom;
    const x = (event.clientX - drag.startClientX) / zoom;
    const y = (event.clientY - drag.startClientY) / zoom;
    this.cancelDrag();
    this.callbacks.reportTransaction({
      commands: [
        {
          type: 'update-components',
          componentIds: [drag.componentId],
          patch: {
            position: {
              x: clampCoordinate(drag.startX + x),
              y: clampCoordinate(drag.startY + y),
            },
          },
        },
      ],
    });
  }

  private startTransform(event: PointerEvent, handle: BaseScreenTransformHandle | undefined): void {
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    if (document === undefined || canvas === undefined) {
      return;
    }
    const components = selectedComponents(
      document,
      this.callbacks.getInteraction().selectedComponentIds,
    );
    const capability = handle === undefined ? 'rotate' : 'resize';
    if (
      components.length === 0 ||
      !components.every((component) => {
        const entry = this.callbacks.getCatalog()?.get(component.type);
        return (
          entry?.manifest.designCapabilities[capability] === true &&
          !isScreenComponentEffectivelyLocked(document, component.id)
        );
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    canvas.setPointerCapture(event.pointerId);
    this.#transform = {
      pointerId: event.pointerId,
      kind: handle === undefined ? 'rotate' : 'resize',
      handle,
      start: this.canvasPointFromPointer(event),
      components,
    };
  }

  private transformComponents(
    transform: Transform,
    event: PointerEvent,
  ): readonly ScreenComponentNode[] {
    const pointer = this.canvasPointFromPointer(event);
    return transform.kind === 'resize'
      ? resizeScreenComponents(transform.components, transform.handle!, pointer, {
          shift: event.shiftKey,
          alt: event.altKey,
        })
      : rotateScreenComponents(transform.components, transform.start, pointer, event.shiftKey);
  }

  private renderTransformPreview(event: PointerEvent): void {
    const selection = this.#canvas?.querySelector<HTMLElement>('[data-selection]');
    if (this.#transform === undefined || selection === null || selection === undefined) {
      return;
    }
    const bounds = getScreenSelectionBounds(this.transformComponents(this.#transform, event));
    if (bounds === null) {
      return;
    }
    selection.style.left = `${bounds.left}px`;
    selection.style.top = `${bounds.top}px`;
    selection.style.width = `${bounds.right - bounds.left}px`;
    selection.style.height = `${bounds.bottom - bounds.top}px`;
  }

  private cancelTransform(): void {
    if (this.#transform === undefined) {
      return;
    }
    this.releasePointerCapture(this.#transform.pointerId);
    this.#transform = undefined;
    this.callbacks.renderSelection();
  }

  private cancelDrag(): void {
    if (this.#drag === undefined) {
      return;
    }
    this.#drag.element.style.translate = '';
    this.releasePointerCapture(this.#drag.pointerId);
    this.#drag = undefined;
  }

  private cancelPan(): void {
    if (this.#pan === undefined) return;
    this.releasePointerCapture(this.#pan.pointerId);
    this.#pan = undefined;
  }

  private cancelMarquee(): void {
    if (this.#marquee !== undefined) {
      this.releasePointerCapture(this.#marquee.pointerId);
      this.#marquee = undefined;
    }
    const marquee = this.#canvas?.querySelector<HTMLElement>('[data-marquee]');
    if (marquee !== null && marquee !== undefined) {
      marquee.style.display = 'none';
    }
  }

  private canvasPointFromPointer(event: PointerEvent): Point {
    const bounds = this.#canvas!.getBoundingClientRect();
    const zoom = this.callbacks.getViewport().zoom;
    return { x: (event.clientX - bounds.left) / zoom, y: (event.clientY - bounds.top) / zoom };
  }

  private renderMarquee(start: Point, end: Point): void {
    const marquee = this.#canvas?.querySelector<HTMLElement>('[data-marquee]');
    if (marquee === null || marquee === undefined) {
      return;
    }
    const rect = normalizedRect(start, end);
    marquee.style.display = 'block';
    marquee.style.left = `${rect.x}px`;
    marquee.style.top = `${rect.y}px`;
    marquee.style.width = `${rect.width}px`;
    marquee.style.height = `${rect.height}px`;
  }

  private releasePointerCapture(pointerId: number): void {
    if (this.#canvas?.hasPointerCapture(pointerId)) {
      this.#canvas.releasePointerCapture(pointerId);
    }
  }
}

function normalizedRect(
  start: Point,
  end: Point,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function clampCoordinate(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}
