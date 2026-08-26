import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerViewportController } from '../../../src/browser/controllers/designer-viewport-controller.js';
import { DesignerWorkbenchController } from '../../../src/browser/controllers/designer-workbench-controller.js';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';

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
    const layout = {
      dataset: {} as DOMStringMap,
      style: { setProperty: () => undefined, removeProperty: () => undefined },
    };
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

  it('does not capture panel or ruler interactions from a secondary button', () => {
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
  replaceChildrenCalls = 0;
  readonly captures = new Set<number>();
  readonly attributes: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly style = {
    setProperty: (property: string, value: string) => {
      (this.style as unknown as Record<string, string>)[property] = value;
    },
    removeProperty: (property: string) => {
      delete (this.style as unknown as Record<string, string>)[property];
    },
  };
  className = '';
  ariaPressed = '';
  ariaSelected = '';
  title = '';
  hidden = false;
  textContent = '';
  clientLeft = 0;
  getBoundingClientRect = () => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  });

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.captures.delete(pointerId);
  }

  readonly classList = {
    add: (name: string) => {
      this.className = this.className === '' ? name : `${this.className} ${name}`;
    },
  };

  readonly ownerDocument = { createElement: () => new WorkbenchElement() };

  appendChild(child: WorkbenchElement): WorkbenchElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: WorkbenchElement[]): void {
    this.replaceChildrenCalls += 1;
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === 'aria-pressed') this.ariaPressed = value;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  closest<T extends Element>(selector: string): T | null {
    return (
      selector === '[data-canvas-guide]' && this.dataset.canvasGuide === 'true' ? this : null
    ) as T | null;
  }
}

