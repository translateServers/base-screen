import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../src/browser/controllers/designer-gesture-controller.js';
import {
  catalog,
  createCanvas,
  createGrabTarget,
  createViewport,
  document,
  FakeElement,
} from './designer-gesture-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerGestureController viewport background click', () => {
  it('clears the selection when clicking the viewport background outside the canvas', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1'],
        focusedComponentId: 'rectangle-1',
      }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', { target: viewport.viewport } as unknown as PointerEvent);

    expect(reduceSelection).toHaveBeenCalledWith({ type: 'clear-selection' });
  });

  it('keeps the selection when clicking inside the canvas', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1'],
        focusedComponentId: 'rectangle-1',
      }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', {
      target: material,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
  });

  it('does not clear the selection from a secondary click on the viewport background', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1'],
        focusedComponentId: 'rectangle-1',
      }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', {
      button: 2,
      target: viewport.viewport,
    } as unknown as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
  });

  it('R4 cancels a pending drag when the pointer leaves the canvas before capture', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1'],
        focusedComponentId: 'rectangle-1',
      }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);
    controller.connectViewport(viewport.viewport);

    canvas.dispatch('pointerdown', {
      pointerId: 11,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);
    expect(canvas.canvas.hasPointerCapture(11)).toBe(false);

    viewport.dispatch('pointercancel', {
      pointerId: 11,
      target: viewport.viewport,
    } as unknown as PointerEvent);

    expect(controller.active).toBe(false);
  });

  it('does not clear when nothing is selected', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', { target: viewport.viewport } as unknown as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
  });
});

describe('DesignerGestureController gesture-active state', () => {
  it('R3 reports active during a drag and restores on every exit path', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => document(),
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1'],
        focusedComponentId: 'rectangle-1',
      }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);
    const pointerDown = {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent;

    canvas.dispatch('pointerdown', pointerDown);
    expect(controller.active).toBe(true);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(controller.active).toBe(false);

    canvas.dispatch('pointerdown', pointerDown);
    expect(controller.active).toBe(true);
    canvas.dispatch('pointercancel', { pointerId: 1 } as PointerEvent);
    expect(controller.active).toBe(false);

    canvas.dispatch('pointerdown', pointerDown);
    expect(controller.active).toBe(true);
    canvas.dispatch('lostpointercapture', { pointerId: 1 } as PointerEvent);
    expect(controller.active).toBe(false);
  });
});

describe('DesignerGestureController snap session', () => {
  it('activates the snap session on drag start and releases it on completion', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const setSnapSessionActive = vi.fn();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1'],
        focusedComponentId: 'rectangle-1',
      }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: vi.fn(),
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      setSnapSessionActive,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: createGrabTarget(),
    } as unknown as PointerEvent);
    expect(setSnapSessionActive).not.toHaveBeenCalled();
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(true);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(false);
  });

  it('activates the snap session on create start and releases it on cancel', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const setSnapSessionActive = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'rectangle',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => ({ rectangle: 'base.rectangle' }),
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: vi.fn(),
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      setSnapSessionActive,
      snapCanvasPoint: (point) => point,
      snapCanvasSelection: (_bounds, translation) => translation,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(true);
    canvas.dispatch('pointercancel', {} as PointerEvent);
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(false);
  });

  it('enters text editing on double click of an editable text component outside group editing', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const text = {
      ...document().components[0]!,
      id: 'text-1',
      type: 'base.text',
      dataSource: { type: 'static' as const, value: '标题' },
    };
    const current = { ...document(), components: [text] };
    const textMaterial = new FakeElement();
    textMaterial.dataset.baseScreenComponentId = 'text-1';
    textMaterial.matches['[data-base-screen-component-id]'] = textMaterial;
    canvas.registerMaterial('text-1', textMaterial);
    const enterTextEdit = vi.fn(() => true);
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasPoint: (point) => point,
      snapCanvasSelection: (_bounds, translation) => translation,
      zoomBy: () => undefined,
      enterTextEdit,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('dblclick', {
      target: textMaterial,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);

    expect(enterTextEdit).toHaveBeenCalledWith('text-1');
    expect(reduceSelection).not.toHaveBeenCalled();
  });
});

describe('DesignerGestureController listener pairing', () => {
  it('disconnect removes canvas and viewport listeners pairwise and reconnect remounts them', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const added: string[] = [];
    const removed: string[] = [];
    const listeners = new Map<EventListener, string>();
    const makeSurface = () =>
      ({
        addEventListener: (type: string, listener: EventListener) => {
          added.push(type);
          listeners.set(listener, type);
        },
        removeEventListener: (type: string, listener: EventListener) => {
          removed.push(type);
          expect(listeners.get(listener)).toBe(type);
          listeners.delete(listener);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        getRootNode: () => null,
      }) as unknown as HTMLDivElement;
    const canvas = makeSurface();
    const viewport = makeSurface();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => undefined,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });

    controller.connect(canvas);
    controller.connectViewport(viewport);
    // 画布 9 个监听 + 视窗 4 个监听；同表面重复 connect 幂等。
    controller.connect(canvas);
    expect(added).toHaveLength(13);
    expect(listeners.size).toBe(13);

    controller.disconnect();
    expect(removed).toHaveLength(13);
    expect(listeners.size).toBe(0);

    controller.connect(canvas);
    controller.connectViewport(viewport);
    expect(added).toHaveLength(26);
    expect(removed).toHaveLength(13);
  });
});
