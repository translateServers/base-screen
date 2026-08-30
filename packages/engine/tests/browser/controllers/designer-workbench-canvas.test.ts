import type { ScreenDocument } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerViewportController } from '../../../src/browser/controllers/designer-viewport-controller.js';
import { DesignerWorkbenchController } from '../../../src/browser/controllers/designer-workbench-controller.js';
import { createWorkbench, measurementComponent } from './designer-workbench-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerWorkbenchController canvas state', () => {
  it('R7 renders snap previews as transient overlays without touching the document', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const originalDocument = structuredClone(workbench.document);

    workbench.controller.renderSnapPreview({ x: 50, y: 40, snappedX: 50 });

    expect(workbench.guides.children).toHaveLength(1);
    expect(workbench.guides.children[0]!.className).toBe(
      'canvas-guide canvas-guide-snap canvas-guide-snap-active',
    );
    workbench.controller.renderSnapPreview(undefined);
    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('R7 renders render-threshold snap guide lines without distance labels and with active highlight', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.renderSnapPreview({
      x: 40,
      y: 30,
      snappedX: 150,
      snappedY: 70,
      guides: {
        x: [{ value: 150, start: 0, size: 100 }],
        y: [{ value: 70, start: 0, size: 100 }],
      },
    });

    expect(workbench.guides.children).toHaveLength(2);
    const xGuide = workbench.guides.children.find((child) => child.dataset.axis === 'x');
    // 吸附目标线（snappedX=150）以 active 高亮；渲染阈值内残余间距恒 ≤1px，不再叠加距离标签。
    expect(xGuide?.className).toBe('canvas-guide canvas-guide-snap canvas-guide-snap-active');
    expect(xGuide?.children).toHaveLength(0);
    workbench.controller.renderSnapPreview(undefined);
    expect(workbench.guides.children).toHaveLength(0);
  });

  it('R2 does not render snap overlays when stacked component boundaries already coincide', () => {
    const workbench = createWorkbench();
    const components = workbench.document.components as unknown as Array<
      ScreenDocument['components'][number]
    >;
    components.push(measurementComponent('above', 130, 126, 100, 40));
    workbench.controller.initialize();

    const preview = workbench.controller.snapSelectionOffset(
      { left: 130, right: 230, top: 166, bottom: 206 },
      { x: 0, y: 0 },
      ['c1'],
    );
    expect(preview).toMatchObject({
      x: 0,
      y: 0,
      snappedX: 130,
      snappedY: 166,
      guides: {},
    });

    workbench.controller.renderSnapPreview(preview);
    expect(workbench.guides.children).toHaveLength(0);
  });

  it('R2 renders alignment-rail measurements only for a moving preview without changing snap candidates', () => {
    const workbench = createWorkbench();
    const components = workbench.document.components as unknown as Array<
      ScreenDocument['components'][number]
    >;
    components.push(
      measurementComponent('top', 0, 0, 260, 100),
      measurementComponent('c1', 0, 146, 200, 34),
      measurementComponent('upper-left', 0, 228, 100, 120),
      measurementComponent('upper-right', 100, 228, 100, 120),
      measurementComponent('lower-left', 0, 407, 100, 120),
      measurementComponent('lower-right', 100, 407, 100, 120),
    );
    workbench.controller.initialize();

    expect(
      workbench.guides.children.filter((child) => child.className === 'canvas-measurement'),
    ).toHaveLength(0);

    const preview = workbench.controller.snapSelectionOffset(
      { left: 0, right: 200, top: 146, bottom: 180 },
      { x: 0, y: 0 },
      ['c1'],
    );
    expect(preview.measurements?.[0]).toMatchObject({ axis: 'y', distance: 46 });
    workbench.controller.renderSnapPreview(preview);
    let measurements = workbench.guides.children.filter(
      (child) => child.className === 'canvas-measurement',
    );
    expect(measurements).toHaveLength(7);
    expect(measurements[0]?.dataset.axis).toBe('y');
    expect(measurements[0]?.children[0]?.textContent).toBe('46');
    expect((measurements[0]?.style as unknown as CSSStyleDeclaration).height).toBe('46px');

    const movedPreview = workbench.controller.snapSelectionOffset(
      { left: 0, right: 200, top: 146, bottom: 180 },
      { x: 0, y: 4 },
      ['c1'],
    );
    expect(movedPreview.measurements?.[0]).toMatchObject({ axis: 'y', distance: 50 });
    workbench.controller.renderSnapPreview(movedPreview);
    measurements = workbench.guides.children.filter(
      (child) => child.className === 'canvas-measurement',
    );
    expect(measurements[0]?.children[0]?.textContent).toBe('50');

    workbench.controller.renderSnapPreview(undefined);
    expect(
      workbench.guides.children.filter((child) => child.className === 'canvas-measurement'),
    ).toHaveLength(0);
  });

  it('R2 clears transient snap overlays when snapping or border guides are toggled', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.renderSnapPreview({ x: 50, y: 40, snappedX: 50 });
    expect(workbench.guides.children).toHaveLength(1);
    workbench.controller.toggleSnap();
    expect(workbench.guides.children).toHaveLength(0);

    workbench.controller.toggleSnap();
    workbench.controller.renderSnapPreview({ x: 50, y: 40, snappedX: 50 });
    expect(workbench.guides.children).toHaveLength(1);
    workbench.controller.toggleBorderGuides();
    expect(workbench.guides.children).toHaveLength(0);
  });

  it('R4 keeps snap overlays disabled for previews arriving after the snap toggle is off', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.toggleSnap();
    workbench.controller.renderSnapPreview({
      x: 50,
      y: 40,
      snappedX: 50,
      guides: { x: [{ value: 50 }], y: [] },
    });

    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.controller.snapPoint({ x: 47, y: 47 })).toEqual({ x: 47, y: 47 });
  });

  it('R4 does not rebuild the guide layer for raw preview changes with no snap', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.renderSnapPreview({
      x: 48,
      y: 48,
    });
    const callsAfterFirstPreview = workbench.guides.replaceChildrenCalls;
    workbench.controller.renderSnapPreview({
      x: 72,
      y: 72,
    });

    expect(workbench.guides.replaceChildrenCalls).toBe(callsAfterFirstPreview);
  });

  it('R4 inversely scales guide and measurement chrome with canvas zoom', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.zoom.value = 5;
    workbench.controller.renderCanvasPrecision();
    const styles = workbench.guides.style as unknown as Record<string, string>;

    expect(styles['--designer-overlay-pixel']).toBe('0.2px');
    expect(styles['--designer-overlay-active']).toBe('0.4px');
    expect(styles['--designer-overlay-hit-size']).toBe('1.8px');
    expect(styles['--designer-overlay-font-size']).toBe('2px');
  });

  it('keeps the viewport active tool and zoom local to each controller', () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('DocumentFragment', class DocumentFragment {});
    const callbacks = {
      getDocument: () => undefined,
      onBlur: () => undefined,
      onToolChange: () => undefined,
    };
    const first = new DesignerViewportController(callbacks);
    const second = new DesignerViewportController(callbacks);

    first.setActiveTool('rectangle');
    first.setZoom(2);

    expect(first.activeTool).toBe('rectangle');
    expect(first.state.zoom).toBe(2);
    expect(second.activeTool).toBe('select');
    expect(second.state.zoom).toBe(1);
  });
});

