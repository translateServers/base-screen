import { describe, expect, it, vi } from 'vitest';
import { DesignerViewportController } from '../../../src/browser/controllers/designer-viewport-controller.js';

class MockContainer {}
vi.stubGlobal('Document', MockContainer);
vi.stubGlobal('DocumentFragment', MockContainer);
vi.stubGlobal('HTMLInputElement', MockContainer);
vi.stubGlobal('HTMLSelectElement', MockContainer);
vi.stubGlobal('HTMLTextAreaElement', MockContainer);
class MockHTMLElement {
  isContentEditable = false;
}
vi.stubGlobal('HTMLElement', MockHTMLElement);

function createController() {
  const onViewportChange = vi.fn();
  const controller = new DesignerViewportController({
    getDocument: () => undefined,
    onBlur: () => {},
    onToolChange: () => {},
    onViewportChange,
  });
  return { controller, onViewportChange };
}

function connectCanvas(controller: DesignerViewportController, width: number, height: number) {
  const listeners = new Map<string, (event: Event) => void>();
  const canvas = {
    offsetLeft: 30,
    offsetTop: 30,
    style: {},
    getRootNode: () => null,
  } as unknown as HTMLDivElement;
  const focus = vi.fn();
  const viewport = {
    clientWidth: width,
    clientHeight: height,
    dataset: {} as Record<string, string>,
    focus,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (type: string, listener: (event: Event) => void) =>
      listeners.set(type, listener),
  } as unknown as HTMLDivElement;
  controller.connect(viewport, canvas);
  return {
    canvas,
    dispatch: (type: string, event: Event) => listeners.get(type)?.(event),
    focus,
    viewport,
  };
}

