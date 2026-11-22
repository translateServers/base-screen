// 吸附对齐索引：手势首帧把画布边、用户 guide 与组件的左/中/右、上/中/下登记为按坐标排序的
// 对齐线（每条线带上该目标在线上的吸附点），每帧只做两件事：
// 1. query：取各锚点 ± 阈值窗口内的去重坐标，交给 vendored Moveable checkSnapPoses 竞争；
// 2. guides：吸附完成后，用极小容差找出与最终几何精确重合的全部线，按坐标分组，
//    每组一条从最小吸附点到最大吸附点的参考线，并给出各吸附点位置供绘制 × 标记。
// 与 tldraw / Excalidraw / Penpot 的“先吸附、再按吸附后位置重算参考线”一致。
// 两步都可带邻近范围：组件线只有在其组件与焦点几何在正交方向的间距 ≤ reach 时才参与
// （Moveable maxSnapElementGuidelineDistance / checkBetweenRects）；画布边与用户 guide 不受限。

import type { ScreenDocument } from '@base-screen/contracts';
import type { SnapGuideline } from '../../common/vendor/moveable/types.js';
import type {
  DesignerSelectionSnapBounds,
  DesignerSnapGuideLine,
  DesignerSnapGuides,
} from './designer-canvas-aids-types.js';
import type { DesignerSnapCandidates } from './designer-canvas-snap-candidates.js';
import type { DesignerSnapComponentBounds } from './designer-canvas-snap-geometry.js';

/** 一条可对齐的线：坐标 + 目标在线上的吸附点（正交坐标）。 */
interface DesignerAlignmentLine {
  readonly value: number;
  /** 目标的吸附点：组件边为两个角，组件中心线为中心点，画布边为两个角，用户 guide 为空。 */
  readonly points: readonly number[];
  /** 画布边与用户 guide 是全画布线：参考线至少覆盖这一段。组件线为 undefined。 */
  readonly span: readonly [number, number] | undefined;
  /** 所属组件在正交方向上的范围，用于邻近范围判定；全局线为 undefined（不受限）。 */
  readonly extent: readonly [number, number] | undefined;
}

/** 焦点几何在正交方向上的范围与允许的最大间距。 */
interface DesignerAlignmentReach {
  readonly start: number;
  readonly end: number;
  readonly reach: number;
}

/** 被拖几何在某条轴上的一个锚点：坐标 + 该锚点在线上的吸附点。 */
interface DesignerAlignmentAnchor {
  readonly value: number;
  readonly points: readonly number[];
}

interface DesignerAlignmentAxis {
  /** 按坐标升序的全部对齐线（同坐标多条线都保留，供参考线收集全部吸附点）。 */
  readonly lines: readonly DesignerAlignmentLine[];
  /** lines[i] 对应的去重坐标下标。 */
  readonly lineValues: readonly number[];
  /** 去重后的坐标与手势内复用的 Moveable 参考线对象，供竞争输入。 */
  readonly values: readonly number[];
  readonly guidelines: readonly SnapGuideline[];
}

export class DesignerAlignmentIndex {
  readonly #x: DesignerAlignmentAxis;
  readonly #y: DesignerAlignmentAxis;

  private constructor(x: readonly DesignerAlignmentLine[], y: readonly DesignerAlignmentLine[]) {
    this.#x = prepareAxis(x, 'vertical');
    this.#y = prepareAxis(y, 'horizontal');
  }

