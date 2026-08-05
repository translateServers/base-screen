export const DESIGNER_GRID_SIZE = 24;
export const DESIGNER_SMART_GUIDE_THRESHOLD = 5;

export interface DesignerCanvasAidsState {
  readonly gridEnabled: boolean;
  readonly gridSnapEnabled: boolean;
  readonly smartGuidesEnabled: boolean;
}

export const DEFAULT_DESIGNER_CANVAS_AIDS: DesignerCanvasAidsState = {
  gridEnabled: true,
  gridSnapEnabled: true,
  smartGuidesEnabled: true,
};

export function snapDesignerCanvasPoint(
  point: { readonly x: number; readonly y: number },
  state: DesignerCanvasAidsState,
  guides: { readonly x: readonly number[]; readonly y: readonly number[] } = { x: [], y: [] },
): { readonly x: number; readonly y: number } {
  const grid = state.gridSnapEnabled
    ? {
        x: Math.round(point.x / DESIGNER_GRID_SIZE) * DESIGNER_GRID_SIZE,
        y: Math.round(point.y / DESIGNER_GRID_SIZE) * DESIGNER_GRID_SIZE,
      }
    : point;
  return {
    x: snapGuide(grid.x, guides.x),
    y: snapGuide(grid.y, guides.y),
  };
}

function snapGuide(value: number, guides: readonly number[]): number {
  const candidate = guides.find(
    (guide) => Math.abs(guide - value) <= DESIGNER_SMART_GUIDE_THRESHOLD,
  );
  return candidate ?? value;
}
