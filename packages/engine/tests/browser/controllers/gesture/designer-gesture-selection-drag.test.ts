import type { ScreenDocumentTransaction, ScreenInteractionAction } from '@base-screen/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../../src/browser/controllers/gesture/designer-gesture-controller.js';
import {
  catalog,
  createCanvas,
  createGrabTarget,
  document,
  FakeElement,
  FakeElementBase,
  groupCatalog,
} from './designer-gesture-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerGestureController selection and drag', () => {
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

  it('keeps dragged positions on whole pixels when zoom produces fractional deltas', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
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
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);
    // zoom 2：7 个 client px = 3.5 个画布 px，按 1px 最小步长取整为 4px。
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 17, clientY: 27 } as PointerEvent);
    expect(material.style.translate).toBe('4px 4px');

    canvas.dispatch('pointerup', { pointerId: 1, clientX: 17, clientY: 27 } as PointerEvent);
    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['rectangle-1'],
            patch: { position: { x: 14, y: 24 } },
          },
        ],
      },
    ]);
  });

  it('quantizes fractional snap adjustments to whole-pixel drag steps', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const transactions: ScreenDocumentTransaction[] = [];
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
      reportTransaction: (transaction) => transactions.push(transaction),
      snapCanvasSelection: (_bounds, translation) => ({ ...translation, x: 31.6, y: 29.4 }),
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
    // 吸附给出的 31.6/29.4 被取整为 32/29，预览与提交保持一致。
    expect(material.style.translate).toBe('32px 29px');

    canvas.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 50 } as PointerEvent);
    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['rectangle-1'],
            patch: { position: { x: 42, y: 49 } },
          },
        ],
      },
    ]);
  });

  it('commits dragged positions on a 1px grid, correcting fractional starts', () => {
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
            patch: { position: { x: 40, y: 50 } },
          },
        ],
      },
    ]);
  });
});
