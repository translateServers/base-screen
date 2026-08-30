import { describe, expect, it } from 'vitest';
import {
  designerFillColorToHex,
  designerFillHsvaToRgba,
  designerFillRgbaToHsva,
  parseDesignerFillColor,
  resolveDesignerFillHue,
} from '../../../../src/browser/dom/color/designer-fill-color-model.js';

describe('designer fill color model', () => {
  it('parses compact, alpha, and transparent color values', () => {
    expect(parseDesignerFillColor('#39c')).toEqual({ r: 51, g: 153, b: 204, a: 1 });
    expect(parseDesignerFillColor('#12345680')).toEqual({
      r: 18,
      g: 52,
      b: 86,
      a: 128 / 255,
    });
    expect(parseDesignerFillColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseDesignerFillColor('#12xz')).toBeUndefined();
  });

  it('serializes alpha only when it is visible', () => {
    expect(designerFillColorToHex({ r: 18, g: 52, b: 86, a: 1 })).toBe('#123456');
    expect(designerFillColorToHex({ r: 18, g: 52, b: 86, a: 0.5 })).toBe('#12345680');
  });

  it('round-trips rgb and hsv without changing the visible color', () => {
    for (const color of [
      { r: 36, g: 131, b: 255, a: 1 },
      { r: 57, g: 197, b: 187, a: 0.42 },
      { r: 237, g: 95, b: 130, a: 0 },
    ]) {
      const roundTrip = designerFillHsvaToRgba(designerFillRgbaToHsva(color));
      expect(roundTrip.r).toBeCloseTo(color.r, 0);
      expect(roundTrip.g).toBeCloseTo(color.g, 0);
      expect(roundTrip.b).toBeCloseTo(color.b, 0);
      expect(roundTrip.a).toBeCloseTo(color.a, 5);
    }
  });

  it('preserves the last meaningful hue for achromatic colors', () => {
    expect(resolveDesignerFillHue({ r: 255, g: 255, b: 255, a: 1 }, 218)).toBe(218);
    expect(resolveDesignerFillHue({ r: 0, g: 0, b: 0, a: 1 }, 142)).toBe(142);
    expect(resolveDesignerFillHue({ r: 255, g: 0, b: 0, a: 1 }, 218)).toBe(0);
  });
});
