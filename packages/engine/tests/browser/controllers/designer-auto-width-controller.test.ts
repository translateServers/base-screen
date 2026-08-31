import type { ScreenDocument } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerAutoWidthController } from '../../../src/browser/controllers/designer-auto-width-controller.js';

function document(): ScreenDocument {
  return {
    canvas: { width: 1000, height: 600, backgroundColor: '#000000' },
    components: [
      {
        id: 'text',
        type: 'base.text',
        name: 'text',
        parentId: null,
        position: { x: 20, y: 20 },
        size: { width: 320, height: 72 },
        rotation: 45,
        zIndex: 0,
        props: { autoWidth: true },
        style: {},
        status: { locked: false, hidden: false },
        dataSource: { type: 'static', value: 'Text' },
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function harness() {
  const style = { width: '125.625px', display: 'block' };
  const element = {
    dataset: { baseScreenComponentId: 'text' },
    isConnected: true,
    ownerDocument: { defaultView: { getComputedStyle: () => style } },
    getBoundingClientRect: () => {
      throw new Error('Transformed bounds must not be read');
    },
  } as unknown as HTMLElement;
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  let resize: ResizeObserverCallback = () => {};
  const constructors = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
        constructors();
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
  const canvas = {
    contains: (candidate: HTMLElement) => candidate === element,
    querySelectorAll: () => [element],
  } as unknown as HTMLElement;
  const change = vi.fn();
  const controller = new DesignerAutoWidthController({
    getCanvas: () => canvas,
    onGeometryChange: change,
  });
  const emit = () =>
    resize([{ target: element } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  return { controller, style, change, observe, unobserve, disconnect, constructors, emit };
}

afterEach(() => vi.unstubAllGlobals());

describe('DesignerAutoWidthController', () => {
  it('synchronously measures the local box and shares one observer without redundant refreshes', () => {
    const { controller, change, constructors, emit } = harness();
    const source = document();
    controller.sync(source);
    const first = controller.project(source);
    expect(first?.components[0]?.size.width).toBe(125.63);
    controller.sync(source);
    emit();
    expect(constructors).toHaveBeenCalledTimes(1);
    expect(controller.project(source)).toBe(first);
    expect(change).not.toHaveBeenCalled();
    expect(source.components[0]?.size.width).toBe(320);
  });

  it('refreshes geometry for dynamic content without changing the source document', () => {
    const { controller, style, change, emit } = harness();
    const source = document();
    controller.sync(source);
    style.width = '240.25px';
    emit();
    expect(controller.project(source)?.components[0]?.size.width).toBe(240.25);
    expect(change).toHaveBeenCalledTimes(1);
    expect(source).toEqual(document());
  });

  it('keeps a stable gesture baseline until the finish/cancel task completes', async () => {
    const { controller, style, change, emit } = harness();
    const source = document();
    controller.sync(source);
    controller.setFrozen(true);
    style.width = '240px';
    emit();
    expect(controller.project(source)?.components[0]?.size.width).toBe(125.63);
    controller.setFrozen(false);
    expect(controller.project(source)?.components[0]?.size.width).toBe(125.63);
    await Promise.resolve();
    expect(controller.project(source)?.components[0]?.size.width).toBe(240);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('retains hidden sizes but clears them on document replacement and ignores stale notifications', async () => {
    const { controller, style, emit, change, disconnect } = harness();
    const source = document();
    controller.sync(source);
    style.display = 'none';
    style.width = '0px';
    emit();
    expect(controller.project(source)?.components[0]?.size.width).toBe(125.63);
    controller.setFrozen(false);
    controller.clear();
    emit();
    await Promise.resolve();
    expect(change).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
    controller.sync(document());
    expect(controller.project(source)?.components[0]?.size.width).toBe(320);
    style.display = 'block';
    style.width = '160px';
    emit();
    expect(controller.project(source)?.components[0]?.size.width).toBe(160);
  });

  it('unobserves removed components and disabled automatic widths', () => {
    const { controller, unobserve, emit, change } = harness();
    const source = document();
    controller.sync(source);
    controller.sync({ ...source, components: [] });
    emit();
    expect(unobserve).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    expect(controller.project(source)?.components[0]?.size.width).toBe(320);
  });
});
