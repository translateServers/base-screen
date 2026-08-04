import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  buildComponentIndex,
  getPainterOrder,
  isEffectiveHidden,
  isEffectiveLocked,
} from '../hierarchy/hierarchy.js';
import { assertCoreValidDocument } from '../internal/document.js';
import { assertFinite, normalizePoint, normalizeZero } from '../internal/preconditions.js';
import type { ScreenViewportState } from '../state/viewport.js';
import { computeComponentBounds } from './bounds.js';
import type { ScreenAxis, ScreenBounds, ScreenPoint, ScreenRect, ScreenVector } from './types.js';

export interface ScreenAlignmentDelta {
  readonly componentId: string;
  readonly delta: ScreenVector;
}

export interface ScreenSnapCandidate {
  readonly axis: ScreenAxis;
  readonly movingValue: number;
  readonly targetValue: number;
  readonly sourceComponentId: string;
  readonly targetComponentId: string | null;
}

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

export function hitTestScreenComponents(
  document: ScreenDocument,
  point: ScreenPoint,
): readonly string[] {
  assertCoreValidDocument(document);
  assertPoint(point, 'point');
  const index = buildComponentIndex(document);
  const byId = index.byId;
  return [...getPainterOrder(document)].reverse().filter((id) => {
    const component = byId.get(id)?.component;
    return (
      component !== undefined && !isEffectiveHidden(index, id) && pointInComponent(point, component)
    );
  });
}

