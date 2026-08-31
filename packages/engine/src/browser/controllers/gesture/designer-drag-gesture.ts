import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { getScreenSelectionBounds, isScreenComponentEffectivelyLocked } from '@base-screen/core';
import {
  clampScreenCoordinate,
  roundScreenStep,
} from '../../../common/operations/element/designer-geometry.js';
import { selectionSubtree } from '../../../common/operations/selection/designer-selection.js';
import type { DesignerSnapTranslation } from '../../viewport/designer-canvas-aids.js';
import type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';
import { DesignerGestureEnvironment } from './designer-gesture-environment.js';

const DESIGNER_DRAG_CLICK_THRESHOLD = 3;

interface DragState {
  readonly components: readonly ScreenComponentNode[];
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly bounds: {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  };
  readonly selection: HTMLElement | undefined;
  readonly elements: readonly HTMLElement[];
  readonly moved: boolean;
}

/** Pending-click and active translation state for component drags. */
export class DesignerDragGesture {
  #state: DragState | undefined;

  constructor(
    private readonly callbacks: DesignerGestureCallbacks,
    private readonly environment: DesignerGestureEnvironment,
  ) {}

  get active(): boolean {
    return this.#state !== undefined;
  }

  start(
    event: PointerEvent,
    roots: readonly ScreenComponentNode[],
    captureImmediately = false,
  ): boolean {
    const document = this.callbacks.getDocument();
    const canvas = this.environment.canvas;
    if (document === undefined || canvas === undefined) return false;
    if (captureImmediately) this.environment.capturePointer(event.pointerId);
    const components = mutableSelectionSubtree(
      document,
      roots.map((component) => component.id),
    );
    const bounds = getScreenSelectionBounds(components);
    if (bounds === null) {
      if (captureImmediately) this.environment.releasePointer(event.pointerId);
      return false;
    }
    this.#state = {
      components,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      bounds,
      selection: canvas.querySelector<HTMLElement>('[data-selection]') ?? undefined,
      elements: components.flatMap((component) => {
        const element = canvas.querySelector<HTMLElement>(
          `[data-base-screen-component-id="${component.id}"]`,
        );
        return element === null ? [] : [element];
      }),
      moved: false,
    };
    return true;
  }

  move(event: PointerEvent): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    const distance = Math.hypot(
      event.clientX - state.startClientX,
      event.clientY - state.startClientY,
    );
    if (distance < DESIGNER_DRAG_CLICK_THRESHOLD) return true;
    const activeState = state.moved ? state : { ...state, moved: true };
    if (!state.moved) {
      this.environment.capturePointer(event.pointerId);
      this.callbacks.setSnapSessionActive?.(true);
      this.#state = activeState;
    }
    const translation = this.translation(activeState, event);
    for (const element of activeState.elements) {
      element.style.translate = `${translation.x}px ${translation.y}px`;
    }
    if (activeState.selection !== undefined) {
      activeState.selection.style.translate = `${translation.x}px ${translation.y}px`;
    }
    return true;
  }

  finish(event: PointerEvent): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    if (!state.moved) {
      this.cancel();
      return true;
    }
    const translation = this.translation(state, event);
    this.cancel();
    const document = this.callbacks.getCanonicalDocument?.() ?? this.callbacks.getDocument();
    if (event.altKey && document !== undefined) {
      this.duplicate(document, state, translation);
      return true;
    }
    this.callbacks.reportTransaction({
      commands: state.components.map((component) => ({
        type: 'update-components' as const,
        componentIds: [component.id],
        patch: {
          position: {
            x: roundScreenStep(clampScreenCoordinate(component.position.x + translation.x)),
            y: roundScreenStep(clampScreenCoordinate(component.position.y + translation.y)),
          },
        },
      })),
    });
    return true;
  }

  cancel(): void {
    const state = this.#state;
    if (state === undefined) return;
    this.callbacks.setSnapSessionActive?.(false);
    for (const element of state.elements) element.style.translate = '';
    if (state.selection !== undefined) state.selection.style.translate = '';
    this.environment.releasePointer(state.pointerId);
    this.#state = undefined;
    this.environment.clearSnapPreview();
  }

  private translation(state: DragState, event: PointerEvent): DesignerSnapTranslation {
    const zoom = this.callbacks.getViewport().zoom;
    const snapped = this.environment.snapSelection(
      state.bounds,
      {
        x: clampScreenCoordinate((event.clientX - state.startClientX) / zoom),
        y: clampScreenCoordinate((event.clientY - state.startClientY) / zoom),
      },
      state.components.map((component) => component.id),
    );
    return {
      ...snapped,
      x: clampScreenCoordinate(roundScreenStep(snapped.x)),
      y: clampScreenCoordinate(roundScreenStep(snapped.y)),
    };
  }

  private duplicate(
    document: ScreenDocument,
    state: DragState,
    translation: DesignerSnapTranslation,
  ): void {
    const canonical = new Map(document.components.map((component) => [component.id, component]));
    const copiedIds = new Map(
      state.components.map((source, index) => [
        source.id,
        nextComponentId(document, `${source.type}-${index}`),
      ]),
    );
    this.callbacks.reportTransaction({
      commands: state.components.map((source, index) => ({
        type: 'add-component' as const,
        component: {
          ...(canonical.get(source.id) ?? source),
          id: copiedIds.get(source.id)!,
          name: `${source.name} copy`,
          parentId:
            source.parentId === null ? null : (copiedIds.get(source.parentId) ?? source.parentId),
          position: {
            x: roundScreenStep(clampScreenCoordinate(source.position.x + translation.x)),
            y: roundScreenStep(clampScreenCoordinate(source.position.y + translation.y)),
          },
          zIndex:
            document.components.reduce(
              (maximum, component) => Math.max(maximum, component.zIndex),
              -1,
            ) +
            index +
            1,
        },
      })),
    });
  }
}

function mutableSelectionSubtree(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] {
  return selectionSubtree(document, componentIds).filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}
