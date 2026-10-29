import { describe, expect, it } from 'vitest';
import {
  computeAngularSize,
  computeMinimumLegibleFontPx,
  computePhysicalSize,
  evaluateDisplayReadability,
} from '../../../../src/common/operations/display/designer-target-display.js';

const canvas = { width: 7680, height: 2160 } as const;
const profile = {
  columns: 2,
  rows: 2,
  pixelPitchMm: 1.25,
  viewingDistanceM: 3,
} as const;

describe('target display physical size', () => {
  it('converts logical pixels to millimetres with the pixel pitch', () => {
    expect(computePhysicalSize(profile, canvas)).toEqual({
      widthMm: 9600,
      heightMm: 2700,
      pixelPitchMm: 1.25,
    });
  });

  it('returns null instead of guessing when the pitch is missing', () => {
    expect(computePhysicalSize({ columns: 2, rows: 2 }, canvas)).toBeNull();
    expect(computePhysicalSize({ ...profile, pixelPitchMm: 0 }, canvas)).toBeNull();
  });
});

describe('target display angular size', () => {
  it('derives the viewing angle from size and distance', () => {
    const angular = computeAngularSize(profile, canvas);
    expect(angular).not.toBeNull();
    expect(angular?.horizontalDeg).toBeCloseTo(116, 0);
    expect(angular?.verticalDeg).toBeCloseTo(48.5, 1);
  });

  it('needs both pitch and distance', () => {
    const { viewingDistanceM: _distance, ...withoutDistance } = profile;
    const { pixelPitchMm: _pitch, ...withoutPitch } = profile;
    expect(computeAngularSize(withoutDistance, canvas)).toBeNull();
    expect(computeAngularSize(withoutPitch, canvas)).toBeNull();
  });
});

describe('minimum legible font size', () => {
  it('applies cap-height 1/200 of the viewing distance', () => {
    // 3000mm / 200 * 1.5 / 1.25mm = 18px
    expect(computeMinimumLegibleFontPx(profile)).toBe(18);
  });

  it('scales with distance and pitch', () => {
    expect(computeMinimumLegibleFontPx({ ...profile, viewingDistanceM: 6 })).toBe(36);
    expect(computeMinimumLegibleFontPx({ ...profile, pixelPitchMm: 2.5 })).toBe(9);
  });

  it('returns null when inputs are missing', () => {
    expect(computeMinimumLegibleFontPx({ columns: 2, rows: 2 })).toBeNull();
  });
});

describe('display readability', () => {
  it('marks a font below the limit as not ok', () => {
    expect(evaluateDisplayReadability(profile, 14)).toEqual({
      requiredFontPx: 18,
      actualFontPx: 14,
      ok: false,
    });
  });

  it('accepts a font at or above the limit', () => {
    expect(evaluateDisplayReadability(profile, 18)?.ok).toBe(true);
    expect(evaluateDisplayReadability(profile, 20)?.ok).toBe(true);
  });

  it('does not claim failure when nothing was measured', () => {
    expect(evaluateDisplayReadability(profile, null)).toEqual({
      requiredFontPx: 18,
      actualFontPx: null,
      ok: true,
    });
  });
});
