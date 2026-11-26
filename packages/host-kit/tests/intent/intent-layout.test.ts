import { describe, expect, it } from 'vitest';
import {
  type LayoutRegion,
  type SolvedRegion,
  solveLayout,
  stretchSpans,
} from '../../src/intent/intent-layout.js';

function solveOk(regions: readonly LayoutRegion[]): readonly SolvedRegion[] {
  const outcome = solveLayout(regions);
  if (!outcome.ok) throw new Error(`unexpected capacity issue: ${JSON.stringify(outcome.issues)}`);
  return outcome.regions;
}

const data = { span: 2, data: true } as const;
const text = { span: 2, data: false } as const;

describe('solveLayout', () => {
  it('splits a band into equal cards across the content width', () => {
    const [band] = solveOk([{ kind: 'band', count: 4 }]);
    if (band?.kind !== 'band') throw new Error('expected a band');

    expect(band.boxes).toHaveLength(4);
    expect(new Set(band.boxes.map((box) => box.width)).size).toBe(1);
    expect(band.boxes[0]).toMatchObject({ x: 64, y: 172, height: 148 });
    const last = band.boxes[3];
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual(1920 - 64);
  });

  it('gives a lone grid region the whole space below the band', () => {
    const [band, grid] = solveOk([
      { kind: 'band', count: 3 },
      { kind: 'grid', slots: [{ span: 4, data: true }] },
    ]);
    if (band?.kind !== 'band' || grid?.kind !== 'grid') throw new Error('unexpected kinds');

    // 指标带 172..320，间隔 24，栅格从 344 起一直到 1010。
    expect(grid.boxes[0]).toMatchObject({ x: 64, y: 344, width: 1792, height: 666 });
  });

  it('packs a grid into rows and stretches a short row over four columns', () => {
    const [grid] = solveOk([{ kind: 'grid', slots: [data, data, text] }]);
    if (grid?.kind !== 'grid') throw new Error('expected a grid');
    const [a, b, c] = grid.boxes;

    // 前两块同一行各占两列，第三块独占一行并铺满。
    expect(a?.y).toBe(b?.y);
    expect(a?.width).toBe(b?.width);
    expect(c?.y).toBeGreaterThan(a?.y ?? 0);
    expect(c?.width).toBe(1792);
  });

  it('puts the narrow rail on the requested side and stacks it', () => {
    const regions = (railSide: 'left' | 'right'): LayoutRegion[] => [
      {
        kind: 'split',
        ratio: 'wide-narrow',
        railSide,
        main: [{ data: true }],
        rail: [{ data: false }, { data: false }],
      },
    ];
    const [right] = solveOk(regions('right'));
    const [left] = solveOk(regions('left'));
    if (right?.kind !== 'split' || left?.kind !== 'split') throw new Error('expected splits');

    expect(right.main[0]?.width).toBeGreaterThan(right.rail[0]?.width ?? 0);
    expect(right.rail[0]?.x).toBeGreaterThan(right.main[0]?.x ?? 0);
    expect(left.rail[0]?.x).toBeLessThan(left.main[0]?.x ?? 0);
    // 两栏加间隔正好铺满内容宽度。
    expect((right.main[0]?.width ?? 0) + 24 + (right.rail[0]?.width ?? 0)).toBe(1792);
    // 侧栏两格纵向堆叠，宽度相同。
    expect(right.rail[1]?.y).toBeGreaterThan(right.rail[0]?.y ?? 0);
    expect(right.rail[1]?.x).toBe(right.rail[0]?.x);
  });

  it('weights data regions above text regions when sharing the height', () => {
    const [grid1, grid2] = solveOk([
      { kind: 'grid', slots: [{ span: 4, data: true }] },
      { kind: 'grid', slots: [{ span: 4, data: false }] },
    ]);
    if (grid1?.kind !== 'grid' || grid2?.kind !== 'grid') throw new Error('expected grids');

    expect(grid1.boxes[0]?.height).toBeGreaterThan(grid2.boxes[0]?.height ?? 0);
    const bottom = (grid2.boxes[0]?.y ?? 0) + (grid2.boxes[0]?.height ?? 0);
    expect(bottom).toBeLessThanOrEqual(1010);
  });

  it('never lets a region reach below the content bottom', () => {
    for (let rows = 1; rows <= 5; rows += 1) {
      const outcome = solveLayout([
        { kind: 'band', count: 4 },
        { kind: 'grid', slots: Array.from({ length: rows }, () => ({ span: 4, data: true })) },
      ]);
      if (!outcome.ok) continue;
      const grid = outcome.regions[1];
      if (grid?.kind !== 'grid') throw new Error('expected a grid');
      for (const box of grid.boxes) expect(box.y + box.height).toBeLessThanOrEqual(1010);
    }
  });

  it('is deterministic: the same skeleton always yields the same geometry', () => {
    const skeleton: LayoutRegion[] = [
      { kind: 'band', count: 4 },
      {
        kind: 'split',
        ratio: 'wide-narrow',
        railSide: 'right',
        main: [{ data: true }],
        rail: [{ data: false }],
      },
      { kind: 'grid', slots: [data, text] },
    ];

    expect(solveOk(skeleton)).toEqual(solveOk(skeleton));
  });

  describe('capacity', () => {
    it('reports a region that does not fit, with how far short it is', () => {
      const outcome = solveLayout([
        { kind: 'band', count: 4 },
        { kind: 'grid', slots: Array.from({ length: 6 }, () => ({ span: 4, data: true })) },
      ]);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.issues).toHaveLength(1);
      expect(outcome.issues[0]).toMatchObject({ regionIndex: 1, reason: 'height' });
      expect(outcome.issues[0]?.requiredPx).toBeGreaterThan(outcome.issues[0]?.availablePx ?? 0);
    });

    it('points at the region that needs the most space', () => {
      const outcome = solveLayout([
        { kind: 'grid', slots: [{ span: 4, data: false }] },
        { kind: 'grid', slots: Array.from({ length: 5 }, () => ({ span: 4, data: true })) },
        { kind: 'grid', slots: [{ span: 4, data: false }] },
      ]);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.issues[0]?.regionIndex).toBe(1);
    });

    it('reports a band whose cards would be narrower than the minimum', () => {
      const outcome = solveLayout([{ kind: 'band', count: 8 }]);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.issues[0]).toMatchObject({ regionIndex: 0, reason: 'width' });
    });

    it('accepts exactly the largest layout that fits', () => {
      // 指标带 + 4 行栅格：4 × 120 + 3 × 24 = 552 ≤ 666。
      expect(
        solveLayout([
          { kind: 'band', count: 4 },
          { kind: 'grid', slots: Array.from({ length: 4 }, () => ({ span: 4, data: false })) },
        ]).ok,
      ).toBe(true);
    });
  });
});

describe('stretchSpans', () => {
  it.each([
    [[2], [4]],
    [
      [1, 1],
      [2, 2],
    ],
    [
      [3, 1],
      [3, 1],
    ],
    [
      [2, 1],
      [3, 1],
    ],
    [
      [1, 1, 1],
      [2, 1, 1],
    ],
    [[4], [4]],
  ])('%j → %j', (input, expected) => {
    expect(stretchSpans(input.map((span) => ({ span })))).toEqual(expected);
  });
});
