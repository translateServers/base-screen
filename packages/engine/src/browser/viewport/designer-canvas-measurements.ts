// 拖动时的布局间距标注收集：为当前选区收集同轨道相邻组件之间的 gap 测量线
// （即吸附时画布上显示的 46 / 48 / 59 这类间距数字）。纯计算，不含 DOM 渲染。

import type { ScreenDocument } from '@base-screen/contracts';
import {
  DESIGNER_SNAP_RENDER_THRESHOLD,
  type DesignerCanvasMeasurement,
  type DesignerSelectionSnapBounds,
} from './designer-canvas-aids-types.js';
import { collectDesignerSnapComponentBounds } from './designer-canvas-snap-geometry.js';

interface Interval {
  readonly end: number;
  readonly start: number;
}

interface AnchorEntry {
  readonly value: number;
  readonly index: number;
}

/**
 * 生成与当前拖动选区 anchor 对齐的布局间距标注。
 *
 * 每条 x/y 轨道只收集与选区 left/center/right 或 top/middle/bottom 重合、且正交投影真实重叠
 * 的可见组件，再按另一轴的视觉区间排序并标注相邻非重叠 gap。这样能同时显示选区周边和同
 * 轨道后续组件之间的间距（参考图中的 46 / 48 / 59），但不会把仅共享边/角的关系或网格线
 * 变成测量或吸附目标。
 */
export function collectDesignerCanvasMeasurements(
  document: ScreenDocument,
  selection: DesignerSelectionSnapBounds,
  selectedComponentIds: readonly string[],
  zoom = 1,
): readonly DesignerCanvasMeasurement[] {
  return measureDesignerCanvasBounds(
    collectDesignerSnapComponentBounds(document, new Set(selectedComponentIds)),
    selection,
    zoom,
  );
}

/** One-off path: indexes the given geometry for a single measurement. */
export function measureDesignerCanvasBounds(
  components: readonly DesignerSelectionSnapBounds[],
  selection: DesignerSelectionSnapBounds,
  zoom = 1,
): readonly DesignerCanvasMeasurement[] {
  return new DesignerCanvasMeasurementIndex(components).measure(selection, zoom);
}

/**
 * Gesture path: built once per geometry snapshot. Each rail only visits components whose
 * start / center / end lies inside the tolerance window (binary search over sorted anchors),
 * so a frame costs O(log N + matches) instead of scanning every component per rail.
 */
export class DesignerCanvasMeasurementIndex {
  readonly #components: readonly DesignerSelectionSnapBounds[];
  readonly #x: readonly AnchorEntry[];
  readonly #y: readonly AnchorEntry[];
  readonly #visited: Uint32Array;
  #visit = 0;

  constructor(components: readonly DesignerSelectionSnapBounds[]) {
    this.#components = components;
    this.#x = sortedAnchors(components, (bounds) => [bounds.left, bounds.right]);
    this.#y = sortedAnchors(components, (bounds) => [bounds.top, bounds.bottom]);
    this.#visited = new Uint32Array(components.length);
  }

  /** `reach` (document units) drops rail components farther than it from the selection. */
  measure(
    selection: DesignerSelectionSnapBounds,
    zoom = 1,
    reach = Number.POSITIVE_INFINITY,
  ): readonly DesignerCanvasMeasurement[] {
    const tolerance = DESIGNER_SNAP_RENDER_THRESHOLD / Math.max(zoom, Number.EPSILON);
    const measurements: DesignerCanvasMeasurement[] = [];

    for (const position of uniqueAnchors(selection.left, selection.right)) {
      const intervals: Interval[] = [{ start: selection.top, end: selection.bottom }];
      for (const index of this.#matches(this.#x, position, tolerance)) {
        const bounds = this.#components[index]!;
        const overlaps = hasEffectiveOverlap(
          selection.left,
          selection.right,
          bounds.left,
          bounds.right,
          tolerance,
        );
        const gap = gapBetween(selection.top, selection.bottom, bounds.top, bounds.bottom);
        if (overlaps && gap <= reach) {
          intervals.push({ start: bounds.top, end: bounds.bottom });
        }
      }
      measurements.push(...collectGapMeasurements('y', position, intervals, tolerance));
    }
    for (const position of uniqueAnchors(selection.top, selection.bottom)) {
      const intervals: Interval[] = [{ start: selection.left, end: selection.right }];
      for (const index of this.#matches(this.#y, position, tolerance)) {
        const bounds = this.#components[index]!;
        const overlaps = hasEffectiveOverlap(
          selection.top,
          selection.bottom,
          bounds.top,
          bounds.bottom,
          tolerance,
        );
        const gap = gapBetween(selection.left, selection.right, bounds.left, bounds.right);
        if (overlaps && gap <= reach) {
          intervals.push({ start: bounds.left, end: bounds.right });
        }
      }
      measurements.push(...collectGapMeasurements('x', position, intervals, tolerance));
    }
    return measurements;
  }

