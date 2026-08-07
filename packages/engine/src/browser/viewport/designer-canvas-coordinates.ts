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

function finiteInset(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}
