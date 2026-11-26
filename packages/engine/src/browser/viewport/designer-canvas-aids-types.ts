// 吸附捕获阈值（屏幕 px，按 zoom 换算成文档坐标），对齐吸附与等间距吸附共用。参考值：
// Moveable 5、Grida 5–6、tldraw / Excalidraw 8、Penpot 10（research/canvas-snap-guides-2026-11-22.md）。
// 8 在加入等间距候选后手感偏“黏”，取 6。密集布局由 designer-snap-tuning.ts 动态收紧。
export const DESIGNER_SMART_GUIDE_THRESHOLD = 6;
// 吸附保持范围倍率：1.0 = 捕获阈值本身（超出阈值立即释放），
// 对齐 Moveable / Penpot 的每帧重新判定语义（无额外滞后带）。
export const DESIGNER_SNAP_RELEASE_MULTIPLIER = 1;
// 吸附邻近范围（屏幕 px，按 zoom 换算成文档坐标）：组件只有在其与拖动几何在正交方向的
// 间距 ≤ 该值时才参与吸附、参考线、等间距与间距标注；等间距本身也不超过该值。对应 Moveable
// maxSnapElementGuidelineDistance / maxSnapElementGapDistance（默认不限）。大屏设计器通常
// 整张画布都在视口内，只靠视口过滤（tldraw / Penpot）不能约束范围，因此另设此上限。
// 画布边与用户 guide 不受此限。这是稀疏布局的基础值，密集布局由 designer-snap-tuning.ts 收紧。
export const DESIGNER_SNAP_REACH = 180;
// 间距标注判定“同轨道 / 已重合”的容差（屏幕 px，按 zoom 换算成文档坐标）。
export const DESIGNER_SNAP_RENDER_THRESHOLD = 1;
// 参考线重合容差（屏幕 px，按 zoom 换算成文档坐标）：吸附完成后，按最终几何重新收集
// 与之精确重合的对齐（Penpot ±0.5px；tldraw / Excalidraw 为零偏移），每个坐标画一条线，
// 覆盖该坐标上全部吸附点。贴角时两轴各一条，已对齐但这次未修正的边同样显示。
export const DESIGNER_SNAP_ALIGNMENT_TOLERANCE = 0.5;

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
 * 选区周边的可视间距：`axis` 表示长度方向，`position` 表示正交坐标。
 * 例如 `axis: 'y'` 从 `from` 到 `to` 的竖线位于 `position` 的 x 坐标。
 */
export interface DesignerCanvasMeasurement {
  readonly axis: 'x' | 'y';
  readonly distance: number;
  readonly from: number;
  readonly position: number;
  readonly to: number;
  /** `equal`：与同排其它间距精确相等的等间距标注；缺省为选区四侧最近的一段间距。 */
  readonly kind?: 'equal' | undefined;
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
  /** 线上各吸附点的正交坐标（目标与被拖几何），供绘制 × 标记。 */
  readonly points?: readonly number[] | undefined;
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
  /** 吸附后与最终几何精确重合的对齐线（每个坐标一条）。 */
  readonly guides?: DesignerSnapGuides | undefined;
  /** 选区四侧最近间距（kind 缺省）或等间距标注，仅作为覆盖层视觉反馈。 */
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