export function queryScreenComponentsInRect(
  document: ScreenDocument,
  rect: ScreenRect,
  mode: 'intersect' | 'contain',
): readonly string[] {
  assertCoreValidDocument(document);
  assertRect(rect);
  if (mode !== 'intersect' && mode !== 'contain') {
    throw new RangeError('Query mode must be intersect or contain.');
  }
  const index = buildComponentIndex(document);
  return document.components
    .filter((component) => {
      if (isEffectiveHidden(index, component.id)) {
        return false;
      }
      const corners = getComponentCorners(component);
      return mode === 'contain'
        ? corners.every((corner) => pointInRect(corner, rect))
        : rotatedRectIntersectsRect(corners, rect);
    })
    .map(({ id }) => id);
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
  const reference = Math.min(
    ...(fixed.length > 0 ? fixed : visible).map(({ bounds }) => axisValue(bounds, axis, mode)),
  );
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

export function chooseScreenSnapCandidate(
  candidates: readonly ScreenSnapCandidate[],
  threshold: number,
): ScreenSnapCandidate | null {
  assertFinite(threshold, 'threshold');
  if (threshold < 0) {
    throw new RangeError('Snap threshold must not be negative.');
  }
  let best: ScreenSnapCandidate | null = null;
  for (const candidate of candidates) {
    assertCandidate(candidate);
    if (Math.abs(candidate.targetValue - candidate.movingValue) > threshold) {
      continue;
    }
    if (best === null || compareCandidate(candidate, best) < 0) {
      best = candidate;
    }
  }
  return best === null ? null : { ...best };
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

function pointInComponent(point: ScreenPoint, component: ScreenComponentNode): boolean {
  const centerX = component.position.x + component.size.width / 2;
  const centerY = component.position.y + component.size.height / 2;
  const radians = (-component.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = (point.x - centerX) * cos - (point.y - centerY) * sin + component.size.width / 2;
  const y = (point.x - centerX) * sin + (point.y - centerY) * cos + component.size.height / 2;
  return x >= 0 && x <= component.size.width && y >= 0 && y <= component.size.height;
}

function getComponentCorners(component: ScreenComponentNode): readonly ScreenPoint[] {
  getScreenComponentBounds(component);
  const centerX = component.position.x + component.size.width / 2;
  const centerY = component.position.y + component.size.height / 2;
  const halfWidth = component.size.width / 2;
  const halfHeight = component.size.height / 2;
  const radians = (component.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map(({ x, y }) =>
    normalizePoint({
      x: centerX + x * cos - y * sin,
      y: centerY + x * sin + y * cos,
    }),
  );
}

function rotatedRectIntersectsRect(corners: readonly ScreenPoint[], rect: ScreenRect): boolean {
  if (corners.some((corner) => pointInRect(corner, rect))) {
    return true;
  }
  const rectCorners: readonly ScreenPoint[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  if (rectCorners.some((corner) => pointInPolygon(corner, corners))) {
    return true;
  }
  for (let index = 0; index < corners.length; index++) {
    const a = corners[index]!;
    const b = corners[(index + 1) % corners.length]!;
    for (let rectIndex = 0; rectIndex < rectCorners.length; rectIndex++) {
      const c = rectCorners[rectIndex]!;
      const d = rectCorners[(rectIndex + 1) % rectCorners.length]!;
      if (segmentsIntersect(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

function pointInPolygon(point: ScreenPoint, corners: readonly ScreenPoint[]): boolean {
  let hasPositive = false;
  let hasNegative = false;
  for (let index = 0; index < corners.length; index++) {
    const start = corners[index]!;
    const end = corners[(index + 1) % corners.length]!;
    const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    hasPositive ||= cross > 0;
    hasNegative ||= cross < 0;
  }
  return !(hasPositive && hasNegative);
}

function segmentsIntersect(
  a: ScreenPoint,
  b: ScreenPoint,
  c: ScreenPoint,
  d: ScreenPoint,
): boolean {
  const cross = (first: ScreenPoint, second: ScreenPoint, third: ScreenPoint): number =>
    (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (abC === 0 && pointOnSegment(c, a, b)) {
    return true;
  }
  if (abD === 0 && pointOnSegment(d, a, b)) {
    return true;
  }
  if (cdA === 0 && pointOnSegment(a, c, d)) {
    return true;
  }
  if (cdB === 0 && pointOnSegment(b, c, d)) {
    return true;
  }
  return abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0;
}

function pointOnSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): boolean {
  return (
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y)
  );
}

function pointInRect(point: ScreenPoint, rect: ScreenRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
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

function compareCandidate(left: ScreenSnapCandidate, right: ScreenSnapCandidate): number {
  const byDistance =
    Math.abs(left.targetValue - left.movingValue) - Math.abs(right.targetValue - right.movingValue);
  if (byDistance !== 0) {
    return byDistance;
  }
  if (left.axis !== right.axis) {
    return left.axis === 'x' ? -1 : 1;
  }
  const bySource = compareStrings(left.sourceComponentId, right.sourceComponentId);
  if (bySource !== 0) {
    return bySource;
  }
  const byTarget = compareNullableStrings(left.targetComponentId, right.targetComponentId);
  if (byTarget !== 0) {
    return byTarget;
  }
  if (left.movingValue !== right.movingValue) {
    return left.movingValue - right.movingValue;
  }
  return left.targetValue - right.targetValue;
}

function compareNullableStrings(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return compareStrings(left, right);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPoint(point: ScreenPoint, name: string): void {
  if (point === null || typeof point !== 'object') {
    throw new RangeError(`${name} must be a finite point.`);
  }
  assertFinite(point.x, `${name}.x`);
  assertFinite(point.y, `${name}.y`);
}

function assertRect(rect: ScreenRect): void {
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

function assertViewport(viewport: ScreenViewportState): void {
  if (viewport === null || typeof viewport !== 'object' || viewport.offset === null) {
    throw new RangeError('Viewport must contain a zoom and finite offset.');
  }
  if (viewport.zoom < 0.05 || viewport.zoom > 64) {
    throw new RangeError('Viewport zoom must be from 0.05 through 64.');
  }
  assertFinite(viewport.zoom, 'viewport.zoom');
  assertPoint(viewport.offset, 'viewport.offset');
}

function assertCandidate(candidate: ScreenSnapCandidate): void {
  if (candidate === null || typeof candidate !== 'object') {
    throw new RangeError('Snap candidate must be an object.');
  }
  if (candidate.axis !== 'x' && candidate.axis !== 'y') {
    throw new RangeError('Snap candidate axis must be x or y.');
  }
  if (
    typeof candidate.sourceComponentId !== 'string' ||
    (typeof candidate.targetComponentId !== 'string' && candidate.targetComponentId !== null)
  ) {
    throw new RangeError('Snap candidate component ids must be strings or null.');
  }
  assertFinite(candidate.movingValue, 'candidate.movingValue');
  assertFinite(candidate.targetValue, 'candidate.targetValue');
}
