import { describe, expect, it } from 'vitest';
import { canvasTabsOverflow } from '../../../src/browser/controllers/designer-artboard-controller.js';

describe('canvasTabsOverflow', () => {
  it('R1 reports no overflow when every tab is visible', () => {
    expect(canvasTabsOverflow(0, 400, 400)).toBe('');
    expect(canvasTabsOverflow(0, 400, 320)).toBe('');
  });

  it('R1 fades only the side that still hides tabs', () => {
    expect(canvasTabsOverflow(0, 400, 900)).toBe('end');
    expect(canvasTabsOverflow(500, 400, 900)).toBe('start');
  });

  it('R1 fades both sides while scrolled into the middle', () => {
    expect(canvasTabsOverflow(200, 400, 900)).toBe('both');
  });

  it('R1 ignores sub-pixel remainders from fractional layout', () => {
    expect(canvasTabsOverflow(0, 400, 400.6)).toBe('');
    expect(canvasTabsOverflow(500.4, 400, 900)).toBe('start');
  });

  it('R1 treats a negative scroll offset as the start of the list', () => {
    expect(canvasTabsOverflow(-4, 400, 900)).toBe('end');
  });
});