describe('DesignerViewportController zoom anchor', () => {
  it('projects the visible center using canvas bounds, border and zoom', () => {
    const { controller } = createController();
    expect(controller.visibleCanvasCenter()).toBeUndefined();
    const { canvas, viewport } = connectCanvas(controller, 800, 600);
    Object.assign(viewport, { getBoundingClientRect: () => ({ left: 100, top: 50 }) });
    Object.assign(canvas, {
      clientLeft: 1,
      clientTop: 1,
      getBoundingClientRect: () => ({ left: 150, top: 100 }),
    });
    controller.setZoom(2);
    expect(controller.visibleCanvasCenter()).toEqual({ x: 174, y: 124 });
    Object.assign(viewport, { clientWidth: 0 });
    expect(controller.visibleCanvasCenter()).toBeUndefined();
  });

  it('R4 setZoomCentered anchors the viewport center point', () => {
    const { controller } = createController();
    const { canvas } = connectCanvas(controller, 800, 600);
    controller.setZoomCentered(1.2);
    expect(canvas.style.transform).toBe('translate(-80px, -60px) scale(1.2)');
  });

  it('R4 setZoomCentered keeps the anchor point stationary across zooms', () => {
    const { controller } = createController();
    const { canvas } = connectCanvas(controller, 800, 600);
    controller.setZoomCentered(1.2);
    controller.setZoomCentered(1.5);
    expect(canvas.style.transform).toBe('translate(-200px, -150px) scale(1.5)');
  });

  it('centers a requested canvas point and returns keyboard focus to the viewport', () => {
    const { controller } = createController();
    const { canvas, focus } = connectCanvas(controller, 800, 600);

    controller.centerOn({ x: 100, y: 50 });

    expect(canvas.style.transform).toBe('translate(270px, 220px) scale(1)');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe('DesignerViewportController focus', () => {
  it('keeps the initial pointer focus out of focus-visible and clears its fallback on blur', () => {
    const { controller } = createController();
    const { dispatch, focus, viewport } = connectCanvas(controller, 800, 600);

    controller.focusFromPointer();

    expect(viewport.dataset.pointerFocus).toBe('');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false });

    dispatch('blur', new Event('blur'));
    expect(viewport.dataset.pointerFocus).toBeUndefined();
  });

  it('keeps ordinary programmatic focus eligible for keyboard focus-visible styling', () => {
    const { controller } = createController();
    const { focus, viewport } = connectCanvas(controller, 800, 600);

    controller.focus();

    expect(viewport.dataset.pointerFocus).toBeUndefined();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe('DesignerViewportController wheel', () => {
  function wheel(partial: Record<string, unknown>): WheelEvent {
    return {
      clientX: 400,
      clientY: 300,
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 0,
      metaKey: false,
      preventDefault: () => {},
      shiftKey: false,
      ...partial,
    } as unknown as WheelEvent;
  }

  it('R4 pans the canvas vertically with a plain wheel and blocks page scroll', () => {
    const { controller } = createController();
    const { canvas, dispatch } = connectCanvas(controller, 800, 600);
    const preventDefault = vi.fn();
    dispatch('wheel', wheel({ deltaY: 120, preventDefault }));

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(canvas.style.transform).toBe('translate(0px, -120px) scale(1)');
  });

  it('R4 pans horizontally with shift+wheel', () => {
    const { controller } = createController();
    const { canvas, dispatch } = connectCanvas(controller, 800, 600);
    dispatch('wheel', wheel({ shiftKey: true, deltaY: 120 }));

    expect(canvas.style.transform).toBe('translate(-120px, 0px) scale(1)');
  });

  it('R4 scales line-mode deltas like Firefox reports them', () => {
    const { controller } = createController();
    const { canvas, dispatch } = connectCanvas(controller, 800, 600);
    dispatch('wheel', wheel({ deltaMode: 1, deltaY: 3 }));

    expect(canvas.style.transform).toBe('translate(0px, -48px) scale(1)');
  });

  it('R4 zooms with ctrl+wheel and keeps the browser zoom blocked', () => {
    const { controller } = createController();
    const { canvas, dispatch } = connectCanvas(controller, 800, 600);
    const preventDefault = vi.fn();
    dispatch('wheel', wheel({ ctrlKey: true, deltaY: -100, preventDefault }));

    expect(preventDefault).toHaveBeenCalledOnce();
    // 光标锚点（400, 300）在缩放后保持不动：offset 相应回退（浮点误差容忍）。
    expect(canvas.style.transform).toMatch(/^translate\(-40/);
    expect(canvas.style.transform).toContain('scale(1.1)');
  });
});

describe('DesignerViewportController space key', () => {
  it('activates pan on Space and preventDefaults even on repeated keydown', () => {
    const { controller } = createController();
    connectCanvas(controller, 800, 600);
    const preventDefault = vi.fn();
    const event = {
      code: 'Space',
      repeat: false,
      target: null,
      preventDefault,
    } as unknown as KeyboardEvent;

    expect(controller.activeTool).toBe('select');
    expect(controller.onKeyDown(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(controller.activeTool).toBe('hand');

    // 按住空格重复触发：仍须阻止浏览器默认滚动，避免焦点容器上的空格滚动页面。
    const repeatEvent = {
      code: 'Space',
      repeat: true,
      target: null,
      preventDefault,
    } as unknown as KeyboardEvent;
    expect(controller.onKeyDown(repeatEvent)).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(controller.activeTool).toBe('hand');

    expect(controller.onKeyUp({ code: 'Space' } as KeyboardEvent)).toBe(true);
    expect(controller.activeTool).toBe('select');
  });

  it('leaves editable targets untouched so text inputs keep native Space handling', () => {
    const { controller } = createController();
    connectCanvas(controller, 800, 600);
    const preventDefault = vi.fn();
    const target = new MockHTMLElement();
    target.isContentEditable = true;
    const event = {
      code: 'Space',
      repeat: false,
      target,
      preventDefault,
    } as unknown as KeyboardEvent;
    expect(controller.onKeyDown(event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('releases a held Space hand when a persistent tool is selected', () => {
    const { controller } = createController();
    connectCanvas(controller, 800, 600);
    controller.onKeyDown({
      code: 'Space',
      repeat: false,
      target: null,
      preventDefault: () => {},
    } as KeyboardEvent);
    expect(controller.activeTool).toBe('hand');

    // 按住空格时选择主工具：临时抓手随主工具切换而清空（对标 Nebula setTool 清空临时栈）。
    controller.setActiveTool('rectangle');
    expect(controller.activeTool).toBe('rectangle');
  });

  it('R4 activates the space hand from hover without keyboard focus and releases on key up', () => {
    const { controller } = createController();
    const { dispatch } = connectCanvas(controller, 800, 600);
    expect(controller.hovered).toBe(false);

    // 鼠标移入视窗：hover 状态就绪（与键盘焦点解耦）。
    dispatch('pointerenter', new Event('pointerenter'));
    expect(controller.hovered).toBe(true);

    const preventDefault = vi.fn();
    const windowDown = {
      code: 'Space',
      target: null,
      preventDefault,
    } as unknown as KeyboardEvent;
    expect(controller.onWindowKeyDown(windowDown)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(controller.activeTool).toBe('hand');

    expect(controller.onWindowKeyUp({ code: 'Space' } as KeyboardEvent)).toBe(true);
    expect(controller.activeTool).toBe('select');

    // 鼠标移出视窗：hover 解除，空格不再激活抓手（宿主页面空格滚动不受影响）。
    dispatch('pointerleave', new Event('pointerleave'));
    expect(controller.hovered).toBe(false);
    expect(
      controller.onWindowKeyDown({
        code: 'Space',
        target: null,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent),
    ).toBe(false);
  });

  it('R2 keeps native space input on editable targets even when hovering', () => {
    const { controller } = createController();
    const { dispatch } = connectCanvas(controller, 800, 600);
    dispatch('pointerenter', new Event('pointerenter'));
    const target = new MockHTMLElement();
    target.isContentEditable = true;
    expect(
      controller.onWindowKeyDown({
        code: 'Space',
        target,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent),
    ).toBe(false);
  });
});

describe('DesignerViewportController connect/disconnect', () => {
  it('disconnect removes every mounted listener and reconnect remounts them', () => {
    const { controller } = createController();
    const added: string[] = [];
    const removed: string[] = [];
    const listeners = new Map<EventListener, string>();
    const viewport = {
      clientWidth: 800,
      clientHeight: 600,
      dataset: {} as Record<string, string>,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      addEventListener: (type: string, listener: EventListener) => {
        added.push(type);
        listeners.set(listener, type);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        removed.push(type);
        expect(listeners.get(listener)).toBe(type);
        listeners.delete(listener);
      },
    } as unknown as HTMLDivElement;
    const canvas = { style: {}, getRootNode: () => null } as unknown as HTMLDivElement;

    controller.connect(viewport, canvas);
    expect(added).toEqual(['wheel', 'blur', 'pointerenter', 'pointerleave']);
    expect(listeners.size).toBe(4);

    controller.disconnect();
    expect(removed).toEqual(['wheel', 'blur', 'pointerenter', 'pointerleave']);
    expect(listeners.size).toBe(0);
    expect(controller.hovered).toBe(false);

    controller.connect(viewport, canvas);
    expect(added).toHaveLength(8);
    expect(removed).toHaveLength(4);
  });
});
