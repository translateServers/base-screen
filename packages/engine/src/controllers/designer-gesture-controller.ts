import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  queryScreenComponentsInRect,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenViewportState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { selectedComponents } from '../operations/designer-selection.js';
import {
  type BaseScreenTransformHandle,
  createTransformTransaction,
  resizeScreenComponents,
  rotateScreenComponents,
} from '../operations/designer-transform.js';
import type { DesignerToolId, DesignerToolMaterialTypes } from '../tools/designer-tools.js';

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

interface Create {
  readonly pointerId: number;
  readonly start: Point;
  readonly tool: DesignerToolId;
  readonly materialType: string;
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
  readonly zoomBy: (factor: number) => void;
  readonly isHandActive: () => boolean;
  readonly getActiveTool: () => DesignerToolId;
  readonly getToolMaterialTypes: () => DesignerToolMaterialTypes | undefined;
  readonly snapCanvasPoint: (point: { readonly x: number; readonly y: number }) => {
    readonly x: number;
    readonly y: number;
  };
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
  #create: Create | undefined;

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
    this.cancelCreate();
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
    if (this.callbacks.getActiveTool() === 'zoom') {
      this.callbacks.zoomBy(event.shiftKey ? 1 / 1.2 : 1.2);
      return;
    }
    const create = this.getCreateTool();
    if (create !== undefined && target.closest('[data-base-screen-component-id]') === null) {
      canvas.setPointerCapture(event.pointerId);
      this.#create = {
        pointerId: event.pointerId,
        start: this.snapCanvasPoint(event),
        ...create,
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
        start: this.snapCanvasPoint(event),
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
    if (isScreenComponentEffectivelyHidden(document, componentId)) {
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
    if (this.#create !== undefined && event.pointerId === this.#create.pointerId) {
      this.renderCreatePreview(this.#create, this.snapCanvasPoint(event));
      return;
    }
    if (this.#marquee !== undefined && event.pointerId === this.#marquee.pointerId) {
      this.renderMarquee(this.#marquee.start, this.snapCanvasPoint(event));
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
    if (this.#create !== undefined && event.pointerId === this.#create.pointerId) {
      this.commitCreate(event);
      return;
    }
    if (this.#marquee !== undefined && event.pointerId === this.#marquee.pointerId) {
      const marquee = this.#marquee;
      const end = this.snapCanvasPoint(event);
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
    const position = this.callbacks.snapCanvasPoint({
      x: clampCoordinate(drag.startX + x),
      y: clampCoordinate(drag.startY + y),
    });
    this.cancelDrag();
    const document = this.callbacks.getDocument();
    const source = document?.components.find((component) => component.id === drag.componentId);
    if (event.altKey && document !== undefined && source !== undefined) {
      this.callbacks.reportTransaction({
        commands: [
          {
            type: 'add-component',
            component: {
              ...source,
              id: nextComponentId(document, source.type),
              name: `${source.name} copy`,
              position,
              zIndex:
                document.components.reduce(
                  (maximum, component) => Math.max(maximum, component.zIndex),
                  -1,
                ) + 1,
            },
          },
        ],
      });
      return;
    }
    this.callbacks.reportTransaction({
      commands: [
        {
          type: 'update-components',
          componentIds: [drag.componentId],
          patch: {
            position,
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
    const pointer = this.snapCanvasPoint(event);
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

  private cancelCreate(): void {
    if (this.#create !== undefined) {
      this.releasePointerCapture(this.#create.pointerId);
      this.#create = undefined;
    }
    this.#canvas?.querySelector<HTMLElement>('[data-create-preview]')?.remove();
  }

  private canvasPointFromPointer(event: PointerEvent): Point {
    const bounds = this.#canvas!.getBoundingClientRect();
    const zoom = this.callbacks.getViewport().zoom;
    return { x: (event.clientX - bounds.left) / zoom, y: (event.clientY - bounds.top) / zoom };
  }

  private snapCanvasPoint(event: PointerEvent): Point {
    return this.callbacks.snapCanvasPoint(this.canvasPointFromPointer(event));
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

  private renderCreatePreview(create: Create, end: Point): void {
    const canvas = this.#canvas;
    if (canvas === undefined) return;
    const preview =
      canvas.querySelector<HTMLElement>('[data-create-preview]') ??
      canvas.ownerDocument.createElement('div');
    preview.className = 'create-preview';
    preview.dataset.createPreview = 'true';
    const rect = normalizedRect(create.start, end);
    preview.style.left = `${rect.x}px`;
    preview.style.top = `${rect.y}px`;
    preview.style.width = `${Math.max(1, rect.width)}px`;
    preview.style.height = `${Math.max(1, rect.height)}px`;
    if (!preview.isConnected) canvas.appendChild(preview);
  }

  private releasePointerCapture(pointerId: number): void {
    if (this.#canvas?.hasPointerCapture(pointerId)) {
      this.#canvas.releasePointerCapture(pointerId);
    }
  }

  private getCreateTool():
    | { readonly tool: DesignerToolId; readonly materialType: string }
    | undefined {
    const tool = this.callbacks.getActiveTool();
    if (!['text', 'rectangle', 'ellipse', 'image'].includes(tool)) return undefined;
    const materialType = this.callbacks.getToolMaterialTypes()?.[tool];
    if (
      materialType === undefined ||
      this.callbacks.getCatalog()?.get(materialType) === undefined
    ) {
      return undefined;
    }
    return { tool, materialType };
  }

  private commitCreate(event: PointerEvent): void {
    const create = this.#create;
    const document = this.callbacks.getDocument();
    this.cancelCreate();
    if (create === undefined || document === undefined) return;
    const entry = this.callbacks.getCatalog()?.get(create.materialType);
    if (entry === undefined) return;
    const end = this.snapCanvasPoint(event);
    const width = Math.abs(end.x - create.start.x);
    const height = Math.abs(end.y - create.start.y);
    if (create.tool !== 'text' && (width > 0 || height > 0) && Math.max(width, height) < 4) return;
    const dragged = create.tool !== 'text' && (width >= 4 || height >= 4);
    this.callbacks.reportTransaction({
      commands: [
        {
          type: 'add-component',
          component: {
            id: nextComponentId(document, entry.manifest.type),
            type: entry.manifest.type,
            name: entry.manifest.name,
            parentId: null,
            position: dragged
              ? { x: Math.min(create.start.x, end.x), y: Math.min(create.start.y, end.y) }
              : create.start,
            size: dragged ? { width, height } : entry.manifest.defaultSize,
            rotation: 0,
            zIndex:
              document.components.reduce(
                (maximum, component) => Math.max(maximum, component.zIndex),
                -1,
              ) + 1,
            status: { locked: false, hidden: false },
            props: entry.manifest.defaultProps,
            style: entry.manifest.defaultStyle,
            dataSource: null,
          },
        },
      ],
    });
  }
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
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
