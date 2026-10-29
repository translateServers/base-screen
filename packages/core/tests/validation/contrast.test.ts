import { describe, expect, it } from 'vitest';
import {
  blend,
  contrastRatio,
  formatCssColor,
  minimumContrastRatio,
  parseCssColor,
  relativeLuminance,
  suggestReadableColor,
} from '../../src/validation/contrast.js';

describe('parseCssColor', () => {
  it('accepts short hex, long hex and rgb()', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseCssColor('#6E6E6E')).toEqual({ r: 110, g: 110, b: 110 });
    expect(parseCssColor('rgb(20, 30, 40)')).toEqual({ r: 20, g: 30, b: 40 });
    expect(parseCssColor('rgb(20 30 40 / 1)')).toEqual({ r: 20, g: 30, b: 40 });
  });

  it('rejects translucent and unknown colors instead of guessing a backdrop', () => {
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toBeUndefined();
    expect(parseCssColor('rgb(0 0 0 / 40%)')).toBeUndefined();
    expect(parseCssColor('transparent')).toBeUndefined();
    expect(parseCssColor('#12345')).toBeUndefined();
    expect(parseCssColor('var(--designer-text-primary)')).toBeUndefined();
  });

  it('clamps out-of-range rgb channels', () => {
    expect(parseCssColor('rgb(300, 30, 128)')).toEqual({ r: 255, g: 30, b: 128 });
  });
});

describe('formatCssColor', () => {
  it('round-trips through parseCssColor', () => {
    const formatted = formatCssColor({ r: 20, g: 30, b: 40 });
    expect(formatted).toBe('#141e28');
    expect(parseCssColor(formatted)).toEqual({ r: 20, g: 30, b: 40 });
  });
});

describe('contrastRatio', () => {
  it('returns the WCAG extremes and a known mid-grey pair', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(contrastRatio(parseCssColor('#6e6e6e')!, parseCssColor('#fcfcfc')!)).toBeCloseTo(
      4.97,
      1,
    );
  });

  it('is symmetric in relative luminance', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe('minimumContrastRatio', () => {
  it('uses 3:1 only for WCAG large text', () => {
    expect(minimumContrastRatio(24, 400)).toBe(3);
    expect(minimumContrastRatio(32, 400)).toBe(3);
    expect(minimumContrastRatio(18.66, 700)).toBe(3);
    expect(minimumContrastRatio(18.66, 400)).toBe(4.5);
    expect(minimumContrastRatio(13, 600)).toBe(4.5);
  });
});

describe('suggestReadableColor', () => {
  const white = { r: 255, g: 255, b: 255 };

  it('keeps a colour that already passes', () => {
    const fg = parseCssColor('#333333')!;
    expect(suggestReadableColor(fg, white, 4.5)).toBe(fg);
  });

  it('returns a colour that meets the threshold, moving toward the contrast extreme', () => {
    const fg = parseCssColor('#cccccc')!;
    const suggested = suggestReadableColor(fg, white, 4.5);
    expect(suggested).toBeDefined();
    expect(contrastRatio(suggested!, white)).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(suggested!)).toBeLessThan(relativeLuminance(fg));
  });

  it('reports no solution when the background cannot support the threshold', () => {
    const grey = parseCssColor('#777777')!;
    expect(suggestReadableColor(grey, grey, 7)).toBeUndefined();
  });
});

describe('blend', () => {
  it('interpolates per channel', () => {
    expect(blend({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 40 }, 0.5)).toEqual({
      r: 50,
      g: 100,
      b: 20,
    });
  });
});
