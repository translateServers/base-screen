// 画布坐标换算：client（视口）坐标 → 画布坐标。
// 关键点是边框内偏移（clientLeft/clientTop 随 zoom 缩放）必须先扣除再除以缩放比，
// 否则边框宽度会随缩放级别污染落点坐标（框选/拖拽抖动的常见来源）。

export interface DesignerClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export interface DesignerCanvasBounds {
  readonly borderLeft?: number;
  readonly borderTop?: number;
  readonly left: number;
  readonly top: number;
}

export function getDesignerCanvasBounds(canvas: HTMLElement): DesignerCanvasBounds {
  const bounds = canvas.getBoundingClientRect();
  return {
    borderLeft: canvas.clientLeft,
    borderTop: canvas.clientTop,
    left: bounds.left,
    top: bounds.top,
  };
}

export function getDesignerCanvasClientOrigin(
  bounds: DesignerCanvasBounds,
  zoom: number,
): { readonly left: number; readonly top: number } {
  const scale = Math.max(zoom, Number.EPSILON);
  return {
    left: bounds.left + finiteInset(bounds.borderLeft) * scale,
    top: bounds.top + finiteInset(bounds.borderTop) * scale,
  };
}

export function clientPointToDesignerCanvasPoint(
  point: DesignerClientPoint,
  bounds: DesignerCanvasBounds,
  zoom: number,
): { readonly x: number; readonly y: number } {
  const scale = Math.max(zoom, Number.EPSILON);
  const origin = getDesignerCanvasClientOrigin(bounds, scale);
  return {
    x: (point.clientX - origin.left) / scale,
    y: (point.clientY - origin.top) / scale,
  };
}

/** Canvas region currently visible inside the viewport, in document coordinates. */
export function getDesignerVisibleCanvasRegion(
  viewport: HTMLElement,
  canvas: HTMLElement,
  zoom: number,
):
  | { readonly bottom: number; readonly left: number; readonly right: number; readonly top: number }
  | undefined {
  const view = viewport.getBoundingClientRect();
  // Detached or not yet laid out: nothing reliable to clip against.
  if (!(view.width > 0 && view.height > 0)) return undefined;
  const bounds = getDesignerCanvasBounds(canvas);
  const topLeft = clientPointToDesignerCanvasPoint(
    { clientX: view.left, clientY: view.top },
    bounds,
    zoom,
  );
  const bottomRight = clientPointToDesignerCanvasPoint(
    { clientX: view.right, clientY: view.bottom },
    bounds,
    zoom,
  );
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

function finiteInset(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}
