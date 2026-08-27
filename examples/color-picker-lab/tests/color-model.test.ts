import { describe, expect, it } from 'vitest';
import { hsvaToRgba, parseHexColor, rgbaToCss, rgbaToHex, rgbaToHsva } from '../src/color-model.js';

describe('color form control model', () => {
  it('parses short, full, and alpha hex values', () => {
    expect(parseHexColor('#2483ff')).toEqual({ r: 36, g: 131, b: 255, a: 1 });
    expect(parseHexColor('#0f08')).toEqual({ r: 0, g: 255, b: 0, a: 136 / 255 });
    expect(parseHexColor('#oops')).toBeUndefined();
  });

  it('serializes the canonical form value and css color', () => {
    const translucent = { r: 57, g: 197, b: 187, a: 0.5 };
    expect(rgbaToHex(translucent)).toBe('#39c5bb80');
    expect(rgbaToCss(translucent)).toBe('rgb(57 197 187 / 0.5)');
  });

  it('keeps rgb values stable through hsva conversion', () => {
    const source = { r: 48, g: 218, b: 180, a: 0.42 };
    expect(hsvaToRgba(rgbaToHsva(source))).toEqual(source);
  });
});