  /** 画布边、用户 guide 与组件视觉包围盒（已排除选区与隐藏组件）。 */
  static fromScene(
    canvas: ScreenDocument['canvas'] | undefined,
    guides: { readonly x: readonly number[]; readonly y: readonly number[] },
    components: readonly DesignerSnapComponentBounds[],
  ): DesignerAlignmentIndex {
    // 没有画布时只吸附用户 guide（与候选收集一致）。
    if (canvas === undefined) {
      return new DesignerAlignmentIndex(
        guides.x.map((value) => globalLine(value, [], undefined)),
        guides.y.map((value) => globalLine(value, [], undefined)),
      );
    }
    const height: readonly [number, number] = [0, canvas.height];
    const width: readonly [number, number] = [0, canvas.width];
    const x: DesignerAlignmentLine[] = [
      globalLine(0, height, height),
      globalLine(canvas.width, height, height),
      ...guides.x.map((value) => globalLine(value, [], height)),
    ];
    const y: DesignerAlignmentLine[] = [
      globalLine(0, width, width),
      globalLine(canvas.height, width, width),
      ...guides.y.map((value) => globalLine(value, [], width)),
    ];
    for (const bounds of components) {
      const vertical: readonly [number, number] = [bounds.top, bounds.bottom];
      const horizontal: readonly [number, number] = [bounds.left, bounds.right];
      x.push(
        { value: bounds.left, points: vertical, span: undefined, extent: vertical },
        { value: bounds.centerX, points: [bounds.centerY], span: undefined, extent: vertical },
        { value: bounds.right, points: vertical, span: undefined, extent: vertical },
      );
      y.push(
        { value: bounds.top, points: horizontal, span: undefined, extent: horizontal },
        { value: bounds.centerY, points: [bounds.centerX], span: undefined, extent: horizontal },
        { value: bounds.bottom, points: horizontal, span: undefined, extent: horizontal },
      );
    }
    return new DesignerAlignmentIndex(x, y);
  }

  /** 直接给出的候选线（测试与无快照调用）：两端视为吸附点。 */
  static fromCandidates(candidates: DesignerSnapCandidates): DesignerAlignmentIndex {
    const axis = (list: DesignerSnapCandidates['x']): DesignerAlignmentLine[] =>
      list.map(({ value, start, size }) =>
        globalLine(value, size > 0 ? [start, start + size] : [], undefined),
      );
    return new DesignerAlignmentIndex(axis(candidates.x), axis(candidates.y));
  }

