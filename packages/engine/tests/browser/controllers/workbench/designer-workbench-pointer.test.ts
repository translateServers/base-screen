import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerWorkbenchController } from '../../../../src/browser/controllers/workbench/designer-workbench-controller.js';
import { captureTarget, WorkbenchElement } from './designer-workbench-fixture.js';

describe('DesignerWorkbenchController pointer capture', () => {
  it('R3 cycles private workbench modes without document state', () => {
    const layout = {
      dataset: {} as DOMStringMap,
      style: { setProperty: () => undefined, removeProperty: () => undefined },
    };
    const root = {
      querySelector: (selector: string) => (selector === '.designer' ? layout : undefined),
      querySelectorAll: () => [],
    } as unknown as ShadowRoot;
    const controller = new DesignerWorkbenchController({
      getCanvas: () => undefined,
      getDocument: () => undefined,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => root,
      getZoom: () => 1,
    });

    controller.cycleMode();
    expect(layout.dataset.workbenchMode).toBe('with-menu');
    controller.cycleMode();
    expect(layout.dataset.workbenchMode).toBe('fullscreen');
    controller.cycleMode();
    expect(layout.dataset.workbenchMode).toBe('standard');
  });

  it('releases panel-resize and guide-drag captures on pointer up', () => {
    const layout = captureTarget();
    const canvas = {
      ...captureTarget(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLDivElement;
    const root = {
      querySelector: (selector: string) => (selector === '.designer' ? layout : undefined),
      querySelectorAll: () => [],
    } as unknown as ShadowRoot;
    const controller = new DesignerWorkbenchController({
      getCanvas: () => canvas,
      getDocument: () => undefined,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => root,
      getZoom: () => 1,
    });
    const panelHandle = {
      closest: (selector: string) =>
        selector === '[data-panel-handle]' ? { dataset: { panelHandle: 'left' } } : null,
    } as unknown as HTMLElement;
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-horizontal' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;

    controller.onPointerDown({
      target: panelHandle,
      pointerId: 1,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    controller.onPointerDown({
      target: ruler,
      pointerId: 2,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    controller.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);
    controller.onPointerUp({ pointerId: 2, clientX: 10, clientY: 20 } as unknown as PointerEvent);

    expect(layout.captures.has(1)).toBe(false);
    expect(canvas.hasPointerCapture(2)).toBe(false);
  });

  it('does not capture panel or ruler interactions from a secondary button', () => {
    const layout = captureTarget();
    const canvas = {
      ...captureTarget(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLDivElement;
    const root = {
      querySelector: (selector: string) => (selector === '.designer' ? layout : undefined),
      querySelectorAll: () => [],
    } as unknown as ShadowRoot;
    const controller = new DesignerWorkbenchController({
      getCanvas: () => canvas,
      getDocument: () => undefined,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => root,
      getZoom: () => 1,
    });
    const panelHandle = {
      closest: (selector: string) =>
        selector === '[data-panel-handle]' ? { dataset: { panelHandle: 'left' } } : null,
    } as unknown as HTMLElement;
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-horizontal' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;

    controller.onPointerDown({
      target: panelHandle,
      pointerId: 9,
      button: 2,
    } as unknown as PointerEvent);
    controller.onPointerDown({
      target: ruler,
      pointerId: 10,
      button: 2,
    } as unknown as PointerEvent);

    expect(layout.captures.has(9)).toBe(false);
    expect(canvas.hasPointerCapture(10)).toBe(false);
  });

  it('releases all transient captures when cancelled', () => {
    const layout = captureTarget();
    const canvas = {
      ...captureTarget(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLDivElement;
    const root = {
      querySelector: (selector: string) => (selector === '.designer' ? layout : undefined),
      querySelectorAll: () => [],
    } as unknown as ShadowRoot;
    const controller = new DesignerWorkbenchController({
      getCanvas: () => canvas,
      getDocument: () => undefined,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => root,
      getZoom: () => 1,
    });
    const panelHandle = {
      closest: (selector: string) =>
        selector === '[data-panel-handle]' ? { dataset: { panelHandle: 'right' } } : null,
    } as unknown as HTMLElement;
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;

    controller.onPointerDown({
      target: panelHandle,
      pointerId: 3,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    controller.onPointerDown({
      target: ruler,
      pointerId: 4,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    controller.cancelTransientState();

    expect(layout.captures.has(3)).toBe(false);
    expect(canvas.hasPointerCapture(4)).toBe(false);
  });
});

describe('DesignerWorkbenchController ruler resize observation', () => {
  class MockResizeObserver {
    static readonly instances: MockResizeObserver[] = [];
    readonly observed: Element[] = [];
    disconnected = false;
    constructor(private readonly callback: ResizeObserverCallback) {
      MockResizeObserver.instances.push(this);
    }
    observe(target: Element): void {
      this.observed.push(target);
    }
    disconnect(): void {
      this.disconnected = true;
    }
    notify(): void {
      this.callback([], this as unknown as ResizeObserver);
    }
  }

  afterEach(() => {
    MockResizeObserver.instances.length = 0;
    vi.unstubAllGlobals();
  });

  it('observes both ruler containers on initialize and releases the observer on disconnect', () => {
    const horizontal = new WorkbenchElement();
    const vertical = new WorkbenchElement();
    const root = {
      querySelector: () => null,
      querySelectorAll: (selector: string) =>
        selector === '.ruler-horizontal, .ruler-vertical' ? [horizontal, vertical] : [],
    } as unknown as ShadowRoot;
    const controller = new DesignerWorkbenchController({
      getCanvas: () => undefined,
      getDocument: () => undefined,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => root,
      getZoom: () => 1,
    });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    controller.initialize();
    const observer = MockResizeObserver.instances.at(-1);
    expect(observer?.observed).toContain(horizontal);
    expect(observer?.observed).toContain(vertical);

    controller.disconnect();
    expect(observer?.disconnected).toBe(true);
  });
});

describe('DesignerWorkbenchController canvas listener pairing', () => {
  it('connect/disconnect removes canvas listeners pairwise and reconnect remounts them', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const listeners = new Map<EventListener, string>();
    const canvas = {
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
    const controller = new DesignerWorkbenchController({
      getCanvas: () => canvas,
      getDocument: () => undefined,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => null,
      getZoom: () => 1,
    });

    controller.connect(canvas);
    expect(added).toEqual(['pointerdown', 'dblclick', 'lostpointercapture']);
    // 同一画布重复 connect 是幂等的。
    controller.connect(canvas);
    expect(added).toHaveLength(3);

    controller.disconnect();
    expect(removed).toEqual(['pointerdown', 'dblclick', 'lostpointercapture']);
    expect(listeners.size).toBe(0);

    controller.connect(canvas);
    expect(added).toHaveLength(6);
    expect(removed).toHaveLength(3);
  });
});
