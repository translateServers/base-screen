import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenComponentBounds, isScreenComponentEffectivelyHidden } from '@base-screen/core';
// 吸附竞争数学来自 vendored Moveable snappable（见 ADR-0020 与 common/vendor 的 MIT notice）：
// 每锚点 × 每候选 offset/dist + 阈值过滤 + 最近排序全部由上游 checkSnap 语义保证。
import {
  checkSnapPoses,
  getNearestSnapGuidelineInfo,
} from '../../common/vendor/moveable/snappable/snap.js';
import type { SnapGuideline, SnapInfo } from '../../common/vendor/moveable/types.js';

export const DESIGNER_SMART_GUIDE_THRESHOLD = 5;
// 吸附保持范围倍率：1.0 = 捕获阈值本身（超出阈值立即释放），
// 对齐 Nebula/Moveable 的每帧重新判定语义（Moveable snapThreshold=5，无额外滞后带）。
export const DESIGNER_SNAP_RELEASE_MULTIPLIER = 1;
// 对齐线渲染阈值（px，文档坐标）：仅距离 ≤ 该值的命中才绘制参考线，
// 对应 Moveable 的 snapRenderThreshold（默认 1）——吸附（5px）与渲染（1px）分离，
// 接近阶段无线，几乎贴合时才出现线。
export const DESIGNER_SNAP_RENDER_THRESHOLD = 1;

export interface DesignerCanvasAidsState {
  readonly gridEnabled: boolean;
  readonly smartGuidesEnabled: boolean;
}

export const DEFAULT_DESIGNER_CANVAS_AIDS: DesignerCanvasAidsState = {
  gridEnabled: true,
  smartGuidesEnabled: true,
};

/** 单个吸附候选：对齐坐标 + 参考线几何（起点与长度，参考 Moveable element guidelines 的局部线语义）。 */
export interface DesignerSnapCandidate {
  /** 对齐坐标（x 轴为 value，y 轴为 value）。 */
  readonly value: number;
  /** 参考线起点（正交方向，画布坐标）：组件边为其 top/left，画布/guide 为 0。 */
  readonly start: number;
  /** 参考线长度：组件边为其正交尺寸（height/width），画布/guide 为画布正交尺寸。 */
  readonly size: number;
}

export interface DesignerSnapCandidates {
  readonly x: readonly DesignerSnapCandidate[];
  readonly y: readonly DesignerSnapCandidate[];
}

export interface DesignerSnapPoint {
  readonly x: number;
  readonly y: number;
  readonly snappedX?: number | undefined;
  readonly snappedY?: number | undefined;
}

/**
 * 选区对齐轨道上的可视间距：`axis` 表示长度方向，`position` 表示正交坐标。
 * 例如 `axis: 'y'` 从 `from` 到 `to` 的竖线位于 `position` 的 x 坐标。
 */
export interface DesignerCanvasMeasurement {
  readonly axis: 'x' | 'y';
  readonly distance: number;
  readonly from: number;
  readonly position: number;
  readonly to: number;
}

export type DesignerSnapPreview = DesignerSnapPoint &
  Pick<DesignerSnapTranslation, 'guides' | 'measurements'>;

/** 单条智能对齐线（画布坐标）：供预览层绘制参考线与吸附目标指示。 */
export interface DesignerSnapGuideLine {
  /** 对齐线坐标（x 轴为 value，y 轴为 value）。 */
  readonly value: number;
  /** 参考线起点（正交方向，可选）：undefined 表示全画布线（CSS 默认 top/left 0 + 铺满）。 */
  readonly start?: number | undefined;
  /** 参考线长度（可选）：undefined 表示全画布线。 */
  readonly size?: number | undefined;
}

export interface DesignerSnapGuides {
  readonly x?: readonly DesignerSnapGuideLine[] | undefined;
  readonly y?: readonly DesignerSnapGuideLine[] | undefined;
}

export interface DesignerSnapTranslation {
  readonly x: number;
  readonly y: number;
  readonly snappedX?: number | undefined;
  readonly snappedY?: number | undefined;
  /** 显示阈值内的最近一条智能对齐线。 */
  readonly guides?: DesignerSnapGuides | undefined;
  /** 选区对齐轨道上的相邻组件间距，仅作为覆盖层视觉反馈。 */
  readonly measurements?: readonly DesignerCanvasMeasurement[] | undefined;
}

/** 单个轴向的吸附会话状态：记录当前吸附的目标与选区锚点，供后续帧做阈值内保持与同锚点跟随。 */
export interface DesignerSnapSessionAxis {
  readonly anchor?: number | undefined;
  readonly value: number;
}

