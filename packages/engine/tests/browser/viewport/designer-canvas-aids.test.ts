import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenComponentBounds } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  collectDesignerAlignmentGuides,
  collectDesignerSnapCandidates,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  DesignerAlignmentIndex,
  type DesignerSnapCandidates,
  type DesignerSnapSession,
  getDesignerRulerMarks,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../../../src/browser/viewport/designer-canvas-aids.js';
import { collectDesignerSnapComponentBounds } from '../../../src/browser/viewport/designer-canvas-snap-geometry.js';

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

  it('uses guides within the 6px smart-guide threshold', () => {
    expect(
      snapDesignerCanvasPoint(
        { x: 49, y: 89 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        candidates([52], [84]),
      ),
    ).toEqual({
      x: 52,
      y: 84,
      snappedX: 52,
      snappedY: 84,
      guides: {
        x: [{ value: 52, start: 0, size: 100, points: [0, 84, 100] }],
        y: [{ value: 84, start: 0, size: 100, points: [0, 52, 100] }],
      },
    });
  });

  it('R2 marks a point snap as soon as it attaches and joins the target edge to the point', () => {
    const local: DesignerSnapCandidates = {
      x: [{ value: 50, start: 120, size: 40 }],
      y: [],
    };
    // Target edge spans y 120..160; the point sits at y 0, so the line runs 0..160 through
    // every snap point on it (the edge's two ends and the snapped point).
    const guides = { x: [{ value: 50, start: 0, size: 160, points: [0, 120, 160] }] };

    for (const x of [45, 47, 49.5, 50, 55]) {
      expect(snapDesignerCanvasPoint({ x, y: 0 }, DEFAULT_DESIGNER_CANVAS_AIDS, local)).toEqual({
        x: 50,
        y: 0,
        snappedX: 50,
        guides,
      });
    }
    expect(snapDesignerCanvasPoint({ x: 41, y: 0 }, DEFAULT_DESIGNER_CANVAS_AIDS, local)).toEqual({
      x: 41,
      y: 0,
    });
    // A point already beside the edge keeps the target extent.
    expect(
      snapDesignerCanvasPoint({ x: 49, y: 130 }, DEFAULT_DESIGNER_CANVAS_AIDS, local).guides,
    ).toEqual({
      x: [{ value: 50, start: 120, size: 40, points: [120, 130, 160] }],
    });
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

  it('R2 keeps a single-point snap inside the capture threshold and releases beyond it (×1.0)', () => {
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
      snapDesignerCanvasPoint({ x: 109, y: 0 }, state, candidates([], []), 1, session),
    ).toEqual({
      x: 109,
      y: 0,
    });
    expect(session.x).toBeUndefined();
  });

  it('R2 prefers a fresh smart hit over holding the previous single-point target', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;
    const session: DesignerSnapSession = { x: { value: 100 } };

    expect(
      snapDesignerCanvasPoint({ x: 103, y: 0 }, state, candidates([105], []), 1, session),
    ).toEqual({
      x: 105,
      y: 0,
      snappedX: 105,
      guides: { x: [{ value: 105, start: 0, size: 100, points: [0, 100] }] },
    });
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
        { x: 49, y: 31 },
        state,
        candidates([150], [70]),
        1,
        session,
      ),
    ).toMatchObject({ x: 49, y: 30, snappedY: 70 });
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

  it('R2 draws guides only for lines the snapped geometry exactly meets', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;

    const result = snapDesignerSelectionTranslation(
      { left: 0, right: 100, top: 20, bottom: 60 },
      { x: 51, y: 31 },
      state,
      candidates([96, 150], [70]),
    );
    // 吸附命中 150（dist 1）；吸附后中心 100 距 96 仍有 4px，不与之重合，不画线。
    expect(result.snappedX).toBe(150);
    // x 线穿过目标两端（0、100）与选区右边两角（50、90）；y 线穿过目标两端与选区中心点。
    expect(result.guides).toEqual({
      x: [{ value: 150, start: 0, size: 100, points: [0, 50, 90, 100] }],
      y: [{ value: 70, start: 0, size: 100, points: [0, 100] }],
    });
  });

  it('R2 snaps to the first equally near candidate and draws only what it then meets', () => {
    const state = DEFAULT_DESIGNER_CANVAS_AIDS;

    const result = snapDesignerSelectionTranslation(
      { left: 0, right: 100, top: 20, bottom: 60 },
      { x: 51, y: 31 },
      state,
      // anchor 50 → 101 距 102（dist 1）、anchor 100 → 151 距 150（dist 1）：同距离按锚点序取
      // 中心 → 102；吸附后右缘 152 距 150 为 2px，不重合。
      candidates([102, 150], [70]),
    );
    expect(result.snappedX).toBe(102);
    expect(result.guides).toEqual({
      x: [{ value: 102, start: 0, size: 100, points: [0, 70, 100] }],
      y: [{ value: 70, start: 0, size: 102, points: [0, 100, 102] }],
    });
  });

  it('R2 draws every edge an unmoved selection already shares, never a canvas-spanning line', () => {
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
        scene(document, ['selected']),
      ),
    ).toEqual({
      x: 0,
      y: 0,
      snappedX: 130,
      snappedY: 166,
      guides: {
        x: [
          { value: 130, start: 126, size: 80, points: [126, 166, 206] },
          // Centre lines pass through the two centre points only.
          { value: 180, start: 146, size: 40, points: [146, 186] },
          { value: 230, start: 126, size: 80, points: [126, 166, 206] },
        ],
        y: [{ value: 166, start: 130, size: 100, points: [130, 230] }],
      },
    });
  });

  it('R2 marks both canvas edges when a moved selection snaps into a corner', () => {
    const document: ScreenDocument = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [],
      variables: [],
      blueprint: { relations: [] },
    };
    const targets = scene(document);
    const bounds = { left: 37, right: 137, top: 23, bottom: 63 };
    // Canvas edges span the whole canvas; markers sit on the canvas corners and the selection.
    const corner = {
      x: [{ value: 0, start: 0, size: 540, points: [0, 40, 540] }],
      y: [{ value: 0, start: 0, size: 960, points: [0, 100, 960] }],
    };
    // Raw distances 2px / 0.5px, then an exact hit on x: both axes stay marked once attached.
    for (const offset of [
      { x: -39, y: -22.5 },
      { x: -37, y: -26 },
    ]) {
      expect(
        snapDesignerSelectionTranslation(bounds, offset, DEFAULT_DESIGNER_CANVAS_AIDS, targets),
      ).toEqual({ x: -37, y: -23, snappedX: 0, snappedY: 0, guides: corner });
    }
    // Point snaps mark both attached axes the same way.
    expect(
      snapDesignerCanvasPoint({ x: 2, y: 0.5 }, DEFAULT_DESIGNER_CANVAS_AIDS, targets),
    ).toEqual({
      x: 0,
      y: 0,
      snappedX: 0,
      snappedY: 0,
      guides: {
        x: [{ value: 0, start: 0, size: 540, points: [0, 540] }],
        y: [{ value: 0, start: 0, size: 960, points: [0, 960] }],
      },
    });
  });

  it('R2 joins each component guide to the dragged selection across the gap', () => {
    // Mirrors the harness board: target edge x=560 spans y 236..284, title bottom y=152 spans
    // x 80..580; the selection lands at x 560..760, y 152..188, away from both segments.
    const targets: DesignerSnapCandidates = {
      x: [{ value: 560, start: 236, size: 48 }],
      y: [{ value: 152, start: 80, size: 500 }],
    };
    const result = snapDesignerSelectionTranslation(
      { left: 84, right: 284, top: 300, bottom: 336 },
      { x: 474, y: -150 },
      DEFAULT_DESIGNER_CANVAS_AIDS,
      targets,
    );
    expect(result).toMatchObject({ x: 476, y: -148, snappedX: 560, snappedY: 152 });
    expect(result.guides).toEqual({
      x: [{ value: 560, start: 152, size: 132, points: [152, 188, 236, 284] }],
      y: [{ value: 152, start: 80, size: 680, points: [80, 560, 580, 760] }],
    });
  });

  it('R2 also marks an already-coincident edge on an axis the drag has not moved', () => {
    const targets = candidates([10], [0]);
    const bounds = { left: 10, right: 110, top: 23, bottom: 63 };
    expect(
      snapDesignerSelectionTranslation(
        bounds,
        { x: 0, y: -21 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        targets,
      ),
    ).toEqual({
      x: 0,
      y: -23,
      snappedX: 10,
      snappedY: 0,
      guides: {
        x: [{ value: 10, start: 0, size: 100, points: [0, 40, 100] }],
        y: [{ value: 0, start: 0, size: 110, points: [0, 10, 100, 110] }],
      },
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

describe('collectDesignerAlignmentGuides', () => {
  it('recomputes guides for derived geometry such as a resized box', () => {
    const document: ScreenDocument = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [
        component('target', 300, 0, false, false),
        component('below', 0, 200, false, false),
      ],
      variables: [],
      blueprint: { relations: [] },
    };
    // A box resized so its right edge reached x 300 while its left edge still matches `below`.
    expect(
      collectDesignerAlignmentGuides(
        { left: 0, right: 300, top: 100, bottom: 140 },
        DEFAULT_DESIGNER_CANVAS_AIDS,
        scene(document),
      ),
    ).toEqual({
      x: [
        { value: 0, start: 0, size: 540, points: [0, 100, 140, 200, 240, 540] },
        { value: 300, start: 0, size: 140, points: [0, 40, 100, 140] },
      ],
    });
    expect(
      collectDesignerAlignmentGuides(
        { left: 0, right: 300, top: 100, bottom: 140 },
        { ...DEFAULT_DESIGNER_CANVAS_AIDS, smartGuidesEnabled: false },
        scene(document),
      ),
    ).toBeUndefined();
  });
});

// The production index: canvas edges, user guides and visible component bounds.
function scene(
  document: ScreenDocument,
  excluded: readonly string[] = [],
  guides: { readonly x: readonly number[]; readonly y: readonly number[] } = { x: [], y: [] },
): DesignerAlignmentIndex {
  return DesignerAlignmentIndex.fromScene(
    document.canvas,
    guides,
    collectDesignerSnapComponentBounds(document, new Set(excluded)),
  );
}

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
