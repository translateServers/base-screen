import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerViewportController } from '../../../src/browser/controllers/designer-viewport-controller.js';
import { DesignerWorkbenchController } from '../../../src/browser/controllers/designer-workbench-controller.js';

function captureTarget() {
  const captures = new Set<number>();
  return {
    captures,
    setPointerCapture: (pointerId: number) => captures.add(pointerId),
    hasPointerCapture: (pointerId: number) => captures.has(pointerId),
    releasePointerCapture: (pointerId: number) => captures.delete(pointerId),
  };
}

describe('DesignerWorkbenchController pointer capture', () => {
  it('R3 cycles private workbench modes without document state', () => {
    const layout = { dataset: {} as DOMStringMap };
    const root = {
      querySelector: (selector: string) => (selector === '.designer' ? layout : undefined),
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

  it('releases all transient captures when cancelled', () => {
    const layout = captureTarget();
    const canvas = {
      ...captureTarget(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLDivElement;
    const root = {
      querySelector: (selector: string) => (selector === '.designer' ? layout : undefined),
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

class WorkbenchElement {
  readonly children: WorkbenchElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: () => undefined };
  className = '';
  ariaPressed = '';
  ariaSelected = '';
  hidden = false;

  appendChild(child: WorkbenchElement): WorkbenchElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: WorkbenchElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    if (name === 'aria-pressed') this.ariaPressed = value;
  }

  closest<T extends Element>(selector: string): T | null {
    return (
      selector === '[data-canvas-guide]' && this.dataset.canvasGuide === 'true' ? this : null
    ) as T | null;
  }
}

function createWorkbench() {
  const layout = new WorkbenchElement();
  const viewport = new WorkbenchElement();
  const guides = new WorkbenchElement();
  const inspectorTabs = new WorkbenchElement();
  const materials = new WorkbenchElement();
  const layers = new WorkbenchElement();
  const leftTabs = ['materials', 'layers'].map((tab) => {
    const control = new WorkbenchElement();
    control.dataset.panelTab = tab;
    return control;
  });
  const rightTabs = ['appearance', 'data', 'interaction', 'events'].map((tab) => {
    const control = new WorkbenchElement();
    control.dataset.inspectorTab = tab;
    return control;
  });
  const panes = rightTabs.map((tab) => {
    const pane = new WorkbenchElement();
    pane.dataset.inspectorPane = tab.dataset.inspectorTab!;
    return pane;
  });
  const grid = new WorkbenchElement();
  const canvasListeners = new Map<string, (event: PointerEvent | MouseEvent) => void>();
  const canvas = {
    ...captureTarget(),
    addEventListener: (type: string, listener: (event: PointerEvent | MouseEvent) => void) =>
      canvasListeners.set(type, listener),
    dispatch: (type: string, event: PointerEvent | MouseEvent) =>
      canvasListeners.get(type)?.(event),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    ownerDocument: { createElement: () => new WorkbenchElement() },
  } as unknown as HTMLDivElement & {
    dispatch: (type: string, event: PointerEvent | MouseEvent) => void;
  };
  const document = {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  } as const;
  const interaction: {
    focusedComponentId: string | null;
    selectedComponentIds: string[];
  } = { focusedComponentId: 'c1', selectedComponentIds: ['c1'] };
  const elements = new Map<string, WorkbenchElement>([
    ['.designer', layout],
    ['[data-viewport]', viewport],
    ['[data-canvas-guides]', guides],
    ['[data-materials]', materials],
    ['[data-layers]', layers],
    ['.inspector-tabs', inspectorTabs],
    ['[data-action="toggle-grid"]', grid],
  ]);
  const root = {
    querySelector: (selector: string) => elements.get(selector) ?? null,
    querySelectorAll: (selector: string) => {
      if (selector === '[data-panel-tab]') return leftTabs;
      if (selector === '[data-inspector-tab]') return rightTabs;
      if (selector === '[data-inspector-pane]') return panes;
      return [];
    },
  } as unknown as ShadowRoot;
  return {
    canvas,
    controller: new DesignerWorkbenchController({
      getCanvas: () => canvas,
      getDocument: () => document,
      getInteraction: () => interaction,
      getRoot: () => root,
      getZoom: () => 1,
    }),
    document,
    grid,
    guides,
    inspectorTabs,
    interaction,
    layers,
    layout,
    leftTabs,
    materials,
    panes,
    rightTabs,
  };
}

function clickTarget(dataset: Record<string, string>) {
  return {
    closest: (selector: string) => {
      if (selector === '[data-panel-collapse]' && dataset.panelCollapse !== undefined)
        return { dataset };
      if (selector === '[data-panel-tab]' && dataset.panelTab !== undefined) return { dataset };
      if (selector === '[data-inspector-tab]' && dataset.inspectorTab !== undefined)
        return { dataset };
      return null;
    },
  } as unknown as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

describe('DesignerWorkbenchController instance state', () => {
  it('keeps canvas aids, guides, and panel state local to each workbench', () => {
    const first = createWorkbench();
    const second = createWorkbench();
    first.controller.initialize();
    second.controller.initialize();

    first.controller.toggleCanvasAid('gridEnabled');
    first.controller.onClick(clickTarget({ panelCollapse: 'left' }));
    first.controller.onClick(clickTarget({ panelTab: 'layers' }));
    first.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;
    first.controller.onPointerDown({
      target: ruler,
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    first.controller.onPointerUp({ pointerId: 1, clientX: 50, clientY: 0 } as PointerEvent);

    expect(first.grid.ariaPressed).toBe('false');
    expect(second.grid.ariaPressed).toBe('true');
    expect(first.layout.dataset.leftCollapsed).toBe('true');
    expect(second.layout.dataset.leftCollapsed).toBe('false');
    expect(first.leftTabs[1]?.ariaSelected).toBe('true');
    expect(second.leftTabs[0]?.ariaSelected).toBe('true');
    expect(first.rightTabs[1]?.ariaSelected).toBe('true');
    expect(second.rightTabs[0]?.ariaSelected).toBe('true');
    expect(first.guides.children).toHaveLength(1);
    expect(first.controller.snapPoint({ x: 47, y: 47 })).toEqual({
      x: 50,
      y: 48,
      snappedX: 50,
      snappedY: 48,
    });
    expect(second.controller.snapPoint({ x: 47, y: 47 })).toEqual({
      x: 48,
      y: 48,
      snappedX: 48,
      snappedY: 48,
    });
  });

  it('R7 moves, double-click deletes, and discards out-of-bounds guides without touching the document', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const originalDocument = structuredClone(workbench.document);
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;

    workbench.controller.onPointerDown({
      target: ruler,
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 1, clientX: 50, clientY: 0 } as PointerEvent);
    const guide = workbench.guides.children[0]!;
    workbench.canvas.dispatch('pointerdown', {
      target: guide,
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 100, clientY: 0 } as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 2, clientX: 100, clientY: 0 } as PointerEvent);

    expect(workbench.guides.children).toHaveLength(1);
    expect((workbench.guides.children[0]!.style as unknown as Record<string, string>).left).toBe(
      '100px',
    );
    workbench.canvas.dispatch('dblclick', {
      target: workbench.guides.children[0],
      stopImmediatePropagation: () => undefined,
    } as unknown as MouseEvent);
    expect(workbench.guides.children).toHaveLength(0);

    workbench.controller.onPointerDown({
      target: ruler,
      pointerId: 3,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 3, clientX: -1, clientY: 0 } as PointerEvent);

    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('hides inspector tabs and falls back to appearance when no component is focused', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    expect(workbench.inspectorTabs.hidden).toBe(false);

    workbench.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    expect(workbench.rightTabs[1]?.ariaSelected).toBe('true');
    expect(workbench.panes[1]?.hidden).toBe(false);

    workbench.interaction.focusedComponentId = null;
    workbench.interaction.selectedComponentIds = [];
    workbench.controller.renderInspectorTabs();
    expect(workbench.inspectorTabs.hidden).toBe(true);
    expect(workbench.rightTabs[0]?.ariaSelected).toBe('true');
    expect(workbench.panes[0]?.hidden).toBe(false);
    expect(workbench.panes[1]?.hidden).toBe(true);
    expect(workbench.panes[2]?.hidden).toBe(true);
    expect(workbench.panes[3]?.hidden).toBe(true);

    workbench.interaction.focusedComponentId = 'c1';
    workbench.interaction.selectedComponentIds = ['c1'];
    workbench.controller.renderInspectorTabs();
    expect(workbench.inspectorTabs.hidden).toBe(false);
    expect(workbench.rightTabs[0]?.ariaSelected).toBe('true');
  });

  it('R7 renders snap previews as transient overlays without touching the document', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const originalDocument = structuredClone(workbench.document);

    workbench.controller.renderSnapPreview({ x: 50, y: 40, snappedX: 50 });

    expect(workbench.guides.children).toHaveLength(1);
    expect(workbench.guides.children[0]!.className).toBe('canvas-guide canvas-guide-snap');
    workbench.controller.renderSnapPreview(undefined);
    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.document).toEqual(originalDocument);
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
