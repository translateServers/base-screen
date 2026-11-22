import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESIGNER_CANVAS_AIDS,
  type DesignerSnapCandidates,
  type DesignerSnapSession,
  snapDesignerSelectionTranslation,
} from '../../../src/browser/viewport/designer-canvas-aids.js';
import { DesignerSpacingIndex } from '../../../src/browser/viewport/designer-canvas-snap-spacing.js';

// Three boxes in a row, 20 apart.
const ROW = [box(0, 0, 40, 40), box(60, 0, 40, 40), box(120, 0, 40, 40)];

describe('DesignerSpacingIndex snapping', () => {
  it('duplicates an existing gap after the last box and before the first one', () => {
    const index = new DesignerSpacingIndex(ROW);
    expect(index.snap('x', box(176, 5, 40, 30), 8)).toBe(4);
    expect(index.snap('x', box(-58, 0, 40, 40), 8)).toBe(-2);
    expect(index.snap('x', box(190, 5, 40, 30), 8)).toBeUndefined();
  });

  it('centres the selection in a gap wider than it', () => {
    const index = new DesignerSpacingIndex([box(0, 0, 40, 40), box(140, 0, 40, 40)]);
    expect(index.snap('x', box(66, 0, 40, 40), 8)).toBe(4);
    // A selection wider than the gap is never centred into it.
    expect(index.snap('x', box(20, 0, 140, 40), 8)).toBeUndefined();
  });

  it('only considers components in the same row or column', () => {
    const index = new DesignerSpacingIndex(ROW);
    expect(index.snap('x', box(176, 100, 40, 30), 8)).toBeUndefined();
    const column = new DesignerSpacingIndex([box(0, 0, 40, 40), box(0, 70, 40, 40)]);
    expect(column.snap('y', box(0, 137, 40, 40), 8)).toBe(3);
    expect(column.snap('x', box(0, 137, 40, 40), 8)).toBeUndefined();
  });

  it('ignores neighbours and gaps beyond the reach', () => {
    // Ten boxes 20 apart: the nearest one is 17 from the selection.
    const row = new DesignerSpacingIndex(
      Array.from({ length: 10 }, (_, n) => box(n * 60, 0, 40, 40)),
    );
    expect(row.snap('x', box(597, 0, 40, 40), 6, 180)).toBe(3);
    expect(row.snap('x', box(597, 0, 40, 40), 6, 10)).toBeUndefined();
    // A 200-wide gap can be duplicated without a reach, never with a 180 one.
    const wide = new DesignerSpacingIndex([box(0, 0, 40, 40), box(240, 0, 40, 40)]);
    expect(wide.snap('x', box(477, 0, 40, 40), 6)).toBe(3);
    expect(wide.snap('x', box(477, 0, 40, 40), 6, 180)).toBeUndefined();
    expect(wide.measurements(box(480, 0, 40, 40), 0.5, 180)).toEqual([]);
  });

  it('keeps per-frame work bounded to the nearest neighbours of a crowded row', () => {
    // 500 boxes 20 apart; only the nearest ones decide, and the result stays correct.
    const crowded = Array.from({ length: 500 }, (_, n) => box(n * 60, 0, 40, 40));
    const index = new DesignerSpacingIndex(crowded);
    expect(index.snap('x', box(500 * 60 - 3, 0, 40, 40), 8)).toBe(3);
  });
});

