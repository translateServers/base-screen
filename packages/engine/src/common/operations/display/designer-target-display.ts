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
