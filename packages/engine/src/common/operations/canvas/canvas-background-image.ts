// 画布背景图的宿主选择协议（ADR-0046）：Engine 只发 request 事件请宿主打开
// 自己的图片选择器，选图结果再经 commit 通道注入；本模块拥有请求体构建与失败关闭校验。

import type {
  ScreenCanvas,
  ScreenCanvasBackgroundImageFit,
  ScreenDiagnostic,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenCanvasPatch } from '@base-screen/core';

/** 面板背景图宿主选择请求事件（ADR-0046）：宿主监听后打开自己的图片选择弹出框，再经 commit 注入。 */
export const BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT =
  'base-screen-canvas-background-image-request';

export interface BaseScreenCanvasBackgroundImageRequest {
  readonly requestId: string;
  readonly instanceId: string;
  readonly documentRevision: string | null;
  readonly current: {
    readonly backgroundImage: string | null;
    readonly backgroundImageFit: ScreenCanvasBackgroundImageFit | null;
  };
}

export interface BaseScreenCanvasBackgroundImageRequestEventDetail {
  readonly request: BaseScreenCanvasBackgroundImageRequest;
}

/** 由当前文档构建宿主请求体（ADR-0046）：current 携带当前背景值（无则 null）。 */
export function buildCanvasBackgroundImageRequest(
  canvas: ScreenCanvas,
  instanceId: string,
  requestId: string,
  documentRevision: string | null,
): BaseScreenCanvasBackgroundImageRequest {
  return {
    requestId,
    instanceId,
    documentRevision,
    current: {
      backgroundImage: canvas.backgroundImage ?? null,
      backgroundImageFit: canvas.backgroundImageFit ?? null,
    },
  };
}

/** 背景图提交守卫（与 ADR-0028 作者桥守卫同构）：会话 kind 匹配且未过期才允许提交。 */
export function validateCanvasBackgroundImageCommitGuards(input: {
  readonly pendingKind: string | undefined;
  readonly disposed: boolean;
}): ScreenParseResult<null> {
  if (input.disposed) {
    return commitFailure(
      'AUTHORING_EXPIRED',
      ['requestId'],
      'Designer is unloaded or disposed; the background image session has expired.',
    );
  }
  if (input.pendingKind !== 'canvas-background-image') {
    return commitFailure(
      'AUTHORING_REQUEST_INVALID',
      ['requestId'],
      'Background image session is missing or no longer current.',
    );
  }
  return { ok: true, value: null, diagnostics: [] };
}

/**
 * 背景图 update-canvas patch（ADR-0043/0046）：`null` 清除背景并同时清除 fit；
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

function commitFailure(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<null> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code, path, message }],
  };
}
