import type { ScreenPoint } from '../geometry/types.js';

export function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

export function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function normalizePoint(point: ScreenPoint): ScreenPoint {
  return {
    x: normalizeZero(point.x),
    y: normalizeZero(point.y),
  };
}