describe('DesignerWorkbenchController snap session', () => {
  function componentNode(id: string, x: number) {
    return {
      id,
      type: 'base.rectangle',
      name: id,
      parentId: null,
      position: { x, y: 100 },
      size: { width: 100, height: 40 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    } as const;
  }

  function snapDocument(left: number): ScreenDocument {
    return {
      canvas: { width: 800, height: 600, backgroundColor: '#000000' },
      components: [componentNode('a', left), componentNode('b', 300)],
      variables: [],
      blueprint: { rules: [] },
    };
  }

  function createController(getDocument: () => ScreenDocument) {
    return new DesignerWorkbenchController({
      getCanvas: () => undefined,
      getDocument,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => null,
      getZoom: () => 1,
    });
  }

  it('R4 caches snap candidates within a gesture session and invalidates across sessions', () => {
    let document = snapDocument(100);
    const controller = createController(() => document);

    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(100);
    document = snapDocument(200);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(101);

    controller.setSnapSessionActive(true);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(101);
    document = snapDocument(100);
    // 会话内文档引用替换：候选仍来自会话起始文档（a@200），未重新收集。
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(101);
    controller.setSnapSessionActive(false);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(100);
  });

  it('R4 distinguishes cached candidates by excluded component set and resets the snap hold', () => {
    const controller = createController(() => snapDocument(100));

    controller.setSnapSessionActive(true);
    expect(controller.snapPoint({ x: 101, y: 0 }, ['a']).x).toBe(101);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(100);
    expect(controller.snapPoint({ x: 101, y: 0 }, ['a']).x).toBe(101);
  });

  it('R4 treats excluded component ids as an order-independent cache key', () => {
    let document = snapDocument(100);
    const controller = createController(() => document);

    controller.setSnapSessionActive(true);
    expect(controller.snapPoint({ x: 197, y: 0 }, ['a', 'b']).x).toBe(197);
    document = snapDocument(200);

    // The reversed exclusion order describes the same candidate set, so the session keeps
    // the original cache instead of collecting the replacement document mid-gesture.
    expect(controller.snapPoint({ x: 197, y: 0 }, ['b', 'a']).x).toBe(197);
    controller.setSnapSessionActive(false);
    expect(controller.snapPoint({ x: 197, y: 0 }).x).toBe(200);
  });
});
