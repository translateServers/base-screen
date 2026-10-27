import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourcePort,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';

class FakeMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  model: BaseScreenMaterialModel | undefined;
  root: FakeRoot | undefined;

  addEventListener(): void {}
  removeEventListener(): void {}

  remove(): void {
    if (this.root !== undefined) {
      const index = this.root.children.indexOf(this);
      if (index >= 0) this.root.children.splice(index, 1);
    }
  }
}

class FakeRoot {
  readonly children: FakeMaterialElement[] = [];
  readonly style = {} as CSSStyleDeclaration;

  appendChild(element: FakeMaterialElement): FakeMaterialElement {
    element.root = this;
    this.children.push(element);
    return element;
  }
}

function createCatalog(type = 'base.test'): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type,
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['host-resource'],
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (materialType) => (materialType === type ? entry : undefined),
    has: (materialType) => materialType === type,
    list: () => [entry],
  };
}

function shareableIndex(): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'dataset'
        ? {
            kind: 'dataResourceType',
            id: 'dataset',
            name: 'Dataset',
            configSchema: { kind: 'object', properties: {}, required: [] },
            queryScope: 'resource',
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

function component(id: string): ScreenComponentNode {
  return {
    id,
    type: 'base.test',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: {
      type: 'host-resource',
      resourceType: 'dataset',
      resourceId: 'orders',
      params: {},
      binding: null,
    },
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { relations: [] },
  };
}

function createCountingPort(calls: { count: number }): ScreenHostResourcePort {
  return {
    resolve: async () => {
      calls.count++;
      return { ok: true as const, value: { ready: true }, diagnostics: [] };
    },
  };
}

describe('Renderer instance isolation (DRH-R3)', () => {
  it('sharing never crosses Renderer instances: each instance issues its own host resolve', async () => {
    const first = new FakeRoot();
    const second = new FakeRoot();
    const firstCalls = { count: 0 };
    const secondCalls = { count: 0 };
    const firstRenderer = createBaseScreenRenderer({
      root: first as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: shareableIndex(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: createCountingPort(firstCalls),
    });
    const secondRenderer = createBaseScreenRenderer({
      root: second as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: shareableIndex(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: createCountingPort(secondCalls),
    });

    expect(firstRenderer.render(document([component('a'), component('b')])).ok).toBe(true);
    expect(secondRenderer.render(document([component('a'), component('b')])).ok).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    // 旧形态的两个组件各自合成一个实例（`data-source-<componentId>`），因此每个
    // renderer 各发 2 次；关键断言是两份计数互不影响——跨实例绝不共享槽位或缓存。
    expect(firstCalls.count).toBe(2);
    expect(secondCalls.count).toBe(2);
    expect(first.children[0]?.model?.dataState).toMatchObject({ status: 'ready' });
    expect(second.children[0]?.model?.dataState).toMatchObject({ status: 'ready' });

    firstRenderer.dispose();
    await Promise.resolve();
    expect(secondCalls.count).toBe(2);
    secondRenderer.dispose();
  });
});