function createWorkbench(
  options: {
    readonly dataCapabilities?: readonly ('static' | 'host-resource')[];
    readonly onNativeEventsChange?: (enabled: boolean) => void;
    readonly storage?: Map<string, string>;
  } = {},
) {
  const layout = new WorkbenchElement();
  const storage = options.storage ?? new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  const defaultView = {
    localStorage,
    getComputedStyle: (element: WorkbenchElement) => ({
      getPropertyValue: (property: string) =>
        (element.style as unknown as Record<string, string>)[property] ?? '',
    }),
  };
  (
    layout.ownerDocument as typeof layout.ownerDocument & {
      defaultView: typeof defaultView;
    }
  ).defaultView = defaultView;
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
  const rightTabs = ['appearance', 'data', 'interaction'].map((tab) => {
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
  const nativeEventsToggle = new WorkbenchElement();
  const leftCollapseControl = new WorkbenchElement();
  const rightCollapseControl = new WorkbenchElement();
  // 面板分隔列 5px（.panel-handle::before 的 1px 高亮线居中，列中线 = 高亮线位置）。
  const handleRect = () => ({ bottom: 0, height: 0, left: 0, right: 5, top: 0, width: 5 });
  const leftHandle = new WorkbenchElement();
  const rightHandle = new WorkbenchElement();
  leftHandle.getBoundingClientRect = handleRect;
  rightHandle.getBoundingClientRect = handleRect;
  const canvasListeners = new Map<string, (event: PointerEvent | MouseEvent) => void>();
  const canvas = {
    ...captureTarget(),
    addEventListener: (type: string, listener: (event: PointerEvent | MouseEvent) => void) =>
      canvasListeners.set(type, listener),
    dispatch: (type: string, event: PointerEvent | MouseEvent) =>
      canvasListeners.get(type)?.(
        Object.assign({ preventDefault: () => undefined }, event) as PointerEvent | MouseEvent,
      ),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    ownerDocument: { createElement: () => new WorkbenchElement() },
  } as unknown as HTMLDivElement & {
    dispatch: (type: string, event: PointerEvent | MouseEvent) => void;
  };
  const document: ScreenDocument = {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components:
      options.dataCapabilities === undefined
        ? []
        : [
            {
              id: 'c1',
              type: 'base.rectangle',
              name: '矩形',
              parentId: null,
              position: { x: 0, y: 0 },
              size: { width: 100, height: 100 },
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
  const interaction: {
    focusedComponentId: string | null;
    selectedComponentIds: string[];
  } = { focusedComponentId: 'c1', selectedComponentIds: ['c1'] };
  const zoom = { value: 1 };
  const elements = new Map<string, WorkbenchElement>([
    ['.designer', layout],
    ['[data-viewport]', viewport],
    ['[data-canvas-guides]', guides],
    ['[data-materials]', materials],
    ['[data-layers]', layers],
    ['.inspector-tabs', inspectorTabs],
    ['[data-action="toggle-grid"]', grid],
    ['[data-status-toggle="native-events"]', nativeEventsToggle],
    ['[data-panel-collapse="left"]', leftCollapseControl],
    ['[data-panel-collapse="right"]', rightCollapseControl],
    ['[data-panel-handle="left"]', leftHandle],
    ['[data-panel-handle="right"]', rightHandle],
  ]);
  const root = {
    ownerDocument: { defaultView },
    querySelector: (selector: string) => elements.get(selector) ?? null,
    querySelectorAll: (selector: string) => {
      if (selector === '[data-panel-tab]') return leftTabs;
      if (selector === '[data-inspector-tab]') return rightTabs;
      if (selector === '[data-inspector-pane]') return panes;
      return [];
    },
    // 浏览器中 dblclick 因指针捕获被重定向到画布，真实路径按坐标命中参考线
    // （elementFromPoint/elementsFromPoint 由真实 ShadowRoot 提供）。
    elementsFromPoint: () => [...guides.children],
  } as unknown as ShadowRoot;
  return {
    canvas,
    controller: new DesignerWorkbenchController({
      getCanvas: () => canvas,
      getDocument: () => document,
      getInteraction: () => interaction,
      ...(options.dataCapabilities === undefined
        ? {}
        : {
            getCatalog: () =>
              ({
                get: () => ({ manifest: { dataCapabilities: options.dataCapabilities } }),
              }) as unknown as BaseScreenMaterialCatalog,
          }),
      ...(options.onNativeEventsChange === undefined
        ? {}
        : { onNativeEventsChange: options.onNativeEventsChange }),
      getRoot: () => root,
      getZoom: () => zoom.value,
    }),
    document,
    grid,
    guides,
    inspectorTabs,
    interaction,
    layers,
    layout,
    leftCollapseControl,
    leftTabs,
    materials,
    nativeEventsToggle,
    panes,
    rightCollapseControl,
    rightTabs,
    storage,
    zoom,
  };
}

function measurementComponent(id: string, x: number, y: number, width: number, height: number) {
  return {
    id,
    type: 'base.rectangle',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  } as const;
}

function clickTarget(dataset: Record<string, string>) {
  return {
    closest: (selector: string) => {
      if (selector === '[data-panel-collapse]' && dataset.panelCollapse !== undefined)
        return { dataset };
      if (selector === '[data-panel-tab]' && dataset.panelTab !== undefined) return { dataset };
      if (selector === '[data-inspector-tab]' && dataset.inspectorTab !== undefined)
        return { dataset };
      if (selector === '[data-status-toggle]' && dataset.statusToggle !== undefined)
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
    first.controller.onClick(clickTarget({ panelTab: 'layers' }));
    first.controller.onClick(clickTarget({ panelCollapse: 'left' }));
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
      y: 47,
      snappedX: 50,
    });
    expect(second.controller.snapPoint({ x: 47, y: 47 })).toEqual({ x: 47, y: 47 });
  });

  it('R4 expands the collapsed rail when an icon tab is clicked and switches the tab', () => {
    const { controller, layout, leftTabs } = createWorkbench();
    controller.initialize();
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');

    controller.onClick(clickTarget({ panelTab: 'layers' }));

    expect(layout.dataset.leftCollapsed).toBe('false');
    expect(leftTabs[1]?.ariaSelected).toBe('true');
    expect(leftTabs[0]?.ariaSelected).toBe('false');
  });

  it('keeps the panel highlight line centered under the pointer while resizing', () => {
    const workbench = createWorkbench();
    // .designer 边框 1px + 分隔列 5px（1px 高亮线居中）：面板宽度 = 指针到内容原点距离 - 列中线，
    // 使拖拽中高亮线始终与指针精确重合（历史 -48 偏移已移除）。
    workbench.layout.clientLeft = 1;
    workbench.layout.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 100,
      right: 1300,
      top: 0,
      width: 1200,
    });
    const panelHandle = (side: string) =>
      ({
        closest: (selector: string) =>
          selector === '[data-panel-handle]' ? { dataset: { panelHandle: side } } : null,
      }) as unknown as HTMLElement;
    const style = workbench.layout.style as unknown as Record<string, string>;

    workbench.controller.onPointerDown({
      target: panelHandle('left'),
      pointerId: 1,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    // 指针位于高亮线（列中线 = 100 + 1 + 300 + 2.5）时，面板宽度恰好为 300px。
    workbench.controller.onPointerMove({ pointerId: 1, clientX: 403.5 } as unknown as PointerEvent);
    expect(style['--left-panel-width']).toBe('300px');
    // 拖出上限后仍按列中线跟随指针，仅受钳制约束。
    workbench.controller.onPointerMove({ pointerId: 1, clientX: 903.5 } as unknown as PointerEvent);
    expect(style['--left-panel-width']).toBe('480px');
    workbench.controller.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);
    expect(workbench.layout.captures.has(1)).toBe(false);

    workbench.controller.onPointerDown({
      target: panelHandle('right'),
      pointerId: 2,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 996.5 } as unknown as PointerEvent);
    expect(style['--right-panel-width']).toBe('300px');
    workbench.controller.onPointerUp({ pointerId: 2 } as unknown as PointerEvent);
    expect(workbench.layout.captures.has(2)).toBe(false);
  });

  it('R1 collapses to the 48px rail after a width drag and restores the dragged width', () => {
    const workbench = createWorkbench();
    const { controller, layout } = workbench;
    layout.clientLeft = 1;
    layout.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 100,
      right: 1300,
      top: 0,
      width: 1200,
    });
    const style = layout.style as unknown as Record<string, string>;
    const drag = (side: string, clientX: number, pointerId: number) => {
      controller.onPointerDown({
        target: {
          closest: (selector: string) =>
            selector === '[data-panel-handle]' ? { dataset: { panelHandle: side } } : null,
        } as unknown as HTMLElement,
        pointerId,
        preventDefault: () => undefined,
      } as unknown as PointerEvent);
      controller.onPointerMove({ pointerId, clientX } as unknown as PointerEvent);
      controller.onPointerUp({ pointerId } as unknown as PointerEvent);
    };

    // 左面板：拖到 380px 后折叠必须收敛到 48px，展开恢复拖拽宽度。
    drag('left', 100 + 1 + 380 + 2.5, 1);
    expect(style['--left-panel-width']).toBe('380px');
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');
    expect(style['--left-panel-width']).toBe('48px');
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('false');
    expect(style['--left-panel-width']).toBe('380px');

    // 右面板：拖到 340px 后同样折叠收敛、展开恢复。
    drag('right', 1300 - 340 - 1 - 2.5, 2);
    expect(style['--right-panel-width']).toBe('340px');
    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(layout.dataset.rightCollapsed).toBe('true');
    expect(style['--right-panel-width']).toBe('48px');
    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(style['--right-panel-width']).toBe('340px');
  });

  it('restores the persisted inspector width when the host initializes while hidden', () => {
    const storage = new Map<string, string>([['base-screen.designer.inspector-width', '420']]);
    const workbench = createWorkbench({ storage });
    const style = workbench.layout.style as unknown as Record<string, string>;

    // XJ Data Hub 使用 v-show：自定义元素 connected 时宿主仍为 display:none，
    // getBoundingClientRect().width 为 0。持久化宽度不得因此被压成 288px。
    expect(workbench.layout.getBoundingClientRect().width).toBe(0);
    workbench.controller.initialize();

    expect(style['--right-panel-width']).toBe('420px');
    expect(storage.get('base-screen.designer.inspector-width')).toBe('420');
  });

  it('R1 keeps the host default width when collapsing without a prior drag', () => {
    const workbench = createWorkbench();
    const { controller, layout } = workbench;
    const style = layout.style as unknown as Record<string, string>;
    controller.initialize();

    // 从未拖拽：不写内联宽度变量，宿主 CSS 默认生效。
    expect(style['--left-panel-width']).toBeUndefined();
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');
    expect(style['--left-panel-width']).toBe('48px');
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(style['--left-panel-width']).toBeUndefined();
  });

  it('R2 expands a collapsed panel only after dragging past the expand threshold', () => {
    const workbench = createWorkbench();
    const { controller, layout } = workbench;
    layout.clientLeft = 1;
    layout.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 100,
      right: 1300,
      top: 0,
      width: 1200,
    });
    controller.initialize();
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');
    const style = layout.style as unknown as Record<string, string>;
    const handle = {
      closest: (selector: string) =>
        selector === '[data-panel-handle]' ? { dataset: { panelHandle: 'left' } } : null,
    } as unknown as HTMLElement;

    controller.onPointerDown({
      target: handle,
      pointerId: 1,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    // 阈值内拖拽（宽度 58 < 48+24）：保持折叠，宽度变量不变。
    controller.onPointerMove({
      pointerId: 1,
      clientX: 100 + 1 + 58 + 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.leftCollapsed).toBe('true');
    expect(style['--left-panel-width']).toBe('48px');
    // 越过阈值（宽度 300 ≥ 48+24）：展开并应用拖拽宽度。
    controller.onPointerMove({
      pointerId: 1,
      clientX: 100 + 1 + 300 + 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.leftCollapsed).toBe('false');
    expect(style['--left-panel-width']).toBe('300px');
    controller.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);

    // 右面板同阈值语义：先折叠，阈值内保持折叠，越过阈值展开。
    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(layout.dataset.rightCollapsed).toBe('true');
    controller.onPointerDown({
      target: {
        closest: (selector: string) =>
          selector === '[data-panel-handle]' ? { dataset: { panelHandle: 'right' } } : null,
      } as unknown as HTMLElement,
      pointerId: 2,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    controller.onPointerMove({
      pointerId: 2,
      clientX: 1300 - 58 - 1 - 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.rightCollapsed).toBe('true');
    expect(style['--right-panel-width']).toBe('48px');
    controller.onPointerMove({
      pointerId: 2,
      clientX: 1300 - 300 - 1 - 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.rightCollapsed).toBe('false');
    expect(style['--right-panel-width']).toBe('300px');
    controller.onPointerUp({ pointerId: 2 } as unknown as PointerEvent);
  });

  it('R3 switches collapse control labels between collapse and expand', () => {
    const workbench = createWorkbench();
    const { controller } = workbench;
    controller.initialize();
    expect(workbench.leftCollapseControl.title).toBe(DESIGNER_UI_TEXT.collapseMaterials);
    expect(workbench.rightCollapseControl.title).toBe(DESIGNER_UI_TEXT.collapseInspector);

    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(workbench.leftCollapseControl.title).toBe(DESIGNER_UI_TEXT.expandMaterials);
    expect(workbench.leftCollapseControl.attributes['aria-label']).toBe(
      DESIGNER_UI_TEXT.expandMaterials,
    );
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(workbench.leftCollapseControl.title).toBe(DESIGNER_UI_TEXT.collapseMaterials);

    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(workbench.rightCollapseControl.title).toBe(DESIGNER_UI_TEXT.expandInspector);
    expect(workbench.rightCollapseControl.attributes['aria-label']).toBe(
      DESIGNER_UI_TEXT.expandInspector,
    );
  });

  it('R4 snap toggle gates snapping while keeping raw coordinates', () => {
    const { controller } = createWorkbench();
    expect(controller.snapEnabled).toBe(true);
    expect(controller.snapPoint({ x: 3, y: 3 }).snappedX).toBe(0);
    controller.toggleSnap();
    expect(controller.snapEnabled).toBe(false);
    expect(controller.snapPoint({ x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
    expect(
      controller.snapSelectionOffset({ left: 0, right: 50, top: 0, bottom: 40 }, { x: 3, y: 3 }),
    ).toEqual({ x: 3, y: 3 });
    controller.toggleSnap();
    expect(controller.snapEnabled).toBe(true);
  });

  it('exposes canvas aid toggle states for menu checkmarks', () => {
    const { controller } = createWorkbench();
    expect(controller.isCanvasAidEnabled('gridEnabled')).toBe(true);
    expect(controller.guidesVisible).toBe(true);
    expect(controller.borderGuidesEnabled).toBe(true);

    controller.toggleCanvasAid('gridEnabled');
    expect(controller.isCanvasAidEnabled('gridEnabled')).toBe(false);
    controller.toggleCanvasAid('gridEnabled');
    expect(controller.isCanvasAidEnabled('gridEnabled')).toBe(true);

    controller.toggleGuides();
    expect(controller.guidesVisible).toBe(false);
    controller.toggleGuides();
    expect(controller.guidesVisible).toBe(true);

    controller.toggleBorderGuides();
    expect(controller.borderGuidesEnabled).toBe(false);
    controller.toggleBorderGuides();
    expect(controller.borderGuidesEnabled).toBe(true);
  });

  it('routes the bottom status snap switch through the workbench click handler', () => {
    const { controller } = createWorkbench();

    expect(controller.onClick(clickTarget({ statusToggle: 'snap' }))).toBe(true);
    expect(controller.snapEnabled).toBe(false);
  });

  it('routes the bottom status native events switch through the workbench click handler', () => {
    const changed: boolean[] = [];
    const { controller } = createWorkbench({
      onNativeEventsChange: (enabled) => changed.push(enabled),
    });

    expect(controller.nativeEventsEnabled).toBe(false);
    expect(controller.onClick(clickTarget({ statusToggle: 'native-events' }))).toBe(true);
    expect(controller.nativeEventsEnabled).toBe(true);
    expect(changed).toEqual([true]);

    expect(controller.onClick(clickTarget({ statusToggle: 'native-events' }))).toBe(true);
    expect(controller.nativeEventsEnabled).toBe(false);
    expect(changed).toEqual([true, false]);
  });

  it('keeps the native events switch functional without a change callback', () => {
    const { controller } = createWorkbench();
    expect(() => controller.toggleNativeEvents()).not.toThrow();
    expect(controller.nativeEventsEnabled).toBe(true);
    expect(() => controller.toggleNativeEvents()).not.toThrow();
    expect(controller.nativeEventsEnabled).toBe(false);
  });

  it('syncs the native events status toggle aria state with the controller state', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    expect(workbench.nativeEventsToggle.attributes['aria-checked']).toBe('false');

    workbench.controller.toggleNativeEvents();
    expect(workbench.nativeEventsToggle.attributes['aria-checked']).toBe('true');
  });

  it('keeps native events state local to each workbench instance', () => {
    const first = createWorkbench();
    const second = createWorkbench();
    first.controller.toggleNativeEvents();
    expect(first.controller.nativeEventsEnabled).toBe(true);
    expect(second.controller.nativeEventsEnabled).toBe(false);
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
    // 参考线以对齐坐标定位，CSS translate(-50%) 使线中心与坐标精确重合。
    expect((workbench.guides.children[0]!.style as unknown as Record<string, string>).left).toBe(
      '100px',
    );
    // 真实浏览器中 dblclick 的 target 是捕获元素（画布）而非参考线：以坐标命中参考线。
    workbench.canvas.dispatch('dblclick', {
      target: workbench.canvas,
      clientX: 100,
      clientY: 0,
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

  it('R7 removes a guide on a second pointerdown within the double-click window', () => {
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
    expect(workbench.guides.children).toHaveLength(1);

    // 第一次 pointerdown 落在参考线上，进入拖拽并原地 commit（无位移，双击判定保持武装）。
    const preventDefault = vi.fn();
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      timeStamp: 1000,
      preventDefault,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 51, clientY: 0 } as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 2, clientX: 51, clientY: 0 } as PointerEvent);
    workbench.canvas.dispatch('lostpointercapture', {
      type: 'lostpointercapture',
      pointerId: 2,
    } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);

    // 500ms 窗口内同一参考线的第二次 pointerdown = 双击：直接移除，不再进入拖拽。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 3,
      clientX: 51,
      clientY: 0,
      timeStamp: 1400,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('R7 keeps a guide when the second pointerdown is a drag or falls outside the double-click window', () => {
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

    // 第一次点击后拖拽位移：判定失效（拖拽不等于双击点击），参考线移动而不是被移除。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      timeStamp: 1000,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 120, clientY: 0 } as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 2, clientX: 120, clientY: 0 } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);

    // 窗口内（500ms 内）的第二次 pointerdown 不触发移除（拖拽已使判定失效），照常进入拖拽。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 3,
      clientX: 120,
      clientY: 0,
      timeStamp: 1300,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 3, clientX: 120, clientY: 0 } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);

    // 窗口外（>500ms）的第二次 pointerdown 同样不触发移除。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 4,
      clientX: 120,
      clientY: 0,
      timeStamp: 2500,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 4, clientX: 120, clientY: 0 } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('R7 does not treat a click after cancelled guide capture as a double click', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
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

    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      timeStamp: 1000,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.canvas.dispatch('lostpointercapture', {
      type: 'lostpointercapture',
      pointerId: 2,
    } as PointerEvent);
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 3,
      clientX: 50,
      clientY: 0,
      timeStamp: 1200,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);

    expect(workbench.guides.children).toHaveLength(1);
    expect(workbench.canvas.hasPointerCapture(3)).toBe(true);
    workbench.controller.onPointerUp({ pointerId: 3, clientX: 50, clientY: 0 } as PointerEvent);
  });

  it('hides inspector tabs and falls back to appearance when no component is focused', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    expect(workbench.inspectorTabs.hidden).toBe(false);
    expect(workbench.panes[0]?.attributes.role).toBe('tabpanel');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBe('designer-appearance-tab');

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
    expect(workbench.panes[0]?.attributes.role).toBe('region');
    expect(workbench.panes[0]?.attributes['aria-label']).toBe('画布');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBeUndefined();

    workbench.interaction.focusedComponentId = 'c1';
    workbench.interaction.selectedComponentIds = ['c1'];
    workbench.controller.renderInspectorTabs();
    expect(workbench.inspectorTabs.hidden).toBe(false);
    expect(workbench.rightTabs[0]?.ariaSelected).toBe('true');
    expect(workbench.panes[0]?.attributes.role).toBe('tabpanel');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBe('designer-appearance-tab');
    expect(workbench.panes[0]?.attributes['aria-label']).toBeUndefined();
  });

  it('hides inspector tabs and falls back to appearance for multi-selection', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    workbench.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    expect(workbench.inspectorTabs.hidden).toBe(false);
    expect(workbench.panes[1]?.hidden).toBe(false);

    workbench.interaction.focusedComponentId = 'c2';
    workbench.interaction.selectedComponentIds = ['c1', 'c2'];
    workbench.controller.renderInspectorTabs();

    expect(workbench.inspectorTabs.hidden).toBe(true);
    expect(workbench.rightTabs[0]?.ariaSelected).toBe('true');
    expect(workbench.panes[0]?.hidden).toBe(false);
    expect(workbench.panes[1]?.hidden).toBe(true);
    expect(workbench.panes[2]?.hidden).toBe(true);
    expect(workbench.panes[0]?.attributes.role).toBe('region');
    expect(workbench.panes[0]?.attributes['aria-label']).toBe('选择概览');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBeUndefined();
  });

  it('hides the data tab when the focused material declares no data capability', () => {
    const withoutData = createWorkbench({ dataCapabilities: [] });
    withoutData.controller.initialize();

    expect(withoutData.rightTabs[1]?.hidden).toBe(true);
    withoutData.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    expect(withoutData.rightTabs[0]?.ariaSelected).toBe('true');
    expect(withoutData.panes[0]?.hidden).toBe(false);

    const withData = createWorkbench({ dataCapabilities: ['static'] });
    withData.controller.initialize();
    expect(withData.rightTabs[1]?.hidden).toBe(false);
  });

  it('R7 renders snap previews as transient overlays without touching the document', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const originalDocument = structuredClone(workbench.document);

    workbench.controller.renderSnapPreview({ x: 50, y: 40, snappedX: 50 });

    expect(workbench.guides.children).toHaveLength(1);
    expect(workbench.guides.children[0]!.className).toBe(
      'canvas-guide canvas-guide-snap canvas-guide-snap-active',
    );
    workbench.controller.renderSnapPreview(undefined);
    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('R7 renders render-threshold snap guide lines without distance labels and with active highlight', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.renderSnapPreview({
      x: 40,
      y: 30,
      snappedX: 150,
      snappedY: 70,
      guides: {
        x: [{ value: 150, start: 0, size: 100 }],
        y: [{ value: 70, start: 0, size: 100 }],
      },
    });

    expect(workbench.guides.children).toHaveLength(2);
    const xGuide = workbench.guides.children.find((child) => child.dataset.axis === 'x');
    // 吸附目标线（snappedX=150）以 active 高亮；渲染阈值内残余间距恒 ≤1px，不再叠加距离标签。
    expect(xGuide?.className).toBe('canvas-guide canvas-guide-snap canvas-guide-snap-active');
    expect(xGuide?.children).toHaveLength(0);
    workbench.controller.renderSnapPreview(undefined);
    expect(workbench.guides.children).toHaveLength(0);
  });

  it('R2 does not render snap overlays when stacked component boundaries already coincide', () => {
    const workbench = createWorkbench();
    const components = workbench.document.components as unknown as Array<
      ScreenDocument['components'][number]
    >;
    components.push(measurementComponent('above', 130, 126, 100, 40));
    workbench.controller.initialize();

    const preview = workbench.controller.snapSelectionOffset(
      { left: 130, right: 230, top: 166, bottom: 206 },
      { x: 0, y: 0 },
      ['c1'],
    );
    expect(preview).toMatchObject({
      x: 0,
      y: 0,
      snappedX: 130,
      snappedY: 166,
      guides: {},
    });

    workbench.controller.renderSnapPreview(preview);
    expect(workbench.guides.children).toHaveLength(0);
  });

  it('R2 renders alignment-rail measurements only for a moving preview without changing snap candidates', () => {
    const workbench = createWorkbench();
    const components = workbench.document.components as unknown as Array<
      ScreenDocument['components'][number]
    >;
    components.push(
      measurementComponent('top', 0, 0, 260, 100),
      measurementComponent('c1', 0, 146, 200, 34),
      measurementComponent('upper-left', 0, 228, 100, 120),
      measurementComponent('upper-right', 100, 228, 100, 120),
      measurementComponent('lower-left', 0, 407, 100, 120),
      measurementComponent('lower-right', 100, 407, 100, 120),
    );
    workbench.controller.initialize();

    expect(
      workbench.guides.children.filter((child) => child.className === 'canvas-measurement'),
    ).toHaveLength(0);

    const preview = workbench.controller.snapSelectionOffset(
      { left: 0, right: 200, top: 146, bottom: 180 },
      { x: 0, y: 0 },
      ['c1'],
    );
    expect(preview.measurements?.[0]).toMatchObject({ axis: 'y', distance: 46 });
    workbench.controller.renderSnapPreview(preview);
    let measurements = workbench.guides.children.filter(
      (child) => child.className === 'canvas-measurement',
    );
    expect(measurements).toHaveLength(7);
    expect(measurements[0]?.dataset.axis).toBe('y');
    expect(measurements[0]?.children[0]?.textContent).toBe('46');
    expect((measurements[0]?.style as unknown as CSSStyleDeclaration).height).toBe('46px');

    const movedPreview = workbench.controller.snapSelectionOffset(
      { left: 0, right: 200, top: 146, bottom: 180 },
      { x: 0, y: 4 },
      ['c1'],
    );
    expect(movedPreview.measurements?.[0]).toMatchObject({ axis: 'y', distance: 50 });
    workbench.controller.renderSnapPreview(movedPreview);
    measurements = workbench.guides.children.filter(
      (child) => child.className === 'canvas-measurement',
    );
    expect(measurements[0]?.children[0]?.textContent).toBe('50');

    workbench.controller.renderSnapPreview(undefined);
    expect(
      workbench.guides.children.filter((child) => child.className === 'canvas-measurement'),
    ).toHaveLength(0);
  });

  it('R2 clears transient snap overlays when snapping or border guides are toggled', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.renderSnapPreview({ x: 50, y: 40, snappedX: 50 });
    expect(workbench.guides.children).toHaveLength(1);
    workbench.controller.toggleSnap();
    expect(workbench.guides.children).toHaveLength(0);

    workbench.controller.toggleSnap();
    workbench.controller.renderSnapPreview({ x: 50, y: 40, snappedX: 50 });
    expect(workbench.guides.children).toHaveLength(1);
    workbench.controller.toggleBorderGuides();
    expect(workbench.guides.children).toHaveLength(0);
  });

  it('R4 keeps snap overlays disabled for previews arriving after the snap toggle is off', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.toggleSnap();
    workbench.controller.renderSnapPreview({
      x: 50,
      y: 40,
      snappedX: 50,
      guides: { x: [{ value: 50 }], y: [] },
    });

    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.controller.snapPoint({ x: 47, y: 47 })).toEqual({ x: 47, y: 47 });
  });

  it('R4 does not rebuild the guide layer for raw preview changes with no snap', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.controller.renderSnapPreview({
      x: 48,
      y: 48,
    });
    const callsAfterFirstPreview = workbench.guides.replaceChildrenCalls;
    workbench.controller.renderSnapPreview({
      x: 72,
      y: 72,
    });

    expect(workbench.guides.replaceChildrenCalls).toBe(callsAfterFirstPreview);
  });

  it('R4 inversely scales guide and measurement chrome with canvas zoom', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();

    workbench.zoom.value = 5;
    workbench.controller.renderCanvasPrecision();
    const styles = workbench.guides.style as unknown as Record<string, string>;

    expect(styles['--designer-overlay-pixel']).toBe('0.2px');
    expect(styles['--designer-overlay-active']).toBe('0.4px');
    expect(styles['--designer-overlay-hit-size']).toBe('1.8px');
    expect(styles['--designer-overlay-font-size']).toBe('2px');
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

describe('DesignerWorkbenchController snap session', () => {
  function componentNode(id: string, x: number) {
    return {
      id,
      type: 'base.rectangle',
      name: id,
      parentId: null,
      position: { x, y: 100 },
      size: { width: 100, height: 40 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    } as const;
  }

  function snapDocument(left: number): ScreenDocument {
    return {
      canvas: { width: 800, height: 600, backgroundColor: '#000000' },
      components: [componentNode('a', left), componentNode('b', 300)],
      variables: [],
      blueprint: { rules: [] },
    };
  }

  function createController(getDocument: () => ScreenDocument) {
    return new DesignerWorkbenchController({
      getCanvas: () => undefined,
      getDocument,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => null,
      getZoom: () => 1,
    });
  }

  it('R4 caches snap candidates within a gesture session and invalidates across sessions', () => {
    let document = snapDocument(100);
    const controller = createController(() => document);

    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(100);
    document = snapDocument(200);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(101);

    controller.setSnapSessionActive(true);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(101);
    document = snapDocument(100);
    // 会话内文档引用替换：候选仍来自会话起始文档（a@200），未重新收集。
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(101);
    controller.setSnapSessionActive(false);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(100);
  });

  it('R4 distinguishes cached candidates by excluded component set and resets the snap hold', () => {
    const controller = createController(() => snapDocument(100));

    controller.setSnapSessionActive(true);
    expect(controller.snapPoint({ x: 101, y: 0 }, ['a']).x).toBe(101);
    expect(controller.snapPoint({ x: 101, y: 0 }).x).toBe(100);
    expect(controller.snapPoint({ x: 101, y: 0 }, ['a']).x).toBe(101);
  });

  it('R4 treats excluded component ids as an order-independent cache key', () => {
    let document = snapDocument(100);
    const controller = createController(() => document);

    controller.setSnapSessionActive(true);
    expect(controller.snapPoint({ x: 197, y: 0 }, ['a', 'b']).x).toBe(197);
    document = snapDocument(200);

    // The reversed exclusion order describes the same candidate set, so the session keeps
    // the original cache instead of collecting the replacement document mid-gesture.
    expect(controller.snapPoint({ x: 197, y: 0 }, ['b', 'a']).x).toBe(197);
    controller.setSnapSessionActive(false);
    expect(controller.snapPoint({ x: 197, y: 0 }).x).toBe(200);
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
