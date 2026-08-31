import type { ScreenDocumentTransaction } from '@base-screen/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../../src/browser/controllers/gesture/designer-gesture-controller.js';
import {
  MATERIAL_DRAG_TYPE,
  MATERIAL_LIBRARY_ITEM_DRAG_TYPE,
} from '../../../../src/browser/controllers/panel/designer-panel-controller.js';
import { BASE_SCREEN_HOST_RESOURCE_DRAG_MIME } from '../../../../src/index.js';
import {
  catalog,
  createCanvas,
  document,
  FakeElement,
  FakeElementBase,
} from './designer-gesture-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerGestureController material drop', () => {
  it('revalidates and inserts a host resource intent at the snapped drop point', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const insertHostResourceAt = vi.fn(() => ({
      ok: true as const,
      value: document(),
      diagnostics: [],
    }));
    const intent = {
      materialType: 'base.image',
      dataSource: {
        type: 'host-resource' as const,
        resourceType: 'xj_asset',
        resourceId: '12',
        params: {},
        binding: null,
      },
    };
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: () => ({ x: 64, y: 80, snappedX: 64, snappedY: 80 }),
      zoomBy: () => undefined,
      validateHostResourceIntent: (value) => ({ ok: true, value, diagnostics: [] }),
      insertHostResourceAt,
    });
    controller.connect(canvas.canvas);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    canvas.dispatch('dragover', {
      dataTransfer: {
        types: [BASE_SCREEN_HOST_RESOURCE_DRAG_MIME],
        getData: () => '',
      },
      preventDefault,
    } as unknown as PointerEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(insertHostResourceAt).not.toHaveBeenCalled();
    preventDefault.mockClear();
    canvas.dispatch('drop', {
      clientX: 30,
      clientY: 40,
      dataTransfer: {
        types: [BASE_SCREEN_HOST_RESOURCE_DRAG_MIME],
        getData: () => JSON.stringify(intent),
      },
      preventDefault,
      stopPropagation,
    } as unknown as PointerEvent);

    expect(insertHostResourceAt).toHaveBeenCalledWith(
      intent,
      expect.objectContaining({ x: 64, y: 80 }),
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('reports and ignores an invalid host resource drag payload', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const reportDiagnostics = vi.fn();
    const insertHostResourceAt = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
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
      insertHostResourceAt,
      reportDiagnostics,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('drop', {
      dataTransfer: {
        types: [BASE_SCREEN_HOST_RESOURCE_DRAG_MIME],
        getData: () => '{',
      },
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent);

    expect(insertHostResourceAt).not.toHaveBeenCalled();
    expect(reportDiagnostics).toHaveBeenCalledWith([
      expect.objectContaining({ code: 'AUTHORING_PAYLOAD_INVALID' }),
    ]);
  });

  it('adds a component at the drop point when a material is dropped on the canvas', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    const dataTransfer = {
      types: [MATERIAL_DRAG_TYPE],
      getData: () => 'base.rectangle',
    };
    canvas.dispatch('drop', {
      clientX: 30,
      clientY: 40,
      dataTransfer,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'add-component',
            component: {
              id: 'base-rectangle-2',
              type: 'base.rectangle',
              name: 'Rectangle',
              parentId: null,
              position: { x: 30, y: 40 },
              size: { width: 100, height: 80 },
              rotation: 0,
              zIndex: 1,
              status: { locked: false, hidden: false },
              props: {},
              style: {},
              dataSource: null,
            },
          },
        ],
      },
    ]);
  });

  it('uses projected item defaults while preserving the canonical type on drop', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getMaterialLibraryItem: (id) =>
        id === 'asset:12'
          ? ({
              id,
              materialType: 'base.rectangle',
              defaultDataSource: {
                type: 'host-resource',
                resourceType: 'xj_asset',
                resourceId: '12',
                params: {},
                binding: null,
              },
              manifest: {
                type: 'base.rectangle',
                name: 'Header asset',
                defaultSize: { width: 320, height: 200 },
                defaultProps: { source: '12' },
                defaultStyle: { opacity: 0.8 },
              },
            } as never)
          : undefined,
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('drop', {
      clientX: 30,
      clientY: 40,
      dataTransfer: {
        types: [MATERIAL_DRAG_TYPE, MATERIAL_LIBRARY_ITEM_DRAG_TYPE],
        getData: (type: string) =>
          type === MATERIAL_LIBRARY_ITEM_DRAG_TYPE ? 'asset:12' : 'base.rectangle',
      },
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent);

    const component = transactions[0]?.commands[0] as Extract<
      ScreenDocumentTransaction['commands'][number],
      { type: 'add-component' }
    >;
    expect(component.component).toMatchObject({
      type: 'base.rectangle',
      name: 'Header asset',
      size: { width: 320, height: 200 },
      props: { source: '12' },
      style: { opacity: 0.8 },
      dataSource: {
        type: 'host-resource',
        resourceType: 'xj_asset',
        resourceId: '12',
        params: {},
        binding: null,
      },
    });
  });

  it('rounds fractional drop coordinates to two decimals like canvas drags', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    const dataTransfer = {
      types: [MATERIAL_DRAG_TYPE],
      getData: () => 'base.rectangle',
    };
    canvas.dispatch('drop', {
      clientX: 30.123,
      clientY: 40.567,
      dataTransfer,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent);

    const component = transactions[0]?.commands[0] as Extract<
      ScreenDocumentTransaction['commands'][number],
      { type: 'add-component' }
    >;
    expect(component.component.position).toEqual({ x: 30.12, y: 40.57 });
  });

  it('rounds created component position and size to two decimal places', () => {
    vi.stubGlobal('Element', FakeElementBase);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = new DesignerGestureController({
      getActiveTool: () => 'rectangle',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => ({ rectangle: 'base.rectangle' }),
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 20, clientY: 30 } as PointerEvent);
    canvas.dispatch('pointerup', {
      pointerId: 1,
      clientX: 123.456,
      clientY: 78.901,
    } as unknown as PointerEvent);

    const component = transactions[0]?.commands[0] as Extract<
      ScreenDocumentTransaction['commands'][number],
      { type: 'add-component' }
    >;
    expect(component.component.position).toEqual({ x: 10, y: 10 });
    expect(component.component.size).toEqual({ width: 113.46, height: 68.9 });
  });

  it('strips snappedX/snappedY from the drop position so the transaction passes fail-closed validation', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      // 真实 workbench 的 snapCanvasPoint 会把吸附值写入 x/y，并附带冗余的 snappedX/snappedY。
      snapCanvasPoint: () => ({ x: 64, y: 64, snappedX: 64, snappedY: 64 }),
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    const dataTransfer = {
      types: [MATERIAL_DRAG_TYPE],
      getData: () => 'base.rectangle',
    };
    canvas.dispatch('drop', {
      clientX: 30,
      clientY: 40,
      dataTransfer,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent);

    const component = transactions[0]?.commands[0] as Extract<
      ScreenDocumentTransaction['commands'][number],
      { type: 'add-component' }
    >;
    expect(component.component.position).toEqual({ x: 64, y: 64 });
    expect(Object.keys(component.component.position).sort()).toEqual(['x', 'y']);
  });

  it('routes focus to the viewport and prevents the browser default focus on canvas pointerdown', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const focusViewport = vi.fn();
    const preventDefault = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
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
      focusViewport,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 3,
      clientX: 10,
      clientY: 20,
      preventDefault,
      target: new FakeElement(),
    } as unknown as PointerEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(focusViewport).toHaveBeenCalledTimes(1);
  });

  it('pans with the primary button when the hand tool is active', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const panBy = vi.fn();
    const setPanning = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'hand',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => true,
      panBy,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
      setPanning,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 6,
      button: 0,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    expect(setPanning).toHaveBeenCalledWith(true);

    canvas.dispatch('pointermove', { pointerId: 6, clientX: 40, clientY: 50 } as PointerEvent);
    expect(panBy).toHaveBeenCalledWith({ x: 30, y: 30 });

    canvas.dispatch('pointerup', { pointerId: 6 } as PointerEvent);
    expect(setPanning).toHaveBeenLastCalledWith(false);
  });

  it('ignores a non-primary (right/middle) button press under the hand tool', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const panBy = vi.fn();
    const setPanning = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'hand',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => true,
      panBy,
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
      setPanning,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 7,
      button: 2,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    expect(setPanning).not.toHaveBeenCalled();

    canvas.dispatch('pointermove', { pointerId: 7, clientX: 40, clientY: 50 } as PointerEvent);
    expect(panBy).not.toHaveBeenCalled();
  });

  it('does not capture or suppress a secondary button under the select tool', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const preventDefault = vi.fn();
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

    canvas.dispatch('pointerdown', {
      pointerId: 8,
      button: 2,
      clientX: 10,
      clientY: 20,
      preventDefault,
      target: material,
    } as unknown as PointerEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(controller.active).toBe(false);
    expect(material.style.translate).toBeUndefined();
  });

  it('leaves the browser middle-button behavior untouched', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
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
    controller.connect(canvas.canvas);
    const preventDefault = vi.fn();

    canvas.dispatch('mousedown', { button: 1, preventDefault } as unknown as PointerEvent);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
