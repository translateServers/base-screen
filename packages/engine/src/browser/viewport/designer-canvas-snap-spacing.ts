// 等间距吸附（tldraw BoundsSnaps 的 gap_center / gap_duplicate，Penpot snap-distance）：
// 只在拖动选区时生效。每帧只看与选区在正交方向重叠的组件（同一行 / 同一列），
// **只有相邻两段之间真正空着的间距**才算候选：
// - 居中：选区放进某个间距的正中；
// - 复制：在某个间距一侧的组件外再复制出相同间距。
// 吸附后再按最终几何收集精确相等的间距，作为间距标注：复制时画新间距与它参照的那一段，
// 居中时画两侧两段。不再沿同一排延伸整条等距链——整列 16px 会把同一读数铺满画布。
// 带 reach 时，只用主轴上离选区 ≤ reach 的组件、且间距本身 ≤ reach（Moveable
// maxSnapElementGuidelineDistance / maxSnapElementGapDistance），标注也止于这个范围。
//
// 间距只认“空档”：A 与 B 之间若还夹着同排的第三个组件，A→B 就不是间距。tldraw 的
// getVisibleGaps 会把这种跨过组件的区间也算进来，密集排布下一列 8 个 16px 组件会同时
// 产出 16 / 32 / 48 / 64 等一堆并不存在的“间距”，吸附与标注都跟着抖动。

import type {
  DesignerCanvasMeasurement,
  DesignerSelectionSnapBounds,
} from './designer-canvas-aids-types.js';

/** 每帧参与间距计算的同排组件上限（Grida 参考值），超出时取主轴上离选区最近的若干个。 */
const MAX_SPACING_NEIGHBORS = 64;

/** 每条轴最多画出的等间距标注段数：新段 + 参照段，两侧 / 多个居中间距合计的上限。 */
const MAX_EQUAL_MARKS = 4;

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
      add(gap.startNode, selection);
      add(selection, gap.endNode);
    }
    // Centring already explains the spacing on this axis; a duplicate reading would add the
    // far side of the neighbour it copied from (one more label per side in a dense column).
    if (centred.length === 0) {
      for (const gap of gaps) {
        if (Math.abs(gap.endNode.end + gap.length - selection.start) <= tolerance) {
          add(gap.startNode, gap.endNode);
          add(gap.endNode, selection);
        }
        if (Math.abs(gap.startNode.start - gap.length - selection.end) <= tolerance) {
          add(selection, gap.startNode);
          add(gap.startNode, gap.endNode);
        }
      }
    }
    return nearestMarks([...segments.values()], selection).sort(
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

// Every pair of adjacent components with empty space between them along the axis that also
// overlaps on the cross axis (tldraw getVisibleGaps, narrowed to real gaps), no wider than
// `reach`. `nodes` is sorted by start. A third component inside the span — in the same cross
// band — makes it an occupied run rather than a gap.
function gapsOf(nodes: readonly SpacingNode[], reach: number): readonly SpacingGap[] {
  const gaps: SpacingGap[] = [];
  for (let first = 0; first < nodes.length; first++) {
    const startNode = nodes[first]!;
    for (let second = first + 1; second < nodes.length; second++) {
      const endNode = nodes[second]!;
      if (endNode.start - startNode.end > reach) break;
      if (!(startNode.end < endNode.start)) continue;
      const crossStart = Math.max(startNode.crossStart, endNode.crossStart);
      const crossEnd = Math.min(startNode.crossEnd, endNode.crossEnd);
      if (!(crossEnd > crossStart)) continue;
      if (hasIntruder(nodes, startNode, endNode, crossStart, crossEnd)) continue;
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

// A component overlapping the empty span on the same cross band splits it: the gap is then
// between that component and one of the pair, not across it.
function hasIntruder(
  nodes: readonly SpacingNode[],
  startNode: SpacingNode,
  endNode: SpacingNode,
  crossStart: number,
  crossEnd: number,
): boolean {
  for (const node of nodes) {
    if (node === startNode || node === endNode) continue;
    if (node.start >= endNode.start || node.end <= startNode.end) continue;
    if (Math.min(crossEnd, node.crossEnd) - Math.max(crossStart, node.crossStart) > 0) return true;
  }
  return false;
}

// Duplicates on both sides, or several centred gaps, can still add up; keep the segments
// nearest the selection (they are the ones the pointer just produced) so the reading stays
// legible in dense layouts.
function nearestMarks(
  marks: readonly DesignerCanvasMeasurement[],
  selection: SpacingSpan,
): DesignerCanvasMeasurement[] {
  if (marks.length <= MAX_EQUAL_MARKS) return [...marks];
  return [...marks]
    .sort(
      (left, right) =>
        markDistance(left, selection) - markDistance(right, selection) ||
        left.from - right.from ||
        left.position - right.position,
    )
    .slice(0, MAX_EQUAL_MARKS);
}

function markDistance(mark: DesignerCanvasMeasurement, selection: SpacingSpan): number {
  return Math.max(0, mark.from - selection.end, selection.start - mark.to);
}

function overlaps(left: SpacingGap, right: SpacingGap): boolean {
  return left.crossStart < right.crossEnd && right.crossStart < left.crossEnd;
}

function span(axis: SpacingAxis, bounds: DesignerSelectionSnapBounds): SpacingSpan {
  return axis === 'x'
    ? { start: bounds.left, end: bounds.right, crossStart: bounds.top, crossEnd: bounds.bottom }
    : { start: bounds.top, end: bounds.bottom, crossStart: bounds.left, crossEnd: bounds.right };
}
