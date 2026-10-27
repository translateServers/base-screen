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
    controller.snapPoint({ x: 101, y: 301 }, ['target', 'selected']);
    controller.snapPoint({ x: 101, y: 301 }, ['selected', 'target', 'target']);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(controller.snapPoint({ x: 101, y: 301 }, ['selected', 'selected']).x).toBe(100);
    expect(collect).toHaveBeenCalledTimes(2);
    expect(controller.snapPoint({ x: 101, y: 301 }, ['target', 'selected']).x).toBe(101);
    expect(collect).toHaveBeenCalledTimes(3);
  });

  it('refreshes user guides explicitly and does not hold a deleted target', () => {
    const { controller, state } = createSnap();
    controller.setSessionActive(true);
    expect(controller.snapPoint({ x: 49, y: 300 }).x).toBe(49);
    state.guides.x = [50];
    controller.invalidateCandidates();
    expect(controller.snapPoint({ x: 49, y: 300 }).x).toBe(50);
    state.guides.x = [];
    controller.invalidateCandidates();
    expect(controller.snapPoint({ x: 49, y: 300 }).x).toBe(49);
  });

  it.each(['toggleSnap', 'toggleBorderGuides'] as const)(
    'drops geometry and hold state when %s changes',
    (toggle) => {
      const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
      const { controller, state } = createSnap();
      controller.setSessionActive(true);
      expect(controller.snapPoint({ x: 101, y: 300 }, ['selected']).x).toBe(100);
      controller[toggle]();
      expect(controller.snapPoint({ x: 101, y: 300 }, ['selected']).x).toBe(101);
      state.document = documentWithTarget(200);
      controller[toggle]();
      expect(controller.snapPoint({ x: 101, y: 300 }, ['selected']).x).toBe(101);
      expect(collect).toHaveBeenCalledTimes(2);
    },
  );

  it('uses live zoom without rebuilding static geometry', () => {
    const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
    const { controller, state } = createSnap();
    controller.setSessionActive(true);
    expect(controller.snapPoint({ x: 102, y: 300 }).x).toBe(100);
    state.zoom = 5;
    expect(controller.snapPoint({ x: 102, y: 300 }).x).toBe(102);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('keeps caches instance-local and evaluates fresh geometry outside a session', () => {
    const collect = vi.spyOn(geometry, 'collectDesignerSnapComponentBounds');
    const first = createSnap();
    const second = createSnap();
    second.state.document = documentWithTarget(200);
    first.controller.setSessionActive(true);
    expect(first.controller.snapPoint({ x: 101, y: 300 }, ['selected']).x).toBe(100);
    expect(second.controller.snapPoint({ x: 101, y: 300 }, ['selected']).x).toBe(101);
    second.controller.snapPoint({ x: 101, y: 300 }, ['selected']);
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
      expect(controller.snapPoint({ x: 101, y: 300 }, ['selected']).x).toBe(100);
      document = documentWithTarget(200);
      controller[method]();
      expect(controller.snapPoint({ x: 101, y: 300 }, ['selected']).x).toBe(101);
      controller.setSnapSessionActive(true);
      expect(controller.snapPoint({ x: 201, y: 300 }, ['selected']).x).toBe(200);
    },
  );
});

describe('DesignerSnapController explicit previews', () => {
  it.each([0.1, 1, 5])(
    'does not turn a captured point into a full-canvas guide at zoom %s',
    (zoom) => {
      const workbench = createWorkbench();
      workbench.controller.initialize();
      workbench.zoom.value = zoom;
      const preview = workbench.controller.snapPoint({ x: 3 / zoom, y: 200 });
      expect(preview.x).toBe(0);
      workbench.controller.renderSnapPreview(preview);
      expect(workbench.guides.children).toHaveLength(0);
      workbench.controller.renderSnapPreview(
        workbench.controller.snapPoint({ x: 0.5 / zoom, y: 200 }),
      );
      expect(workbench.guides.children).toHaveLength(1);
      workbench.controller.renderSnapPreview(workbench.controller.snapPoint({ x: 0, y: 200 }));
      expect(workbench.guides.children).toHaveLength(1);
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
  };
  const getDocument = vi.fn(() => state.document);
  return {
    state,
    getDocument,
    controller: new DesignerSnapController({
      getDocument,
      getGuides: () => state.guides,
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
    blueprint: { relations: [] },
  };
}