/** 吸附会话状态（每轴独立），由调用方在每个手势会话内持有并传入吸附函数。 */
export interface DesignerSnapSession {
  x?: DesignerSnapSessionAxis | undefined;
  y?: DesignerSnapSessionAxis | undefined;
}

export interface DesignerSelectionSnapBounds {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface DesignerRulerMark {
  readonly label: string;
  readonly position: number;
  readonly value: number;
}

export interface DesignerRulerOptions {
  readonly devicePixelRatio: number;
  readonly length: number;
  readonly origin: number;
  readonly zoom: number;
  /** 可选：覆盖默认刻度间距（Nebula 语义：max(1, floor(50 / zoom)) 画布单位）。 */
  readonly increment?: number | undefined;
}

export function snapDesignerCanvasPoint(
  point: { readonly x: number; readonly y: number },
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapCandidates = { x: [], y: [] },
  zoom = 1,
  session?: DesignerSnapSession,
): DesignerSnapPoint {
  const threshold = DESIGNER_SMART_GUIDE_THRESHOLD / Math.max(zoom, Number.EPSILON);
  const releaseThreshold = DESIGNER_SNAP_RELEASE_MULTIPLIER * threshold;
  const guidelines = state.smartGuidesEnabled ? toSnapGuidelines(candidates) : [];
  const result = checkSnapPoses(
    guidelines,
    [point.x],
    [point.y],
    [],
    [],
    threshold,
    threshold,
    [1, 1],
  );
  const horizontal = resolvePointAxis(
    point.x,
    result.vertical,
    releaseThreshold,
    session?.x,
    'vertical',
  );
  const vertical = resolvePointAxis(
    point.y,
    result.horizontal,
    releaseThreshold,
    session?.y,
    'horizontal',
  );
  if (session !== undefined) {
    session.x = horizontal.next;
    session.y = vertical.next;
  }
  return {
    x: horizontal.value,
    y: vertical.value,
    ...(horizontal.snapped === undefined ? {} : { snappedX: horizontal.snapped }),
    ...(vertical.snapped === undefined ? {} : { snappedY: vertical.snapped }),
  };
}

export function snapDesignerSelectionTranslation(
  bounds: DesignerSelectionSnapBounds,
  translation: { readonly x: number; readonly y: number },
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapCandidates = { x: [], y: [] },
  zoom = 1,
  session?: DesignerSnapSession,
): DesignerSnapTranslation {
  const threshold = DESIGNER_SMART_GUIDE_THRESHOLD / Math.max(zoom, Number.EPSILON);
  const releaseThreshold = DESIGNER_SNAP_RELEASE_MULTIPLIER * threshold;
  const renderThreshold = DESIGNER_SNAP_RENDER_THRESHOLD / Math.max(zoom, Number.EPSILON);
  const guidelines = state.smartGuidesEnabled ? toSnapGuidelines(candidates) : [];
  const xAnchors = [bounds.left, (bounds.left + bounds.right) / 2, bounds.right];
  const yAnchors = [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom];
  const result = checkSnapPoses(
    guidelines,
    xAnchors.map((anchor) => anchor + translation.x),
    yAnchors.map((anchor) => anchor + translation.y),
    ['start', 'center', 'end'],
    ['start', 'center', 'end'],
    threshold,
    threshold,
    [1, 1],
  );
  const horizontal = resolveSelectionAxis(
    xAnchors,
    translation.x,
    result.vertical,
    state,
    releaseThreshold,
    renderThreshold,
    session?.x,
    'vertical',
  );
  const vertical = resolveSelectionAxis(
    yAnchors,
    translation.y,
    result.horizontal,
    state,
    releaseThreshold,
    renderThreshold,
    session?.y,
    'horizontal',
  );
  if (session !== undefined) {
    session.x = horizontal.next;
    session.y = vertical.next;
  }
  return {
    x: horizontal.value,
    y: vertical.value,
    ...(horizontal.snapped === undefined ? {} : { snappedX: horizontal.snapped }),
    ...(vertical.snapped === undefined ? {} : { snappedY: vertical.snapped }),
    ...(horizontal.guides.length === 0 && vertical.guides.length === 0
      ? {}
      : {
          guides: {
            ...(horizontal.guides.length === 0 ? {} : { x: horizontal.guides }),
            ...(vertical.guides.length === 0 ? {} : { y: vertical.guides }),
          },
        }),
  };
}

export function collectDesignerSnapCandidates(
  document: ScreenDocument,
  guides: { readonly x: readonly number[]; readonly y: readonly number[] },
  excludedComponentIds: readonly string[] = [],
): DesignerSnapCandidates {
  const excluded = new Set(excludedComponentIds);
  // x 轴候选：画布边（0/宽）+ 用户 guide + 组件边（不含画布中心点候选）。
  const x: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: document.canvas.height },
    { value: document.canvas.width, start: 0, size: document.canvas.height },
    ...guides.x.map((value) => ({ value, start: 0, size: document.canvas.height })),
  ];
  const y: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: document.canvas.width },
    { value: document.canvas.height, start: 0, size: document.canvas.width },
    ...guides.y.map((value) => ({ value, start: 0, size: document.canvas.width })),
  ];
  for (const component of document.components) {
    if (excluded.has(component.id) || isScreenComponentEffectivelyHidden(document, component.id)) {
      continue;
    }
    const bounds = componentSnapBounds(component);
    x.push(
      { value: bounds.left, start: bounds.top, size: bounds.height },
      { value: bounds.centerX, start: bounds.top, size: bounds.height },
      { value: bounds.right, start: bounds.top, size: bounds.height },
    );
    y.push(
      { value: bounds.top, start: bounds.left, size: bounds.width },
      { value: bounds.centerY, start: bounds.left, size: bounds.width },
      { value: bounds.bottom, start: bounds.left, size: bounds.width },
    );
  }
  return { x: sortedUniqueCandidates(x), y: sortedUniqueCandidates(y) };
}

