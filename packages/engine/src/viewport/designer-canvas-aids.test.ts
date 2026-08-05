import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGNER_CANVAS_AIDS, snapDesignerCanvasPoint } from './designer-canvas-aids.js';

describe('snapDesignerCanvasPoint', () => {
  it('snaps to the instance-local 24px grid only when enabled', () => {
    expect(snapDesignerCanvasPoint({ x: 35, y: 61 }, DEFAULT_DESIGNER_CANVAS_AIDS)).toEqual({
      x: 24,
      y: 72,
    });
    expect(
      snapDesignerCanvasPoint(
        { x: 35, y: 61 },
        { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false },
      ),
    ).toEqual({ x: 35, y: 61 });
  });

  it('uses guides within the 5px smart-guide threshold', () => {
    expect(
      snapDesignerCanvasPoint(
        { x: 49, y: 89 },
        { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false },
        { x: [52], y: [84] },
      ),
    ).toEqual({ x: 52, y: 84 });
  });
});
