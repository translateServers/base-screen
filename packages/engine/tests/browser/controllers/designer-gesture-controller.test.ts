import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../src/browser/controllers/designer-gesture-controller.js';
import { MATERIAL_DRAG_TYPE } from '../../../src/browser/controllers/designer-panel-controller.js';

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly matches: Record<string, FakeElement> = {};
  readonly style: Record<string, string> = {};
  className = '';
  isConnected = false;
  onRemove: (() => void) | undefined;

  closest<T extends Element>(selector: string): T | null {
    return (this.matches[selector] ?? null) as T | null;
  }

  remove(): void {
    this.onRemove?.();
  }
}

function document(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'rectangle-1',
        type: 'base.rectangle',
        name: 'Rectangle',
        parentId: null,
        position: { x: 10, y: 20 },
        size: { width: 100, height: 80 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () =>
      ({
        manifest: {
          type: 'base.rectangle',
          name: 'Rectangle',
          defaultSize: { width: 100, height: 80 },
          defaultProps: {},
          defaultStyle: {},
          designCapabilities: { resize: true, rotate: true, children: false },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

function createCanvas() {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const captures = new Set<number>();
  const marquee = new FakeElement();
  const selection = new FakeElement();
  const materials = new Map<string, FakeElement>();
  const body = new FakeElement();
  let preview: FakeElement | undefined;
  const canvas = {
    addEventListener: (type: string, listener: (event: PointerEvent) => void) =>
      listeners.set(type, listener),
    appendChild: (element: FakeElement) => {
      preview = element;
      element.isConnected = true;
      element.onRemove = () => {
        preview = undefined;
        element.isConnected = false;
      };
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    hasPointerCapture: (pointerId: number) => captures.has(pointerId),
    ownerDocument: {
      body,
      createElement: () => new FakeElement(),
    },
    querySelector: <T extends Element>(selector: string) =>
      (selector === '[data-marquee]'
        ? marquee
        : selector === '[data-selection]'
          ? selection
          : selector === '[data-create-preview]'
            ? preview
            : (materials.get(
                selector.match(/^\[data-base-screen-component-id="(.+)"\]$/)?.[1] ?? '',
              ) ?? null)) as T | null,
    releasePointerCapture: (pointerId: number) => captures.delete(pointerId),
    setPointerCapture: (pointerId: number) => captures.add(pointerId),
    style: {},
  };
  return {
    body,
    canvas: canvas as unknown as HTMLDivElement,
    dispatch: (type: string, event: PointerEvent) => listeners.get(type)?.(event),
    marquee,
    preview: () => preview,
    registerMaterial: (id: string, material: FakeElement) => materials.set(id, material),
    selection,
  };
}

afterEach(() => vi.unstubAllGlobals());

function createGrabTarget() {
  const grab = new FakeElement();
  grab.matches['[data-selection-grab]'] = grab;
  return grab;
}

describe('DesignerGestureController cancellation', () => {
  it('R5 moves an existing same-parent selection in one transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const first = document().components[0]!;
    const second = {
      ...first,
      id: 'rectangle-2',
      position: { x: 50, y: 60 },
      zIndex: 1,
    };
    const current = { ...document(), components: [first, second] };
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const secondMaterial = new FakeElement();
    secondMaterial.dataset.baseScreenComponentId = 'rectangle-2';
    canvas.registerMaterial('rectangle-2', secondMaterial);
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1', 'rectangle-2'],
        focusedComponentId: 'rectangle-1',
      }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection,
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
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    // 拖拽以 selection（控制器）为目标，组件内容作为被选实体一起跟随移动，二者同步。
    expect(material.style.translate).toBe('30px 30px');
    expect(secondMaterial.style.translate).toBe('30px 30px');
    expect(canvas.selection.style.translate).toBe('30px 30px');
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
    expect(material.style.translate).toBe('');
    expect(secondMaterial.style.translate).toBe('');
    expect(canvas.selection.style.translate).toBe('');
    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['rectangle-1'],
            patch: { position: { x: 40, y: 50 } },
          },
          {
            type: 'update-components',
            componentIds: ['rectangle-2'],
            patch: { position: { x: 80, y: 90 } },
          },
        ],
      },
    ]);
  });

  it('moves a multi-selection by dragging the selection overlay itself', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const first = document().components[0]!;
    const second = {
      ...first,
      id: 'rectangle-2',
      position: { x: 50, y: 60 },
      zIndex: 1,
    };
    const current = { ...document(), components: [first, second] };
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const secondMaterial = new FakeElement();
    secondMaterial.dataset.baseScreenComponentId = 'rectangle-2';
    canvas.registerMaterial('rectangle-2', secondMaterial);
    const grab = createGrabTarget();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({
        selectedComponentIds: ['rectangle-1', 'rectangle-2'],
        focusedComponentId: 'rectangle-2',
      }),
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

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: grab,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(material.style.translate).toBe('30px 30px');
    expect(secondMaterial.style.translate).toBe('30px 30px');
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(material.style.translate).toBe('');
    expect(secondMaterial.style.translate).toBe('');
    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['rectangle-1'],
            patch: { position: { x: 40, y: 50 } },
          },
          {
            type: 'update-components',
            componentIds: ['rectangle-2'],
            patch: { position: { x: 80, y: 90 } },
          },
        ],
      },
    ]);
  });

  it('disables pixel-grid snap during drag so the selection can move freely', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const snapCanvasSelection = vi.fn((_bounds, translation) => translation);
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
      snapCanvasSelection,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(snapCanvasSelection).toHaveBeenCalledWith(
      expect.anything(),
      { x: 30, y: 30 },
      ['rectangle-1'],
      { gridSnapEnabled: false },
    );
  });

  it('rounds the committed drag position to two decimal places', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const current = {
      ...document(),
      components: [
        {
          ...document().components[0]!,
          position: { x: 10.005, y: 20.004 },
        },
      ],
    };
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
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
      reportTransaction: (transaction) => transactions.push(transaction),
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
      target: material,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['rectangle-1'],
            patch: { position: { x: 40.01, y: 50 } },
          },
        ],
      },
    ]);
  });

  it('toggles the component under the selection overlay on a modifier click', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const grab = createGrabTarget();
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

    canvas.dispatch('pointerdown', {
      pointerId: 2,
      clientX: 20,
      clientY: 30,
      shiftKey: true,
      preventDefault: () => undefined,
      target: grab,
    } as unknown as PointerEvent);

    expect(reduceSelection).toHaveBeenCalledWith({
      type: 'toggle-selection',
      componentId: 'rectangle-1',
    });
  });

  it('removes a create preview on pointer cancel without reporting a transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
    const renderSnapPreview = vi.fn();
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
      renderSnapPreview,
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
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 50, clientY: 60 } as PointerEvent);
    canvas.dispatch('pointercancel', {} as PointerEvent);

    expect(canvas.preview()).toBeUndefined();
    expect(transactions).toEqual([]);
    expect(renderSnapPreview).toHaveBeenLastCalledWith(undefined);
  });

  it('hides a marquee projection on lost pointer capture without reporting a transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
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

    canvas.dispatch('pointerdown', {
      pointerId: 2,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 2, clientX: 50, clientY: 60 } as PointerEvent);
    canvas.dispatch('lostpointercapture', {} as PointerEvent);

    expect(canvas.marquee.style.display).toBe('none');
    expect(transactions).toEqual([]);
  });

  it('keeps a marquee start at the raw pointer point without invoking snap or snap preview', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const snapCanvasPoint = vi.fn((point) => ({ x: point.x + 5, y: point.y + 5 }));
    const renderSnapPreview = vi.fn();
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
      renderSnapPreview,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 3,
      clientX: 12,
      clientY: 24,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);

    expect(snapCanvasPoint).not.toHaveBeenCalled();
    expect(renderSnapPreview).not.toHaveBeenCalled();
    expect(canvas.marquee.style.display).toBe('block');
    expect(canvas.marquee.style.left).toBe('12px');
    expect(canvas.marquee.style.top).toBe('24px');
  });

  it('clears a drag translation on pointer cancel without reporting a transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
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

    canvas.dispatch('pointerdown', {
      pointerId: 3,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 3, clientX: 50, clientY: 60 } as PointerEvent);
    canvas.dispatch('pointercancel', {} as PointerEvent);

    expect(canvas.selection.style.translate).toBe('');
    expect(material.style.translate).toBe('');
    expect(transactions).toEqual([]);
  });

  it('restores a transform overlay on lost pointer capture without reporting a transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
    const handle = new FakeElement();
    handle.dataset.transformHandle = 'east';
    handle.matches['[data-transform-handle]'] = handle;
    const renderSelection = vi.fn();
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
      renderSelection,
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 4,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      target: handle,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 4, clientX: 50, clientY: 20 } as PointerEvent);
    canvas.dispatch('lostpointercapture', {} as PointerEvent);

    expect(canvas.selection.style.width).toBe('40px');
    expect(renderSelection).toHaveBeenCalledOnce();
    expect(transactions).toEqual([]);
  });

  it('R2 previews resize/rotate on the material root and restores its styles on cancel', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
    const handle = new FakeElement();
    handle.dataset.transformHandle = 'east';
    handle.matches['[data-transform-handle]'] = handle;
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    material.style.left = '10px';
    material.style.top = '20px';
    material.style.width = '100px';
    material.style.height = '80px';
    material.style.transform = 'rotate(0deg)';
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
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 5,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      target: handle,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 5, clientX: 60, clientY: 20 } as PointerEvent);

    // V10：resize 预览直接作用于 Material 根元素（left/top/width/height + rotate()，与 renderer 一致）。
    expect(material.style.width).toBe('50px');
    expect(material.style.left).toBe('10px');
    expect(canvas.selection.style.width).toBe('50px');

    canvas.dispatch('lostpointercapture', {} as PointerEvent);

    // 取消恢复手势开始前捕获的样式，不残留脏预览。
    expect(material.style.left).toBe('10px');
    expect(material.style.top).toBe('20px');
    expect(material.style.width).toBe('100px');
    expect(material.style.height).toBe('80px');
    expect(material.style.transform).toBe('rotate(0deg)');
    expect(transactions).toEqual([]);
  });

  it('R2 commits a resize transaction from the previewed geometry', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
    const handle = new FakeElement();
    handle.dataset.transformHandle = 'east';
    handle.matches['[data-transform-handle]'] = handle;
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    material.style.left = '10px';
    material.style.top = '20px';
    material.style.width = '100px';
    material.style.height = '80px';
    material.style.transform = 'rotate(0deg)';
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
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 6,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      target: handle,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 6, clientX: 60, clientY: 20 } as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 6, clientX: 60, clientY: 20 } as PointerEvent);

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0] as {
      commands: readonly { type: string; componentIds: readonly string[]; patch: object }[];
    };
    expect(transaction.commands[0]).toMatchObject({
      type: 'update-components',
      componentIds: ['rectangle-1'],
      patch: { size: { width: 50, height: 80 } },
    });
    expect(material.style.width).toBe('100px');
    expect(material.style.height).toBe('80px');
  });

  it('prevents native text selection on the canvas via selectstart', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
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
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('selectstart', { preventDefault } as unknown as PointerEvent);

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('suppresses canvas text selection during a drag and restores it on release', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    canvas.canvas.style.userSelect = 'auto';
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
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

    canvas.dispatch('pointerdown', {
      pointerId: 5,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);

    expect(canvas.canvas.style.userSelect).toBe('none');

    canvas.dispatch('pointerup', { pointerId: 5, clientX: 10, clientY: 20 } as PointerEvent);

    expect(canvas.canvas.style.userSelect).toBe('auto');
  });
});

describe('DesignerGestureController gesture-active state', () => {
  it('R3 reports active during a drag and restores on every exit path', () => {
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

describe('DesignerGestureController material drop', () => {
  it('adds a component at the drop point when a material is dropped on the canvas', () => {
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

  it('strips snappedX/snappedY from the drop position so the transaction passes fail-closed validation', () => {
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
});

describe('DesignerGestureController snap session', () => {
  it('activates the snap session on drag start and releases it on completion', () => {
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
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(true);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(false);
  });

  it('activates the snap session on create start and releases it on cancel', () => {
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
});
