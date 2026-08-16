import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionAction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../src/browser/controllers/designer-gesture-controller.js';
import { MATERIAL_DRAG_TYPE } from '../../../src/browser/controllers/designer-panel-controller.js';

// 元素类层次：FakeElementBase 对应 Element（所有元素），FakeElement 对应 HTMLElement。
// 测试里 Element stub 为基类、HTMLElement stub 为子类，从而可以构造"是 Element 但
// 不是 HTMLElement"的 SVG 场景。
class FakeElementBase {
  readonly dataset: Record<string, string> = {};
  readonly matches: Record<string, FakeElementBase> = {};
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

class FakeElement extends FakeElementBase {}

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

function groupCatalog(): BaseScreenMaterialCatalog {
  return {
    get: (type: string) =>
      ({
        manifest: {
          type,
          name: type,
          defaultSize: { width: 100, height: 80 },
          defaultProps: {},
          defaultStyle: {},
          designCapabilities: { resize: true, rotate: true, children: type === 'base.group' },
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
    contains: (node: unknown) =>
      node === canvas ||
      node === marquee ||
      node === selection ||
      (preview !== undefined && node === preview) ||
      Array.from(materials.values()).includes(node as FakeElement),
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

// 视窗背景 fake：只提供事件挂载与分发，供 connectViewport 绑定测试。
function createViewport() {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const viewport = new FakeElement();
  (viewport as unknown as Record<string, unknown>).addEventListener = (
    type: string,
    listener: (event: PointerEvent) => void,
  ) => listeners.set(type, listener);
  return {
    dispatch: (type: string, event: PointerEvent) => listeners.get(type)?.(event),
    viewport: viewport as unknown as HTMLDivElement,
  };
}

afterEach(() => vi.unstubAllGlobals());

function createGrabTarget() {
  const grab = new FakeElement();
  grab.matches['[data-selection-grab]'] = grab;
  return grab;
}

describe('DesignerGestureController cancellation', () => {
  it('R3 selects the outer group when clicking a nested child from the canvas root', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const group = {
      ...document().components[0]!,
      id: 'group',
      type: 'base.group',
      size: { width: 300, height: 200 },
    };
    const child = {
      ...document().components[0]!,
      id: 'child',
      parentId: 'group',
      position: { x: 20, y: 30 },
      zIndex: 1,
    };
    const current = { ...document(), components: [group, child] };
    const childMaterial = new FakeElement();
    childMaterial.dataset.baseScreenComponentId = 'child';
    childMaterial.matches['[data-base-screen-component-id]'] = childMaterial;
    canvas.registerMaterial('child', childMaterial);
    const interaction = {
      selectedComponentIds: [] as string[],
      focusedComponentId: null as string | null,
    };
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: groupCatalog,
      getDocument: () => current,
      getInteraction: () => interaction,
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection: (action) => {
        if (action.type === 'replace-selection') {
          interaction.selectedComponentIds = [...action.componentIds];
          interaction.focusedComponentId = action.focusedComponentId;
        }
      },
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 25,
      clientY: 35,
      preventDefault: () => undefined,
      target: childMaterial,
    } as unknown as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 25, clientY: 35 } as PointerEvent);

    expect(interaction).toEqual({ selectedComponentIds: ['group'], focusedComponentId: 'group' });
  });

  it('R3 drills into nested groups with double click and backs out one level with Escape', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const root = {
      ...document().components[0]!,
      id: 'root-group',
      type: 'base.group',
      size: { width: 300, height: 200 },
    };
    const childGroup = {
      ...document().components[0]!,
      id: 'child-group',
      type: 'base.group',
      parentId: 'root-group',
      position: { x: 20, y: 30 },
      zIndex: 1,
    };
    const leaf = {
      ...document().components[0]!,
      id: 'leaf',
      parentId: 'child-group',
      position: { x: 40, y: 50 },
      zIndex: 2,
    };
    const current = { ...document(), components: [root, childGroup, leaf] };
    const leafMaterial = new FakeElement();
    leafMaterial.dataset.baseScreenComponentId = 'leaf';
    leafMaterial.matches['[data-base-screen-component-id]'] = leafMaterial;
    canvas.registerMaterial('leaf', leafMaterial);
    const interaction = {
      selectedComponentIds: [] as string[],
      focusedComponentId: null as string | null,
    };
    const reduceSelection = (action: ScreenInteractionAction) => {
      if (action.type === 'replace-selection') {
        interaction.selectedComponentIds = [...action.componentIds];
        interaction.focusedComponentId = action.focusedComponentId;
      }
    };
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: groupCatalog,
      getDocument: () => current,
      getInteraction: () => interaction,
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

    canvas.dispatch('dblclick', {
      preventDefault: () => undefined,
      target: leafMaterial,
    } as unknown as PointerEvent);
    expect(interaction).toEqual({
      selectedComponentIds: ['child-group'],
      focusedComponentId: 'child-group',
    });

    canvas.dispatch('dblclick', {
      preventDefault: () => undefined,
      target: leafMaterial,
    } as unknown as PointerEvent);
    expect(interaction).toEqual({ selectedComponentIds: ['leaf'], focusedComponentId: 'leaf' });

    expect(controller.exitGroupEditingContext()).toBe(true);
    expect(interaction).toEqual({
      selectedComponentIds: ['child-group'],
      focusedComponentId: 'child-group',
    });
    expect(controller.exitGroupEditingContext()).toBe(true);
    expect(interaction).toEqual({
      selectedComponentIds: ['root-group'],
      focusedComponentId: 'root-group',
    });
    expect(controller.canEnterGroupEditingContext()).toBe(true);
    expect(controller.enterGroupEditingContext()).toBe(true);
    expect(interaction).toEqual({
      selectedComponentIds: ['child-group'],
      focusedComponentId: 'child-group',
    });
  });

  it('R5 moves an existing same-parent selection in one transaction', () => {
    vi.stubGlobal('Element', FakeElement);
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

  // SVG 元素（如物料内部的图表/图标）不是 HTMLElement 实例，但仍是 Element。
  // 拖拽手势的目标判定必须兼容 Element，否则点击物料内 SVG 时手势被跳过。
  it('starts a drag when the pointer target is an SVG element inside a material', () => {
    vi.stubGlobal('Element', FakeElementBase);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const first = document().components[0]!;
    const current = { ...document(), components: [first] };
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const svg = new FakeElementBase();
    svg.matches['[data-base-screen-component-id]'] = material;
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({
        selectedComponentIds: [] as string[],
        focusedComponentId: null as string | null,
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
      target: svg,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(material.style.translate).toBe('30px 30px');
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['rectangle-1'],
            patch: { position: { x: 40, y: 50 } },
          },
        ],
      },
    ]);
  });

  it('moves a multi-selection by dragging the selection overlay itself', () => {
    vi.stubGlobal('Element', FakeElement);
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

  it('R2 routes drag snapping through selection candidates and only renders after the drag threshold', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const snapCanvasSelection = vi.fn((_bounds, translation) => translation);
    const renderSnapPreview = vi.fn();
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
      renderSnapPreview,
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
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 12, clientY: 20 } as PointerEvent);
    expect(snapCanvasSelection).not.toHaveBeenCalled();
    expect(renderSnapPreview).not.toHaveBeenCalled();

    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(snapCanvasSelection).toHaveBeenCalledWith(expect.anything(), { x: 30, y: 30 }, [
      'rectangle-1',
    ]);
    expect(renderSnapPreview).toHaveBeenLastCalledWith({ x: 30, y: 30 });

    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(renderSnapPreview).toHaveBeenLastCalledWith(undefined);
  });

