import type { ScreenDocument } from '@base-screen/contracts';
import * as core from '@base-screen/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerSnapController } from '../../../../src/browser/controllers/workbench/designer-snap-controller.js';
import { DesignerWorkbenchController } from '../../../../src/browser/controllers/workbench/designer-workbench-controller.js';
import * as geometry from '../../../../src/browser/viewport/designer-canvas-snap-geometry.js';
import { createWorkbench, measurementComponent } from './designer-workbench-fixture.js';

afterEach(() => vi.restoreAllMocks());

describe('DesignerSnapController geometry lifecycle', () => {
  it('projects component bounds once for both snapping and measurements throughout a gesture', () => {
    const bounds = vi.spyOn(core, 'getScreenComponentBounds');
    const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
    const { controller, state, getDocument } = createSnap();
    controller.setSessionActive(true);
    const selection = { left: 100, right: 200, top: 146, bottom: 180 };
    const snap = () => controller.snapSelectionOffset(selection, { x: 0, y: 0 }, ['selected']);
    expect(snap().measurements?.[0]?.distance).toBe(46);
    for (let frame = 0; frame < 20; frame++) snap();
    state.zoom = 2;
    state.document = documentWithTarget(100, 20);
    expect(snap().measurements?.[0]?.distance).toBe(46);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(bounds).toHaveBeenCalledTimes(1);
    expect(getDocument).toHaveBeenCalledTimes(1);

    controller.setSessionActive(false);
    expect(snap().measurements?.[0]?.distance).toBe(26);
    expect(collect).toHaveBeenCalledTimes(2);
    expect(bounds).toHaveBeenCalledTimes(2);
  });

  it('treats reordered and duplicate exclusions as sets and invalidates when membership changes', () => {
    const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
    const { controller } = createSnap();
    controller.setSessionActive(true);
    controller.snapPoint({ x: 101, y: 251 }, ['target', 'selected']);
    controller.snapPoint({ x: 101, y: 251 }, ['selected', 'target', 'target']);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(controller.snapPoint({ x: 101, y: 251 }, ['selected', 'selected']).x).toBe(100);
    expect(collect).toHaveBeenCalledTimes(2);
    expect(controller.snapPoint({ x: 101, y: 251 }, ['target', 'selected']).x).toBe(101);
    expect(collect).toHaveBeenCalledTimes(3);
  });

  it('refreshes user guides explicitly and does not hold a deleted target', () => {
    const { controller, state } = createSnap();
    controller.setSessionActive(true);
    expect(controller.snapPoint({ x: 49, y: 250 }).x).toBe(49);
    state.guides.x = [50];
    controller.invalidateCandidates();
    expect(controller.snapPoint({ x: 49, y: 250 }).x).toBe(50);
    state.guides.x = [];
    controller.invalidateCandidates();
    expect(controller.snapPoint({ x: 49, y: 250 }).x).toBe(49);
  });

  it.each(['toggleSnap', 'toggleBorderGuides'] as const)(
    'drops geometry and hold state when %s changes',
    (toggle) => {
      const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
      const { controller, state } = createSnap();
      controller.setSessionActive(true);
      expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(100);
      controller[toggle]();
      expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(101);
      state.document = documentWithTarget(200);
      controller[toggle]();
      expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(101);
      expect(collect).toHaveBeenCalledTimes(2);
    },
  );

  it('uses live zoom without rebuilding static geometry', () => {
    const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
    const { controller, state } = createSnap();
    controller.setSessionActive(true);
    expect(controller.snapPoint({ x: 102, y: 250 }).x).toBe(100);
    state.zoom = 5;
    expect(controller.snapPoint({ x: 102, y: 250 }).x).toBe(102);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('only snaps to components inside the visible region', () => {
    const { controller, state } = createSnap();
    state.document = documentWithTarget(100, 400);
    expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(100);
    state.region = { left: 0, top: 0, right: 960, bottom: 300 };
    expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(101);
    state.region = { left: 0, top: 300, right: 960, bottom: 600 };
    expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(100);
  });

  it.each([
    [1, 101],
    [0.1, 100],
  ])('ignores components beyond the screen-space reach at zoom %s', (zoom, expected) => {
    // The target sits 1750 below the pointer: past 180 screen px at zoom 1, within at 0.1.
    const { controller, state } = createSnap();
    state.document = documentWithTarget(100, 2_000);
    state.zoom = zoom;
    controller.setSessionActive(true);
    expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(expected);
  });

  it('snaps to siblings and the parent container, never to components elsewhere', () => {
    const { controller, state } = createSnap();
    state.document = {
      ...documentWithTarget(0),
      components: [
        { ...measurementComponent('frame', 100, 100, 400, 300) },
        { ...measurementComponent('inside', 150, 150, 100, 40), parentId: 'frame' },
        { ...measurementComponent('sibling', 300, 150, 100, 40), parentId: 'frame' },
        { ...measurementComponent('nested', 330, 250, 50, 40), parentId: 'sibling' },
        measurementComponent('outside', 520, 150, 100, 40),
      ],
    };
    // Dragging `inside`: its sibling and the frame edge are targets.
    expect(controller.snapPoint({ x: 302, y: 170 }, ['inside']).x).toBe(300);
    expect(controller.snapPoint({ x: 102, y: 170 }, ['inside']).x).toBe(100);
    // The other frame's child and a root component are not.
    expect(controller.snapPoint({ x: 331, y: 170 }, ['inside']).x).toBe(331);
    expect(controller.snapPoint({ x: 521, y: 170 }, ['inside']).x).toBe(521);
    // At the root, the frame snaps as a whole and its children do not.
    expect(controller.snapPoint({ x: 498, y: 50 }, ['outside']).x).toBe(500);
    expect(controller.snapPoint({ x: 152, y: 50 }, ['outside']).x).toBe(152);
  });

  it('collects guides for derived geometry with the gesture snapshot', () => {
    const { controller } = createSnap();
    controller.setSessionActive(true);
    // A box resized so its left edge meets x 100: `selected` (146..180) is within reach and
    // marked; `target` (0..100) is 200 above, beyond it.
    const box = { left: 100, right: 160, top: 300, bottom: 340 };
    expect(controller.alignmentGuides(box)).toEqual({
      x: [{ value: 100, start: 146, size: 194, points: [146, 180, 300, 340] }],
    });
    controller.toggleSnap();
    expect(controller.alignmentGuides(box)).toBeUndefined();
  });

  it('keeps caches instance-local and evaluates fresh geometry outside a session', () => {
    const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
    const first = createSnap();
    const second = createSnap();
    second.state.document = documentWithTarget(200);
    first.controller.setSessionActive(true);
    expect(first.controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(100);
    expect(second.controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(101);
    second.controller.snapPoint({ x: 101, y: 250 }, ['selected']);
    expect(collect).toHaveBeenCalledTimes(3);
  });

  it.each(['cancelTransientState', 'disconnect'] as const)(
    'releases the snapshot when the workbench calls %s',
    (method) => {
      let document = documentWithTarget(100);
      const controller = new DesignerWorkbenchController({
        getCanvas: () => undefined,
        getRoot: () => null,
        getZoom: () => 1,
        getDocument: () => document,
        getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      });
      controller.setSnapSessionActive(true);
      expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(100);
      document = documentWithTarget(200);
      controller[method]();
      expect(controller.snapPoint({ x: 101, y: 250 }, ['selected']).x).toBe(101);
      controller.setSnapSessionActive(true);
      expect(controller.snapPoint({ x: 201, y: 250 }, ['selected']).x).toBe(200);
    },
  );
});

describe('DesignerSnapController explicit previews', () => {
  it.each([0.1, 1, 5])(
    'marks a captured canvas edge for every attached point and clears it on release at zoom %s',
    (zoom) => {
      const workbench = createWorkbench();
      workbench.controller.initialize();
      workbench.zoom.value = zoom;
      const preview = workbench.controller.snapPoint({ x: 3 / zoom, y: 200 });
      expect(preview.x).toBe(0);
      workbench.controller.renderSnapPreview(preview);
      expect(workbench.guides.children).toHaveLength(1);
      workbench.controller.renderSnapPreview(
        workbench.controller.snapPoint({ x: 0.5 / zoom, y: 200 }),
      );
      expect(workbench.guides.children).toHaveLength(1);
      workbench.controller.renderSnapPreview(workbench.controller.snapPoint({ x: 0, y: 200 }));
      expect(workbench.guides.children).toHaveLength(1);
      workbench.controller.renderSnapPreview(
        workbench.controller.snapPoint({ x: 9 / zoom, y: 200 }),
      );
      expect(workbench.guides.children).toHaveLength(0);
    },
  );

  it('rejects a late preview after smart guides are disabled', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const preview = workbench.controller.snapPoint({ x: 0.5, y: 200 });
    workbench.controller.renderSnapPreview(preview);
    expect(workbench.guides.children).toHaveLength(1);
    workbench.controller.toggleBorderGuides();
    workbench.controller.renderSnapPreview(preview);
    expect(workbench.guides.children).toHaveLength(0);
  });
});

function createSnap() {
  const state = {
    document: documentWithTarget(100),
    zoom: 1,
    guides: { x: [] as number[], y: [] as number[] },
    region: undefined as { left: number; top: number; right: number; bottom: number } | undefined,
  };
  const getDocument = vi.fn(() => state.document);
  return {
    state,
    getDocument,
    controller: new DesignerSnapController({
      getDocument,
      getGuides: () => state.guides,
      getVisibleRegion: () => state.region,
      getZoom: () => state.zoom,
      getRoot: () => null,
      renderGuides: vi.fn(),
      renderRulers: vi.fn(),
      renderStatus: vi.fn(),
    }),
  };
}

function documentWithTarget(x: number, y = 0): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      measurementComponent('target', x, y, 100, 100),
      measurementComponent('selected', 100, 146, 100, 34),
    ],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}
