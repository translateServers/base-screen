import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { DesignerWorkbenchController } from '../../../src/browser/controllers/designer-workbench-controller.js';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';

export function captureTarget() {
  const captures = new Set<number>();
  return {
    captures,
    setPointerCapture: (pointerId: number) => captures.add(pointerId),
    hasPointerCapture: (pointerId: number) => captures.has(pointerId),
    releasePointerCapture: (pointerId: number) => captures.delete(pointerId),
  };
}
export class WorkbenchElement {
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

export function createWorkbench(
  options: {
    readonly dataCapabilities?: readonly ('static' | 'host-resource')[];
    readonly hostLeftPanelGroup?: { readonly id: string; readonly label: string };
    readonly onLeftPanelGroupChange?: (groupId: string | undefined) => void;
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
  const leftTabs = [
    { tab: 'materials', label: DESIGNER_UI_TEXT.materials },
    { tab: 'layers', label: DESIGNER_UI_TEXT.layers },
    ...(options.hostLeftPanelGroup === undefined
      ? []
      : [
          {
            tab: `host:${options.hostLeftPanelGroup.id}`,
            label: options.hostLeftPanelGroup.label,
          },
        ]),
  ].map(({ tab, label }) => {
    const control = new WorkbenchElement();
    control.dataset.panelTab = tab;
    control.dataset.panelLabel = label;
    return control;
  });
  const hostLeftPanelPanes =
    options.hostLeftPanelGroup === undefined
      ? []
      : (() => {
          const pane = new WorkbenchElement();
          pane.dataset.hostLeftPanelGroup = options.hostLeftPanelGroup.id;
          pane.hidden = true;
          return [pane];
        })();
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
  const leftTitle = new WorkbenchElement();
  const leftCount = new WorkbenchElement();
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
    ['[data-left-panel-title]', leftTitle],
    ['[data-left-panel-count]', leftCount],
    ['[data-panel-handle="left"]', leftHandle],
    ['[data-panel-handle="right"]', rightHandle],
  ]);
  const root = {
    ownerDocument: { defaultView },
    querySelector: (selector: string) => elements.get(selector) ?? null,
    querySelectorAll: (selector: string) => {
      if (selector === '[data-panel-tab]') return leftTabs;
      if (selector === '.host-left-panel-view[data-host-left-panel-group]')
        return hostLeftPanelPanes;
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
      ...(options.onLeftPanelGroupChange === undefined
        ? {}
        : { onLeftPanelGroupChange: options.onLeftPanelGroupChange }),
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
    leftCount,
    leftTitle,
    leftTabs,
    hostLeftPanelPanes,
    materials,
    nativeEventsToggle,
    panes,
    rightCollapseControl,
    rightTabs,
    storage,
    zoom,
  };
}

export function measurementComponent(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
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

export function clickTarget(dataset: Record<string, string>) {
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
