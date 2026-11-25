import type { ScreenTargetDisplayProfile } from '@base-screen/contracts';

/**
 * 可读性下限的判定依据：字高（cap height）不小于观距的 1/200；字号（em）约等于字高的 1.5 倍。
 *
 * 放在 core 而不是 engine：示例后端与 MCP 工具面只能加载 contracts 与 core，生成产物的硬校验
 * （ADR-0112 §2.2）与设计器的目标屏面板必须用同一份换算。
 */
const LEGIBLE_CAP_TO_DISTANCE = 1 / 200;
const FONT_SIZE_TO_CAP = 1.5;

/** 没有目标屏参数时的默认下限：1920 宽画布上 16px，按画布宽度等比换算。 */
const DEFAULT_FONT_FLOOR_PX = 16;
const DEFAULT_FONT_FLOOR_CANVAS_WIDTH = 1920;

/** 最小可读字号：观距决定字高，点间距把毫米换回逻辑像素。缺参数时返回 null，不做猜测。 */
export function computeMinimumLegibleFontPx(profile: ScreenTargetDisplayProfile): number | null {
  const distanceM = profile.viewingDistanceM;
  const pitch = profile.pixelPitchMm;
  if (distanceM === undefined || !(distanceM > 0) || pitch === undefined || !(pitch > 0)) {
    return null;
  }
  const capMm = distanceM * 1000 * LEGIBLE_CAP_TO_DISTANCE;
  return (capMm * FONT_SIZE_TO_CAP) / pitch;
}

/**
 * 生成产物的字号下限：有目标屏参数时用 `computeMinimumLegibleFontPx`，否则按画布宽度换算默认值。
 * 静态审计（`auditScreenLayout`）与渲染探针共用这一个口径。
 */
export function resolveScreenFontFloorPx(
  canvasWidth: number,
  targetDisplay?: ScreenTargetDisplayProfile,
): number {
  const fromDisplay =
    targetDisplay === undefined ? null : computeMinimumLegibleFontPx(targetDisplay);
  if (fromDisplay !== null) return fromDisplay;
  const width = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 0;
  return (DEFAULT_FONT_FLOOR_PX * width) / DEFAULT_FONT_FLOOR_CANVAS_WIDTH;
}