  it('rounds the committed drag position to two decimal places', () => {
    vi.stubGlobal('Element', FakeElement);
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

  it('moves a group and its children in one drag transaction', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const group = document().components[0]!;
    const groupNode = {
      ...group,
      id: 'group',
      type: 'base.container',
      size: { width: 300, height: 200 },
    };
    const child = {
      ...group,
      id: 'child',
      parentId: 'group',
      position: { x: 20, y: 30 },
      zIndex: 1,
    };
    const current = { ...document(), components: [groupNode, child] };
    const groupMaterial = new FakeElement();
    groupMaterial.dataset.baseScreenComponentId = 'group';
    groupMaterial.matches['[data-base-screen-component-id]'] = groupMaterial;
    canvas.registerMaterial('group', groupMaterial);
    const childMaterial = new FakeElement();
    childMaterial.dataset.baseScreenComponentId = 'child';
    canvas.registerMaterial('child', childMaterial);
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({
        selectedComponentIds: ['group'],
        focusedComponentId: 'group',
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
      target: groupMaterial,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(groupMaterial.style.translate).toBe('30px 30px');
    expect(childMaterial.style.translate).toBe('30px 30px');
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['group'],
            patch: { position: { x: 40, y: 50 } },
          },
          {
            type: 'update-components',
            componentIds: ['child'],
            patch: { position: { x: 50, y: 60 } },
          },
        ],
      },
    ]);
  });

  it('R2 excludes locked descendants from group drag preview and mutation', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const group = {
      ...document().components[0]!,
      id: 'group',
      type: 'base.container',
      size: { width: 300, height: 200 },
    };
    const child = {
      ...document().components[0]!,
      id: 'child',
      parentId: 'group',
      position: { x: 20, y: 30 },
      status: { locked: true, hidden: false },
      zIndex: 1,
    };
    const current = { ...document(), components: [group, child] };
    const groupMaterial = new FakeElement();
    groupMaterial.dataset.baseScreenComponentId = 'group';
    groupMaterial.matches['[data-base-screen-component-id]'] = groupMaterial;
    canvas.registerMaterial('group', groupMaterial);
    const childMaterial = new FakeElement();
    childMaterial.dataset.baseScreenComponentId = 'child';
    canvas.registerMaterial('child', childMaterial);
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({ selectedComponentIds: ['group'], focusedComponentId: 'group' }),
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
      target: groupMaterial,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);

    expect(groupMaterial.style.translate).toBe('30px 30px');
    expect(childMaterial.style.translate).toBeUndefined();
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['group'],
            patch: { position: { x: 40, y: 50 } },
          },
        ],
      },
    ]);
  });

  it('R2 rewrites copied group child parents during Alt drag duplication', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
    const group = {
      ...document().components[0]!,
      id: 'group',
      type: 'base.container',
      size: { width: 300, height: 200 },
    };
    const child = {
      ...document().components[0]!,
      id: 'child',
      parentId: 'group',
      position: { x: 20, y: 30 },
      zIndex: 1,
    };
    const current = { ...document(), components: [group, child] };
    const groupMaterial = new FakeElement();
    groupMaterial.dataset.baseScreenComponentId = 'group';
    groupMaterial.matches['[data-base-screen-component-id]'] = groupMaterial;
    canvas.registerMaterial('group', groupMaterial);
    const childMaterial = new FakeElement();
    childMaterial.dataset.baseScreenComponentId = 'child';
    canvas.registerMaterial('child', childMaterial);
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({ selectedComponentIds: ['group'], focusedComponentId: 'group' }),
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
      target: groupMaterial,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    canvas.dispatch('pointerup', {
      pointerId: 1,
      clientX: 40,
      clientY: 50,
      altKey: true,
    } as unknown as PointerEvent);

    const commands = transactions[0]?.commands as readonly {
      readonly component: { readonly id: string; readonly parentId: string | null };
    }[];
    expect(commands).toHaveLength(2);
    expect(commands[1]?.component.parentId).toBe(commands[0]?.component.id);
  });

  it('prunes marquee selection to subtree roots so group children are not double-selected', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const first = document().components[0]!;
    const group = {
      ...first,
      id: 'group',
      type: 'base.container',
      size: { width: 300, height: 200 },
    };
    const child = {
      ...first,
      id: 'child',
      parentId: 'group',
      position: { x: 20, y: 30 },
      zIndex: 1,
    };
    const current = { ...document(), components: [group, child] };
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({
        selectedComponentIds: [],
        focusedComponentId: null,
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
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', {
      pointerId: 1,
      clientX: 500,
      clientY: 400,
    } as unknown as PointerEvent);
    canvas.dispatch('pointerup', {
      pointerId: 1,
      clientX: 500,
      clientY: 400,
    } as unknown as PointerEvent);

    expect(reduceSelection).toHaveBeenCalledWith({
      type: 'replace-selection',
      componentIds: ['group'],
      focusedComponentId: 'group',
    });
  });

  it('toggles the component under the selection overlay on a Ctrl/Cmd modifier click', () => {
    vi.stubGlobal('Element', FakeElement);
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
      ctrlKey: true,
      preventDefault: () => undefined,
      target: grab,
    } as unknown as PointerEvent);

    expect(reduceSelection).toHaveBeenCalledWith({
      type: 'toggle-selection',
      componentId: 'rectangle-1',
    });
  });

  it('R3 does not use Shift as a multi-select modifier', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
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
      pointerId: 4,
      clientX: 20,
      clientY: 30,
      shiftKey: true,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalledWith({
      type: 'toggle-selection',
      componentId: 'rectangle-1',
    });
  });

  it('R3 keeps Ctrl/Cmd multi-select while resolving hits to the current group context', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const group = {
      ...document().components[0]!,
      id: 'group',
      type: 'base.group',
      size: { width: 300, height: 200 },
    };
    const child = {
      ...document().components[0]!,
      id: 'child',
      parentId: 'group',
      position: { x: 20, y: 30 },
      zIndex: 1,
    };
    const current = { ...document(), components: [group, child] };
    const childMaterial = new FakeElement();
    childMaterial.dataset.baseScreenComponentId = 'child';
    childMaterial.matches['[data-base-screen-component-id]'] = childMaterial;
    canvas.registerMaterial('child', childMaterial);
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: groupCatalog,
      getDocument: () => current,
      getInteraction: () => ({
        selectedComponentIds: [],
        focusedComponentId: null,
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
      pointerId: 3,
      clientX: 25,
      clientY: 35,
      ctrlKey: true,
      preventDefault: () => undefined,
      target: childMaterial,
    } as unknown as PointerEvent);

    expect(reduceSelection).toHaveBeenCalledWith({
      type: 'toggle-selection',
      componentId: 'group',
    });
  });

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

