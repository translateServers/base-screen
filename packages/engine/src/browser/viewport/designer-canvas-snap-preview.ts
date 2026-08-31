import type {
  DesignerCanvasMeasurement,
  DesignerSnapGuideLine,
  DesignerSnapPreview,
} from './designer-canvas-aids-types.js';

export interface DesignerGuideSnapPreview {
  readonly x: readonly DesignerSnapGuideLine[] | undefined;
  readonly y: readonly DesignerSnapGuideLine[] | undefined;
  readonly activeX: number | undefined;
  readonly activeY: number | undefined;
  readonly measurements: readonly DesignerCanvasMeasurement[] | undefined;
}

/** Coordinates alone never imply a visible guide: the solver owns the render threshold. */
export function projectDesignerSnapPreview(
  point: DesignerSnapPreview | undefined,
): DesignerGuideSnapPreview | undefined {
  if (point === undefined) return undefined;
  const x = nonempty(point.guides?.x);
  const y = nonempty(point.guides?.y);
  const measurements = nonempty(point.measurements);
  if (x === undefined && y === undefined && measurements === undefined) return undefined;
  return {
    x,
    y,
    activeX: x?.some((line) => line.value === point.snappedX) ? point.snappedX : undefined,
    activeY: y?.some((line) => line.value === point.snappedY) ? point.snappedY : undefined,
    measurements,
  };
}

export function equalDesignerSnapPreviews(
  previous: DesignerGuideSnapPreview | undefined,
  next: DesignerGuideSnapPreview | undefined,
): boolean {
  return (
    previous === next ||
    (previous?.activeX === next?.activeX &&
      previous?.activeY === next?.activeY &&
      equalItems(previous?.x, next?.x, equalGuide) &&
      equalItems(previous?.y, next?.y, equalGuide) &&
      equalItems(previous?.measurements, next?.measurements, equalMeasurement))
  );
}

function nonempty<T>(items: readonly T[] | undefined): readonly T[] | undefined {
  return items?.length === 0 ? undefined : items;
}

function equalItems<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  equal: (first: T, second: T) => boolean,
): boolean {
  if (left === right) return true;
  if ((left?.length ?? 0) !== (right?.length ?? 0)) return false;
  return left?.every((item, index) => equal(item, right![index]!)) ?? true;
}

function equalGuide(left: DesignerSnapGuideLine, right: DesignerSnapGuideLine): boolean {
  return left.value === right.value && left.start === right.start && left.size === right.size;
}

function equalMeasurement(
  left: DesignerCanvasMeasurement,
  right: DesignerCanvasMeasurement,
): boolean {
  return (
    left.axis === right.axis &&
    left.from === right.from &&
    left.to === right.to &&
    left.position === right.position &&
    Math.round(left.distance) === Math.round(right.distance)
  );
}
