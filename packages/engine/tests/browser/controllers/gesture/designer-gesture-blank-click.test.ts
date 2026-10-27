import type { ScreenDocument } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerGestureController } from '../../../../src/browser/controllers/gesture/designer-gesture-controller.js';
import { catalog, createCanvas, FakeElement } from './designer-gesture-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

/**
 * 铺满画布的锁定背景是大屏的常见做法（作者不想误动底色），但它覆盖了每一个"空白"点。
 * 渲染层不对锁定组件做 pointer-events 处理，所以这些点击全部命中锁定项；曾经它们走
 * `clearSelectionOnClick: false`，选中态于是永远清不掉。这几条钉住"命中不可选内容等同命中空白"。
 */
function lockedBackdrop(): { readonly document: ScreenDocument; readonly background: FakeElement } {
  const doc = {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'stage-bg',
        type: 'base.rectangle',
        name: '背景',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 960, height: 540 },
        rotation: 0,
        zIndex: 0,
        status: { locked: true, hidden: false },
        props: {},
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { relations: [] },
  } as unknown as ScreenDocument;
  const background = new FakeElement();
  background.dataset.baseScreenComponentId = 'stage-bg';
  background.matches['[data-base-screen-component-id]'] = background;
  return { document: doc, background };
}

function createController(doc: ScreenDocument, actions: unknown[]): DesignerGestureController {
  return new DesignerGestureController({
    getActiveTool: () => 'select',
    getCatalog: () => catalog(),
    getDocument: () => doc,
    getInteraction: () => ({
      selectedComponentIds: ['other'],
      focusedComponentId: 'other',
    }),
    getToolMaterialTypes: () => undefined,
    getViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
    isHandActive: () => false,
    panBy: () => undefined,
    reduceSelection: (action) => actions.push(action),
    renderSelection: () => undefined,
    reportTransaction: () => undefined,
    snapCanvasSelection: (_bounds, translation) => translation,
    snapCanvasPoint: (point) => point,
    zoomBy: () => undefined,
  });
}

function stubElementGlobals(): void {
  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('HTMLElement', FakeElement);
}

describe('clicking non-selectable canvas content clears the selection', () => {
  it('clears on a click that lands on bare canvas', () => {
    stubElementGlobals();
    const canvas = createCanvas();
    const actions: unknown[] = [];
    const controller = createController(lockedBackdrop().document, actions);
    controller.connect(canvas.canvas);
    // 目标不是任何组件：closest('[data-base-screen-component-id]') 取不到。
    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 500,
      clientY: 400,
      preventDefault: () => undefined,
      target: new FakeElement(),
    } as unknown as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 500, clientY: 400 } as PointerEvent);
    expect(actions).toEqual([{ type: 'clear-selection' }]);
  });

  it('clears on a click that lands on a locked full-canvas backdrop', () => {
    stubElementGlobals();
    const canvas = createCanvas();
    const { document: doc, background } = lockedBackdrop();
    canvas.registerMaterial('stage-bg', background);
    const actions: unknown[] = [];
    const controller = createController(doc, actions);
    controller.connect(canvas.canvas);
    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 500,
      clientY: 400,
      preventDefault: () => undefined,
      target: background,
    } as unknown as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 500, clientY: 400 } as PointerEvent);
    expect(actions).toEqual([{ type: 'clear-selection' }]);
  });

  it('still rubber-bands when the pointer drags off a locked backdrop', () => {
    stubElementGlobals();
    const canvas = createCanvas();
    const { document: doc, background } = lockedBackdrop();
    canvas.registerMaterial('stage-bg', background);
    const actions: unknown[] = [];
    const controller = createController(doc, actions);
    controller.connect(canvas.canvas);
    canvas.dispatch('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      preventDefault: () => undefined,
      target: background,
    } as unknown as PointerEvent);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 600, clientY: 500 } as PointerEvent);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 600, clientY: 500 } as PointerEvent);

    // 拖拽仍是框选，且锁定背景不会被选进去（它不是选择目标）。
    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: [], focusedComponentId: null },
    ]);
  });
});

/**
 * 分割线是"容器与内容一样大"的典型：canonical 尺寸就是线的粗细（默认 2px 高），
 * DOM 命中带也只有 2px，缩放到 50% 后屏幕上不足 1px。这几条钉住"薄组件在空白处留一圈
 * 可点厚度"——它只补足薄轴，不会让正常组件越过自己的边界去抢点击。
 */
function thinRuleDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'rule-line',
        type: 'base.rule',
        name: '分割线',
        parentId: null,
        position: { x: 100, y: 200 },
        size: { width: 320, height: 2 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: { axis: 'horizontal' },
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { relations: [] },
  } as unknown as ScreenDocument;
}

function dispatchBlankPointerDown(
  canvas: ReturnType<typeof createCanvas>,
  clientX: number,
  clientY: number,
): void {
  canvas.dispatch('pointerdown', {
    pointerId: 1,
    clientX,
    clientY,
    preventDefault: () => undefined,
    target: new FakeElement(),
  } as unknown as PointerEvent);
}

describe('thin components are selectable from their surrounding blank area', () => {
  it('selects a 2px rule when the click lands just outside its own box', () => {
    stubElementGlobals();
    const canvas = createCanvas();
    const actions: unknown[] = [];
    const controller = createController(thinRuleDocument(), actions);
    controller.connect(canvas.canvas);
    // 线在 y 200–202；(200, 205) 在线外 3px，落在最小命中带（10px）以内。
    dispatchBlankPointerDown(canvas, 200, 205);

    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['rule-line'], focusedComponentId: 'rule-line' },
    ]);
  });

  it('leaves clicks beyond the hit band to the canvas marquee', () => {
    stubElementGlobals();
    const canvas = createCanvas();
    const actions: unknown[] = [];
    const controller = createController(thinRuleDocument(), actions);
    controller.connect(canvas.canvas);
    dispatchBlankPointerDown(canvas, 200, 215);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 200, clientY: 215 } as PointerEvent);

    expect(actions).toEqual([{ type: 'clear-selection' }]);
  });

  it('does not stretch ordinary components past their own bounds', () => {
    stubElementGlobals();
    const canvas = createCanvas();
    const actions: unknown[] = [];
    const controller = createController(lockedBackdrop().document, actions);
    controller.connect(canvas.canvas);
    // 铺满画布的矩形只有自身矩形内有命中带；右下角外侧仍按空白处理。
    dispatchBlankPointerDown(canvas, 1000, 600);
    canvas.dispatch('pointerup', { pointerId: 1, clientX: 1000, clientY: 600 } as PointerEvent);

    expect(actions).toEqual([{ type: 'clear-selection' }]);
  });
});
