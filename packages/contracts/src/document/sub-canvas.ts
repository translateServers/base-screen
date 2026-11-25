import type { ScreenDocument, ScreenPopupAnchor } from '../types/document.js';

/** 弹框面板的九个锚点（ADR-0108 §2.6），按「上中下 × 左中右」排列，作者面据此画九宫格。 */
export const SCREEN_POPUP_ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const satisfies readonly ScreenPopupAnchor[];

/**
 * 面板左上角在画布上的位置：面板的锚点对齐画布的同名锚点，再加偏移。
 * 运行时（renderer）与作者面（engine 的位置预览）共用这一个换算，避免两边口径漂移。
 */
export function resolveScreenPopupPosition(
  canvas: { readonly width: number; readonly height: number },
  panel: { readonly width: number; readonly height: number },
  placement: {
    readonly anchor: ScreenPopupAnchor;
    readonly offsetX: number;
    readonly offsetY: number;
  } = {
    anchor: 'center',
    offsetX: 0,
    offsetY: 0,
  },
): { readonly x: number; readonly y: number } {
  const anchor = placement.anchor;
  const column = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 2 : 1;
  const row = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 2 : 1;
  const x = (column / 2) * (canvas.width - panel.width) + placement.offsetX;
  const y = (row / 2) * (canvas.height - panel.height) + placement.offsetY;
  return { x, y };
}

/**
 * 起始页（ADR-0109 §2.3）：`startCanvasId` 指向的页面，缺省取第一个页面；文档没有页面时为 `null`。
 * 查看器与设计器预览共用这一个口径。
 */
export function resolveScreenStartPageId(
  document: Pick<ScreenDocument, 'subCanvases' | 'startCanvasId'>,
): string | null {
  const pages = (document.subCanvases ?? []).filter((canvas) => canvas.display === 'page');
  const start = pages.find((canvas) => canvas.id === document.startCanvasId);
  return (start ?? pages[0])?.id ?? null;
}
