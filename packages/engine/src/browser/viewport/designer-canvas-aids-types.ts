export const DESIGNER_SMART_GUIDE_THRESHOLD = 5;
// 吸附保持范围倍率：1.0 = 捕获阈值本身（超出阈值立即释放），
// 对齐 Nebula/Moveable 的每帧重新判定语义（Moveable snapThreshold=5，无额外滞后带）。
export const DESIGNER_SNAP_RELEASE_MULTIPLIER = 1;
// 对齐线渲染阈值（屏幕 px，按 zoom 换算成文档坐标）：仅距离 ≤ 该值的命中才绘制参考线，
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

export interface DesignerSnapPoint {
  readonly guides?: DesignerSnapGuides | undefined;
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
