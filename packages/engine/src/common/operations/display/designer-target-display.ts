import type { ScreenTargetDisplayProfile } from '@base-screen/contracts';

export type DesignerDisplayOverlayKind = 'safe-area' | 'seam' | 'distance';

export interface DesignerDisplayRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DesignerDisplaySeam {
  readonly axis: 'x' | 'y';
  readonly at: number;
  readonly size: number;
}

export interface DesignerDisplayOverlay {
  readonly safeArea: DesignerDisplayRect | null;
  readonly seams: readonly DesignerDisplaySeam[];
  readonly distanceLabel: string | null;
}

const HAIRLINE = 1;

/**
 * 可读性下限的判定依据：字高（cap height）不小于观距的 1/200；
 * 字号（em）约等于字高的 1.5 倍。两个常量集中在这里，测试逐值比对，
 * 不散落在文案或宿主代码里。
 */
const LEGIBLE_CAP_TO_DISTANCE = 1 / 200;
const FONT_SIZE_TO_CAP = 1.5;

export interface DesignerDisplayPhysicalSize {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly pixelPitchMm: number;
}

export interface DesignerDisplayAngularSize {
  readonly horizontalDeg: number;
  readonly verticalDeg: number;
}

/** 目标屏的验收读数：宿主与面板都读这一份，不各自换算。 */
export interface DesignerDisplayMetrics {
  readonly physical: DesignerDisplayPhysicalSize | null;
  readonly angular: DesignerDisplayAngularSize | null;
  readonly minimumLegibleFontPx: number | null;
  readonly brightnessCdM2: number | undefined;
  readonly ambientLux: number | undefined;
}

export interface DesignerDisplayReadability {
  /** 按点间距与观距算出的最小可读字号（逻辑像素）。 */
  readonly requiredFontPx: number;
  /** 画布上实际的最小字号；未测量时为 null。 */
  readonly actualFontPx: number | null;
  readonly ok: boolean;
}

/** 物理尺寸：逻辑像素 × 点间距。缺参数时返回 null，不做猜测。 */
export function computePhysicalSize(
  profile: ScreenTargetDisplayProfile,
  canvas: { readonly width: number; readonly height: number },
): DesignerDisplayPhysicalSize | null {
  const pitch = profile.pixelPitchMm;
  if (pitch === undefined || !(pitch > 0)) return null;
  return {
    widthMm: canvas.width * pitch,
    heightMm: canvas.height * pitch,
    pixelPitchMm: pitch,
  };
}

/** 角尺寸：从观距看过去屏幕占多大视角。缺观距或点间距时返回 null。 */
export function computeAngularSize(
  profile: ScreenTargetDisplayProfile,
  canvas: { readonly width: number; readonly height: number },
): DesignerDisplayAngularSize | null {
  const distanceM = profile.viewingDistanceM;
  const physical = computePhysicalSize(profile, canvas);
  if (physical === null || distanceM === undefined || !(distanceM > 0)) return null;
  const distanceMm = distanceM * 1000;
  return {
    horizontalDeg: toDegrees(2 * Math.atan(physical.widthMm / 2 / distanceMm)),
    verticalDeg: toDegrees(2 * Math.atan(physical.heightMm / 2 / distanceMm)),
  };
}

/** 最小可读字号：观距决定字高，点间距把毫米换回逻辑像素。 */
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
 * 可读性判定：信息项，不是守卫。
 *
 * 报告把「可读性下限」列为硬约束，但守卫层只有对比度一项；这里给出结论与
 * 两个数值，由目标屏面板展示，不阻断采纳。
 */
export function evaluateDisplayReadability(
  profile: ScreenTargetDisplayProfile,
  measuredMinFontPx: number | null,
): DesignerDisplayReadability | null {
  const required = computeMinimumLegibleFontPx(profile);
  if (required === null) return null;
  if (measuredMinFontPx === null || !(measuredMinFontPx > 0)) {
    return { requiredFontPx: round1(required), actualFontPx: null, ok: true };
  }
  return {
    requiredFontPx: round1(required),
    actualFontPx: measuredMinFontPx,
    ok: measuredMinFontPx >= required,
  };
}

function toDegrees(radians: number): number {
  return round1((radians * 180) / Math.PI);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 目标屏叠加的纯几何：只根据「物理呈现参数 + 画布逻辑尺寸」计算矩形与拼缝位置。
 * 不读 DOM、不写文档——叠加是渲染辅助，不是画布内容。
 */
export function computeDisplayOverlay(
  profile: ScreenTargetDisplayProfile,
  canvas: { readonly width: number; readonly height: number },
  toggles: ReadonlySet<DesignerDisplayOverlayKind>,
): DesignerDisplayOverlay {
  const columns = Math.max(1, Math.floor(profile.columns));
  const rows = Math.max(1, Math.floor(profile.rows));
  const seamSize = Math.max(HAIRLINE, profile.seamPx ?? HAIRLINE);
  const safeInset = Math.max(0, profile.safeAreaPx ?? 0);
  const safeArea =
    toggles.has('safe-area') && safeInset > 0
      ? {
          x: safeInset,
          y: safeInset,
          width: Math.max(0, canvas.width - safeInset * 2),
          height: Math.max(0, canvas.height - safeInset * 2),
        }
      : null;
  const seams: DesignerDisplaySeam[] = [];
  if (toggles.has('seam')) {
    for (let index = 1; index < columns; index++) {
      seams.push({ axis: 'x', at: (canvas.width / columns) * index, size: seamSize });
    }
    for (let index = 1; index < rows; index++) {
      seams.push({ axis: 'y', at: (canvas.height / rows) * index, size: seamSize });
    }
  }
  const distance = profile.viewingDistanceM;
  const distanceLabel =
    toggles.has('distance') && distance !== undefined && distance > 0 ? `${distance} m` : null;
  return { safeArea, seams, distanceLabel };
}
