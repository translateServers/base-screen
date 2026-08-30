// 标尺渲染：把 designer-canvas-ruler.ts 的刻度序列绘制到横竖两个 canvas 上，
// 含 devicePixelRatio 与画布原点换算；使用 canvas 自身显示尺寸避免 1px 裁剪。

import { getDesignerRulerMarks } from './designer-canvas-aids.js';
import {
  type DesignerCanvasBounds,
  getDesignerCanvasBounds,
  getDesignerCanvasClientOrigin,
} from './designer-canvas-coordinates.js';

interface DesignerRulerRenderOptions {
  readonly canvas: HTMLDivElement;
  readonly root: ShadowRoot;
  readonly zoom: number;
}

export function renderDesignerRulers(options: DesignerRulerRenderOptions): void {
  const canvasBounds = getDesignerCanvasBounds(options.canvas);
  renderRuler(
    options.root.querySelector<HTMLElement>('.ruler-horizontal'),
    'x',
    canvasBounds,
    options.zoom,
  );
  renderRuler(
    options.root.querySelector<HTMLElement>('.ruler-vertical'),
    'y',
    canvasBounds,
    options.zoom,
  );
}

function renderRuler(
  ruler: HTMLElement | null,
  axis: 'x' | 'y',
  canvasBounds: DesignerCanvasBounds,
  zoom: number,
): void {
  if (ruler === null || ruler === undefined) return;
  const canvas = ruler.querySelector<HTMLCanvasElement>('canvas[data-ruler-canvas]');
  if (canvas === null || canvas === undefined) return;
  // 标尺容器有边框，必须使用 canvas 自身显示尺寸，避免刻度或文字被裁掉 1px。
  const canvasRect = canvas.getBoundingClientRect();
  const length = axis === 'x' ? canvasRect.width : canvasRect.height;
  if (length <= 0) return;
  const canvasOrigin = getDesignerCanvasClientOrigin(canvasBounds, zoom);
  const origin =
    axis === 'x' ? canvasOrigin.left - canvasRect.left : canvasOrigin.top - canvasRect.top;
  const devicePixelRatio = Math.max(1, globalThis.devicePixelRatio || 1);
  const widthPixels = Math.round(canvasRect.width * devicePixelRatio);
  const heightPixels = Math.round(canvasRect.height * devicePixelRatio);
  if (canvas.width !== widthPixels) canvas.width = widthPixels;
  if (canvas.height !== heightPixels) canvas.height = heightPixels;
  // 对齐 scena ruler：主刻度 50 画布单位除以缩放，次刻度位于主刻度正中。
  const unit = Math.max(1, Math.floor(50 / zoom));
  const marks = getDesignerRulerMarks({
    devicePixelRatio,
    length,
    origin,
    zoom,
    increment: unit,
  });
  canvas.dataset.rulerVersion = String((Number(canvas.dataset.rulerVersion) || 0) + 1);
  const context = canvas.getContext('2d');
  if (context === null) return;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, canvasRect.width, canvasRect.height);
  const style = canvas.ownerDocument.defaultView?.getComputedStyle(ruler) ?? null;
  const line = style?.getPropertyValue('--designer-border-default').trim() || '#e4e4e7';
  const text = style?.getPropertyValue('--designer-text-muted').trim() || '#71717a';
  const barSize = axis === 'x' ? canvasRect.height : canvasRect.width;
  renderMarks(context, axis, marks, unit, zoom, barSize, line);
  renderLabels(context, axis, marks, barSize, text);
}

function renderMarks(
  context: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  marks: readonly { readonly position: number }[],
  unit: number,
  zoom: number,
  barSize: number,
  color: string,
): void {
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  for (const mark of marks) {
    const mid = mark.position + (unit * zoom) / 2;
    if (axis === 'x') {
      context.moveTo(mark.position + 0.5, 0);
      context.lineTo(mark.position + 0.5, barSize);
      context.moveTo(mid + 0.5, barSize - 7);
      context.lineTo(mid + 0.5, barSize);
    } else {
      context.moveTo(0, mark.position + 0.5);
      context.lineTo(barSize, mark.position + 0.5);
      context.moveTo(barSize - 7, mid + 0.5);
      context.lineTo(barSize, mid + 0.5);
    }
  }
  context.stroke();
}

function renderLabels(
  context: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  marks: readonly { readonly label: string; readonly position: number }[],
  barSize: number,
  color: string,
): void {
  context.fillStyle = color;
  context.font = '10px sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'bottom';
  for (const mark of marks) {
    if (axis === 'x') {
      context.fillText(mark.label, mark.position - 3, barSize - 7);
    } else {
      context.save();
      context.translate(barSize - 7, mark.position - 3);
      context.rotate(-Math.PI / 2);
      context.fillText(mark.label, 0, 0);
      context.restore();
    }
  }
}
