import type { ScreenComponentNode } from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import { isDesignerAutoWidthText } from './designer-auto-width.js';
import { clampScreenCoordinate, clampScreenSize, roundScreenStep } from './designer-geometry.js';

export type BaseScreenTransformHandle =
  | 'north-west'
  | 'north'
  | 'north-east'
  | 'east'
  | 'south-east'
  | 'south'
  | 'south-west'
  | 'west';

export interface BaseScreenTransformModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
}

export function resizeScreenComponents(
  components: readonly ScreenComponentNode[],
  handle: BaseScreenTransformHandle,
  pointer: { readonly x: number; readonly y: number },
  modifiers: BaseScreenTransformModifiers,
): readonly ScreenComponentNode[] {
  const bounds = getScreenSelectionBounds(components);
  if (bounds === null) {
    return components;
  }
  const next = resizeBounds(bounds, handle, pointer, modifiers);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const scaleX = next.width / width;
  const scaleY = next.height / height;
  return components.map((component) => ({
    ...component,
    position: {
      x: roundScreenStep(
        clampScreenCoordinate(next.left + (component.position.x - bounds.left) * scaleX),
      ),
      y: roundScreenStep(
        clampScreenCoordinate(next.top + (component.position.y - bounds.top) * scaleY),
      ),
    },
    size: {
      width:
        isDesignerAutoWidthText(component) && scaleX === 1
          ? component.size.width
          : roundScreenStep(clampScreenSize(component.size.width * scaleX)),
      height: roundScreenStep(clampScreenSize(component.size.height * scaleY)),
    },
  }));
}

export function rotateScreenComponents(
  components: readonly ScreenComponentNode[],
  start: { readonly x: number; readonly y: number },
  pointer: { readonly x: number; readonly y: number },
  snapToFifteenDegrees: boolean,
): readonly ScreenComponentNode[] {
  const bounds = getScreenSelectionBounds(components);
  if (bounds === null) {
    return components;
  }
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const initial = angleFrom(center, start);
  const current = angleFrom(center, pointer);
  let delta = normalizeRotation(current - initial);
  if (snapToFifteenDegrees) {
    delta = Math.round(delta / 15) * 15;
  }
  const radians = (delta * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return components.map((component) => {
    const componentCenter = {
      x: component.position.x + component.size.width / 2,
      y: component.position.y + component.size.height / 2,
    };
    const x = componentCenter.x - center.x;
    const y = componentCenter.y - center.y;
    const nextCenter = { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
    return {
      ...component,
      position: {
        x: roundScreenStep(clampScreenCoordinate(nextCenter.x - component.size.width / 2)),
        y: roundScreenStep(clampScreenCoordinate(nextCenter.y - component.size.height / 2)),
      },
      rotation: normalizeRotation(component.rotation + delta),
    };
  });
}

export function createTransformTransaction(
  before: readonly ScreenComponentNode[],
  after: readonly ScreenComponentNode[],
): ScreenDocumentTransaction {
  const beforeById = new Map(before.map((component) => [component.id, component]));
  const commands: ScreenDocumentCommand[] = [];
  for (const component of after) {
    const original = beforeById.get(component.id);
    if (original === undefined) {
      continue;
    }
    const patch = {
      ...(samePosition(original.position, component.position)
        ? {}
        : { position: component.position }),
      ...(sameSize(original.size, component.size) ? {} : { size: component.size }),
      ...(original.rotation === component.rotation ? {} : { rotation: component.rotation }),
    };
    if (Object.keys(patch).length > 0) {
      commands.push({ type: 'update-components', componentIds: [component.id], patch });
    }
  }
  return { commands };
}

function resizeBounds(
  bounds: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  },
  handle: BaseScreenTransformHandle,
  pointer: { readonly x: number; readonly y: number },
  modifiers: BaseScreenTransformModifiers,
): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  const horizontal = handle.includes('west') ? 'west' : handle.includes('east') ? 'east' : null;
  const vertical = handle.includes('north') ? 'north' : handle.includes('south') ? 'south' : null;
  let left = bounds.left;
  let top = bounds.top;
  let right = bounds.right;
  let bottom = bounds.bottom;
  if (horizontal === 'west') left = pointer.x;
  if (horizontal === 'east') right = pointer.x;
  if (vertical === 'north') top = pointer.y;
  if (vertical === 'south') bottom = pointer.y;
  if (modifiers.alt) {
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    if (horizontal === 'west') right = centerX + (centerX - left);
    if (horizontal === 'east') left = centerX - (right - centerX);
    if (vertical === 'north') bottom = centerY + (centerY - top);
    if (vertical === 'south') top = centerY - (bottom - centerY);
  }
  const originalWidth = bounds.right - bounds.left;
  const originalHeight = bounds.bottom - bounds.top;
  let width = Math.max(1, Math.abs(right - left));
  let height = Math.max(1, Math.abs(bottom - top));
  if (modifiers.shift) {
    const scale =
      horizontal === null
        ? height / originalHeight
        : vertical === null
          ? width / originalWidth
          : Math.max(width / originalWidth, height / originalHeight);
    width = Math.max(1, originalWidth * scale);
    height = Math.max(1, originalHeight * scale);
    if (horizontal === 'west') left = right - width;
    else if (horizontal === 'east') right = left + width;
    else {
      left = (bounds.left + bounds.right - width) / 2;
      right = left + width;
    }
    if (vertical === 'north') top = bottom - height;
    else if (vertical === 'south') bottom = top + height;
    else {
      top = (bounds.top + bounds.bottom - height) / 2;
      bottom = top + height;
    }
  }
  return { left: Math.min(left, right), top: Math.min(top, bottom), width, height };
}

function angleFrom(
  center: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function normalizeRotation(rotation: number): number {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function samePosition(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameSize(
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number },
): boolean {
  return left.width === right.width && left.height === right.height;
}