describe('DesignerGestureController viewport background click', () => {
  it('clears the selection when clicking the viewport background outside the canvas', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
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
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', { target: viewport.viewport } as unknown as PointerEvent);

    expect(reduceSelection).toHaveBeenCalledWith({ type: 'clear-selection' });
  });

  it('keeps the selection when clicking inside the canvas', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
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
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', {
      target: material,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
  });

  it('does not clear the selection from a secondary click on the viewport background', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
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
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', {
      button: 2,
      target: viewport.viewport,
    } as unknown as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
  });

  it('R4 cancels a pending drag when the pointer leaves the canvas before capture', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
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
      reduceSelection: () => undefined,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);
    controller.connectViewport(viewport.viewport);

    canvas.dispatch('pointerdown', {
      pointerId: 11,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);
    expect(canvas.canvas.hasPointerCapture(11)).toBe(false);

    viewport.dispatch('pointercancel', {
      pointerId: 11,
      target: viewport.viewport,
    } as unknown as PointerEvent);

    expect(controller.active).toBe(false);
  });

  it('does not clear when nothing is selected', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const viewport = createViewport();
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
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
    controller.connectViewport(viewport.viewport);

    viewport.dispatch('pointerdown', { target: viewport.viewport } as unknown as PointerEvent);

    expect(reduceSelection).not.toHaveBeenCalled();
  });
});

