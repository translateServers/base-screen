import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  buildComponentIndex,
  isEffectiveHidden,
  isEffectiveLocked,
} from '../hierarchy/hierarchy.js';
import { normalizeZero } from '../internal/preconditions.js';
import { getScreenComponentBounds } from './component-bounds.js';
import type { ScreenAxis, ScreenBounds, ScreenVector } from './types.js';

export interface ScreenAlignmentDelta {
  readonly componentId: string;
  readonly delta: ScreenVector;
}

export function calculateScreenAlignment(
  components: readonly ScreenComponentNode[],
  axis: ScreenAxis,
  mode: 'start' | 'center' | 'end',
): readonly ScreenAlignmentDelta[] {
  if (axis !== 'x' && axis !== 'y') {
    throw new RangeError('Alignment axis must be x or y.');
  }
  if (mode !== 'start' && mode !== 'center' && mode !== 'end') {
    throw new RangeError('Alignment mode must be start, center, or end.');
  }
  const visible = getVisibleComponents(components);
  if (visible.length < 2) {
    return [];
  }
  const fixed = visible.filter(({ locked }) => locked);
  const candidates = fixed.length > 0 ? fixed : visible;
  const starts = candidates.map(({ bounds }) => axisStart(bounds, axis));
  const ends = candidates.map(({ bounds }) => axisEnd(bounds, axis));
  // start 对齐到最左/最上，end 对齐到最右/最下；center 对齐到选区并集的中心。
  const reference =
    mode === 'start'
      ? Math.min(...starts)
      : mode === 'end'
        ? Math.max(...ends)
        : (Math.min(...starts) + Math.max(...ends)) / 2;
  return visible
    .filter(({ locked }) => !locked)
    .map(({ component, bounds }) => ({
      componentId: component.id,
      delta: deltaForAxis(axis, reference - axisValue(bounds, axis, mode)),
    }))
    .filter(({ delta }) => delta.x !== 0 || delta.y !== 0)
    .sort(compareDelta);
}

export function calculateScreenDistribution(
  components: readonly ScreenComponentNode[],
  axis: ScreenAxis,
): readonly ScreenAlignmentDelta[] {
  if (axis !== 'x' && axis !== 'y') {
    throw new RangeError('Distribution axis must be x or y.');
  }
  const items = [...getVisibleComponents(components)].sort((left, right) => {
    const byStart = axisStart(left.bounds, axis) - axisStart(right.bounds, axis);
    return byStart !== 0 ? byStart : compareStrings(left.component.id, right.component.id);
  });
  if (items.length < 2) {
    return [];
  }

  const fixedIndices = new Set<number>([0, items.length - 1]);
  for (let index = 0; index < items.length; index++) {
    if (items[index]!.locked) {
      fixedIndices.add(index);
    }
  }
  const orderedFixed = [...fixedIndices].sort((left, right) => left - right);
  const deltas: ScreenAlignmentDelta[] = [];
  for (let fixedIndex = 1; fixedIndex < orderedFixed.length; fixedIndex++) {
    const startIndex = orderedFixed[fixedIndex - 1]!;
    const endIndex = orderedFixed[fixedIndex]!;
    const moving = items.slice(startIndex + 1, endIndex);
    if (moving.length === 0) {
      continue;
    }
    const start = items[startIndex]!;
    const end = items[endIndex]!;
    const available = axisStart(end.bounds, axis) - axisEnd(start.bounds, axis);
    const movingSize = moving.reduce((total, item) => total + axisSize(item.bounds, axis), 0);
    const gap = (available - movingSize) / (moving.length + 1);
    let cursor = axisEnd(start.bounds, axis) + gap;
    for (const item of moving) {
      const delta = cursor - axisStart(item.bounds, axis);
      if (delta !== 0) {
        deltas.push({ componentId: item.component.id, delta: deltaForAxis(axis, delta) });
      }
      cursor += axisSize(item.bounds, axis) + gap;
    }
  }
  return deltas.sort(compareDelta);
}

function getVisibleComponents(components: readonly ScreenComponentNode[]): readonly {
  readonly component: ScreenComponentNode;
  readonly bounds: ScreenBounds;
  readonly locked: boolean;
}[] {
  const document = { components } as Pick<ScreenDocument, 'components'>;
  const index = buildComponentIndex(document as ScreenDocument);
  return components
    .filter((component) => !isEffectiveHidden(index, component.id))
    .map((component) => ({
      component,
      bounds: getScreenComponentBounds(component),
      locked: isEffectiveLocked(index, component.id),
    }));
}

function axisStart(bounds: ScreenBounds, axis: ScreenAxis): number {
  return axis === 'x' ? bounds.left : bounds.top;
}

function axisEnd(bounds: ScreenBounds, axis: ScreenAxis): number {
  return axis === 'x' ? bounds.right : bounds.bottom;
}

function axisSize(bounds: ScreenBounds, axis: ScreenAxis): number {
  return axisEnd(bounds, axis) - axisStart(bounds, axis);
}

function axisValue(
  bounds: ScreenBounds,
  axis: ScreenAxis,
  mode: 'start' | 'center' | 'end',
): number {
  const start = axisStart(bounds, axis);
  if (mode === 'start') {
    return start;
  }
  const end = axisEnd(bounds, axis);
  return mode === 'end' ? end : start + (end - start) / 2;
}

function deltaForAxis(axis: ScreenAxis, value: number): ScreenVector {
  return axis === 'x' ? { x: normalizeZero(value), y: 0 } : { x: 0, y: normalizeZero(value) };
}

function compareDelta(left: ScreenAlignmentDelta, right: ScreenAlignmentDelta): number {
  return compareStrings(left.componentId, right.componentId);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
