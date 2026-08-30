import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { getScreenSelectionBounds, isScreenComponentEffectivelyLocked } from '@base-screen/core';
import {
  type BaseScreenTransformHandle,
  createTransformTransaction,
  resizeScreenComponents,
  rotateScreenComponents,
} from '../../../common/operations/element/designer-transform.js';
import {
  selectedComponents,
  selectionSubtree,
} from '../../../common/operations/selection/designer-selection.js';
import type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';
import {
  DesignerGestureEnvironment,
  type DesignerGesturePoint,
} from './designer-gesture-environment.js';

interface TransformPreviewStyle {
  readonly height: string;
  readonly left: string;
  readonly top: string;
  readonly transform: string;
  readonly width: string;
}

interface TransformState {
  readonly pointerId: number;
  readonly kind: 'resize' | 'rotate';
  readonly handle: BaseScreenTransformHandle | undefined;
  readonly start: DesignerGesturePoint;
  readonly components: readonly ScreenComponentNode[];
  readonly previewStyles: ReadonlyMap<string, TransformPreviewStyle>;
  readonly elements: ReadonlyMap<string, HTMLElement>;
  readonly selection: HTMLElement | undefined;
}

/** Resize/rotate state with live DOM previews and canonical transaction commit. */
export class DesignerTransformGesture {
  #state: TransformState | undefined;

  constructor(
    private readonly callbacks: DesignerGestureCallbacks,
    private readonly environment: DesignerGestureEnvironment,
  ) {}

  get active(): boolean {
    return this.#state !== undefined;
  }

  start(event: PointerEvent, handle: BaseScreenTransformHandle | undefined): boolean {
    const document = this.callbacks.getDocument();
    const canvas = this.environment.canvas;
    if (document === undefined || canvas === undefined) return false;
    const roots = selectedComponents(
      document,
      this.callbacks.getInteraction().selectedComponentIds,
    );
    const capability = handle === undefined ? 'rotate' : 'resize';
    if (
      roots.length === 0 ||
      !roots.every((component) => {
        const entry = this.callbacks.getCatalog()?.get(component.type);
        return (
          entry?.manifest.designCapabilities[capability] === true &&
          !isScreenComponentEffectivelyLocked(document, component.id)
        );
      })
    ) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    this.environment.capturePointer(event.pointerId);
    this.callbacks.setSnapSessionActive?.(true);
    const components = mutableSelectionSubtree(
      document,
      roots.map((component) => component.id),
    );
    const elements = new Map<string, HTMLElement>();
    for (const component of components) {
      const element = canvas.querySelector<HTMLElement>(
        `[data-base-screen-component-id="${component.id}"]`,
      );
      if (element !== null) elements.set(component.id, element);
    }
    this.#state = {
      pointerId: event.pointerId,
      kind: handle === undefined ? 'rotate' : 'resize',
      handle,
      start: this.environment.canvasPoint(event),
      components,
      previewStyles: capturePreviewStyles(elements),
      elements,
      selection: canvas.querySelector<HTMLElement>('[data-selection]') ?? undefined,
    };
    return true;
  }

  move(event: PointerEvent): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    const after = this.transformComponents(state, event);
    const bounds = getScreenSelectionBounds(after);
    if (bounds === null || state.selection === undefined) return true;
    state.selection.style.left = `${bounds.left}px`;
    state.selection.style.top = `${bounds.top}px`;
    state.selection.style.width = `${bounds.right - bounds.left}px`;
    state.selection.style.height = `${bounds.bottom - bounds.top}px`;
    for (const component of after) {
      const element = state.elements.get(component.id);
      if (element === undefined) continue;
      element.style.left = `${component.position.x}px`;
      element.style.top = `${component.position.y}px`;
      element.style.width = `${component.size.width}px`;
      element.style.height = `${component.size.height}px`;
      element.style.transform = `rotate(${component.rotation}deg)`;
    }
    return true;
  }

  finish(event: PointerEvent): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    const after = this.transformComponents(state, event);
    this.cancel();
    this.callbacks.reportTransaction(createTransformTransaction(state.components, after));
    return true;
  }

  cancel(): void {
    const state = this.#state;
    if (state === undefined) return;
    this.callbacks.setSnapSessionActive?.(false);
    this.environment.releasePointer(state.pointerId);
    for (const [componentId, styles] of state.previewStyles) {
      const element = state.elements.get(componentId);
      if (element === undefined) continue;
      element.style.left = styles.left;
      element.style.top = styles.top;
      element.style.width = styles.width;
      element.style.height = styles.height;
      element.style.transform = styles.transform;
    }
    this.#state = undefined;
    this.environment.clearSnapPreview();
    this.callbacks.renderSelection();
  }

  private transformComponents(
    state: TransformState,
    event: PointerEvent,
  ): readonly ScreenComponentNode[] {
    const pointer = this.environment.snapCanvasPoint(
      event,
      state.components.map((component) => component.id),
    );
    return state.kind === 'resize'
      ? resizeScreenComponents(state.components, state.handle!, pointer, {
          shift: event.shiftKey,
          alt: event.altKey,
        })
      : rotateScreenComponents(state.components, state.start, pointer, event.shiftKey);
  }
}

function capturePreviewStyles(
  elements: ReadonlyMap<string, HTMLElement>,
): ReadonlyMap<string, TransformPreviewStyle> {
  return new Map(
    [...elements].map(([componentId, element]) => [
      componentId,
      {
        left: element.style.left,
        top: element.style.top,
        width: element.style.width,
        height: element.style.height,
        transform: element.style.transform,
      },
    ]),
  );
}

function mutableSelectionSubtree(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] {
  return selectionSubtree(document, componentIds).filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
}
