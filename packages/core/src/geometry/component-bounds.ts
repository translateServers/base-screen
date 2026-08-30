import type { ScreenComponentNode } from '@base-screen/contracts';
import { normalizeZero } from '../internal/preconditions.js';
import { computeComponentBounds } from './bounds.js';
import type { ScreenBounds } from './types.js';

export function getScreenComponentBounds(component: ScreenComponentNode): ScreenBounds {
  const bounds = computeComponentBounds(component);
  if (bounds === null) {
    throw new RangeError('Component geometry must be finite with positive dimensions.');
  }
  return bounds;
}

export function getScreenSelectionBounds(
  components: readonly ScreenComponentNode[],
): ScreenBounds | null {
  if (components.length === 0) {
    return null;
  }
  const first = getScreenComponentBounds(components[0]!);
  let left = first.left;
  let top = first.top;
  let right = first.right;
  let bottom = first.bottom;
  for (let index = 1; index < components.length; index++) {
    const bounds = getScreenComponentBounds(components[index]!);
    left = Math.min(left, bounds.left);
    top = Math.min(top, bounds.top);
    right = Math.max(right, bounds.right);
    bottom = Math.max(bottom, bounds.bottom);
  }
  return {
    left: normalizeZero(left),
    top: normalizeZero(top),
    right: normalizeZero(right),
    bottom: normalizeZero(bottom),
  };
}
