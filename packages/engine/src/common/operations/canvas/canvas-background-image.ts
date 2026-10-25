// 画布背景 patch helper（ADR-0077）：统一资源选择桥在 canvas-background 目标上复用。
// 宿主选择请求/提交不再走画布专用协议，见 host-resource-selection.ts。

import type { ScreenCanvasBackgroundImageFit } from '@base-screen/contracts';
import type { ScreenCanvasPatch } from '@base-screen/core';

/**
 * 背景图 update-canvas patch（ADR-0043/0089）：`null` 清除背景并同时清除 fit；
 * 设置图片未传 fit 保留既有 fit（无则渲染按 cover）。
 */
export function buildCanvasBackgroundImagePatch(
  backgroundImage: string | null,
  fit: ScreenCanvasBackgroundImageFit | undefined,
): ScreenCanvasPatch {
  if (backgroundImage === null) {
    return { backgroundImage: null, backgroundImageFit: null };
  }
  return fit === undefined ? { backgroundImage } : { backgroundImage, backgroundImageFit: fit };
}
