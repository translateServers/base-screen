import type { ScreenPoint, ScreenVector } from '../geometry/types.js';
import { normalizeZero } from '../internal/preconditions.js';

export interface ScreenViewportState {
  readonly zoom: number;
  readonly offset: ScreenPoint;
}

export type ScreenViewportAction =
  | { readonly type: 'set-zoom'; readonly zoom: number; readonly anchor: ScreenPoint }
  | { readonly type: 'pan-by'; readonly delta: ScreenVector }
  | { readonly type: 'set-offset'; readonly offset: ScreenPoint }
  | { readonly type: 'reset' };

const INITIAL_VIEWPORT: ScreenViewportState = { zoom: 1, offset: { x: 0, y: 0 } };

export function reduceScreenViewport(
  state: ScreenViewportState,
  action: ScreenViewportAction,
): ScreenViewportState {
  if (!isViewportState(state) || action === null || typeof action !== 'object') {
    return state;
  }
  switch (action.type) {
    case 'reset':
      return state.zoom === 1 && state.offset.x === 0 && state.offset.y === 0
        ? state
        : INITIAL_VIEWPORT;
    case 'pan-by':
      if (!isPoint(action.delta)) {
        return state;
      }
      return withViewport(state, state.zoom, {
        x: state.offset.x + action.delta.x,
        y: state.offset.y + action.delta.y,
      });
    case 'set-offset':
      return isPoint(action.offset) ? withViewport(state, state.zoom, action.offset) : state;
    case 'set-zoom':
      if (!isZoom(action.zoom) || !isPoint(action.anchor)) {
        return state;
      }
      const canvasX = (action.anchor.x - state.offset.x) / state.zoom;
      const canvasY = (action.anchor.y - state.offset.y) / state.zoom;
      return withViewport(state, action.zoom, {
        x: action.anchor.x - canvasX * action.zoom,
        y: action.anchor.y - canvasY * action.zoom,
      });
    default:
      return state;
  }
}

function withViewport(
  state: ScreenViewportState,
  zoom: number,
  offset: ScreenPoint,
): ScreenViewportState {
  const next = { x: normalizeZero(offset.x), y: normalizeZero(offset.y) };
  if (state.zoom === zoom && state.offset.x === next.x && state.offset.y === next.y) {
    return state;
  }
  return { zoom: normalizeZero(zoom), offset: next };
}

function isViewportState(value: ScreenViewportState): boolean {
  return isZoom(value.zoom) && isPoint(value.offset);
}

function isZoom(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.05 && value <= 64;
}

function isPoint(value: unknown): value is ScreenPoint {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as ScreenPoint).x === 'number' &&
    typeof (value as ScreenPoint).y === 'number' &&
    Number.isFinite((value as ScreenPoint).x) &&
    Number.isFinite((value as ScreenPoint).y)
  );
}
