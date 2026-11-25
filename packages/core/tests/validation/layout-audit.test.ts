import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  auditScreenLayout,
  computeMinimumLegibleFontPx,
  resolveScreenFontFloorPx,
} from '../../src/index.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

function text(overrides: Partial<ScreenComponentNode> & { id: string }): ScreenComponentNode {
  return makeComponent({
    type: 'base.text',
    position: { x: 100, y: 100 },
    size: { width: 400, height: 60 },
    style: { fontSize: 32, color: '#ffffff' },
    ...overrides,
  });
}

function screen(
  components: readonly ScreenComponentNode[],
  canvas: Partial<ScreenDocument['canvas']> = {},
): ScreenDocument {
  const base = makeDocument({ components });
  return {
    ...base,
    canvas: { width: 1920, height: 1080, backgroundColor: '#0b1020', ...canvas },
  };
}

const codes = (document: ScreenDocument, options?: Parameters<typeof auditScreenLayout>[1]) =>
  auditScreenLayout(document, options).map((item) => item.code);

describe('legibility', () => {
  it('converts viewing distance and pixel pitch into a font floor', () => {
    expect(
      computeMinimumLegibleFontPx({ columns: 1, rows: 1, viewingDistanceM: 3, pixelPitchMm: 1.25 }),
    ).toBe(18);
    expect(computeMinimumLegibleFontPx({ columns: 1, rows: 1 })).toBeNull();
  });

  it('defaults to 16px on a 1920 canvas and scales with width', () => {
    expect(resolveScreenFontFloorPx(1920)).toBe(16);
    expect(resolveScreenFontFloorPx(3840)).toBe(32);
    expect(
      resolveScreenFontFloorPx(1920, {
        columns: 1,
        rows: 1,
        viewingDistanceM: 6,
        pixelPitchMm: 1.25,
      }),
    ).toBe(36);
  });
});

describe('auditScreenLayout', () => {
  it('passes a readable, in-bounds, non-overlapping layout', () => {
    expect(codes(screen([text({ id: 'title' })]))).toEqual([]);
  });

  it('flags text below the font floor at the fontSize path', () => {
    const result = auditScreenLayout(
      screen([text({ id: 'tiny', style: { fontSize: 12, color: '#ffffff' } })]),
    );
    expect(result).toMatchObject([
      {
        severity: 'error',
        code: 'LAYOUT_FONT_TOO_SMALL',
        path: ['components', 0, 'style', 'fontSize'],
      },
    ]);
  });

  it('flags geometry outside the canvas, including popup panels', () => {
    expect(codes(screen([text({ id: 'edge', position: { x: 1700, y: 100 } })]))).toEqual([
      'LAYOUT_OUT_OF_BOUNDS',
    ]);
    const base = screen([text({ id: 'in-popup', canvasId: 'popup', position: { x: 300, y: 10 } })]);
    const withPopup: ScreenDocument = {
      ...base,
      subCanvases: [
        {
          id: 'popup',
          name: 'popup',
          display: 'popup',
          width: 600,
          height: 400,
          backgroundColor: '#0b1020',
          borderRadius: 8,
          maskColor: 'rgba(0, 0, 0, 0.5)',
          closeOnMaskClick: true,
          closeOnEscape: true,
        },
      ],
    };
    expect(codes(withPopup)).toEqual(['LAYOUT_OUT_OF_BOUNDS']);
  });

  it('flags partial overlap between siblings but not a card holding its title', () => {
    const card = makeComponent({
      id: 'card',
      type: 'base.rectangle',
      position: { x: 80, y: 80 },
      size: { width: 600, height: 300 },
      style: { fill: '#16213a' },
    });
    // 卡片完整包住标题：有意叠放，不算重叠。
    expect(codes(screen([card, text({ id: 'title' })]))).toEqual([]);

    const left = text({ id: 'left', position: { x: 100, y: 500 } });
    const right = text({ id: 'right', position: { x: 300, y: 520 } });
    const result = auditScreenLayout(screen([left, right]));
    expect(result.map((item) => item.code)).toEqual(['LAYOUT_OVERLAP']);
    expect(result[0]?.path).toEqual(['components', 1, 'position']);
  });

  it('ignores overlaps below 10% of the smaller area', () => {
    const left = text({ id: 'left', position: { x: 100, y: 500 } });
    const right = text({ id: 'right', position: { x: 470, y: 500 } });
    expect(codes(screen([left, right]))).toEqual([]);
  });

  it('checks contrast against a static background and skips when unknown', () => {
    const dim = { fontSize: 32, color: '#1a2233' };
    // 画布纯色底：判得出来。
    expect(codes(screen([text({ id: 'dim', style: dim })]))).toEqual(['LAYOUT_CONTRAST_LOW']);
    // 包住它的卡片底色：用卡片底色判。
    const card = makeComponent({
      id: 'card',
      type: 'base.rectangle',
      position: { x: 80, y: 80 },
      size: { width: 600, height: 300 },
      style: { fill: '#ffffff' },
    });
    expect(codes(screen([card, text({ id: 'dim', style: dim })]))).toEqual([]);
    // 画布是渐变：判不了，跳过，不猜。
    expect(
      codes(
        screen([text({ id: 'dim', style: dim })], {
          background: {
            type: 'linear-gradient',
            angle: 90,
            stops: [
              { color: '#000000', position: 0 },
              { color: '#ffffff', position: 1 },
            ],
          },
        }),
      ),
    ).toEqual([]);
  });

  it('only reports the requested components and honours the severity option', () => {
    const tiny = text({ id: 'tiny', style: { fontSize: 10, color: '#ffffff' } });
    const other = text({
      id: 'other',
      position: { x: 100, y: 300 },
      style: { fontSize: 10, color: '#ffffff' },
    });
    const result = auditScreenLayout(screen([tiny, other]), {
      componentIds: ['other'],
      severity: 'warning',
    });
    expect(result).toMatchObject([
      {
        severity: 'warning',
        code: 'LAYOUT_FONT_TOO_SMALL',
        path: ['components', 1, 'style', 'fontSize'],
      },
    ]);
  });

  it('skips hidden components', () => {
    const hidden = text({
      id: 'hidden',
      status: { locked: false, hidden: true },
      style: { fontSize: 8, color: '#ffffff' },
    });
    expect(codes(screen([hidden]))).toEqual([]);
  });
});
