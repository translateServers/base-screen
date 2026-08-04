import type { ScreenComponentNode } from '@base-screen/contracts';
import { normalizeZero } from '../internal/preconditions.js';
import type { ScreenBounds } from './types.js';

/**
 * Compute the axis-aligned bounds of a component after rotation around its
 * center. Component position is the top-left corner in canvas coordinates.
 * Rotation is in degrees, applied clockwise around the component center.
 *
 * Returns `null` when the result would not be finite or would have
 * non-positive width/height. Public geometry APIs throw `RangeError` for
 * such inputs; validation surfaces them as `CORE_GEOMETRY_INVALID` diagnostics.
 */
export function computeComponentBounds(component: ScreenComponentNode): ScreenBounds | null {
  const {
    position: { x, y },
    size: { width, height },
    rotation,
  } = component;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(rotation) ||
    x < -1_000_000 ||
    x > 1_000_000 ||
    y < -1_000_000 ||
    y > 1_000_000 ||
    width <= 0 ||
    height <= 0 ||
    width > 1_000_000 ||
    height > 1_000_000 ||
    rotation < -180 ||
    rotation >= 180
  ) {
    return null;
  }

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const theta = (rotation * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  const corners: readonly Readonly<{ readonly x: number; readonly y: number }>[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const corner of corners) {
    const dx = corner.x;
    const dy = corner.y;
    const rotatedX = dx * cosTheta - dy * sinTheta;
    const rotatedY = dx * sinTheta + dy * cosTheta;
    const absoluteX = centerX + rotatedX;
    const absoluteY = centerY + rotatedY;
    if (!Number.isFinite(absoluteX) || !Number.isFinite(absoluteY)) {
      return null;
    }
    if (absoluteX < minX) {
      minX = absoluteX;
    }
    if (absoluteX > maxX) {
      maxX = absoluteX;
    }
    if (absoluteY < minY) {
      minY = absoluteY;
    }
    if (absoluteY > maxY) {
      maxY = absoluteY;
    }
  }

  const boundsWidth = maxX - minX;
  const boundsHeight = maxY - minY;
  if (
    !Number.isFinite(boundsWidth) ||
    !Number.isFinite(boundsHeight) ||
    boundsWidth <= 0 ||
    boundsHeight <= 0
  ) {
    return null;
  }

  return {
    left: normalizeZero(minX),
    top: normalizeZero(minY),
    right: normalizeZero(maxX),
    bottom: normalizeZero(maxY),
  };
}
