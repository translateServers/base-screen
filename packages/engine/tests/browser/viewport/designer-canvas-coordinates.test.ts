import { describe, expect, it } from 'vitest';
import { clientPointToDesignerCanvasPoint } from '../../../src/browser/viewport/designer-canvas-coordinates.js';

describe('clientPointToDesignerCanvasPoint', () => {
  it('R3 converts client coordinates through the canvas bounds and zoom', () => {
    expect(
      clientPointToDesignerCanvasPoint({ clientX: 310, clientY: 170 }, { left: 110, top: 70 }, 2),
    ).toEqual({ x: 100, y: 50 });
  });
});
