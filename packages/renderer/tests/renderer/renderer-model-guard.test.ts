import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourcePort,
} from '@base-screen/contracts';
import type { BaseScreenConditionalStylePort } from '@base-screen/plugin-core';
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

  it('keeps refreshConditionalStyles effective while the render guard holds', () => {
    const root = new FakeRoot();
    let opacity = 0.5;
    let portCalls = 0;
    const port: BaseScreenConditionalStylePort = {
      resolve: () => {
        portCalls++;
        return { opacity };
      },
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      conditionalStylePort: port,
    });
    const first = document([component('styled', 0)]);
    expect(renderer.render(first).ok).toBe(true);
    expect(elementOf(root, 'styled').model?.style.opacity).toBe(0.5);

    const second = derive(first, [...first.components]);
    expect(renderer.render(second).ok).toBe(true);
    const applied = elementOf(root, 'styled').model;
    const appliedCalls = portCalls;

    // 守卫命中：输入未变的提交不再调端口、不重赋 model。
    const third = derive(second, [...second.components]);
    expect(renderer.render(third).ok).toBe(true);
    expect(elementOf(root, 'styled').model).toBe(applied);
    expect(portCalls).toBe(appliedCalls);

    // 宿主快照变化仍经 refreshConditionalStyles 生效（协议入口不受守卫影响）。
    opacity = 0.9;
    renderer.refreshConditionalStyles();
    expect(elementOf(root, 'styled').model).not.toBe(applied);
    expect(elementOf(root, 'styled').model?.style.opacity).toBe(0.9);
    expect(portCalls).toBe(appliedCalls + 1);
  });
});
