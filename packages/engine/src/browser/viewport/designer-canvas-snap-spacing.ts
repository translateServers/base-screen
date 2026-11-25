// 等间距吸附（tldraw BoundsSnaps 的 gap_center / gap_duplicate，Penpot snap-distance）：
// 只在拖动选区时生效。每帧只看与选区在正交方向重叠的组件（同一行 / 同一列），
// 两两之间的间距作为候选：
// - 居中：选区放进某个间距的正中；
// - 复制：在某个间距一侧的组件外再复制出相同间距。
// 吸附后再按最终几何收集精确相等的间距（含沿同一排继续相等的间距链），作为间距标注。
// 带 reach 时，只用主轴上离选区 ≤ reach 的组件、且间距本身 ≤ reach（Moveable
// maxSnapElementGuidelineDistance / maxSnapElementGapDistance），标注链也止于这个范围。

import type {
  DesignerCanvasMeasurement,
  DesignerSelectionSnapBounds,
} from './designer-canvas-aids-types.js';

/** 每帧参与间距计算的同排组件上限（Grida 参考值），超出时取主轴上离选区最近的若干个。 */
const MAX_SPACING_NEIGHBORS = 64;

type SpacingAxis = 'x' | 'y';

interface SpacingNode {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly crossStart: number;
  readonly crossEnd: number;
}

interface SpacingGap {
  readonly startNode: SpacingNode;
  readonly endNode: SpacingNode;
  readonly from: number;
  readonly to: number;
  readonly length: number;
  readonly crossStart: number;
  readonly crossEnd: number;
}

interface SpacingSpan {
  readonly start: number;
  readonly end: number;
  readonly crossStart: number;
  readonly crossEnd: number;
}

export class DesignerSpacingIndex {
  readonly #x: readonly SpacingNode[];
  readonly #y: readonly SpacingNode[];

