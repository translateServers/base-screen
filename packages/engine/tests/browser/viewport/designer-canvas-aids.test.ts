import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  collectDesignerSnapCandidates,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  type DesignerSnapCandidates,
  type DesignerSnapSession,
  getDesignerRulerMarks,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../../../src/browser/viewport/designer-canvas-aids.js';

// 测试候选 helper：start 0、size 100 的通用参考线。
// 候选按值升序（对齐生产路径 sortedUniqueCandidates；vendored checkSnap 对同距离命中按数组序取首个）。
function candidates(x: readonly number[] = [], y: readonly number[] = []): DesignerSnapCandidates {
  const axis = (values: readonly number[]) =>
    [...values]
      .sort((left, right) => left - right)
      .map((value) => ({ value, start: 0, size: 100 }));
  return { x: axis(x), y: axis(y) };
}

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
        candidates([52], [84]),
      ),
    ).toEqual({ x: 52, y: 84, snappedX: 52, snappedY: 84 });
  });

  it('R7 chooses the nearest sorted candidate within a screen-pixel threshold at every zoom', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };

    expect(
      snapDesignerCanvasPoint({ x: 40, y: 0 }, state, candidates([42, 38], []), 1),
    ).toMatchObject({
      x: 38,
      snappedX: 38,
    });
    expect(
      snapDesignerCanvasPoint({ x: 40, y: 0 }, state, candidates([46], []), 0.1),
    ).toMatchObject({
      x: 46,
      snappedX: 46,
    });
    expect(snapDesignerCanvasPoint({ x: 40, y: 0 }, state, candidates([46], []), 5)).toMatchObject({
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

    const collected = collectDesignerSnapCandidates(document, { x: [15], y: [25] }, ['visible']);
    expect({
      x: collected.x.map((candidate) => candidate.value),
      y: collected.y.map((candidate) => candidate.value),
    }).toEqual({
      x: [0, 15, 80, 100, 130, 180, 200],
      y: [0, 10, 25, 30, 50, 100],
    });
    // 组件参考线携带局部几何（起点/长度），画布与用户参考线为全画布尺寸（y 向线长 = 画布宽）。
    expect(collected.x).toEqual([
      { value: 0, start: 0, size: 100 },
      { value: 15, start: 0, size: 100 },
      { value: 80, start: 10, size: 40 },
      { value: 100, start: 0, size: 100 },
      { value: 130, start: 10, size: 40 },
      { value: 180, start: 10, size: 40 },
      { value: 200, start: 0, size: 100 },
    ]);
    expect(collected.y).toEqual([
      { value: 0, start: 0, size: 200 },
      { value: 10, start: 80, size: 100 },
      { value: 25, start: 0, size: 200 },
      { value: 30, start: 80, size: 100 },
      { value: 50, start: 0, size: 200 },
      { value: 100, start: 0, size: 200 },
    ]);
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

    const collected = collectDesignerSnapCandidates(document, { x: [], y: [] });
    expect({
      x: collected.x.map((candidate) => candidate.value),
      y: collected.y.map((candidate) => candidate.value),
    }).toEqual({
      x: [0, 80, 100, 120, 200],
      y: [0, 50, 100],
    });
  });

  it('R2 snaps selection edge and center anchors with one shared translation', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };

    expect(
      snapDesignerSelectionTranslation(
        { left: 10, right: 110, top: 20, bottom: 60 },
        { x: 37, y: 31 },
        state,
        candidates([150], [70]),
      ),
    ).toMatchObject({ x: 40, y: 30, snappedX: 150, snappedY: 70 });
  });

  it('R2 competes smart guides against the grid by absolute distance at a single point', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;

    expect(snapDesignerCanvasPoint({ x: 98, y: 0 }, state, candidates([99], []))).toEqual({
      x: 99,
      y: 0,
      snappedX: 99,
      snappedY: 0,
    });
    expect(snapDesignerCanvasPoint({ x: 95, y: 0 }, state, candidates([99], []))).toEqual({
      x: 96,
      y: 0,
      snappedX: 96,
      snappedY: 0,
    });
  });

  it('R2 holds an active single-point snap inside the release band, then releases to the grid', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };
    const session: DesignerSnapSession = { x: { value: 100 } };

    expect(
      snapDesignerCanvasPoint({ x: 106, y: 0 }, state, candidates([], []), 1, session),
    ).toEqual({
      x: 100,
      y: 0,
      snappedX: 100,
    });
    expect(session.x).toEqual({ value: 100 });
    expect(
      snapDesignerCanvasPoint({ x: 109, y: 0 }, state, candidates([], []), 1, session),
    ).toEqual({
      x: 109,
      y: 0,
    });
    expect(session.x).toBeUndefined();
  });

  it('R2 prefers a fresh smart hit over holding the previous single-point target', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };
    const session: DesignerSnapSession = { x: { value: 100 } };

    expect(
      snapDesignerCanvasPoint({ x: 103, y: 0 }, state, candidates([105], []), 1, session),
    ).toEqual({ x: 105, y: 0, snappedX: 105 });
    expect(session.x).toEqual({ value: 105 });
  });

  it('R2 scales the release band with zoom so it stays a screen-pixel semantic', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };
    const session: DesignerSnapSession = { x: { value: 100 } };

    expect(
      snapDesignerCanvasPoint({ x: 101, y: 0 }, state, candidates([], []), 5, session),
    ).toEqual({
      x: 100,
      y: 0,
      snappedX: 100,
    });
    expect(
      snapDesignerCanvasPoint({ x: 102, y: 0 }, state, candidates([], []), 5, session),
    ).toEqual({
      x: 102,
      y: 0,
    });
  });

  it('R2 follows the same selection anchor while dragging near its guide', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };
    const session: DesignerSnapSession = { x: { anchor: 110, value: 150 } };
    const bounds = { left: 10, right: 110, top: 20, bottom: 60 };

    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 44, y: 31 },
        state,
        candidates([150], [70]),
        1,
        session,
      ),
    ).toMatchObject({ x: 40, y: 30, snappedX: 150, snappedY: 70 });
    expect(session.x).toEqual({ anchor: 110, value: 150 });
  });

  it('R2 keeps the snapped selection inside the release band and releases beyond it', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };
    const session: DesignerSnapSession = { x: { anchor: 110, value: 150 } };
    const bounds = { left: 10, right: 110, top: 20, bottom: 60 };

    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 48, y: 31 },
        state,
        candidates([150], [70]),
        1,
        session,
      ),
    ).toMatchObject({ x: 40, y: 30, snappedX: 150, snappedY: 70 });
    expect(session.x).toEqual({ anchor: 110, value: 150 });
    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 53, y: 31 },
        state,
        candidates([150], [70]),
        1,
        session,
      ),
    ).toMatchObject({ x: 53, y: 30, snappedY: 70 });
    expect(session.x).toBeUndefined();
  });

  it('R2 keeps an already-tracked anchor over a nearer grid line', () => {
    const session: DesignerSnapSession = { x: { anchor: 110, value: 150 } };
    const bounds = { left: 10, right: 110, top: 20, bottom: 60 };

    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 45, y: 31 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        candidates([150], [70]),
        1,
        session,
      ),
    ).toMatchObject({ x: 40, y: 30, snappedX: 150, snappedY: 70 });
  });

  it('R2 competes anchors by distance when the tracked anchor is no longer the best hit', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };
    const session: DesignerSnapSession = { x: { anchor: 50, value: 96 } };
    const bounds = { left: 0, right: 100, top: 20, bottom: 60 };

    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 51, y: 0 },
        state,
        candidates([96, 150], []),
        1,
        session,
      ),
    ).toMatchObject({ x: 50, y: 0, snappedX: 150 });
    expect(session.x).toEqual({ anchor: 100, value: 150 });
  });

  it('R2 falls back to the grid after the release band when grid snap is enabled', () => {
    const session: DesignerSnapSession = { x: { anchor: 110, value: 150 } };
    const bounds = { left: 10, right: 110, top: 20, bottom: 60 };

    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 53, y: 31 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        candidates([150], [70]),
        1,
        session,
      ),
    ).toMatchObject({ x: 62, y: 30, snappedX: 72, snappedY: 70 });
  });

  it('R2 emits only render-threshold (1px) guide lines with geometry and sorting', () => {
    const state = { ...DEFAULT_DESIGNER_CANVAS_AIDS, gridSnapEnabled: false };

    const result = snapDesignerSelectionTranslation(
      { left: 0, right: 100, top: 20, bottom: 60 },
      { x: 51, y: 31 },
      state,
      candidates([96, 150], [70]),
    );
    // 吸附（5px 阈值）命中 150（dist 1）；渲染阈值 1px：96（dist 5）不显示。
    expect(result.snappedX).toBe(150);
    expect(result.guides).toEqual({
      x: [{ value: 150, start: 0, size: 100, distance: 1 }],
      y: [{ value: 70, start: 0, size: 100, distance: 1 }],
    });
  });

  it('R2 emits no guide lines for grid-only snapping', () => {
    const result = snapDesignerSelectionTranslation(
      { left: 10, right: 110, top: 20, bottom: 60 },
      { x: 53, y: 31 },
      DEFAULT_DESIGNER_CANVAS_AIDS,
      candidates([], [70]),
    );
    expect(result.x).toBe(62);
    expect(result.guides).toEqual({
      y: [{ value: 70, start: 0, size: 100, distance: 1 }],
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