  /**
   * 各锚点 ± threshold 窗口内的去重坐标，按坐标升序——Moveable 竞争的输入与平局序。
   * 给出 focus 时，组件线须在 focus 的 reach 范围内（正交方向间距）。
   */
  query(
    posesX: readonly number[],
    posesY: readonly number[],
    threshold: number,
    focus?: DesignerSelectionSnapBounds,
    reach = Number.POSITIVE_INFINITY,
  ): readonly SnapGuideline[] {
    return [
      ...queryAxis(this.#x, posesX, threshold, near(focus, 'x', reach)),
      ...queryAxis(this.#y, posesY, threshold, near(focus, 'y', reach)),
    ];
  }

  /**
   * 与 bounds（点即退化矩形）在 tolerance 内精确重合的全部对齐，每个坐标一条参考线；
   * 只收集与 bounds 在正交方向间距 ≤ reach 的组件。
   */
  guides(
    bounds: DesignerSelectionSnapBounds,
    tolerance: number,
    reach = Number.POSITIVE_INFINITY,
  ): DesignerSnapGuides | undefined {
    const middleX = (bounds.left + bounds.right) / 2;
    const middleY = (bounds.top + bounds.bottom) / 2;
    const vertical = [bounds.top, bounds.bottom];
    const horizontal = [bounds.left, bounds.right];
    const x = axisGuides(
      this.#x.lines,
      [
        { value: bounds.left, points: vertical },
        { value: middleX, points: [middleY] },
        { value: bounds.right, points: vertical },
      ],
      tolerance,
      near(bounds, 'x', reach),
    );
    const y = axisGuides(
      this.#y.lines,
      [
        { value: bounds.top, points: horizontal },
        { value: middleY, points: [middleX] },
        { value: bounds.bottom, points: horizontal },
      ],
      tolerance,
      near(bounds, 'y', reach),
    );
    if (x.length === 0 && y.length === 0) return undefined;
    return { ...(x.length === 0 ? {} : { x }), ...(y.length === 0 ? {} : { y }) };
  }
}

function prepareAxis(
  lines: readonly DesignerAlignmentLine[],
  type: SnapGuideline['type'],
): DesignerAlignmentAxis {
  const sorted = lines
    .filter((line) => Number.isFinite(line.value))
    .map((line) => ({ ...line, points: line.points.filter(Number.isFinite) }))
    .sort((left, right) => left.value - right.value);
  const values: number[] = [];
  const lineValues: number[] = [];
  const guidelines: SnapGuideline[] = [];
  for (const line of sorted) {
    if (values.at(-1) !== line.value) {
      values.push(line.value);
      guidelines.push({
        type,
        direction: '',
        pos: type === 'vertical' ? [line.value, 0] : [0, line.value],
        size: 0,
      });
    }
    lineValues.push(values.length - 1);
  }
  return { lines: sorted, lineValues, values, guidelines };
}

function globalLine(
  value: number,
  points: readonly number[],
  span: readonly [number, number] | undefined,
): DesignerAlignmentLine {
  return { value, points, span, extent: undefined };
}

// x-axis lines are vertical: their component's extent is its top..bottom, so the reach is
// measured against the focus' vertical range (and vice versa).
function near(
  focus: DesignerSelectionSnapBounds | undefined,
  axis: 'x' | 'y',
  reach: number,
): DesignerAlignmentReach | undefined {
  if (focus === undefined || !(reach < Number.POSITIVE_INFINITY)) return undefined;
  return axis === 'x'
    ? { start: focus.top, end: focus.bottom, reach }
    : { start: focus.left, end: focus.right, reach };
}

function withinReach(line: DesignerAlignmentLine, reach: DesignerAlignmentReach | undefined) {
  if (reach === undefined || line.extent === undefined) return true;
  const gap = Math.max(0, line.extent[0] - reach.end, reach.start - line.extent[1]);
  return gap <= reach.reach;
}

function queryAxis(
  axis: DesignerAlignmentAxis,
  poses: readonly number[],
  threshold: number,
  reach: DesignerAlignmentReach | undefined,
): readonly SnapGuideline[] {
  if (!(threshold >= 0)) return [];
  const { lines, lineValues, guidelines } = axis;
  const matches = new Set<number>();
  for (const pose of poses) {
    if (Number.isNaN(pose)) continue;
    // Compare the same subtraction as Moveable, avoiding rounding differences at pose ± threshold.
    for (let index = lowerBound(lines, pose, threshold); index < lines.length; index++) {
      const line = lines[index]!;
      if (pose - line.value < -threshold) break;
      if (withinReach(line, reach)) matches.add(lineValues[index]!);
    }
  }
  return [...matches].sort((left, right) => left - right).map((index) => guidelines[index]!);
}

// First index whose value satisfies `pose - value <= window` (values ascending).
function lowerBound(
  values: readonly number[] | readonly DesignerAlignmentLine[],
  pose: number,
  window: number,
): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const entry = values[middle]!;
    const value = typeof entry === 'number' ? entry : entry.value;
    if (pose - value > window) low = middle + 1;
    else high = middle;
  }
  return low;
}

interface GuideGroup {
  readonly value: number;
  readonly markers: Set<number>;
  from: number;
  to: number;
}

function axisGuides(
  lines: readonly DesignerAlignmentLine[],
  anchors: readonly DesignerAlignmentAnchor[],
  tolerance: number,
  reach: DesignerAlignmentReach | undefined,
): DesignerSnapGuideLine[] {
  if (!(tolerance >= 0)) return [];
  const groups = new Map<number, GuideGroup>();
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.value)) continue;
    for (let index = lowerBound(lines, anchor.value, tolerance); index < lines.length; index++) {
      const line = lines[index]!;
      if (anchor.value - line.value < -tolerance) break;
      if (!withinReach(line, reach)) continue;
      let group = groups.get(line.value);
      if (group === undefined) {
        group = { value: line.value, markers: new Set(), from: Infinity, to: -Infinity };
        groups.set(line.value, group);
      }
      for (const point of [...line.points, ...anchor.points]) {
        if (!Number.isFinite(point)) continue;
        group.markers.add(point);
        group.from = Math.min(group.from, point);
        group.to = Math.max(group.to, point);
      }
      if (line.span !== undefined) {
        group.from = Math.min(group.from, line.span[0]);
        group.to = Math.max(group.to, line.span[1]);
      }
    }
  }
  return [...groups.values()]
    .filter((group) => group.from <= group.to)
    .sort((left, right) => left.value - right.value)
    .map((group) => ({
      value: group.value,
      start: group.from,
      size: group.to - group.from,
      points: [...group.markers].sort((left, right) => left - right),
    }));
}
