import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  collectDesignerCanvasMeasurements,
  DesignerCanvasMeasurementIndex,
} from '../../../src/browser/viewport/designer-canvas-measurements.js';

describe('collectDesignerCanvasMeasurements', () => {
  it('R2 marks only the nearest gap on each side of the selection', () => {
    const document: ScreenDocument = {
      canvas: { width: 400, height: 700, backgroundColor: '#000000' },
      components: [
        component('top', 0, 0, 260, 100),
        component('selected', 0, 146, 200, 34),
        component('upper-left', 0, 228, 100, 120),
        component('upper-right', 100, 228, 100, 120),
        component('lower-left', 0, 407, 100, 120),
        component('lower-right', 100, 407, 100, 120),
      ],
      variables: [],
      blueprint: { nodes: [], edges: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(document, { left: 0, right: 200, top: 146, bottom: 180 }, [
        'selected',
      ]),
    ).toEqual([
      // The 46px gap above is read across the whole shared span; the 48px gap below ties
      // between the two upper boxes and keeps the first one's 100px span.
      { axis: 'y', position: 100, from: 100, to: 146, distance: 46 },
      { axis: 'y', position: 50, from: 180, to: 228, distance: 48 },
    ]);
  });

  it('R2 uses visual bounds and excludes hidden components from measurements', () => {
    const document: ScreenDocument = {
      canvas: { width: 400, height: 400, backgroundColor: '#000000' },
      components: [
        component('rotated', 0, 200, 100, 40, 90),
        component('hidden', 0, 130, 100, 20, 0, true),
      ],
      variables: [],
      blueprint: { nodes: [], edges: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(document, { left: 0, right: 100, top: 0, bottom: 100 }, [
        'selected',
      ]),
    ).toEqual([{ axis: 'y', position: 50, from: 100, to: 170, distance: 70 }]);
  });

  it('R2 excludes neighbours that only meet the selection at an edge or corner', () => {
    const document: ScreenDocument = {
      canvas: { width: 800, height: 500, backgroundColor: '#000000' },
      components: [component('above-left', 115, 22, 242, 120)],
      variables: [],
      blueprint: { nodes: [], edges: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(
        document,
        { left: 490, right: 730, top: 142, bottom: 262 },
        ['selected'],
      ),
    ).toEqual([]);
  });
});

describe('DesignerCanvasMeasurementIndex', () => {
  it('R2 keeps a dense column to one gap per side instead of every adjacent pair', () => {
    // Ten 40px rows 16 apart, with the selection occupying the row at 280..320.
    const components = Array.from({ length: 10 }, (_, index) => box(0, index * 56, 100, 40)).filter(
      (bounds) => bounds.top !== 280,
    );
    expect(
      new DesignerCanvasMeasurementIndex(components).measure({
        left: 0,
        right: 100,
        top: 280,
        bottom: 320,
      }),
    ).toEqual([
      { axis: 'y', position: 50, from: 264, to: 280, distance: 16 },
      { axis: 'y', position: 50, from: 320, to: 336, distance: 16 },
    ]);
  });

  it('R2 measures a side gap along its own axis at the shared span centre', () => {
    const index = new DesignerCanvasMeasurementIndex([box(40, 120, 40, 40)]);
    expect(index.measure({ left: 100, right: 200, top: 100, bottom: 200 })).toEqual([
      { axis: 'x', position: 140, from: 80, to: 100, distance: 20 },
    ]);
  });

  it('R2 picks the neighbour sharing more of the selection span at equal distance', () => {
    const index = new DesignerCanvasMeasurementIndex([
      box(100, -40, 40, 30),
      box(140, -40, 60, 30),
    ]);
    expect(index.measure({ left: 100, right: 200, top: 0, bottom: 100 })).toEqual([
      { axis: 'y', position: 170, from: -10, to: 0, distance: 10 },
    ]);
  });

  it('R2 drops neighbours beyond the reach', () => {
    const index = new DesignerCanvasMeasurementIndex([box(0, -40, 100, 30)]);
    const selection = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(index.measure(selection, 1, 8)).toEqual([]);
    expect(index.measure(selection)).toEqual([
      { axis: 'y', position: 50, from: -10, to: 0, distance: 10 },
    ]);
  });

  it('R2 measures a sub-pixel gap only once zoom makes it a real gap on screen', () => {
    const index = new DesignerCanvasMeasurementIndex([box(0, -40, 100, 39.5)]);
    const selection = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(index.measure(selection, 1)).toEqual([]);
    expect(index.measure(selection, 4)).toEqual([
      { axis: 'y', position: 50, from: -0.5, to: 0, distance: 0.5 },
    ]);
  });
});

function box(left: number, top: number, width: number, height: number) {
  return { left, top, right: left + width, bottom: top + height };
}

function component(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  hidden = false,
) {
  return {
    id,
    type: 'base.rectangle',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation,
    zIndex: 0,
    status: { locked: false, hidden },
    props: {},
    style: {},
    dataSource: null,
  } as const;
}
