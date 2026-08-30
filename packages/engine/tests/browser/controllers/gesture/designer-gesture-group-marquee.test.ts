import type { ScreenDocumentTransaction } from '@base-screen/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../../src/browser/controllers/gesture/designer-gesture-controller.js';
import {
  catalog,
  createCanvas,
  createGrabTarget,
  document,
  FakeElement,
  groupCatalog,
} from './designer-gesture-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerGestureController group drag and marquee', () => {
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

  it('uses a locked component as a marquee origin but never a canvas selection target', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const canvas = createCanvas();
    const first = document().components[0]!;
    const locked = {
      ...first,
      id: 'locked',
      status: { locked: true, hidden: false },
    };
    const unlocked = {
      ...first,
      id: 'unlocked',
      position: { x: 150, y: 20 },
      zIndex: 1,
    };
    const current = { ...document(), components: [locked, unlocked] };
    const material = new FakeElement();
    material.dataset.baseScreenComponentId = locked.id;
    material.matches['[data-base-screen-component-id]'] = material;
    canvas.registerMaterial(locked.id, material);
    const reduceSelection = vi.fn();
    const controller = new DesignerGestureController({
      getActiveTool: () => 'select',
      getCatalog: catalog,
      getDocument: () => current,
      getInteraction: () => ({
        selectedComponentIds: [unlocked.id],
        focusedComponentId: unlocked.id,
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

    for (const [index, modifier] of [{}, { ctrlKey: true }, { metaKey: true }].entries()) {
      const pointerId = index + 1;
      canvas.dispatch('pointerdown', {
        pointerId,
        clientX: 20,
        clientY: 30,
        preventDefault: () => undefined,
        target: material,
        ...modifier,
      } as unknown as PointerEvent);

      expect(controller.active).toBe(true);
      expect(canvas.canvas.hasPointerCapture(pointerId)).toBe(true);

      canvas.dispatch('pointerup', {
        pointerId,
        clientX: 20,
        clientY: 30,
      } as unknown as PointerEvent);

      expect(controller.active).toBe(false);
      expect(canvas.canvas.hasPointerCapture(pointerId)).toBe(false);
    }

    expect(reduceSelection).not.toHaveBeenCalled();

    canvas.dispatch('pointerdown', {
      pointerId: 4,
      clientX: 20,
      clientY: 30,
      preventDefault: () => undefined,
      target: material,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', {
      pointerId: 4,
      clientX: 300,
      clientY: 150,
    } as unknown as PointerEvent);

    expect(canvas.marquee.style.display).toBe('block');

    canvas.dispatch('pointerup', {
      pointerId: 4,
      clientX: 300,
      clientY: 150,
    } as unknown as PointerEvent);

    expect(reduceSelection).toHaveBeenCalledTimes(1);
    expect(reduceSelection).toHaveBeenCalledWith({
      type: 'replace-selection',
      componentIds: ['unlocked'],
      focusedComponentId: 'unlocked',
    });
    expect(controller.active).toBe(false);
    expect(canvas.marquee.style.display).toBe('none');
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
});
