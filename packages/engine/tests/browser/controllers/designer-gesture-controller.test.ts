import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../src/browser/controllers/designer-gesture-controller.js';

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
      createElement: () => new FakeElement(),
    },
    querySelector: <T extends Element>(selector: string) =>
      (selector === '[data-marquee]'
        ? marquee
        : selector === '[data-selection]'
          ? selection
          : selector === '[data-create-preview]'
            ? preview
            : null) as T | null,
    releasePointerCapture: (pointerId: number) => captures.delete(pointerId),
    setPointerCapture: (pointerId: number) => captures.add(pointerId),
  };
  return {
    canvas: canvas as unknown as HTMLDivElement,
    dispatch: (type: string, event: PointerEvent) => listeners.get(type)?.(event),
    marquee,
    preview: () => preview,
    selection,
  };
}

afterEach(() => vi.unstubAllGlobals());

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
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      target: material,
    } as unknown as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
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
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
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
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 2,
      clientX: 10,
      clientY: 20,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 2, clientX: 50, clientY: 60 } as PointerEvent);
    canvas.dispatch('lostpointercapture', {} as PointerEvent);

    expect(canvas.marquee.style.display).toBe('none');
    expect(transactions).toEqual([]);
  });

  it('clears a drag translation on pointer cancel without reporting a transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: unknown[] = [];
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
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
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 3,
      clientX: 10,
      clientY: 20,
      target: material,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 3, clientX: 50, clientY: 60 } as PointerEvent);
    canvas.dispatch('pointercancel', {} as PointerEvent);

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
});
