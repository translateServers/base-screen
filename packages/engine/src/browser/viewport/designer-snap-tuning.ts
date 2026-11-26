// 动态吸附参数：同一屏内可对齐的组件越多，捕获窗口与邻近范围越小。
//
// 固定参数在两种场景下都别扭：稀疏布局需要 6px / 180px 才够「跟手」，而密集画布里每条边
// 附近都有线，6px 等于永远被吸住；180px 的邻近范围又会把整片画布的组件拉进参考线、
// 等间距和间距标注。这里按选区周围（四周各扩两个基础邻近范围）的组件数把两个参数连续
// 收紧，稀疏布局（≤ CROWDING_START 个邻居）完全保持原值。
//
// 只改参与吸附的范围，不改竞争与平局规则（仍由 vendored Moveable checkSnapPoses 决定）。

import {
  DESIGNER_SMART_GUIDE_THRESHOLD,
  DESIGNER_SNAP_REACH,
  type DesignerSelectionSnapBounds,
} from './designer-canvas-aids-types.js';

/** 邻居不超过该数量视为稀疏布局，完全沿用基础参数。 */
const CROWDING_START = 4;
/** 邻居再增加该数量时达到最密；与 START 一起构成连续过渡的区间。 */
const CROWDING_RANGE = 10;
/** 密度窗口 = 基础邻近范围的该倍数（屏幕上的 360 × 360，约等于一屏可见区）。 */
const CROWDING_RADIUS = 2;
/** 最密时捕获窗口缩到的比例（6 → 3.6 屏幕 px）。 */
const THRESHOLD_FLOOR = 0.6;
/** 最密时邻近范围缩到的比例（180 → 81 屏幕 px）：同一行/列的邻居仍在，远距离巧合被丢掉。 */
const REACH_FLOOR = 0.45;

/** 一帧内使用的吸附参数，均为文档坐标（已按 zoom 换算）。 */
export interface DesignerSnapTuning {
  /** 捕获阈值：锚点与目标线相差多少文档像素内才吸附。 */
  readonly threshold: number;
  /** 邻近范围：组件与拖动几何在正交方向超过它就不参与参考线 / 等间距 / 标注。 */
  readonly reach: number;
}

/**
 * 按选区周围的组件密度求吸附参数。`focus` 是拖动几何（吸附前的位置）；
 * 没有几何（纯点吸附且调用方不提供包围盒）时直接用基础值。
 */
export function resolveDesignerSnapTuning(
  components: readonly DesignerSelectionSnapBounds[],
  focus: DesignerSelectionSnapBounds | undefined,
  zoom: number,
): DesignerSnapTuning {
  const scale = Math.max(zoom, Number.EPSILON);
  const threshold = DESIGNER_SMART_GUIDE_THRESHOLD / scale;
  const reach = DESIGNER_SNAP_REACH / scale;
  if (focus === undefined || components.length <= CROWDING_START) return { threshold, reach };
  const radius = reach * CROWDING_RADIUS;
  let neighbours = 0;
  for (const bounds of components) {
    if (bounds.right < focus.left - radius || bounds.left > focus.right + radius) continue;
    if (bounds.bottom < focus.top - radius || bounds.top > focus.bottom + radius) continue;
    neighbours += 1;
  }
  if (neighbours <= CROWDING_START) return { threshold, reach };
  const crowding = smoothstep(Math.min(1, (neighbours - CROWDING_START) / CROWDING_RANGE));
  return {
    threshold: threshold * (1 - (1 - THRESHOLD_FLOOR) * crowding),
    reach: reach * (1 - (1 - REACH_FLOOR) * crowding),
  };
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
