// 拖动时的布局间距标注：只标选区四侧各自最近的一段空档（同排 / 同列、正交投影真实重叠）。
//
// 旧实现沿选区 left/center/right 三条对齐轨道，把轨道上每一对相邻组件的间距都标出来：
// 一列 8 个 16px 组件会同时画出 7 段读数，其中大部分与选区无关，密集场景下读数互相遮挡。
// 吸附本身只关心最近的一段，标注因此收敛到同一范围（Figma / Penpot 的最近邻取法）：
// 每侧最多一条，总计 ≤ 4。等间距标注由 DesignerSpacingIndex 单独负责。

import type { ScreenDocument } from '@base-screen/contracts';
import {
  DESIGNER_SNAP_RENDER_THRESHOLD,
  type DesignerCanvasMeasurement,
  type DesignerSelectionSnapBounds,
} from './designer-canvas-aids-types.js';
import { collectDesignerSnapComponentBounds } from './designer-canvas-snap-geometry.js';

/** 单侧最近空档：长度方向 from→to，position 是正交方向上的重叠中心。 */
interface SideGap {
  readonly distance: number;
  readonly from: number;
  readonly overlap: number;
  readonly position: number;
  readonly to: number;
}

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

/** Gesture path: built once per geometry snapshot, scanned per frame. */
export class DesignerCanvasMeasurementIndex {
  readonly #components: readonly DesignerSelectionSnapBounds[];

  constructor(components: readonly DesignerSelectionSnapBounds[]) {
    this.#components = components;
  }

  /** `reach` (document units) drops neighbours farther than it from the selection. */
  measure(
    selection: DesignerSelectionSnapBounds,
    zoom = 1,
    reach = Number.POSITIVE_INFINITY,
  ): readonly DesignerCanvasMeasurement[] {
    const tolerance = DESIGNER_SNAP_RENDER_THRESHOLD / Math.max(zoom, Number.EPSILON);
    let left: SideGap | undefined;
    let right: SideGap | undefined;
    let top: SideGap | undefined;
    let bottom: SideGap | undefined;
    for (const bounds of this.#components) {
      // A side is only measured against a neighbour that shares a real cross span with the
      // selection; meeting at an edge or corner is not a gap.
      const verticalStart = Math.max(selection.top, bounds.top);
      const verticalEnd = Math.min(selection.bottom, bounds.bottom);
      if (verticalEnd - verticalStart > tolerance) {
        left = closer(
          left,
          gapBetween(bounds.right, selection.left, verticalStart, verticalEnd, tolerance, reach),
        );
        right = closer(
          right,
          gapBetween(selection.right, bounds.left, verticalStart, verticalEnd, tolerance, reach),
        );
      }
      const horizontalStart = Math.max(selection.left, bounds.left);
      const horizontalEnd = Math.min(selection.right, bounds.right);
      if (horizontalEnd - horizontalStart > tolerance) {
        top = closer(
          top,
          gapBetween(
            bounds.bottom,
            selection.top,
            horizontalStart,
            horizontalEnd,
            tolerance,
            reach,
          ),
        );
        bottom = closer(
          bottom,
          gapBetween(
            selection.bottom,
            bounds.top,
            horizontalStart,
            horizontalEnd,
            tolerance,
            reach,
          ),
        );
      }
    }
    return [
      measurement('x', left),
      measurement('x', right),
      measurement('y', top),
      measurement('y', bottom),
    ].filter((item): item is DesignerCanvasMeasurement => item !== undefined);
  }
}

// `from`/`to` run along the measured axis; `crossStart..crossEnd` is the shared span that
// decides where the line and its reading sit.
function gapBetween(
  from: number,
  to: number,
  crossStart: number,
  crossEnd: number,
  tolerance: number,
  reach: number,
): SideGap | undefined {
  const distance = to - from;
  if (!(distance > tolerance) || distance > reach) return undefined;
  return {
    distance,
    from,
    to,
    overlap: crossEnd - crossStart,
    position: (crossStart + crossEnd) / 2,
  };
}

// Nearest wins; at equal distances the neighbour sharing more of the selection's span reads
// better, so it owns the mark (a row of equal-height items under a wide selection).
function closer(current: SideGap | undefined, next: SideGap | undefined): SideGap | undefined {
  if (next === undefined) return current;
  if (current === undefined) return next;
  if (next.distance !== current.distance) return next.distance < current.distance ? next : current;
  return next.overlap > current.overlap ? next : current;
}

function measurement(
  axis: DesignerCanvasMeasurement['axis'],
  gap: SideGap | undefined,
): DesignerCanvasMeasurement | undefined {
  return gap === undefined
    ? undefined
    : { axis, distance: gap.distance, from: gap.from, to: gap.to, position: gap.position };
}
