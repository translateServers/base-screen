// 拖动时的布局间距标注收集：为当前选区收集同轨道相邻组件之间的 gap 测量线
// （即吸附时画布上显示的 46 / 48 / 59 这类间距数字）。纯计算，不含 DOM 渲染。

import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenComponentBounds, isScreenComponentEffectivelyHidden } from '@base-screen/core';
import {
  DESIGNER_SNAP_RENDER_THRESHOLD,
  type DesignerCanvasMeasurement,
  type DesignerSelectionSnapBounds,
} from './designer-canvas-aids.js';

interface Interval {
  readonly end: number;
  readonly start: number;
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
  const tolerance = DESIGNER_SNAP_RENDER_THRESHOLD / Math.max(zoom, Number.EPSILON);
  const selected = new Set(selectedComponentIds);
  const components = document.components
    .filter((component) => !selected.has(component.id))
    .filter((component) => !isScreenComponentEffectivelyHidden(document, component.id))
    .map((component) => getScreenComponentBounds(component));
  const measurements: DesignerCanvasMeasurement[] = [];

  for (const position of uniqueAnchors(selection.left, selection.right)) {
    const intervals: Interval[] = [
      { start: selection.top, end: selection.bottom },
      ...components
        .filter(
          (bounds) =>
            matchesAnchor(position, bounds.left, bounds.right, tolerance) &&
            hasEffectiveOverlap(
              selection.left,
              selection.right,
              bounds.left,
              bounds.right,
              tolerance,
            ),
        )
        .map((bounds) => ({ start: bounds.top, end: bounds.bottom })),
    ];
    measurements.push(...collectGapMeasurements('y', position, intervals, tolerance));
  }
  for (const position of uniqueAnchors(selection.top, selection.bottom)) {
    const intervals: Interval[] = [
      { start: selection.left, end: selection.right },
      ...components
        .filter(
          (bounds) =>
            matchesAnchor(position, bounds.top, bounds.bottom, tolerance) &&
            hasEffectiveOverlap(
              selection.top,
              selection.bottom,
              bounds.top,
              bounds.bottom,
              tolerance,
            ),
        )
        .map((bounds) => ({ start: bounds.left, end: bounds.right })),
    ];
    measurements.push(...collectGapMeasurements('x', position, intervals, tolerance));
  }
  return measurements;
}

function uniqueAnchors(start: number, end: number): readonly number[] {
  return [...new Set([start, (start + end) / 2, end])];
}

function matchesAnchor(position: number, start: number, end: number, tolerance: number): boolean {
  return [start, (start + end) / 2, end].some((anchor) => Math.abs(anchor - position) <= tolerance);
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
