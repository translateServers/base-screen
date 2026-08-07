import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { collectDesignerCanvasMeasurements } from '../../../src/browser/viewport/designer-canvas-measurements.js';

describe('collectDesignerCanvasMeasurements', () => {
  it('R2 renders each adjacent gap along the selected alignment rails', () => {
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
      blueprint: { rules: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(document, { left: 0, right: 200, top: 146, bottom: 180 }, [
        'selected',
      ]),
    ).toEqual([
      { axis: 'y', position: 0, from: 100, to: 146, distance: 46 },
      { axis: 'y', position: 0, from: 180, to: 228, distance: 48 },
      { axis: 'y', position: 0, from: 348, to: 407, distance: 59 },
      { axis: 'y', position: 100, from: 180, to: 228, distance: 48 },
      { axis: 'y', position: 100, from: 348, to: 407, distance: 59 },
      { axis: 'y', position: 200, from: 180, to: 228, distance: 48 },
      { axis: 'y', position: 200, from: 348, to: 407, distance: 59 },
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
      blueprint: { rules: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(document, { left: 0, right: 100, top: 0, bottom: 100 }, [
        'selected',
      ]),
    ).toEqual([{ axis: 'y', position: 50, from: 100, to: 170, distance: 70 }]);
  });

  it('R2 excludes lanes whose components only meet the selection at an edge or corner', () => {
    const document: ScreenDocument = {
      canvas: { width: 800, height: 500, backgroundColor: '#000000' },
      components: [component('above-left', 115, 22, 242, 120)],
      variables: [],
      blueprint: { rules: [] },
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