describe('DesignerGestureController gesture-active state', () => {
  it('R3 reports active during a drag and restores on every exit path', () => {
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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

  it('rounds fractional drop coordinates to two decimals like canvas drags', () => {
    vi.stubGlobal('Element', FakeElement);
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
      clientX: 30.123,
      clientY: 40.567,
      dataTransfer,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent);

    const component = transactions[0]?.commands[0] as Extract<
      ScreenDocumentTransaction['commands'][number],
      { type: 'add-component' }
    >;
    expect(component.component.position).toEqual({ x: 30.12, y: 40.57 });
  });

  it('rounds created component position and size to two decimal places', () => {
    vi.stubGlobal('Element', FakeElementBase);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
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
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 20, clientY: 30 } as PointerEvent);
    canvas.dispatch('pointerup', {
      pointerId: 1,
      clientX: 123.456,
      clientY: 78.901,
    } as unknown as PointerEvent);

    const component = transactions[0]?.commands[0] as Extract<
      ScreenDocumentTransaction['commands'][number],
      { type: 'add-component' }
    >;
    expect(component.component.position).toEqual({ x: 10, y: 10 });
    expect(component.component.size).toEqual({ width: 113.46, height: 68.9 });
  });

  it('strips snappedX/snappedY from the drop position so the transaction passes fail-closed validation', () => {
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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
    vi.stubGlobal('Element', FakeElement);
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

  it('does not capture or suppress a secondary button under the select tool', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = 'rectangle-1';
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial('rectangle-1', material);
    const preventDefault = vi.fn();
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
      snapCanvasSelection: (_bounds, translation) => translation,
      snapCanvasPoint: (point) => point,
      zoomBy: () => undefined,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('pointerdown', {
      pointerId: 8,
      button: 2,
      clientX: 10,
      clientY: 20,
      preventDefault,
      target: material,
    } as unknown as PointerEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(controller.active).toBe(false);
    expect(material.style.translate).toBeUndefined();
  });

  it('leaves the browser middle-button behavior untouched', () => {
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
    const preventDefault = vi.fn();

    canvas.dispatch('mousedown', { button: 1, preventDefault } as unknown as PointerEvent);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('DesignerGestureController snap session', () => {
  it('activates the snap session on drag start and releases it on completion', () => {
    vi.stubGlobal('Element', FakeElement);
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
    expect(setSnapSessionActive).not.toHaveBeenCalled();
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(true);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(setSnapSessionActive).toHaveBeenLastCalledWith(false);
  });

  it('activates the snap session on create start and releases it on cancel', () => {
    vi.stubGlobal('Element', FakeElement);
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

  it('enters text editing on double click of an editable text component outside group editing', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const text = {
      ...document().components[0]!,
      id: 'text-1',
      type: 'base.text',
      dataSource: { type: 'static' as const, value: '标题' },
    };
    const current = { ...document(), components: [text] };
    const textMaterial = new FakeElement();
    textMaterial.dataset.baseScreenComponentId = 'text-1';
    textMaterial.matches['[data-base-screen-component-id]'] = textMaterial;
    canvas.registerMaterial('text-1', textMaterial);
    const enterTextEdit = vi.fn(() => true);
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getToolMaterialTypes: () => undefined,
      getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      isHandActive: () => false,
      panBy: () => undefined,
      reduceSelection,
      renderSelection: () => undefined,
      reportTransaction: () => undefined,
      snapCanvasPoint: (point) => point,
      snapCanvasSelection: (_bounds, translation) => translation,
      zoomBy: () => undefined,
      enterTextEdit,
    });
    controller.connect(canvas.canvas);

    canvas.dispatch('dblclick', {
      target: textMaterial,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);

    expect(enterTextEdit).toHaveBeenCalledWith('text-1');
    expect(reduceSelection).not.toHaveBeenCalled();
  });
});
