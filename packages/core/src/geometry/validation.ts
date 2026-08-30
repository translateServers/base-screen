import { assertFinite } from '../internal/preconditions.js';
import type { ScreenViewportState } from '../state/viewport.js';
import type { ScreenPoint, ScreenRect } from './types.js';

export function assertPoint(point: ScreenPoint, name: string): void {
  if (point === null || typeof point !== 'object') {
    throw new RangeError(`${name} must be a finite point.`);
  }
  assertFinite(point.x, `${name}.x`);
  assertFinite(point.y, `${name}.y`);
}

export function assertRect(rect: ScreenRect): void {
  if (rect === null || typeof rect !== 'object') {
    throw new RangeError('Rectangle must be an object.');
  }
  assertFinite(rect.x, 'rect.x');
  assertFinite(rect.y, 'rect.y');
  assertFinite(rect.width, 'rect.width');
  assertFinite(rect.height, 'rect.height');
  if (rect.width <= 0 || rect.height <= 0) {
    throw new RangeError('Rectangle dimensions must be positive.');
  }
}

export function assertViewport(viewport: ScreenViewportState): void {
  if (viewport === null || typeof viewport !== 'object' || viewport.offset === null) {
    throw new RangeError('Viewport must contain a zoom and finite offset.');
  }
  if (viewport.zoom < 0.05 || viewport.zoom > 64) {
    throw new RangeError('Viewport zoom must be from 0.05 through 64.');
  }
  assertFinite(viewport.zoom, 'viewport.zoom');
  assertPoint(viewport.offset, 'viewport.offset');
}
