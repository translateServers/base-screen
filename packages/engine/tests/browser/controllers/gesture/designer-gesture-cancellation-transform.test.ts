import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../../src/browser/controllers/gesture/designer-gesture-controller.js';
import {
  catalog,
  createCanvas,
  document,
  FakeElement,
} from './designer-gesture-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerGestureController cancellation and transform', () => {
  it('removes a create preview on pointer cancel without reporting a transaction', () => {
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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

  it('captures at marquee start so a release outside the viewport cannot strand the gesture', () => {
    vi.stubGlobal('Element', FakeElement);
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
    expect(canvas.marquee.style.display).toBeUndefined();
    // 按下即捕获：即使未越过点击阈值就释放，pointerup 也会被重定向到画布，
    // 状态栏/面板等视窗之外的释放不会把 #marquee 悬挂成 active 常驻。
    expect(canvas.canvas.hasPointerCapture(3)).toBe(true);

    canvas.dispatch('pointermove', { pointerId: 3, clientX: 16, clientY: 28 } as PointerEvent);

    expect(snapCanvasPoint).not.toHaveBeenCalled();
    expect(renderSnapPreview).not.toHaveBeenCalled();
    expect(canvas.marquee.style.display).toBe('block');
    expect(canvas.canvas.hasPointerCapture(3)).toBe(true);
    expect(canvas.marquee.style.left).toBe('12px');
    expect(canvas.marquee.style.top).toBe('24px');
  });

  it('keeps repeated box selects from stranding the gesture with or without movement', () => {
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

    for (let round = 0; round < 3; round++) {
      canvas.dispatch('pointerdown', {
        pointerId: 20 + round,
        clientX: 10,
        clientY: 20,
        preventDefault: () => undefined,
        target: new FakeElement(),
      } as unknown as PointerEvent);
      expect(controller.active).toBe(true);
      expect(canvas.canvas.hasPointerCapture(20 + round)).toBe(true);

      canvas.dispatch('pointerup', {
        pointerId: 20 + round,
        clientX: 10,
        clientY: 20,
      } as unknown as PointerEvent);

      expect(controller.active).toBe(false);
      expect(canvas.canvas.hasPointerCapture(20 + round)).toBe(false);
      expect(canvas.marquee.style.display).toBe('none');
    }

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 200, clientY: 150 } as PointerEvent);
    expect(controller.active).toBe(true);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 200, clientY: 150 } as PointerEvent);
    expect(controller.active).toBe(false);
    expect(canvas.marquee.style.display).toBe('none');
  });

  it('clears a drag translation on pointer cancel without reporting a transaction', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
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
      renderSnapPreview,
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
    expect(renderSnapPreview).toHaveBeenLastCalledWith(undefined);
  });

  it('restores a transform overlay on lost pointer capture without reporting a transaction', () => {
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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

  it('keeps resize preview and commit on whole pixels when zoom produces fractional pointers', () => {
    vi.stubGlobal('Element', FakeElement);
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
      getViewport: () => ({ zoom: 2, offset: { x: 0, y: 0 } }),
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
      pointerId: 7,
      clientX: 200,
      clientY: 20,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      target: handle,
    } as unknown as PointerEvent);
    // zoom 2：3 个 client px = 1.5 个画布 px，右边缘 101.5 → 宽度取整为 92px。
    canvas.dispatch('pointermove', { pointerId: 7, clientX: 203, clientY: 20 } as PointerEvent);
    expect(material.style.width).toBe('92px');
    expect(canvas.selection.style.width).toBe('92px');

    canvas.dispatch('pointerup', { pointerId: 7, clientX: 203, clientY: 20 } as PointerEvent);
    expect(transactions).toHaveLength(1);
    const transaction = transactions[0] as {
      commands: readonly { type: string; componentIds: readonly string[]; patch: object }[];
    };
    expect(transaction.commands[0]).toMatchObject({
      type: 'update-components',
      componentIds: ['rectangle-1'],
      patch: { size: { width: 92, height: 80 } },
    });
  });

  it('prevents native text selection on the canvas via selectstart', () => {
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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

    expect(canvas.canvas.style.userSelect).toBe('auto');

    canvas.dispatch('pointermove', { pointerId: 5, clientX: 14, clientY: 24 } as PointerEvent);

    expect(canvas.canvas.style.userSelect).toBe('none');

    canvas.dispatch('pointerup', { pointerId: 5, clientX: 10, clientY: 20 } as PointerEvent);

    expect(canvas.canvas.style.userSelect).toBe('auto');
  });
});
