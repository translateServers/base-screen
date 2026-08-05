export interface DesignerClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export interface DesignerCanvasBounds {
  readonly left: number;
  readonly top: number;
}

export function clientPointToDesignerCanvasPoint(
  point: DesignerClientPoint,
  bounds: DesignerCanvasBounds,
  zoom: number,
): { readonly x: number; readonly y: number } {
  const scale = Math.max(zoom, Number.EPSILON);
  return {
    x: (point.clientX - bounds.left) / scale,
    y: (point.clientY - bounds.top) / scale,
  };
}