  constructor(components: readonly DesignerSelectionSnapBounds[]) {
    const finite = components.filter(
      (bounds) =>
        Number.isFinite(bounds.left) &&
        Number.isFinite(bounds.right) &&
        Number.isFinite(bounds.top) &&
        Number.isFinite(bounds.bottom),
    );
    this.#x = finite.map((bounds, id) => ({
      id,
      start: bounds.left,
      end: bounds.right,
      crossStart: bounds.top,
      crossEnd: bounds.bottom,
    }));
    this.#y = finite.map((bounds, id) => ({
      id,
      start: bounds.top,
      end: bounds.bottom,
      crossStart: bounds.left,
      crossEnd: bounds.right,
    }));
  }

  /** 该轴上阈值内最近的等间距修正量（正值向右 / 向下），没有则 undefined。 */
  snap(
    axis: SpacingAxis,
    bounds: DesignerSelectionSnapBounds,
    threshold: number,
    reach = Number.POSITIVE_INFINITY,
  ): number | undefined {
    if (!(threshold >= 0)) return undefined;
    const selection = span(axis, bounds);
    let best: number | undefined;
    const consider = (nudge: number) => {
      if (Math.abs(nudge) > threshold) return;
      if (best === undefined || Math.abs(nudge) < Math.abs(best)) best = nudge;
    };
    const size = selection.end - selection.start;
    const center = (selection.start + selection.end) / 2;
    for (const gap of gapsOf(this.#band(axis, selection, reach), reach)) {
      if (gap.length > size) consider(gap.from + gap.length / 2 - center);
      consider(gap.startNode.start - gap.length - selection.end);
      consider(gap.endNode.end + gap.length - selection.start);
    }
    return best;
  }

  /** 最终几何上精确相等的间距（两轴），作为“等间距”标注；没有则为空。 */
  measurements(
    bounds: DesignerSelectionSnapBounds,
    tolerance: number,
    reach = Number.POSITIVE_INFINITY,
  ): readonly DesignerCanvasMeasurement[] {
    if (!(tolerance >= 0)) return [];
    return [
      ...this.#axisMeasurements('x', bounds, tolerance, reach),
      ...this.#axisMeasurements('y', bounds, tolerance, reach),
    ];
  }

  #axisMeasurements(
    axis: SpacingAxis,
    bounds: DesignerSelectionSnapBounds,
    tolerance: number,
    reach: number,
  ): readonly DesignerCanvasMeasurement[] {
    const selection = span(axis, bounds);
    const gaps = gapsOf(this.#band(axis, selection, reach), reach);
    const size = selection.end - selection.start;
    const center = (selection.start + selection.end) / 2;
    const segments = new Map<string, DesignerCanvasMeasurement>();
    const add = (start: SpacingSpan, end: SpacingSpan) => {
      const from = start.end;
      const to = end.start;
      const crossStart = Math.max(start.crossStart, end.crossStart);
      const crossEnd = Math.min(start.crossEnd, end.crossEnd);
      if (!(to - from > tolerance) || !(crossEnd > crossStart)) return;
      const position = (crossStart + crossEnd) / 2;
      const key = `${from}:${to}:${position}`;
      if (!segments.has(key)) {
        segments.set(key, { axis, distance: to - from, from, to, position, kind: 'equal' });
      }
    };
    const chain = (
      node: SpacingNode,
      length: number,
      direction: 'forward' | 'backward',
      crossStart: number,
      crossEnd: number,
      visited = new Set<number>(),
    ) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      for (const gap of gaps) {
        if ((direction === 'forward' ? gap.startNode : gap.endNode) !== node) continue;
        if (Math.abs(gap.length - length) > tolerance) continue;
        const nextStart = Math.max(crossStart, gap.crossStart);
        const nextEnd = Math.min(crossEnd, gap.crossEnd);
        if (!(nextEnd > nextStart)) continue;
        add(gap.startNode, gap.endNode);
        chain(
          direction === 'forward' ? gap.endNode : gap.startNode,
          length,
          direction,
          nextStart,
          nextEnd,
          visited,
        );
      }
    };
    // Adjacent evenly spaced items yield many centred gaps over the same breadth: keep the
    // smallest one per overlapping breadth (tldraw findOverlappingCenterSnap).
    const centred: SpacingGap[] = [];
    for (const gap of gaps) {
      if (!(gap.length > size)) continue;
      if (Math.abs(gap.from + gap.length / 2 - center) > tolerance) continue;
      const overlapping = centred.findIndex((other) => overlaps(other, gap));
      if (overlapping < 0) centred.push(gap);
      else if (centred[overlapping]!.length > gap.length) centred[overlapping] = gap;
    }
    for (const gap of centred) {
      const length = (gap.length - size) / 2;
      const crossStart = Math.max(gap.crossStart, selection.crossStart);
      const crossEnd = Math.min(gap.crossEnd, selection.crossEnd);
      chain(gap.startNode, length, 'backward', crossStart, crossEnd);
      add(gap.startNode, selection);
      add(selection, gap.endNode);
      chain(gap.endNode, length, 'forward', crossStart, crossEnd);
    }
    for (const gap of gaps) {
      const crossStart = Math.max(gap.crossStart, selection.crossStart);
      const crossEnd = Math.min(gap.crossEnd, selection.crossEnd);
      if (Math.abs(gap.endNode.end + gap.length - selection.start) <= tolerance) {
        chain(gap.startNode, gap.length, 'backward', crossStart, crossEnd);
        add(gap.startNode, gap.endNode);
        add(gap.endNode, selection);
      }
      if (Math.abs(gap.startNode.start - gap.length - selection.end) <= tolerance) {
        add(selection, gap.startNode);
        add(gap.startNode, gap.endNode);
        chain(gap.endNode, gap.length, 'forward', crossStart, crossEnd);
      }
    }
    return [...segments.values()].sort(
      (left, right) => left.position - right.position || left.from - right.from,
    );
  }

  // Components in the selection's row (x) or column (y) — their cross range overlaps it —
  // within `reach` of it along the axis.
  #band(axis: SpacingAxis, selection: SpacingSpan, reach: number): readonly SpacingNode[] {
    const nodes = axis === 'x' ? this.#x : this.#y;
    const distance = (node: SpacingNode) =>
      Math.max(0, node.start - selection.end, selection.start - node.end);
    let band = nodes.filter(
      (node) =>
        node.crossStart < selection.crossEnd &&
        selection.crossStart < node.crossEnd &&
        distance(node) <= reach,
    );
    if (band.length > MAX_SPACING_NEIGHBORS) {
      band = band
        .sort((left, right) => distance(left) - distance(right) || left.id - right.id)
        .slice(0, MAX_SPACING_NEIGHBORS);
    }
    return band.sort((left, right) => left.start - right.start || left.id - right.id);
  }
}

// Every pair with empty space between them along the axis that also overlaps on the cross
// axis (tldraw getVisibleGaps), no wider than `reach`. `nodes` is sorted by start.
function gapsOf(nodes: readonly SpacingNode[], reach: number): readonly SpacingGap[] {
  const gaps: SpacingGap[] = [];
  for (let first = 0; first < nodes.length; first++) {
    const startNode = nodes[first]!;
    for (let second = first + 1; second < nodes.length; second++) {
      const endNode = nodes[second]!;
      if (!(startNode.end < endNode.start) || endNode.start - startNode.end > reach) continue;
      const crossStart = Math.max(startNode.crossStart, endNode.crossStart);
      const crossEnd = Math.min(startNode.crossEnd, endNode.crossEnd);
      if (!(crossEnd > crossStart)) continue;
      gaps.push({
        startNode,
        endNode,
        from: startNode.end,
        to: endNode.start,
        length: endNode.start - startNode.end,
        crossStart,
        crossEnd,
      });
    }
  }
  return gaps;
}

function overlaps(left: SpacingGap, right: SpacingGap): boolean {
  return left.crossStart < right.crossEnd && right.crossStart < left.crossEnd;
}

function span(axis: SpacingAxis, bounds: DesignerSelectionSnapBounds): SpacingSpan {
  return axis === 'x'
    ? { start: bounds.left, end: bounds.right, crossStart: bounds.top, crossEnd: bounds.bottom }
    : { start: bounds.top, end: bounds.bottom, crossStart: bounds.left, crossEnd: bounds.right };
}
