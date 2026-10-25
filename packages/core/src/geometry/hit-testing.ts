import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, getPainterOrder, isEffectiveHidden } from '../hierarchy/hierarchy.js';
import { assertCoreValidDocument } from '../internal/document.js';
import { normalizePoint } from '../internal/preconditions.js';
import { getScreenComponentBounds } from './component-bounds.js';
import type { ScreenPoint, ScreenRect } from './types.js';
import { assertPoint, assertRect } from './validation.js';

export interface ScreenHitTestOptions {
  /**
   * 每个轴上的最小命中厚度（画布单位）。某个轴上的 canonical 尺寸小于该值时，命中范围
   * 以组件中心为对称轴扩到该厚度 —— 让 2px 高的分割线、1px 描边的容器这类"容器与内容
   * 一样大"的组件仍有可点的命中带。默认 0，即严格按 canonical 尺寸命中。
   */
  readonly minimumThickness?: number;
}

export function hitTestScreenComponents(
  document: ScreenDocument,
  point: ScreenPoint,
  options: ScreenHitTestOptions = {},
): readonly string[] {
  assertCoreValidDocument(document);
  assertPoint(point, 'point');
  const minimumThickness = options.minimumThickness ?? 0;
  if (!Number.isFinite(minimumThickness) || minimumThickness < 0) {
    throw new RangeError('Hit test minimumThickness must be a non-negative finite number.');
  }
  const index = buildComponentIndex(document);
  const byId = index.byId;
  return [...getPainterOrder(document)].reverse().filter((id) => {
    const component = byId.get(id)?.component;
    return (
      component !== undefined &&
      !isEffectiveHidden(index, id) &&
      pointInComponent(point, component, minimumThickness)
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

function pointInComponent(
  point: ScreenPoint,
  component: ScreenComponentNode,
  minimumThickness: number,
): boolean {
  const width = component.size.width;
  const height = component.size.height;
  // 薄轴上的命中带以中心为轴加宽，厚轴不受影响；判断仍在组件局部坐标系里做，
  // 所以旋转后的命中带与组件本身同向。
  const padX = Math.max(0, minimumThickness - width) / 2;
  const padY = Math.max(0, minimumThickness - height) / 2;
  const centerX = component.position.x + width / 2;
  const centerY = component.position.y + height / 2;
  const radians = (-component.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = (point.x - centerX) * cos - (point.y - centerY) * sin + width / 2;
  const y = (point.x - centerX) * sin + (point.y - centerY) * cos + height / 2;
  return x >= -padX && x <= width + padX && y >= -padY && y <= height + padY;
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
