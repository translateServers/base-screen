import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenComponentBounds } from '@base-screen/core';
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
  it('R2 does not derive snap targets from the grid', () => {
    expect(snapDesignerCanvasPoint({ x: 35, y: 61 }, DEFAULT_DESIGNER_CANVAS_AIDS)).toEqual({
      x: 35,
      y: 61,
    });
    expect(
      snapDesignerSelectionTranslation(
        { left: 100, right: 200, top: 100, bottom: 140 },
        { x: 21, y: 21 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
      ),
    ).toEqual({ x: 21, y: 21 });
  });

  it('uses guides within the 5px smart-guide threshold', () => {
    expect(
      snapDesignerCanvasPoint(
        { x: 49, y: 89 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        candidates([52], [84]),
      ),
    ).toEqual({ x: 52, y: 84, snappedX: 52, snappedY: 84 });
  });

  it('R2 applies the 1px render threshold and preserves local geometry for point snaps', () => {
    const local: DesignerSnapCandidates = {
      x: [{ value: 50, start: 120, size: 40 }],
      y: [],
    };

    expect(snapDesignerCanvasPoint({ x: 47, y: 0 }, DEFAULT_DESIGNER_CANVAS_AIDS, local)).toEqual({
      x: 50,
      y: 0,
      snappedX: 50,
    });
    expect(snapDesignerCanvasPoint({ x: 49.5, y: 0 }, DEFAULT_DESIGNER_CANVAS_AIDS, local)).toEqual(
      {
        x: 50,
        y: 0,
        snappedX: 50,
        guides: { x: [{ value: 50, start: 120, size: 40 }] },
      },
    );
    expect(
      snapDesignerCanvasPoint({ x: 50, y: 0 }, DEFAULT_DESIGNER_CANVAS_AIDS, local),
    ).toMatchObject({ guides: { x: [{ value: 50, start: 120, size: 40 }] } });
  });

  it('R7 chooses the nearest sorted candidate within a screen-pixel threshold at every zoom', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;

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
      blueprint: { relations: [] },
    };

    const collected = collectDesignerSnapCandidates(document, { x: [15], y: [25] }, ['visible']);
    expect({
      x: collected.x.map((candidate) => candidate.value),
      y: collected.y.map((candidate) => candidate.value),
    }).toEqual({
      x: [0, 15, 80, 130, 180, 200],
      y: [0, 10, 25, 30, 50, 100],
    });
    // 组件参考线携带局部几何（起点/长度），画布与用户参考线为全画布尺寸（y 向线长 = 画布宽）；
    // 画布中心点（100/50）不作为候选。
    expect(collected.x).toEqual([
      { value: 0, start: 0, size: 100 },
      { value: 15, start: 0, size: 100 },
      { value: 80, start: 10, size: 40 },
      { value: 130, start: 10, size: 40 },
      { value: 180, start: 10, size: 40 },
      { value: 200, start: 0, size: 100 },
    ]);
    expect(collected.y).toEqual([
      { value: 0, start: 0, size: 200 },
      { value: 10, start: 80, size: 100 },
      { value: 25, start: 0, size: 200 },
      { value: 30, start: 80, size: 100 },
      { value: 50, start: 80, size: 100 },
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
      blueprint: { relations: [] },
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
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;

    expect(
      snapDesignerSelectionTranslation(
        { left: 10, right: 110, top: 20, bottom: 60 },
        { x: 37, y: 31 },
        state,
        candidates([150], [70]),
      ),
    ).toMatchObject({ x: 40, y: 30, snappedX: 150, snappedY: 70 });
  });

  it('R2 keeps a single-point snap inside the capture threshold and releases beyond it (×1.0, Nebula 语义)', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;
    const session: DesignerSnapSession = { x: { value: 100 } };

    expect(
      snapDesignerCanvasPoint({ x: 104, y: 0 }, state, candidates([], []), 1, session),
    ).toEqual({
      x: 100,
      y: 0,
      snappedX: 100,
    });
    expect(session.x).toEqual({ value: 100 });
    expect(
      snapDesignerCanvasPoint({ x: 106, y: 0 }, state, candidates([], []), 1, session),
    ).toEqual({
      x: 106,
      y: 0,
    });
    expect(session.x).toBeUndefined();
  });

  it('R2 prefers a fresh smart hit over holding the previous single-point target', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;
    const session: DesignerSnapSession = { x: { value: 100 } };

    expect(
      snapDesignerCanvasPoint({ x: 103, y: 0 }, state, candidates([105], []), 1, session),
    ).toEqual({ x: 105, y: 0, snappedX: 105 });
    expect(session.x).toEqual({ value: 105 });
  });

  it('R2 scales the capture threshold with zoom so it stays a screen-pixel semantic', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;
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
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;
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

  it('R2 keeps the snapped selection inside the capture threshold and releases beyond it (×1.0)', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;
    const session: DesignerSnapSession = { x: { anchor: 110, value: 150 } };
    const bounds = { left: 10, right: 110, top: 20, bottom: 60 };

    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 45, y: 31 },
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
        { x: 47, y: 31 },
        state,
        candidates([150], [70]),
        1,
        session,
      ),
    ).toMatchObject({ x: 47, y: 30, snappedY: 70 });
    expect(session.x).toBeUndefined();
  });

  it('R2 keeps an already-tracked anchor inside the capture threshold', () => {
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
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;
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

  it('R2 emits only the nearest render-threshold (1px) guide line per axis', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;

    const result = snapDesignerSelectionTranslation(
      { left: 0, right: 100, top: 20, bottom: 60 },
      { x: 51, y: 31 },
      state,
      candidates([96, 150], [70]),
    );
    // 吸附（5px 阈值）命中 150（dist 1）；渲染阈值 1px：96（dist 5）不显示。
    expect(result.snappedX).toBe(150);
    expect(result.guides).toEqual({
      x: [{ value: 150, start: 0, size: 100 }],
      y: [{ value: 70, start: 0, size: 100 }],
    });
  });

  it('R2 renders only the nearest line when several candidates are within the render threshold', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;

    const result = snapDesignerSelectionTranslation(
      { left: 0, right: 100, top: 20, bottom: 60 },
      { x: 51, y: 31 },
      state,
      // anchor 50 → 101 距 102（dist 1）、anchor 100 → 151 距 150（dist 1）：两条线都在渲染阈值内，
      // 每轴只输出最近一条（同距离取候选序首个 = 102）。
      candidates([102, 150], [70]),
    );
    expect(result.snappedX).toBe(102);
    expect(result.guides).toEqual({
      x: [{ value: 102, start: 0, size: 100 }],
      y: [{ value: 70, start: 0, size: 100 }],
    });
  });

  it('R2 keeps exact component-boundary snaps without rendering canvas-spanning guides', () => {
    const document: ScreenDocument = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [component('above', 130, 126, false, false)],
      variables: [],
      blueprint: { relations: [] },
    };

    expect(
      snapDesignerSelectionTranslation(
        { left: 130, right: 230, top: 166, bottom: 206 },
        { x: 0, y: 0 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        collectDesignerSnapCandidates(document, { x: [], y: [] }, ['selected']),
      ),
    ).toEqual({
      x: 0,
      y: 0,
      snappedX: 130,
      snappedY: 166,
    });
  });

  it('R2 keeps rotated candidate anchors identical to Core visual bounds', () => {
    const document: ScreenDocument = {
      canvas: { width: 400, height: 300, backgroundColor: '#000000' },
      components: [component('rotated', 80, 60, false, false, 37)],
      variables: [],
      blueprint: { relations: [] },
    };
    const bounds = getScreenComponentBounds(document.components[0]!);
    const collected = collectDesignerSnapCandidates(document, { x: [], y: [] });

    expect(collected.x).toContainEqual({
      value: bounds.left,
      start: bounds.top,
      size: bounds.bottom - bounds.top,
    });
    expect(collected.x).toContainEqual({
      value: bounds.right,
      start: bounds.top,
      size: bounds.bottom - bounds.top,
    });
    expect(collected.y).toContainEqual({
      value: bounds.top,
      start: bounds.left,
      size: bounds.right - bounds.left,
    });
    expect(collected.y).toContainEqual({
      value: bounds.bottom,
      start: bounds.left,
      size: bounds.right - bounds.left,
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
