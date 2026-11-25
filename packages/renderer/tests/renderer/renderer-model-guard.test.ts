import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourcePort,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  document,
  FakeRoot,
} from './__fixtures__/renderer-test-harness.js';

function elementOf(root: FakeRoot, componentId: string) {
  return root.children.find((element) => element.dataset.baseScreenComponentId === componentId)!;
}

/**
 * 模拟会话事务的文档派生：换组件引用的结构共享更新。
 * 首次渲染（无 base）会克隆组件，因此守卫引用链从第二次派生起才稳定——
 * 这与设计器真实链路一致（首次提交重赋全部，之后未变组件跳过）。
 */
function derive(documentInput: ScreenDocument, components: readonly ScreenComponentNode[]) {
  return { ...documentInput, components };
}

describe('material model reassignment guard', () => {
  it('keeps a material-declared max-content width when the model is not reassigned', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const a = component('a', 0);
    const first = document([a]);
    expect(renderer.render(first).ok).toBe(true);
    elementOf(root, 'a').style.width = 'max-content';

    // 只移动位置、模型引用不变：几何帧仍会跑，但不能把自适应宽度写回 canonical 保存值。
    expect(renderer.render(derive(first, [{ ...a, position: { x: 10, y: 0 } }])).ok).toBe(true);
    expect(elementOf(root, 'a').style.width).toBe('max-content');
  });

  it('keeps the applied model of untouched components while reapplying the edited one', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const a = component('a', 0);
    const b = component('b', 1);
    const first = document([a, b]);
    expect(renderer.render(first).ok).toBe(true);

    // 第二次提交：a 换新引用（position 变化），b 结构共享；引用链从此稳定。
    const second = derive(first, [{ ...a, position: { x: 10, y: 0 } }, b]);
    expect(renderer.render(second).ok).toBe(true);
    const modelA = elementOf(root, 'a').model;
    const modelB = elementOf(root, 'b').model;

    // 第三次提交：再改 a，b 仍共享——b 的 model 不再重赋。
    const third = derive(second, [{ ...a, position: { x: 40, y: 0 } }, b]);
    expect(renderer.render(third).ok).toBe(true);

    expect(elementOf(root, 'a').model).not.toBe(modelA);
    expect(elementOf(root, 'a').style.left).toBe('40px');
    expect(elementOf(root, 'b').model).toBe(modelB);
  });

  it('skips model reassignment for every component when only unrelated sections change', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const first = document([component('a', 0), component('b', 1)]);
    expect(renderer.render(first).ok).toBe(true);

    const second = derive(first, [...first.components]);
    expect(renderer.render(second).ok).toBe(true);
    const modelA = elementOf(root, 'a').model;
    const modelB = elementOf(root, 'b').model;

    const third = derive(second, [...second.components]);
    expect(renderer.render(third).ok).toBe(true);

    expect(elementOf(root, 'a').model).toBe(modelA);
    expect(elementOf(root, 'b').model).toBe(modelB);
  });

  it('reassigns when the data source instance settles, then holds the settled epoch', async () => {
    const root = new FakeRoot();
    let resolveCalls = 0;
    const resourcePort: ScreenHostResourcePort = {
      resolve: async () => {
        resolveCalls++;
        return { ok: true, value: { calls: resolveCalls }, diagnostics: [] };
      },
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort,
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'resource-1',
      resourceType: 'resource',
      params: { region: { kind: 'literal', value: 'north' } },
      binding: null,
    };
    const first = document([component('resource', 0, null, source)]);

    expect(renderer.render(first).ok).toBe(true);
    const loading = elementOf(root, 'resource').model;
    expect(loading?.dataState.status).toBe('loading');

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const settled = elementOf(root, 'resource').model;
    expect(settled).not.toBe(loading);
    expect(settled?.dataState.status).toBe('ready');

    // 提交一次无关编辑建立引用链：既不重发请求，也不打断已落定结果。
    const second = derive(first, [...first.components]);
    expect(renderer.render(second).ok).toBe(true);
    const reapplied = elementOf(root, 'resource').model;
    expect(reapplied?.dataState.status).toBe('ready');

    const third = derive(second, [...second.components]);
    expect(renderer.render(third).ok).toBe(true);
    expect(resolveCalls).toBe(1);
    expect(elementOf(root, 'resource').model).toBe(reapplied);
  });

  it('keeps blueprint state effects effective while the render guard holds', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const styled: ScreenComponentNode = {
      ...component('styled', 0),
      style: { opacity: 0.5 },
      states: { items: [{ id: 'dim', name: '暗', style: { opacity: 0.9 } }] },
    };
    const first = document([styled]);
    expect(renderer.render(first).ok).toBe(true);
    const second = derive(first, [...first.components]);
    expect(renderer.render(second).ok).toBe(true);
    const applied = elementOf(root, 'styled').model;

    // 守卫命中：输入未变的提交不重赋 model。
    const third = derive(second, [...second.components]);
    expect(renderer.render(third).ok).toBe(true);
    expect(elementOf(root, 'styled').model).toBe(applied);

    // 蓝图设置状态改变守卫签名：只重写这一个组件，下一次同输入渲染保持设置后的结果。
    renderer.applyBlueprintStateEffects([
      { componentId: 'styled', operation: 'set', stateId: 'dim' },
    ]);
    expect(elementOf(root, 'styled').model?.style.opacity).toBe(0.9);
    const dimmed = elementOf(root, 'styled').model;
    expect(renderer.render(derive(third, [...third.components])).ok).toBe(true);
    expect(elementOf(root, 'styled').model).toBe(dimmed);

    renderer.applyBlueprintStateEffects([{ componentId: 'styled', operation: 'reset' }]);
    expect(elementOf(root, 'styled').model?.style.opacity).toBe(0.5);
  });
});

