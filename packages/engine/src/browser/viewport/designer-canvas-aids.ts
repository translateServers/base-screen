import type { ScreenDocument } from '@base-screen/contracts';
import { isScreenComponentEffectivelyHidden } from '@base-screen/core';
// 吸附竞争数学来自 vendored Moveable snappable（见 ADR-0020 与 common/vendor 的 MIT notice）：
// 每锚点 × 每候选 offset/dist + 阈值过滤 + 最近排序全部由上游 checkSnap 语义保证。
import {
  checkSnapPoses,
  getNearestSnapGuidelineInfo,
} from '../../common/vendor/moveable/snappable/snap.js';
import type { SnapGuideline, SnapInfo } from '../../common/vendor/moveable/types.js';

export const DESIGNER_GRID_SIZE = 24;
export const DESIGNER_SMART_GUIDE_THRESHOLD = 5;
// 吸附释放带倍率：吸附激活后偏离超过捕获阈值 × 此倍率才释放。
// 阈值边界（如 4.9↔5.1px）的微小移动不会反复吸附/脱离，参考 Moveable 的贴线保持语义。
export const DESIGNER_SNAP_RELEASE_MULTIPLIER = 1.6;
// 对齐线渲染阈值（px，文档坐标）：仅距离 ≤ 该值的命中才绘制参考线，
// 对应 Moveable 的 snapRenderThreshold（默认 1）——吸附（5px）与渲染（1px）分离，
// 接近阶段无线，几乎贴合时才出现线。
export const DESIGNER_SNAP_RENDER_THRESHOLD = 1;

export interface DesignerCanvasAidsState {
  readonly gridEnabled: boolean;
  readonly gridSnapEnabled: boolean;
  readonly smartGuidesEnabled: boolean;
}

export const DEFAULT_DESIGNER_CANVAS_AIDS: DesignerCanvasAidsState = {
  gridEnabled: true,
  gridSnapEnabled: true,
  smartGuidesEnabled: true,
};

/** 单个吸附候选：对齐坐标 + 参考线几何（起点与长度，参考 Moveable element guidelines 的局部线语义）。 */
export interface DesignerSnapCandidate {
  /** 对齐坐标（x 轴为 value，y 轴为 value）。 */
  readonly value: number;
  /** 参考线起点（正交方向，画布坐标）：组件边为其 top/left，画布/guide/网格线为 0。 */
  readonly start: number;
  /** 参考线长度：组件边为其正交尺寸（height/width），画布/guide/网格线为画布正交尺寸。 */
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

/** 单条智能对齐线（画布坐标）：供预览层绘制参考线、距离标签与吸附目标指示。 */
export interface DesignerSnapGuideLine {
  /** 对齐线坐标（x 轴为 value，y 轴为 value）。 */
  readonly value: number;
  /** 参考线起点（正交方向，可选）：undefined 表示全画布线（CSS 默认 top/left 0 + 铺满）。 */
  readonly start?: number | undefined;
  /** 参考线长度（可选）：undefined 表示全画布线。 */
  readonly size?: number | undefined;
  /** 被移动选区锚点与参考边的距离（绝对值，px）。 */
  readonly distance: number;
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
  /** 显示阈值内的全部智能对齐线（不含网格，网格吸附不绘制参考线）。 */
  readonly guides?: DesignerSnapGuides | undefined;
}

/** 单个轴向的吸附会话状态：记录当前吸附的目标与选区锚点，供后续帧做释放带保持与同锚点跟随。 */
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
    state,
    releaseThreshold,
    session?.x,
    'vertical',
  );
  const vertical = resolvePointAxis(
    point.y,
    result.horizontal,
    state,
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
  // x 轴候选：x 坐标 + 正交方向的起点/长度（垂直线沿 y 延伸）。
  const x: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: document.canvas.height },
    { value: document.canvas.width / 2, start: 0, size: document.canvas.height },
    { value: document.canvas.width, start: 0, size: document.canvas.height },
    ...guides.x.map((value) => ({ value, start: 0, size: document.canvas.height })),
  ];
  const y: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: document.canvas.width },
    { value: document.canvas.height / 2, start: 0, size: document.canvas.width },
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

// 单点（指针位置）吸附解析：智能参考线与网格按绝对距离统一竞争；
// 智能线未命中但仍在释放带内时保持上次吸附目标，避免阈值边界反复吸附/脱离。
function resolvePointAxis(
  raw: number,
  snap: SnapInfo,
  state: DesignerCanvasAidsState,
  releaseThreshold: number,
  previous: DesignerSnapSessionAxis | undefined,
  axis: 'vertical' | 'horizontal',
): AxisResolution {
  const smart = getNearestSnapGuidelineInfo(snap);
  const grid = state.gridSnapEnabled
    ? Math.round(raw / DESIGNER_GRID_SIZE) * DESIGNER_GRID_SIZE
    : undefined;
  if (smart.isSnap) {
    const smartDistance = smart.dist;
    if (grid !== undefined && Math.abs(grid - raw) < smartDistance) {
      return { value: grid, snapped: grid, next: undefined, guides: [] };
    }
    const value = smart.guideline!.pos[axis === 'vertical' ? 0 : 1]!;
    return { value, snapped: value, next: { value }, guides: [] };
  }
  if (previous !== undefined && Math.abs(previous.value - raw) <= releaseThreshold) {
    return { value: previous.value, snapped: previous.value, next: previous, guides: [] };
  }
  return { value: grid ?? raw, snapped: grid, next: undefined, guides: [] };
}

