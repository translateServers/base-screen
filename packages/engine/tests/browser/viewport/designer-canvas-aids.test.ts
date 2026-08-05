import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  collectDesignerSnapCandidates,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  getDesignerRulerMarks,
  snapDesignerCanvasPoint,
} from '../../../src/browser/viewport/designer-canvas-aids.js';

describe('snapDesignerCanvasPoint', () => {
  it('snaps to the instance-local 24px grid only when enabled', () => {
    expect(snapDesignerCanvasPoint({ x: 35, y: 61 }, DEFAULT_DESIGNER_CANVAS_AIDS)).toEqual({
      x: 24,
      y: 72,
      snappedX: 24,
      snappedY: 72,
    });
    expect(
      snapDesignerCanvasPoint(
        { x: 35, y: 61 },
        { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false },
      ),
    ).toEqual({ x: 35, y: 61 });
  });

  it('uses guides within the 5px smart-guide threshold', () => {
    expect(
      snapDesignerCanvasPoint(
        { x: 49, y: 89 },
        { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false },
        { x: [52], y: [84] },
      ),
    ).toEqual({ x: 52, y: 84, snappedX: 52, snappedY: 84 });
  });

  it('R7 chooses the nearest sorted candidate within a screen-pixel threshold at every zoom', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };

    expect(
      snapDesignerCanvasPoint({ x: 40, y: 0 }, state, { x: [42, 38], y: [] }, 1),
    ).toMatchObject({
      x: 38,
      snappedX: 38,
    });
    expect(snapDesignerCanvasPoint({ x: 40, y: 0 }, state, { x: [46], y: [] }, 0.1)).toMatchObject({
      x: 46,
      snappedX: 46,
    });
    expect(snapDesignerCanvasPoint({ x: 40, y: 0 }, state, { x: [46], y: [] }, 5)).toMatchObject({
      x: 40,
    });
  });

  it('R7 collects canvas, user-guide, and visible component candidates while retaining locked components', () => {
    const document: ScreenDocument = {
      canvas: { width: 200, height: 100, backgroundColor: '#000000' },
      components: [
        component('visible', 20, 30, false, false),
        component('locked', 80, 10, true, false),
        component('hidden', 120, 40, false, true),
      ],
      variables: [],
      blueprint: { rules: [] },
    };

    expect(collectDesignerSnapCandidates(document, { x: [15], y: [25] }, ['visible'])).toEqual({
      x: [0, 15, 80, 100, 130, 180, 200],
      y: [0, 10, 25, 30, 50, 100],
    });
  });

  it('R7 aligns ruler marks to pan, zoom, and device pixels deterministically', () => {
    expect(
      getDesignerRulerMarks({ devicePixelRatio: 2, length: 140, origin: 13.25, zoom: 1.25 }),
    ).toEqual([
      { label: '0', position: 13.5, value: 0 },
      { label: '50', position: 76, value: 50 },
      { label: '100', position: 138.5, value: 100 },
    ]);
  });

  it('R7 uses rotated visual bounds for visible component candidates', () => {
    const document: ScreenDocument = {
      canvas: { width: 200, height: 100, backgroundColor: '#000000' },
      components: [component('rotated', 50, 30, false, false, 90)],
      variables: [],
      blueprint: { rules: [] },
    };

    expect(collectDesignerSnapCandidates(document, { x: [], y: [] })).toEqual({
      x: [0, 80, 100, 120, 200],
      y: [0, 50, 100],
    });
  });
});

function component(
  id: string,
  x: number,
  y: number,
  locked: boolean,
  hidden: boolean,
  rotation = 0,
) {
  return {
    id,
    type: 'base.rectangle',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width: 100, height: 40 },
    rotation,
    zIndex: 0,
    status: { locked, hidden },
    props: {},
    style: {},
    dataSource: null,
  } as const;
}
