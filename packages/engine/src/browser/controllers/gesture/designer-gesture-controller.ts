import {
  hitTestScreenComponents,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from '@base-screen/core';
import type { BaseScreenTransformHandle } from '../../../common/operations/element/designer-transform.js';
import { selectedComponents } from '../../../common/operations/selection/designer-selection.js';
import { DesignerCreateGesture } from './designer-create-gesture.js';
import { DesignerDragGesture } from './designer-drag-gesture.js';
import type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';
import { DesignerGestureEnvironment } from './designer-gesture-environment.js';
import { DesignerGroupEditingController } from './designer-group-editing-controller.js';
import { DesignerMarqueeGesture } from './designer-marquee-gesture.js';
import { DesignerTransformGesture } from './designer-transform-gesture.js';

export type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';

interface PanState {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
}

/** Routes DOM events into focused drag, transform, marquee, create, and group-editing states. */
export class DesignerGestureController {
  #canvas: HTMLDivElement | undefined;
  #viewport: HTMLDivElement | undefined;
  #canvasListeners: readonly { readonly type: string; readonly listener: EventListener }[] = [];
  #viewportListeners: readonly { readonly type: string; readonly listener: EventListener }[] = [];
  #pan: PanState | undefined;
  readonly #environment: DesignerGestureEnvironment;
  readonly #drag: DesignerDragGesture;
  readonly #transform: DesignerTransformGesture;
  readonly #marquee: DesignerMarqueeGesture;
  readonly #create: DesignerCreateGesture;
  readonly #groupEditing: DesignerGroupEditingController;

  constructor(private readonly callbacks: DesignerGestureCallbacks) {
    this.#environment = new DesignerGestureEnvironment(callbacks);
    this.#drag = new DesignerDragGesture(callbacks, this.#environment);
    this.#transform = new DesignerTransformGesture(callbacks, this.#environment);
    this.#marquee = new DesignerMarqueeGesture(callbacks, this.#environment);
    this.#create = new DesignerCreateGesture(callbacks, this.#environment);
    this.#groupEditing = new DesignerGroupEditingController(callbacks);
  }

  get groupEditingParentId(): string | null {
    return this.#groupEditing.parentId;
  }

  get active(): boolean {
    return (
      this.#drag.active ||
      this.#transform.active ||
      this.#marquee.active ||
      this.#pan !== undefined ||
      this.#create.active
    );
  }

  connect(canvas: HTMLDivElement): void {
    if (this.#canvas === canvas) return;
    this.removeListeners(this.#canvas, this.#canvasListeners);
    this.#canvas = canvas;
    this.#environment.setCanvas(canvas);
    this.#canvasListeners = [
      { type: 'pointerdown', listener: (event) => this.onPointerDown(event as PointerEvent) },
      { type: 'pointermove', listener: (event) => this.onPointerMove(event as PointerEvent) },
      { type: 'pointerup', listener: (event) => this.onPointerUp(event as PointerEvent) },
      { type: 'pointercancel', listener: () => this.cancel() },
      { type: 'lostpointercapture', listener: () => this.cancel() },
      {
        type: 'dblclick',
        listener: (event) => this.#groupEditing.onDoubleClick(event as MouseEvent),
      },
      { type: 'selectstart', listener: (event) => event.preventDefault() },
      { type: 'dragover', listener: (event) => this.#create.onDragOver(event as DragEvent) },
      { type: 'drop', listener: (event) => this.#create.onDrop(event as DragEvent) },
    ];
    for (const { type, listener } of this.#canvasListeners) canvas.addEventListener(type, listener);
  }

  connectViewport(viewport: HTMLDivElement): void {
    if (this.#viewport === viewport) return;
    this.removeListeners(this.#viewport, this.#viewportListeners);
    this.#viewport = viewport;
    this.#viewportListeners = [
      {
        type: 'pointerdown',
        listener: (event) => this.onViewportBackgroundPointerDown(event as PointerEvent),
      },
      {
        type: 'pointermove',
        listener: (event) => {
          if (!this.isCanvasEvent(event)) this.onPointerMove(event as PointerEvent);
        },
      },
      {
        type: 'pointerup',
        listener: (event) => {
          if (!this.isCanvasEvent(event)) this.onPointerUp(event as PointerEvent);
        },
      },
      {
        type: 'pointercancel',
        listener: (event) => {
          if (!this.isCanvasEvent(event)) this.cancel();
        },
      },
    ];
    for (const { type, listener } of this.#viewportListeners) {
      viewport.addEventListener(type, listener);
    }
  }

  disconnect(): void {
    this.cancel();
    this.removeListeners(this.#canvas, this.#canvasListeners);
    this.removeListeners(this.#viewport, this.#viewportListeners);
    this.#canvasListeners = [];
    this.#viewportListeners = [];
    this.#canvas = undefined;
    this.#viewport = undefined;
    this.#marquee.disconnect();
    this.#environment.setCanvas(undefined);
  }

  cancel(): void {
    this.#drag.cancel();
    this.#transform.cancel();
    this.#marquee.cancel();
    this.cancelPan();
    this.#create.cancel();
    this.#environment.clearSnapPreview();
  }

  exitGroupEditingContext(): boolean {
    return this.#groupEditing.exit();
  }

  canEnterGroupEditingContext(): boolean {
    return this.#groupEditing.canEnter();
  }

  canExitGroupEditingContext(): boolean {
    return this.#groupEditing.canExit();
  }

  enterGroupEditingContext(): boolean {
    return this.#groupEditing.enter();
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    if (!(target instanceof Element) || document === undefined || canvas === undefined) return;
    if (!isPrimaryPointer(event)) return;
    event.preventDefault();
    this.callbacks.focusViewport?.();
    if (this.callbacks.isHandActive()) {
      event.preventDefault();
      this.#environment.capturePointer(event.pointerId);
      this.#pan = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      this.callbacks.setPanning?.(true);
      return;
    }
    if (this.callbacks.getActiveTool() === 'zoom') {
      this.callbacks.zoomBy(event.shiftKey ? 1 / 1.2 : 1.2);
      return;
    }
    const create = this.#create.getTool();
    if (create !== undefined && target.closest('[data-base-screen-component-id]') === null) {
      this.#create.start(event, create);
      return;
    }
    const transformHandle = target.closest<HTMLElement>('[data-transform-handle]');
    if (transformHandle !== null) {
      this.#transform.start(
        event,
        transformHandle.dataset.transformHandle as BaseScreenTransformHandle,
      );
      return;
    }
    if (target.closest<HTMLElement>('[data-transform-rotate]') !== null) {
      this.#transform.start(event, undefined);
      return;
    }
    if (target.closest<HTMLElement>('[data-selection-grab]') !== null) {
      this.onSelectionPointerDown(event);
      return;
    }
    const material = target.closest<HTMLElement>('[data-base-screen-component-id]');
    const hitId = material?.dataset.baseScreenComponentId;
    if (hitId === undefined || material === null) {
      this.#groupEditing.clear();
      this.#marquee.start(event, true);
      return;
    }
    const selectableId = this.#groupEditing.selectableComponentId(document, hitId);
    const component =
      selectableId === null
        ? undefined
        : document.components.find((item) => item.id === selectableId);
    if (component === undefined || isScreenComponentEffectivelyHidden(document, component.id)) {
      return;
    }
    if (isScreenComponentEffectivelyLocked(document, component.id)) {
      if (this.callbacks.getActiveTool() === 'select') this.#marquee.start(event, false);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId: component.id });
      return;
    }
    const interaction = this.callbacks.getInteraction();
    const selected = selectedComponents(document, interaction.selectedComponentIds);
    const components = interaction.selectedComponentIds.includes(component.id)
      ? selected
      : [component];
    if (
      components.length === 0 ||
      new Set(components.map((item) => item.parentId)).size !== 1 ||
      components.some((item) => isScreenComponentEffectivelyLocked(document, item.id))
    ) {
      return;
    }
    if (!interaction.selectedComponentIds.includes(component.id)) {
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds: [component.id],
        focusedComponentId: component.id,
      });
    }
    event.preventDefault();
    this.#drag.start(event, components);
  }

  private onSelectionPointerDown(event: PointerEvent): void {
    const document = this.callbacks.getDocument();
    if (document === undefined || this.#canvas === undefined) return;
    if (event.ctrlKey || event.metaKey) {
      const hitId = hitTestScreenComponents(document, this.#environment.canvasPoint(event))[0];
      const selectableId =
        hitId === undefined ? null : this.#groupEditing.selectableComponentId(document, hitId);
      if (selectableId !== null) {
        this.callbacks.reduceSelection({ type: 'toggle-selection', componentId: selectableId });
      }
      return;
    }
    const components = selectedComponents(
      document,
      this.callbacks.getInteraction().selectedComponentIds,
    );
    if (
      components.length === 0 ||
      new Set(components.map((item) => item.parentId)).size !== 1 ||
      components.some((item) => isScreenComponentEffectivelyLocked(document, item.id))
    ) {
      return;
    }
    event.preventDefault();
    this.#drag.start(event, components, true);
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
    if (this.#create.move(event)) return;
    if (this.#marquee.move(event)) return;
    if (this.#transform.move(event)) return;
    this.#drag.move(event);
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.#pan !== undefined && event.pointerId === this.#pan.pointerId) {
      this.cancelPan();
      return;
    }
    if (this.#create.finish(event)) return;
    if (
      this.#marquee.finish(event, this.#groupEditing.validParentId(this.callbacks.getDocument()))
    ) {
      return;
    }
    if (this.#transform.finish(event)) return;
    this.#drag.finish(event);
  }

  private cancelPan(): void {
    if (this.#pan === undefined) return;
    this.#environment.releasePointer(this.#pan.pointerId);
    this.#pan = undefined;
    this.callbacks.setPanning?.(false);
    this.#environment.clearSnapPreview();
  }

  private onViewportBackgroundPointerDown(event: PointerEvent): void {
    const target = event.target;
    const canvas = this.#canvas;
    if (
      !isPrimaryPointer(event) ||
      !(target instanceof Element) ||
      canvas === undefined ||
      canvas.contains(target) ||
      this.callbacks.getInteraction().selectedComponentIds.length === 0
    ) {
      return;
    }
    this.#groupEditing.clear();
    this.callbacks.reduceSelection({ type: 'clear-selection' });
  }

  private isCanvasEvent(event: Event): boolean {
    return (
      this.#canvas !== undefined &&
      event.target !== null &&
      this.#canvas.contains(event.target as Node)
    );
  }

  private removeListeners(
    target: HTMLDivElement | undefined,
    listeners: readonly { readonly type: string; readonly listener: EventListener }[],
  ): void {
    if (target === undefined) return;
    for (const { type, listener } of listeners) target.removeEventListener(type, listener);
  }
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}
