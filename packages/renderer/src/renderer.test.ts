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
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from './renderer.js';

class FakeMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  model: BaseScreenMaterialModel | undefined;

  addEventListener(): void {}
  remove(): void {}
  removeEventListener(): void {}
}

class FakeRoot {
  readonly children: FakeMaterialElement[] = [];
  readonly style = {} as CSSStyleDeclaration;

  appendChild(element: FakeMaterialElement): FakeMaterialElement {
    this.children.push(element);
    return element;
  }
}

function createCatalog(): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.test',
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
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

function component(
  id: string,
  zIndex: number,
  parentId: string | null = null,
  dataSource: ScreenComponentNode['dataSource'] = null,
): ScreenComponentNode {
  return {
    id,
    type: 'base.test',
    name: id,
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

describe('BaseScreenRenderer', () => {
  it('R2 keeps every root subtree within its Core painter-order span', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });

    const result = renderer.render(
      document([
        component('root-1', 0),
        component('root-2', 0),
        component('root-1-child', 100, 'root-1'),
      ]),
    );

    expect(result.ok).toBe(true);
    expect(root.children.map((element) => element.dataset.baseScreenComponentId)).toEqual([
      'root-1',
      'root-1-child',
      'root-2',
    ]);
    expect(root.children.map((element) => element.style.zIndex)).toEqual(['0', '1', '2']);
  });

  it('R2 does not restart an unchanged host-resource resolve for unrelated edits', async () => {
    const root = new FakeRoot();
    let resolveCalls = 0;
    const resourcePort: ScreenHostResourcePort = {
      resolve: async () => {
        resolveCalls++;
        return { ok: true, value: { status: 'ready' }, diagnostics: [] };
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
      params: { region: 'north' },
    };
    const initial = document([component('resource', 0, null, source)]);

    expect(renderer.render(initial).ok).toBe(true);
    await Promise.resolve();
    expect(resolveCalls).toBe(1);

    const edited = document([{ ...initial.components[0]!, name: 'Edited resource' }]);
    expect(renderer.render(edited).ok).toBe(true);
    expect(resolveCalls).toBe(1);
    expect(root.children[0]?.model?.dataState.status).toBe('ready');
  });

  it('R4 rejects a component style that does not satisfy its Material schema', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const invalid = { ...component('invalid-style', 0), style: { color: 42 } };

    const result = renderer.render(document([invalid]));

    expect(result.ok).toBe(false);
    expect(root.children).toEqual([]);
  });

  it('R3 updates a mounted Material model without replacing its element', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const initial = document([component('material', 0)]);

    expect(renderer.render(initial).ok).toBe(true);
    const mounted = root.children[0];
    expect(renderer.render(document([{ ...initial.components[0]!, style: {} }])).ok).toBe(true);

    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(mounted);
  });
});