  // Components with any anchor in [position - tolerance, position + tolerance], once each,
  // in document order (the same membership as `Math.abs(anchor - position) <= tolerance`).
  #matches(entries: readonly AnchorEntry[], position: number, tolerance: number): number[] {
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (entries[middle]!.value - position < -tolerance) low = middle + 1;
      else high = middle;
    }
    const visit = this.#nextVisit();
    const matches: number[] = [];
    for (let cursor = low; cursor < entries.length; cursor++) {
      const entry = entries[cursor]!;
      if (entry.value - position > tolerance) break;
      if (this.#visited[entry.index] === visit) continue;
      this.#visited[entry.index] = visit;
      matches.push(entry.index);
    }
    return matches.length > 1 ? matches.sort((left, right) => left - right) : matches;
  }

  #nextVisit(): number {
    this.#visit = (this.#visit + 1) >>> 0;
    if (this.#visit === 0) {
      this.#visited.fill(0);
      this.#visit = 1;
    }
    return this.#visit;
  }
}

function sortedAnchors(
  components: readonly DesignerSelectionSnapBounds[],
  span: (bounds: DesignerSelectionSnapBounds) => readonly [number, number],
): readonly AnchorEntry[] {
  const entries: AnchorEntry[] = [];
  for (const [index, bounds] of components.entries()) {
    const [start, end] = span(bounds);
    // Same center expression as the original per-rail scan, so floating-point membership matches.
    for (const value of [start, (start + end) / 2, end]) {
      if (Number.isFinite(value)) entries.push({ value, index });
    }
  }
  return entries.sort((left, right) => left.value - right.value);
}

function uniqueAnchors(start: number, end: number): readonly number[] {
  return [...new Set([start, (start + end) / 2, end])];
}

function gapBetween(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return Math.max(0, secondStart - firstEnd, firstStart - secondEnd);
}

function hasEffectiveOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  tolerance: number,
): boolean {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > tolerance;
}

function collectGapMeasurements(
  axis: DesignerCanvasMeasurement['axis'],
  position: number,
  intervals: readonly Interval[],
  tolerance: number,
): readonly DesignerCanvasMeasurement[] {
  const merged = mergeIntervals(intervals, tolerance);
  const measurements: DesignerCanvasMeasurement[] = [];
  for (let index = 1; index < merged.length; index += 1) {
    const previous = merged[index - 1]!;
    const next = merged[index]!;
    const distance = next.start - previous.end;
    if (distance <= tolerance) continue;
    measurements.push({
      axis,
      distance,
      from: previous.end,
      position,
      to: next.start,
    });
  }
  return measurements;
}

function mergeIntervals(intervals: readonly Interval[], tolerance: number): readonly Interval[] {
  const merged: Interval[] = [];
  for (const interval of [...intervals].sort((left, right) => left.start - right.start)) {
    const previous = merged.at(-1);
    if (previous === undefined || interval.start > previous.end + tolerance) {
      merged.push({ ...interval });
      continue;
    }
    if (interval.end > previous.end) {
      merged[merged.length - 1] = { start: previous.start, end: interval.end };
    }
  }
  return merged;
}
