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
import { createBaseScreenRenderer } from '../src/renderer.js';

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

function createEventCatalog(): BaseScreenMaterialCatalog {
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
    events: ['valueClick'],
    dataCapabilities: [],
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: EventfulMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

class ExplodingConstructorElement {
  constructor() {
    throw new Error('constructor boom');
  }
}

let modelExplodes = false;

class ExplodingModelMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  #model: BaseScreenMaterialModel | undefined;

  get model(): BaseScreenMaterialModel | undefined {
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    if (modelExplodes) {
      throw new Error('model boom');
    }
    this.#model = value;
  }

  addEventListener(): void {}
  remove(): void {}
  removeEventListener(): void {}
}

class EventfulMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  model: BaseScreenMaterialModel | undefined;
  readonly handlers: Record<string, ((event: unknown) => void) | undefined> = {};

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.handlers[type] = handler;
  }

  removeEventListener(type: string): void {
    this.handlers[type] = undefined;
  }

  remove(): void {}

  fire(detail: unknown): void {
    this.handlers['base-screen-material-event']?.({
      bubbles: true,
      composed: true,
      type: 'base-screen-material-event',
      detail,
      stopPropagation() {},
    });
  }
}

function createImageCatalog(): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.image',
    tagName: 'base-screen-image',
    name: '图片',
    category: '基础',
    keywords: ['图片'],
    defaultSize: { width: 100, height: 40 },
    defaultProps: { source: '', alt: '' },
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: {
      kind: 'object',
      properties: { source: { kind: 'string' }, alt: { kind: 'string' } },
      required: ['source', 'alt'],
    },
    propertyPanel: [
      { prop: 'source', label: '图片来源', control: 'text' },
      { prop: 'alt', label: '替代文本', control: 'text' },
    ],
    events: [],
    dataCapabilities: [],
    designCapabilities: { resize: true, rotate: true, children: false },
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
  it('R5 validates and forwards declared image alternative text to its Material model', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createImageCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const image = {
      ...component('image', 0),
      type: 'base.image',
      props: { source: '', alt: '趋势图' },
    };

    expect(renderer.render(document([image])).ok).toBe(true);
    expect(root.children[0]?.model?.props).toEqual({ source: '', alt: '趋势图' });
  });

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

  it('R1 resolves again when only a host-resource id changes', async () => {
    const root = new FakeRoot();
    let resolveCalls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          resolveCalls++;
          return { ok: true, value: { resolveCalls }, diagnostics: [] };
        },
      },
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

    expect(
      renderer.render(
        document([
          {
            ...initial.components[0]!,
            dataSource: { ...source, resourceId: 'resource-2' },
          },
        ]),
      ).ok,
    ).toBe(true);
    await Promise.resolve();
    expect(resolveCalls).toBe(2);
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

  it('R5 isolates a throwing material constructor and keeps rendering other components', () => {
    const root = new FakeRoot();
    const healthy: BaseScreenMaterialManifest = {
      type: 'base.healthy',
      tagName: 'base-screen-healthy',
      name: 'Healthy',
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
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: true },
    };
    const broken: BaseScreenMaterialManifest = {
      type: 'base.broken',
      tagName: 'base-screen-broken',
      name: 'Broken',
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
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: true },
    };
    const catalog: BaseScreenMaterialCatalog = {
      get: (type) =>
        type === 'base.healthy'
          ? {
              manifest: healthy,
              constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
            }
          : type === 'base.broken'
            ? {
                manifest: broken,
                constructor:
                  ExplodingConstructorElement as unknown as BaseScreenMaterialConstructor,
              }
            : undefined,
      has: (type) => type === 'base.healthy' || type === 'base.broken',
      list: () => [],
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });

    const result = renderer.render(
      document([
        { ...component('healthy', 0), type: 'base.healthy' },
        { ...component('broken', 0), type: 'base.broken' },
      ]),
    );

    expect(result.ok).toBe(true);
    expect(root.children.map((element) => element.dataset.baseScreenComponentId)).toEqual([
      'healthy',
    ]);
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'broken'],
        message: 'Material constructor raised an exception.',
      },
    ]);
  });

  it('R5 keeps the previous mounted element when a material model update throws', () => {
    const root = new FakeRoot();
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
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: true },
    };
    const entry = {
      manifest,
      constructor: ExplodingModelMaterialElement as unknown as BaseScreenMaterialConstructor,
    };
    const catalog: BaseScreenMaterialCatalog = {
      get: (type) => (type === manifest.type ? entry : undefined),
      has: (type) => type === manifest.type,
      list: () => [entry],
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const initial = document([component('volatile', 0)]);

    expect(renderer.render(initial).ok).toBe(true);
    expect(root.children).toHaveLength(1);
    const mounted = root.children[0];

    modelExplodes = true;
    const result = renderer.render(initial);
    modelExplodes = false;

    expect(result.ok).toBe(true);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(mounted);
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'volatile'],
        message: 'Material model update raised an exception.',
      },
    ]);
  });

  it('R5 contains a throwing host material event callback without breaking the render pipeline', () => {
    const root = new FakeRoot();
    const diagnostics: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createEventCatalog(),
      mode: 'viewer',
      interactive: true,
      onMaterialEvent: () => {
        throw new Error('host boom');
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      resourcePort: undefined,
    });

    expect(renderer.render(document([component('interactive', 0)])).ok).toBe(true);
    const element = root.children[0] as unknown as EventfulMaterialElement;
    expect(() => element.fire({ name: 'valueClick', payload: {} })).not.toThrow();
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'interactive'],
        message: 'Host material event callback raised an exception.',
      },
    ]);
  });
});
