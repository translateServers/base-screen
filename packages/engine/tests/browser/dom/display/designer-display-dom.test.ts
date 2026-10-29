import { describe, expect, it } from 'vitest';
import { displayPanelMarkup } from '../../../../src/browser/dom/display/designer-display-dom.js';

const profile = {
  columns: 2,
  rows: 2,
  seamPx: 3.5,
  safeAreaPx: 48,
  viewingDistanceM: 3,
  pixelPitchMm: 1.25,
  brightnessCdM2: 200,
  ambientLux: 120,
} as const;

const metrics = {
  physical: { widthMm: 9600, heightMm: 2700, pixelPitchMm: 1.25 },
  angular: { horizontalDeg: 116, verticalDeg: 48.5 },
  minimumLegibleFontPx: 18,
  brightnessCdM2: 200,
  ambientLux: 120,
};

describe('target display panel', () => {
  it('lists the physical parameters and derived readouts', () => {
    const html = displayPanelMarkup(profile, metrics, new Set(['safe-area']));
    expect(html).toContain('2 × 2');
    expect(html).toContain('P1.25');
    expect(html).toContain('3 m');
    expect(html).toContain('9.6 × 2.7 m');
    expect(html).toContain('18 px');
    expect(html).toContain('116° × 48.5°');
  });

  it('reflects each overlay switch independently', () => {
    const html = displayPanelMarkup(profile, metrics, new Set(['seam', 'distance']));
    expect(html).toContain('data-display-overlay="safe-area" aria-pressed="false"');
    expect(html).toContain('data-display-overlay="seam" aria-pressed="true"');
    expect(html).toContain('data-display-overlay="distance" aria-pressed="true"');
  });

  it('says so instead of inventing parameters when the host provides none', () => {
    const html = displayPanelMarkup(undefined, undefined, new Set());
    expect(html).toContain('当前环境未提供目标屏参数');
    expect(html).not.toContain('P1.25');
  });
});