export function getDesignerRulerMarks(options: DesignerRulerOptions): readonly DesignerRulerMark[] {
  const { devicePixelRatio, length, origin, zoom } = options;
  if (!Number.isFinite(length) || !Number.isFinite(origin) || length <= 0 || zoom <= 0) {
    return [];
  }
  const increment = options.increment ?? rulerIncrement(zoom);
  const first = Math.ceil(-origin / zoom / increment) * increment;
  const last = Math.floor((length - origin) / zoom / increment) * increment;
  const pixelRatio = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);
  const precision = 10 ** Math.max(0, -Math.floor(Math.log10(increment)));
  const marks: DesignerRulerMark[] = [];
  for (let value = first; value <= last && marks.length < 200; value += increment) {
    const roundedValue = Math.round(value * precision) / precision;
    const normalizedValue = roundedValue === 0 ? 0 : roundedValue;
    const position = Math.round((origin + normalizedValue * zoom) * pixelRatio) / pixelRatio;
    marks.push({ label: String(normalizedValue), position, value: normalizedValue });
  }
  return marks;
}

interface AxisResolution {
  readonly guides: readonly DesignerSnapGuideLine[];
  readonly next: DesignerSnapSessionAxis | undefined;
  readonly snapped: number | undefined;
  readonly value: number;
}

interface SelectionSnapHit {
  readonly anchor: number;
  readonly distance: number;
  readonly guideline: SnapGuideline;
  readonly value: number;
}

// 候选 → 上游 SnapGuideline：垂直线的 pos=[对齐坐标, 正交起点]、水平线相反，size 为参考线长度。
// 数组顺序保留调用方顺序（上游 checkSnap 对同距离命中按数组序取首个，生产路径候选已按值升序）。
function toSnapGuidelines(candidates: DesignerSnapCandidates): SnapGuideline[] {
  const guidelines: SnapGuideline[] = [];
  for (const candidate of candidates.x) {
    guidelines.push({
      type: 'vertical',
      direction: '',
      pos: [candidate.value, candidate.start],
      size: candidate.size,
    });
  }
  for (const candidate of candidates.y) {
    guidelines.push({
      type: 'horizontal',
      direction: '',
      pos: [candidate.start, candidate.value],
      size: candidate.size,
    });
  }
  return guidelines;
}

// 单点（指针位置）吸附解析：智能参考线未命中但仍在捕获阈值内时保持上次吸附目标
// （×1.0，超出阈值即释放，对齐 Nebula 每帧判定）。
function resolvePointAxis(
  raw: number,
  snap: SnapInfo,
  releaseThreshold: number,
  previous: DesignerSnapSessionAxis | undefined,
  axis: 'vertical' | 'horizontal',
): AxisResolution {
  const smart = getNearestSnapGuidelineInfo(snap);
  if (smart.isSnap) {
    const value = smart.guideline!.pos[axis === 'vertical' ? 0 : 1]!;
    return {
      value,
      snapped: value,
      next: { value },
      guides: [],
    };
  }
  if (previous !== undefined && Math.abs(previous.value - raw) <= releaseThreshold) {
    return {
      value: previous.value,
      snapped: previous.value,
      next: previous,
      guides: [],
    };
  }
  return {
    value: raw,
    snapped: undefined,
    next: undefined,
    guides: [],
  };
}

