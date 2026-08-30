import { isScreenComponentEffectivelyLocked, queryScreenComponentsInRect } from '@base-screen/core';
import {
  selectedRootIds,
  selectionTargetsInContext,
} from '../../../common/operations/selection/designer-selection.js';
import type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';
import {
  DesignerGestureEnvironment,
  type DesignerGesturePoint,
} from './designer-gesture-environment.js';

const DESIGNER_DRAG_CLICK_THRESHOLD = 3;

interface MarqueeState {
  readonly pointerId: number;
  readonly start: DesignerGesturePoint;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly union: boolean;
  readonly contain: boolean;
  readonly clearSelectionOnClick: boolean;
  readonly moved: boolean;
}

/** Marquee selection state, rendering, and context-aware selection commit. */
export class DesignerMarqueeGesture {
  #state: MarqueeState | undefined;
  #element: HTMLElement | undefined;

  constructor(
    private readonly callbacks: DesignerGestureCallbacks,
    private readonly environment: DesignerGestureEnvironment,
  ) {}

  get active(): boolean {
    return this.#state !== undefined;
  }

  start(event: PointerEvent, clearSelectionOnClick: boolean): void {
    event.preventDefault();
    this.environment.capturePointer(event.pointerId);
    this.#state = {
      pointerId: event.pointerId,
      start: this.environment.canvasPoint(event),
      startClientX: event.clientX,
      startClientY: event.clientY,
      union: event.ctrlKey || event.metaKey,
      contain: event.altKey,
      clearSelectionOnClick,
      moved: false,
    };
  }

  move(event: PointerEvent): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    const distance = Math.hypot(
      event.clientX - state.startClientX,
      event.clientY - state.startClientY,
    );
    if (distance < DESIGNER_DRAG_CLICK_THRESHOLD) return true;
    if (!state.moved) this.#state = { ...state, moved: true };
    this.render(state.start, this.environment.canvasPoint(event));
    return true;
  }

  finish(event: PointerEvent, editingParentId: string | null): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    const end = this.environment.canvasPoint(event);
    this.cancel();
    const rect = normalizedRect(state.start, end);
    if (rect.width < 1 || rect.height < 1) {
      if (state.clearSelectionOnClick) {
        this.callbacks.reduceSelection({ type: 'clear-selection' });
      }
      return true;
    }
    const document = this.callbacks.getDocument();
    if (document === undefined) return true;
    const ids = queryScreenComponentsInRect(
      document,
      rect,
      state.contain ? 'contain' : 'intersect',
    );
    const interaction = this.callbacks.getInteraction();
    const selectableIds = selectionTargetsInContext(document, ids, editingParentId).filter(
      (componentId) => !isScreenComponentEffectivelyLocked(document, componentId),
    );
    const componentIds = selectedRootIds(
      document,
      state.union ? [...interaction.selectedComponentIds, ...selectableIds] : selectableIds,
    );
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds,
      focusedComponentId:
        componentIds.at(-1) ?? (state.union ? interaction.focusedComponentId : null),
    });
    return true;
  }

  cancel(): void {
    if (this.#state !== undefined) {
      this.environment.releasePointer(this.#state.pointerId);
      this.#state = undefined;
    }
    const element = this.marqueeElement();
    if (element !== undefined) element.style.display = 'none';
    this.environment.clearSnapPreview();
  }

  disconnect(): void {
    this.#element = undefined;
  }

  private render(start: DesignerGesturePoint, end: DesignerGesturePoint): void {
    const element = this.marqueeElement();
    if (element === undefined) return;
    const rect = normalizedRect(start, end);
    element.style.display = 'block';
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  }

  private marqueeElement(): HTMLElement | undefined {
    if (this.#element?.isConnected) return this.#element;
    this.#element =
      this.environment.canvas?.querySelector<HTMLElement>('[data-marquee]') ?? undefined;
    return this.#element;
  }
}

function normalizedRect(start: DesignerGesturePoint, end: DesignerGesturePoint) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
