import { assertFinite, normalizePoint } from '../internal/preconditions.js';
import type { ScreenViewportState } from '../state/viewport.js';
import type { ScreenPoint } from './types.js';
import { assertPoint, assertViewport } from './validation.js';

export function canvasPointToViewport(
  point: ScreenPoint,
  viewport: ScreenViewportState,
): ScreenPoint {
  assertPoint(point, 'point');
  assertViewport(viewport);
  return normalizeFinitePoint({
    x: point.x * viewport.zoom + viewport.offset.x,
    y: point.y * viewport.zoom + viewport.offset.y,
  });
}

export function viewportPointToCanvas(
  point: ScreenPoint,
  viewport: ScreenViewportState,
): ScreenPoint {
  assertPoint(point, 'point');
  assertViewport(viewport);
  return normalizeFinitePoint({
    x: (point.x - viewport.offset.x) / viewport.zoom,
    y: (point.y - viewport.offset.y) / viewport.zoom,
  });
}

function normalizeFinitePoint(point: ScreenPoint): ScreenPoint {
  assertFinite(point.x, 'calculated point x');
  assertFinite(point.y, 'calculated point y');
  return normalizePoint(point);
}