describe('DesignerSpacingIndex equal-spacing marks', () => {
  it('marks the duplicated gap together with the chain of equal gaps it extends', () => {
    const index = new DesignerSpacingIndex(ROW);
    expect(index.measurements(box(180, 5, 40, 30), 0.5)).toEqual([
      equal('x', 40, 60, 20),
      equal('x', 100, 120, 20),
      equal('x', 160, 180, 20),
    ]);
    expect(index.measurements(box(-60, 0, 40, 40), 0.5)).toEqual([
      equal('x', -20, 0, 20),
      equal('x', 40, 60, 20),
      equal('x', 100, 120, 20),
    ]);
  });

  it('marks both halves of a centred gap', () => {
    const index = new DesignerSpacingIndex([box(0, 0, 40, 40), box(140, 0, 40, 40)]);
    expect(index.measurements(box(70, 0, 40, 40), 0.5)).toEqual([
      equal('x', 40, 70, 20),
      equal('x', 110, 140, 20),
    ]);
  });

  it('marks vertical spacing in a column and nothing when no gap matches', () => {
    const index = new DesignerSpacingIndex([box(0, 0, 40, 40), box(0, 70, 40, 40)]);
    expect(index.measurements(box(0, 140, 40, 40), 0.5)).toEqual([
      equal('y', 40, 70, 20),
      equal('y', 110, 140, 20),
    ]);
    expect(index.measurements(box(0, 141, 40, 40), 0.5)).toEqual([]);
  });

  it('places each mark in the middle of the two boxes it separates', () => {
    const index = new DesignerSpacingIndex([box(0, 0, 40, 100), box(60, 50, 40, 100)]);
    // The gap between the fixed boxes sits in their shared 50..100 band; the new gap in the
    // 80..120 band the second box shares with the selection.
    expect(index.measurements(box(120, 80, 40, 40), 0.5)).toEqual([
      equal('x', 40, 60, 75),
      equal('x', 100, 120, 100),
    ]);
  });
});

describe('equal spacing in the selection solver', () => {
  const lines = (values: readonly number[]): DesignerSnapCandidates => ({
    x: values.map((value) => ({ value, start: 0, size: 40 })),
    y: [],
  });

  it('snaps to equal spacing when it is nearer than any alignment, and marks it', () => {
    const result = snapDesignerSelectionTranslation(
      { left: 0, right: 40, top: 5, bottom: 35 },
      { x: 176, y: 0 },
      DEFAULT_DESIGNER_CANVAS_AIDS,
      lines([0, 20, 40, 60, 80, 100, 120, 140, 160]),
      1,
      undefined,
      new DesignerSpacingIndex(ROW),
    );
    expect(result).toMatchObject({ x: 180, y: 0, snappedX: 180 });
    expect(result.measurements).toEqual([
      equal('x', 40, 60, 20),
      equal('x', 100, 120, 20),
      equal('x', 160, 180, 20),
    ]);
  });

  it('keeps the alignment when it is as near as the equal spacing', () => {
    // Raw left 176: spacing wants 180 (4px), an alignment line at 172 is also 4px away.
    const result = snapDesignerSelectionTranslation(
      { left: 0, right: 40, top: 5, bottom: 35 },
      { x: 176, y: 0 },
      DEFAULT_DESIGNER_CANVAS_AIDS,
      lines([172]),
      1,
      undefined,
      new DesignerSpacingIndex(ROW),
    );
    expect(result).toMatchObject({ x: 172, snappedX: 172 });
    expect(result.measurements).toBeUndefined();
  });

  it('holds the spacing target in the session like any other snap', () => {
    const session: DesignerSnapSession = {};
    snapDesignerSelectionTranslation(
      { left: 0, right: 40, top: 5, bottom: 35 },
      { x: 176, y: 0 },
      DEFAULT_DESIGNER_CANVAS_AIDS,
      lines([]),
      1,
      session,
      new DesignerSpacingIndex(ROW),
    );
    expect(session.x).toEqual({ anchor: 0, value: 180 });
  });

  it('never snaps a plain selection without the spacing index', () => {
    expect(
      snapDesignerSelectionTranslation(
        { left: 0, right: 40, top: 5, bottom: 35 },
        { x: 176, y: 0 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        lines([]),
      ),
    ).toEqual({ x: 176, y: 0 });
  });
});

function box(left: number, top: number, width: number, height: number) {
  return { left, top, right: left + width, bottom: top + height };
}

function equal(axis: 'x' | 'y', from: number, to: number, position: number) {
  return { axis, distance: to - from, from, to, position, kind: 'equal' as const };
}