/** 计数 model 写入次数的物料：验证解析克隆引用与只改显隐两条守卫路径。 */
class TrackingElement {
  static instances: TrackingElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  modelWrites = 0;
  #model: BaseScreenMaterialModel | undefined;

  constructor() {
    TrackingElement.instances.push(this);
  }

  get model(): BaseScreenMaterialModel | undefined {
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    this.modelWrites += 1;
    this.#model = value;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  remove(): void {}
}

const trackingManifest: BaseScreenMaterialManifest = {
  type: 'base.test',
  tagName: 'test-guard',
  name: 'Test',
  category: 'Test',
  keywords: [],
  defaultSize: { width: 100, height: 40 },
  defaultProps: {},
  defaultStyle: {},
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  styleSchema: { kind: 'object', properties: {}, required: [] },
  stylePanel: [],
  events: [],
  dataCapabilities: ['static'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

function trackingRenderer() {
  TrackingElement.instances = [];
  return createBaseScreenRenderer({
    root: new FakeRoot() as unknown as HTMLElement,
    catalog: createBaseScreenMaterialCatalog([
      {
        manifest: trackingManifest,
        constructor: TrackingElement as unknown as BaseScreenMaterialConstructor,
      },
    ]),
    mode: 'design',
    interactive: false,
    onMaterialEvent: undefined,
    resourcePort: undefined,
  });
}

function withHidden(node: ScreenComponentNode, hidden: boolean): ScreenComponentNode {
  return { ...node, status: { hidden, locked: hidden } };
}

function replace(base: ScreenDocument, next: ScreenComponentNode): ScreenDocument {
  return {
    ...base,
    components: base.components.map((item) => (item.id === next.id ? next : item)),
  };
}

describe('material model guard across parse clones and display-only changes', () => {
  it('writes a new component input once, not again on the next render that reuses it', () => {
    const renderer = trackingRenderer();
    const first = document([component('a', 0), component('b', 1)]);
    expect(renderer.render(first).ok).toBe(true);
    const [a, b] = TrackingElement.instances;
    expect(a!.modelWrites).toBe(1);
    // b 换成新对象：第一次见到它会被解析克隆，第二次渲染复用同一输入引用。
    const edited = replace(first, { ...first.components[1]!, name: 'renamed' });
    expect(renderer.render(edited).ok).toBe(true);
    expect(b!.modelWrites).toBe(2);
    const again = { ...edited, components: [...edited.components] };
    expect(renderer.render(again).ok).toBe(true);
    expect(a!.modelWrites).toBe(1);
    expect(b!.modelWrites).toBe(2);
  });

  it('hides and re-shows a component painted while visible without rewriting its model', () => {
    const renderer = trackingRenderer();
    const visible = document([component('a', 0)]);
    expect(renderer.render(visible).ok).toBe(true);
    const element = TrackingElement.instances[0]!;
    expect(element.modelWrites).toBe(1);
    const hidden = replace(visible, withHidden(visible.components[0]!, true));
    expect(renderer.render(hidden).ok).toBe(true);
    expect(element.style.display).toBe('none');
    expect(renderer.render(visible).ok).toBe(true);
    expect(element.style.display).toBe('block');
    expect(element.modelWrites).toBe(1);
  });

  it('rewrites the model when showing a component that was last painted while hidden', () => {
    const renderer = trackingRenderer();
    const source = component('a', 0);
    const hidden = document([withHidden(source, true)]);
    expect(renderer.render(hidden).ok).toBe(true);
    const element = TrackingElement.instances[0]!;
    expect(element.modelWrites).toBe(1);
    expect(renderer.render(document([source])).ok).toBe(true);
    expect(element.style.display).toBe('block');
    expect(element.modelWrites).toBe(2);
  });

  it('still rewrites the model when hiding goes together with a real change', () => {
    const renderer = trackingRenderer();
    const visible = document([component('a', 0)]);
    expect(renderer.render(visible).ok).toBe(true);
    const element = TrackingElement.instances[0]!;
    const moved = { ...withHidden(visible.components[0]!, true), size: { width: 200, height: 40 } };
    expect(renderer.render(replace(visible, moved)).ok).toBe(true);
    expect(element.modelWrites).toBe(2);
  });
});