// 选区平移吸附解析：6 个锚点匹配候选；同锚点继续跟随，未命中时在捕获阈值内保持上次吸附目标。
// 仅在本帧确实修正位置时绘制渲染阈值内的最近智能对齐线；已精确重合的边界会保留吸附，
// 但不再以贯穿画布的蓝线重复提示（吸附 5px 与渲染 1px 仍分离）。
function resolveSelectionAxis(
  anchors: readonly number[],
  translation: number,
  snap: SnapInfo,
  state: DesignerCanvasAidsState,
  releaseThreshold: number,
  renderThreshold: number,
  previous: DesignerSnapSessionAxis | undefined,
  axis: 'vertical' | 'horizontal',
): AxisResolution {
  const smart = nearestSnapHit(snap, anchors, axis);
  const guides = state.smartGuidesEnabled ? collectGuideLines(smart, renderThreshold, axis) : [];
  if (smart !== undefined) {
    if (previous?.anchor !== undefined && previous.anchor === smart.anchor) {
      return {
        value: smart.value - smart.anchor,
        snapped: smart.value,
        next: {
          anchor: smart.anchor,
          value: smart.value,
        },
        guides,
      };
    }
    return {
      value: smart.value - smart.anchor,
      snapped: smart.value,
      next: {
        anchor: smart.anchor,
        value: smart.value,
      },
      guides,
    };
  }
  if (
    previous?.anchor !== undefined &&
    Math.abs(previous.value - (previous.anchor + translation)) <= releaseThreshold
  ) {
    return {
      value: previous.value - previous.anchor,
      snapped: previous.value,
      next: previous,
      guides,
    };
  }
  return {
    value: translation,
    snapped: undefined,
    next: undefined,
    guides,
  };
}

// 从上游 checkSnap 的最近命中取锚点/对齐值/距离（posInfos 已按最近距离排序）。
function nearestSnapHit(
  snap: SnapInfo,
  anchors: readonly number[],
  axis: 'vertical' | 'horizontal',
): SelectionSnapHit | undefined {
  const posInfo = snap.posInfos[0];
  const info = posInfo?.guidelineInfos[0];
  if (posInfo === undefined || info === undefined) return undefined;
  const posType = axis === 'vertical' ? 0 : 1;
  return {
    anchor: anchors[posInfo.index] ?? posInfo.pos,
    distance: info.dist,
    guideline: info.guideline,
    value: info.guideline.pos[posType]!,
  };
}

// 渲染阈值内的吸附线：每轴只输出实际赢得本次吸附的最近一条，避免其他巧合重合线混入。
// 零距离代表选区原本就与候选边界/中心重合，并未发生位置修正，因此不输出视觉辅助线。
function collectGuideLines(
  hit: SelectionSnapHit | undefined,
  threshold: number,
  axis: 'vertical' | 'horizontal',
): readonly DesignerSnapGuideLine[] {
  if (hit === undefined || hit.distance <= Number.EPSILON || hit.distance > threshold) return [];
  const startType = axis === 'vertical' ? 1 : 0;
  return [
    {
      size: hit.guideline.size,
      start: hit.guideline.pos[startType]!,
      value: hit.value,
    },
  ];
}

function rulerIncrement(zoom: number): number {
  const target = 48 / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 5, 10].find((factor) => factor * magnitude >= target) ?? 10) * magnitude;
}

function componentSnapBounds(component: ScreenDocument['components'][number]): {
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
} {
  // Selection rendering and snapping must use the same Core geometry. Keeping a second
  // rotation formula here caused sub-pixel drift between the outline and the snap anchors.
  const visual = getScreenComponentBounds(component);
  const centerX = component.position.x + component.size.width / 2;
  const centerY = component.position.y + component.size.height / 2;
  const left = visual.left;
  const right = visual.right;
  const top = visual.top;
  const bottom = visual.bottom;
  return {
    bottom,
    centerX,
    centerY,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

// 同值候选合并（长度取更长者），按 value 升序；过滤非有限值。
function sortedUniqueCandidates(
  candidates: readonly DesignerSnapCandidate[],
): readonly DesignerSnapCandidate[] {
  const byValue = new Map<number, DesignerSnapCandidate>();
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.value)) continue;
    const existing = byValue.get(candidate.value);
    if (existing === undefined || candidate.size > existing.size) {
      byValue.set(candidate.value, candidate);
    }
  }
  return [...byValue.values()].sort((left, right) => left.value - right.value);
}
