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
  const canvas = {
    style: {},
    getRootNode: () => null,
  } as unknown as HTMLDivElement;
  const viewport = {
    clientWidth: width,
    clientHeight: height,
    addEventListener: vi.fn(),
  } as unknown as HTMLDivElement;
  controller.connect(viewport, canvas);
  return { canvas, viewport };
}

describe('DesignerViewportController zoom anchor', () => {
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
});