// 选区平移吸附解析：6 个锚点匹配候选；同锚点继续跟随（吸附目标未变时不切换到其他线/网格），
// 新锚点或首次命中与网格按绝对距离统一竞争，未命中时在释放带内保持上次吸附目标。
// 同时收集渲染阈值内的全部智能对齐线（每锚点 × 每候选，同值取最近；渲染阈值 1px，
// 对应 Moveable snapRenderThreshold——吸附 5px 与渲染分离，接近阶段无线）。
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
  const guides = state.smartGuidesEnabled ? collectGuideLines(snap, renderThreshold, axis) : [];
  const smart = nearestSnapHit(snap, anchors, axis);
  const gridAnchor = anchors[0]!;
  const grid = state.gridSnapEnabled
    ? Math.round((gridAnchor + translation) / DESIGNER_GRID_SIZE) * DESIGNER_GRID_SIZE
    : undefined;
  if (smart !== undefined) {
    if (previous?.anchor !== undefined && previous.anchor === smart.anchor) {
      return {
        value: smart.value - smart.anchor,
        snapped: smart.value,
        next: { anchor: smart.anchor, value: smart.value },
        guides,
      };
    }
    const smartDistance = smart.dist;
    if (grid !== undefined && Math.abs(grid - (gridAnchor + translation)) < smartDistance) {
      return { value: grid - gridAnchor, snapped: grid, next: undefined, guides };
    }
    return {
      value: smart.value - smart.anchor,
      snapped: smart.value,
      next: { anchor: smart.anchor, value: smart.value },
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
    value: grid === undefined ? translation : grid - gridAnchor,
    snapped: grid,
    next: undefined,
    guides,
  };
}

// 从上游 checkSnap 的最近命中取锚点/对齐值/距离（posInfos 已按最近距离排序）。
function nearestSnapHit(
  snap: SnapInfo,
  anchors: readonly number[],
  axis: 'vertical' | 'horizontal',
): { readonly anchor: number; readonly value: number; readonly dist: number } | undefined {
  const posInfo = snap.posInfos[0];
  const info = posInfo?.guidelineInfos[0];
  if (posInfo === undefined || info === undefined) return undefined;
  const posType = axis === 'vertical' ? 0 : 1;
  return {
    anchor: anchors[posInfo.index] ?? posInfo.pos,
    value: info.guideline.pos[posType]!,
    dist: info.dist,
  };
}

// 渲染阈值内的全部智能对齐线（来自上游 guidelineInfos，同值多条候选合并取最近距离、长度取更长者，
// 画布/网格线为全画布尺寸，视觉上覆盖组件局部线），按 value 升序。
function collectGuideLines(
  snap: SnapInfo,
  threshold: number,
  axis: 'vertical' | 'horizontal',
): readonly DesignerSnapGuideLine[] {
  const posType = axis === 'vertical' ? 0 : 1;
  const startType = axis === 'vertical' ? 1 : 0;
  const byValue = new Map<number, { distance: number; start: number; size: number }>();
  for (const posInfo of snap.posInfos) {
    for (const info of posInfo.guidelineInfos) {
      if (info.dist > threshold) continue;
      const guideline = info.guideline;
      const value = guideline.pos[posType]!;
      const nearest = byValue.get(value);
      if (
        nearest === undefined ||
        info.dist < nearest.distance ||
        (info.dist === nearest.distance && guideline.size > nearest.size)
      ) {
        byValue.set(value, {
          distance: info.dist,
          start: guideline.pos[startType]!,
          size: guideline.size,
        });
      }
    }
  }
  return [...byValue.entries()]
    .map(([value, info]) => ({
      value,
      start: info.start,
      size: info.size,
      distance: info.distance,
    }))
    .sort((left, right) => left.value - right.value);
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
  const centerX = component.position.x + component.size.width / 2;
  const centerY = component.position.y + component.size.height / 2;
  const radians = (component.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfWidth = (component.size.width * cosine + component.size.height * sine) / 2;
  const halfHeight = (component.size.width * sine + component.size.height * cosine) / 2;
  const left = normalizeCoordinate(centerX - halfWidth);
  const right = normalizeCoordinate(centerX + halfWidth);
  const top = normalizeCoordinate(centerY - halfHeight);
  const bottom = normalizeCoordinate(centerY + halfHeight);
  return {
    bottom,
    centerX: normalizeCoordinate(centerX),
    centerY: normalizeCoordinate(centerY),
    height: normalizeCoordinate(bottom - top),
    left,
    right,
    top,
    width: normalizeCoordinate(right - left),
  };
}

function normalizeCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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
