import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialDataBindingRole,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
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

function createDatasetCatalog(
  adapter: BaseScreenMaterialTabularDataAdapter,
  roles: readonly BaseScreenMaterialDataBindingRole[] = [
    { id: 'columns', minFields: 1, maxFields: 256, valueTypes: ['string', 'number'] },
  ],
): BaseScreenMaterialCatalog {
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
    dataBinding: { roles },
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
    tabularDataAdapter: adapter,
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

class DisplayManagingMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;

  set model(_value: BaseScreenMaterialModel) {
    this.style.display = 'block';
  }

  addEventListener(): void {}
  remove(): void {}
  removeEventListener(): void {}
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

function rendererWithRoot(): {
  root: FakeRoot;
  renderer: ReturnType<typeof createBaseScreenRenderer>;
} {
  const root = new FakeRoot();
  return {
    root,
    renderer: createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    }),
  };
}

describe('BaseScreenRenderer canvas background image', () => {
  it('applies the canvas background image styles with a cover default', () => {
    const { root, renderer } = rendererWithRoot();
    const result = renderer.render({
      ...document([]),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/screens/bg.png',
      },
    });

    expect(result.ok).toBe(true);
    expect(root.style.backgroundImage).toBe('url("https://cdn.x/screens/bg.png")');
    expect(root.style.backgroundSize).toBe('cover');
    expect(root.style.backgroundPosition).toBe('center');
    expect(root.style.backgroundRepeat).toBe('no-repeat');
    expect(root.style.backgroundColor).toBe('#000000');
  });

  it('renders linear and radial palettes below an optional background image', () => {
    const { root, renderer } = rendererWithRoot();
    expect(
      renderer.render({
        ...document([]),
        canvas: {
          width: 960,
          height: 540,
          backgroundColor: '#000000',
          backgroundImage: 'https://cdn.x/screens/bg.png',
          background: {
            type: 'linear-gradient',
            angle: 45,
            stops: [
              { color: '#112233', position: 0 },
              { color: '#abcdef', position: 100 },
            ],
          },
        },
      }).ok,
    ).toBe(true);
    expect(root.style.backgroundImage).toBe(
      'url("https://cdn.x/screens/bg.png"), linear-gradient(45deg, #112233 0%, #abcdef 100%)',
    );
    expect(root.style.backgroundSize).toBe('cover, 100% 100%');

    expect(
      renderer.render({
        ...document([]),
        canvas: {
          width: 960,
          height: 540,
          backgroundColor: '#000000',
          background: {
            type: 'radial-gradient',
            position: { x: 25, y: 75 },
            stops: [
              { color: '#112233', position: 0 },
              { color: 'transparent', position: 100 },
            ],
          },
        },
      }).ok,
    ).toBe(true);
    expect(root.style.backgroundImage).toBe(
      'radial-gradient(circle at 25% 75%, #112233 0%, transparent 100%)',
    );
    expect(root.style.backgroundSize).toBe('100% 100%');
  });

  it('maps contain fit and escapes quotes in the CSS url value', () => {
    const { root, renderer } = rendererWithRoot();
    const result = renderer.render({
      ...document([]),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/a"b/bg.png',
        backgroundImageFit: 'contain',
      },
    });

    expect(result.ok).toBe(true);
    expect(root.style.backgroundImage).toBe('url("https://cdn.x/a\\"b/bg.png")');
    expect(root.style.backgroundSize).toBe('contain');
  });

  it('clears background styles when the document has no background image', () => {
    const { root, renderer } = rendererWithRoot();
    expect(
      renderer.render({
        ...document([]),
        canvas: {
          width: 960,
          height: 540,
          backgroundColor: '#000000',
          backgroundImage: 'https://cdn.x/bg.png',
        },
      }).ok,
    ).toBe(true);
    expect(root.style.backgroundImage).not.toBe('');

    const cleared = renderer.render(document([]));
    expect(cleared.ok).toBe(true);
    expect(root.style.backgroundImage).toBe('');
    expect(root.style.backgroundSize).toBe('');
    expect(root.style.backgroundPosition).toBe('');
    expect(root.style.backgroundRepeat).toBe('');
    expect(root.style.backgroundColor).toBe('#000000');
  });

  it('rejects a document with an invalid background image fail-closed', () => {
    const { renderer } = rendererWithRoot();
    const result = renderer.render({
      ...document([]),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'javascript:alert(1)',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.path).toEqual(['canvas', 'backgroundImage']);
    }
  });
});

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

  it('reuses mounts and skips re-parse for a same-reference re-render', () => {
    const { root, renderer } = rendererWithRoot();
    const doc = document([component('a', 0), component('b', 1)]);

    expect(renderer.render(doc).ok).toBe(true);
    const first = [...root.children];

    // 同引用重渲染（如 setInteractive 原地重渲染）：不重挂载、不重建 DOM。
    expect(renderer.render(doc).ok).toBe(true);
    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toBe(first[0]);
    expect(root.children[1]).toBe(first[1]);
  });

  it('validates only changed components for a structurally shared document', () => {
    const { root, renderer } = rendererWithRoot();
    const a = component('a', 0);
    const b = component('b', 1);
    expect(renderer.render(document([a, b])).ok).toBe(true);
    const first = [...root.children];

    // 派生文档：仅组件 a 的 position 变化，b 引用共享（命中校验缓存）。
    const moved = { ...a, position: { x: 40, y: 20 } };
    const result = renderer.render(document([moved, b]));

    expect(result.ok).toBe(true);
    expect(root.children[0]?.style.left).toBe('40px');
    expect(root.children[0]?.style.top).toBe('20px');
    // reconcile 路径复用全部挂载元素。
    expect(root.children[0]).toBe(first[0]);
    expect(root.children[1]).toBe(first[1]);

    // clear 后缓存重置，重渲染仍成功（FakeMaterialElement.remove 不回收
    // root.children 数组，故此处只断言渲染结果）。
    renderer.clear();
    expect(renderer.render(document([moved, b])).ok).toBe(true);
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
      params: { region: { kind: 'literal', value: 'north' } },
      binding: null,
    };
    const initial = document([component('resource', 0, null, source)]);

    expect(renderer.render(initial).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
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
      params: { region: { kind: 'literal', value: 'north' } },
      binding: null,
    };
    const initial = document([component('resource', 0, null, source)]);

    expect(renderer.render(initial).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
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
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveCalls).toBe(2);
  });

  it('R4 projects a validated dataset and forwards only evaluated request parameters', async () => {
    const root = new FakeRoot();
    const requests: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog({
        adapt: ({ dataset, fields }) => ({
          ok: true,
          value: {
            columns: fields.columns?.map((field) => field.id) ?? [],
            rows: dataset.rows,
          },
          diagnostics: [],
        }),
      }),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async (request) => {
          requests.push(request);
          return {
            ok: true as const,
            value: {
              fields: [
                { id: 'name', label: '名称', valueType: 'string' },
                { id: 'amount', label: '金额', valueType: 'number' },
              ],
              rows: [{ name: 'A', amount: 2 }],
            },
            diagnostics: [],
          };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'orders',
      resourceType: 'dataset',
      params: { limit: { kind: 'literal', value: 5 } },
      binding: { fields: { columns: ['name'] } },
    };

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(requests).toEqual([
      {
        componentId: 'dataset',
        resourceType: 'dataset',
        resourceId: 'orders',
        params: { limit: 5 },
      },
    ]);
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['name'], rows: [{ name: 'A', amount: 2 }] },
    });
  });

  it('R4 blocks a variable-dependent resource until variables are supplied', async () => {
    const root = new FakeRoot();
    let resolveCalls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          resolveCalls++;
          return { ok: true as const, value: { ready: true }, diagnostics: [] };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'orders',
      resourceType: 'dataset',
      params: { region: { kind: 'variable', name: 'region' } },
      binding: null,
    };
    const screen = document([component('dependent', 0, null, source)]);

    expect(renderer.render(screen).ok).toBe(true);
    expect(resolveCalls).toBe(0);
    expect(root.children[0]?.model?.dataState.status).toBe('error');

    expect(renderer.setVariables({ region: 'north' }).ok).toBe(true);
    expect(renderer.render(screen).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveCalls).toBe(1);
  });

  it('R4 coalesces repeated refreshes while a component request is pending', async () => {
    const root = new FakeRoot();
    let resolveRequest: (() => void) | undefined;
    let resolveCalls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          resolveCalls++;
          await new Promise<void>((resolve) => {
            resolveRequest = resolve;
          });
          return { ok: true as const, value: { ready: true }, diagnostics: [] };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'orders',
      resourceType: 'dataset',
      params: { limit: { kind: 'literal', value: 5 } },
      binding: null,
    };
    expect(renderer.render(document([component('refreshable', 0, null, source)])).ok).toBe(true);
    renderer.refreshData('refreshable');
    renderer.refreshData('refreshable');
    expect(resolveCalls).toBe(1);
    resolveRequest?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    renderer.refreshData('refreshable');
    expect(resolveCalls).toBe(2);
  });

  it('R4 suppresses a late result after timeout', async () => {
    vi.useFakeTimers();
    try {
      const root = new FakeRoot();
      let resolveRequest: ((value: ScreenParseResult<ScreenJsonValue>) => void) | undefined;
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        mode: 'viewer',
        interactive: false,
        onMaterialEvent: undefined,
        resourceTimeoutMs: 100,
        resourcePort: {
          resolve: () =>
            new Promise<ScreenParseResult<ScreenJsonValue>>((resolve) => {
              resolveRequest = resolve;
            }),
        },
      });
      const source: ScreenComponentNode['dataSource'] = {
        type: 'host-resource',
        resourceId: 'orders',
        resourceType: 'dataset',
        params: { limit: { kind: 'literal', value: 5 } },
        binding: null,
      };
      expect(renderer.render(document([component('timeout', 0, null, source)])).ok).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(root.children[0]?.model?.dataState.status).toBe('error');
      resolveRequest?.({ ok: true, value: { late: true }, diagnostics: [] });
      await Promise.resolve();
      await Promise.resolve();
      expect(root.children[0]?.model?.dataState).toMatchObject({ code: 'HOST_RESOURCE_TIMEOUT' });
    } finally {
      vi.useRealTimers();
    }
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

  it('keeps effectively hidden components and subtrees display none despite Material display overrides', () => {
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
    const catalog: BaseScreenMaterialCatalog = {
      get: (type) =>
        type === manifest.type
          ? {
              manifest,
              constructor:
                DisplayManagingMaterialElement as unknown as BaseScreenMaterialConstructor,
            }
          : undefined,
      has: (type) => type === manifest.type,
      list: () => [
        {
          manifest,
          constructor: DisplayManagingMaterialElement as unknown as BaseScreenMaterialConstructor,
        },
      ],
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const visible = component('visible', 0);
    const hidden = { ...component('hidden', 1), status: { locked: false, hidden: true } };
    const child = { ...component('child', 2, 'hidden'), status: { locked: false, hidden: false } };
    const initial = document([visible, hidden, child]);

    expect(renderer.render(initial).ok).toBe(true);
    expect(root.children).toHaveLength(3);
    expect(root.children[0]!.style.display).toBe('block');
    expect(root.children[1]!.style.display).toBe('none');
    expect(root.children[2]!.style.display).toBe('none');

    const unhidden = { ...hidden, status: { locked: false, hidden: false } };
    expect(renderer.render(document([visible, unhidden, child])).ok).toBe(true);
    expect(root.children[1]!.style.display).toBe('block');

    expect(renderer.render(initial).ok).toBe(true);
    expect(root.children[1]!.style.display).toBe('none');
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

  it('forwards every declared manifest event and filters undeclared event names', () => {
    const root = new FakeRoot();
    const forwarded: unknown[] = [];
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
      events: ['rowClick', 'cellClick'],
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: true },
    };
    const entry = {
      manifest,
      constructor: EventfulMaterialElement as unknown as BaseScreenMaterialConstructor,
    };
    const catalog: BaseScreenMaterialCatalog = {
      get: (type) => (type === manifest.type ? entry : undefined),
      has: (type) => type === manifest.type,
      list: () => [entry],
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'viewer',
      interactive: true,
      onMaterialEvent: (event) => forwarded.push(event),
      resourcePort: undefined,
    });

    expect(renderer.render(document([component('table', 0)])).ok).toBe(true);
    const element = root.children[0] as unknown as EventfulMaterialElement;
    element.fire({ name: 'rowClick', payload: { rowIndex: 0 } });
    element.fire({ name: 'cellClick', payload: { rowIndex: 0, columnId: 'amount' } });
    // 未在 manifest.events 声明的事件名不进入宿主回调（按物料声明门控）。
    element.fire({ name: 'undeclaredClick', payload: {} });
    expect(forwarded).toEqual([
      { componentId: 'table', type: 'base.test', name: 'rowClick', payload: { rowIndex: 0 } },
      {
        componentId: 'table',
        type: 'base.test',
        name: 'cellClick',
        payload: { rowIndex: 0, columnId: 'amount' },
      },
    ]);
  });

  describe('BaseScreenRenderer setInteractive', () => {
    it('switches mounted models in place and gates material events', () => {
      const root = new FakeRoot();
      const forwarded: unknown[] = [];
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createEventCatalog(),
        mode: 'design',
        interactive: false,
        onMaterialEvent: (event) => forwarded.push(event),
        resourcePort: undefined,
      });

      expect(renderer.render(document([component('interactive', 0)])).ok).toBe(true);
      const element = root.children[0] as unknown as EventfulMaterialElement;
      expect(element.model?.interactive).toBe(false);

      // 关闭时物料事件被门控，零外泄。
      element.fire({ name: 'valueClick', payload: { ok: true } });
      expect(forwarded).toEqual([]);

      expect(renderer.setInteractive(true).ok).toBe(true);
      expect(root.children).toHaveLength(1);
      expect(root.children[0]).toBe(element); // 同一实例，未重挂载
      expect(element.model?.interactive).toBe(true);

      element.fire({ name: 'valueClick', payload: { ok: true } });
      expect(forwarded).toEqual([
        {
          componentId: 'interactive',
          type: 'base.test',
          name: 'valueClick',
          payload: { ok: true },
        },
      ]);

      expect(renderer.setInteractive(false).ok).toBe(true);
      expect(root.children[0]).toBe(element);
      expect(element.model?.interactive).toBe(false);
      element.fire({ name: 'valueClick', payload: {} });
      expect(forwarded).toHaveLength(1);
    });

    it('records the state when called before the first render', () => {
      const root = new FakeRoot();
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        mode: 'design',
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: undefined,
      });

      expect(renderer.setInteractive(true).ok).toBe(true);
      expect(root.children).toHaveLength(0);
      expect(renderer.render(document([component('material', 0)])).ok).toBe(true);
      expect(root.children[0]?.model?.interactive).toBe(true);
    });

    it('is a no-op for the same value and re-renders only when the value changes', () => {
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
      const diagnostics: unknown[] = [];
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog,
        mode: 'design',
        interactive: false,
        onMaterialEvent: undefined,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        resourcePort: undefined,
      });

      expect(renderer.render(document([component('volatile', 0)])).ok).toBe(true);
      modelExplodes = true;
      const same = renderer.setInteractive(false);
      modelExplodes = false;
      expect(same.ok).toBe(true);
      expect(diagnostics).toEqual([]); // 同值不重渲染

      modelExplodes = true;
      const changed = renderer.setInteractive(true);
      modelExplodes = false;
      expect(changed.ok).toBe(true);
      expect(root.children).toHaveLength(1); // 值变化走原地重渲染，异常被隔离
      expect(changed.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'PLUGIN_CORE_RENDER_FAILED',
          path: ['components', 'volatile'],
          message: 'Material model update raised an exception.',
        },
      ]);
      expect(diagnostics).toEqual(changed.diagnostics);
    });

    it('fails closed after dispose', () => {
      const root = new FakeRoot();
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        mode: 'design',
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: undefined,
      });

      expect(renderer.render(document([component('material', 0)])).ok).toBe(true);
      renderer.dispose();
      const result = renderer.setInteractive(true);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
          path: [],
          message: 'Renderer has been disposed.',
        },
      ]);
    });
  });
});

describe('conditional style rules', () => {
  function createStyleRuleCatalog(): BaseScreenMaterialCatalog {
    const manifest: BaseScreenMaterialManifest = {
      type: 'base.test',
      tagName: 'base-screen-test',
      name: 'Test',
      category: 'Test',
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: { color: '#ffffff' },
      styleSchema: {
        kind: 'object',
        properties: { color: { kind: 'string' }, fontWeight: { kind: 'string' } },
        required: ['color'],
      },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: [],
      dataCapabilities: ['static', 'host-resource'],
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

  function styledComponent(
    value: ScreenJsonValue,
    styleRules: ScreenComponentNode['styleRules'],
  ): ScreenComponentNode {
    return {
      ...component('metric', 0, null, { type: 'static', value }),
      style: { color: '#ffffff' },
      ...(styleRules === undefined ? {} : { styleRules }),
    };
  }

  function flush(): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < 8; index++) chain = chain.then(() => undefined);
    return chain;
  }

  it('R3 applies a threshold rule to a static source and restores the base style', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const warn = {
      id: 'warn',
      when: { path: [], operator: 'gt', value: 100 },
      style: { color: '#ff0000' },
    } as const;

    expect(renderer.render(document([styledComponent(120, [warn])])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ff0000' });

    expect(renderer.render(document([styledComponent(42, [warn])])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffffff' });
  });

  it('R3 merges matched rules in document order with per-key override', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const rules = [
      { id: 'warn', when: { path: [], operator: 'gt', value: 10 }, style: { color: '#ffaa00' } },
      {
        id: 'crit',
        when: { path: [], operator: 'gt', value: 100 },
        style: { color: '#ff0000', fontWeight: '700' },
      },
    ] as const;

    expect(renderer.render(document([styledComponent(150, rules)])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ff0000', fontWeight: '700' });

    expect(renderer.render(document([styledComponent(50, rules)])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffaa00' });
  });

  it('R3 resolves object paths, array indices, exists, and contains', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const red = { color: '#ff0000' } as const;
    const cases: readonly [ScreenJsonValue, ScreenComponentNode['styleRules'], boolean][] = [
      [
        { amount: 120 },
        [{ id: 'r', when: { path: ['amount'], operator: 'gt', value: 100 }, style: red }],
        true,
      ],
      [
        { amount: 80 },
        [{ id: 'r', when: { path: ['amount'], operator: 'gt', value: 100 }, style: red }],
        false,
      ],
      [
        { rows: [{ v: 7 }] },
        [{ id: 'r', when: { path: ['rows', '0', 'v'], operator: 'eq', value: 7 }, style: red }],
        true,
      ],
      [
        { rows: [{ v: 7 }] },
        [{ id: 'r', when: { path: ['rows', '1', 'v'], operator: 'eq', value: 7 }, style: red }],
        false,
      ],
      [{ rows: [] }, [{ id: 'r', when: { path: ['rows'], operator: 'exists' }, style: red }], true],
      [{}, [{ id: 'r', when: { path: ['__proto__'], operator: 'exists' }, style: red }], false],
      [
        ['a', 'b'],
        [{ id: 'r', when: { path: [], operator: 'contains', value: 'a' }, style: red }],
        true,
      ],
      [
        'error',
        [{ id: 'r', when: { path: [], operator: 'contains', value: 'err' }, style: red }],
        true,
      ],
      ['high', [{ id: 'r', when: { path: [], operator: 'gt', value: 100 }, style: red }], false],
      [100, [{ id: 'r', when: { path: [], operator: 'gt', value: 100 }, style: red }], false],
    ];
    for (const [index, [value, rules, matched]] of cases.entries()) {
      expect(renderer.render(document([styledComponent(value, rules)])).ok).toBe(true);
      expect(root.children[0]?.model?.style?.color, `case ${index}`).toBe(
        matched ? '#ff0000' : '#ffffff',
      );
    }
  });

  it('R3 keeps the base style while host data is loading and evaluates after resolve', async () => {
    const root = new FakeRoot();
    let currentValue: ScreenJsonValue = 120;
    const requests: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async (request) => {
          requests.push(request);
          return { ok: true as const, value: currentValue, diagnostics: [] };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'metrics',
      resourceType: 'dataset',
      params: {},
      binding: null,
    };
    const warn = [
      { id: 'warn', when: { path: [], operator: 'gt', value: 100 }, style: { color: '#ff0000' } },
    ] as const;
    const target: ScreenComponentNode = {
      ...component('metric', 0, null, source),
      style: { color: '#ffffff' },
      styleRules: warn,
    };

    expect(renderer.render(document([target])).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');

    await flush();
    expect(root.children[0]?.model?.dataState.status).toBe('ready');
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');

    currentValue = 42;
    renderer.refreshData('metric');
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');
    expect(requests).toHaveLength(2);

    // 无关编辑触发原地重渲染：保留的 ready 数据继续派生 effective style，不发新请求。
    currentValue = 150;
    renderer.refreshData('metric');
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    expect(requests).toHaveLength(3);
    expect(renderer.render(document([{ ...target, name: 'metric-renamed' }])).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    expect(requests).toHaveLength(3);
  });

  it('R3 fails closed on a rule style outside the material schema and keeps the tree unchanged', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const invalid = styledComponent(120, [
      { id: 'bad', when: { path: [], operator: 'gt', value: 100 }, style: { unknownKey: 'x' } },
    ]);

    const result = renderer.render(document([invalid]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.path.slice(0, 5)).toEqual([
        'components',
        0,
        'styleRules',
        0,
        'style',
      ]);
    }
    expect(root.children).toEqual([]);
  });
});

describe('conditional style port (ADR-0059)', () => {
  function createPortCatalog(): BaseScreenMaterialCatalog {
    const manifest: BaseScreenMaterialManifest = {
      type: 'base.test',
      tagName: 'base-screen-test',
      name: 'Test',
      category: 'Test',
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: { color: '#ffffff' },
      styleSchema: {
        kind: 'object',
        properties: { color: { kind: 'string' }, fontWeight: { kind: 'string' } },
        required: ['color'],
      },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: [],
      dataCapabilities: ['static', 'host-resource'],
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

  function portComponent(
    value: ScreenJsonValue,
    styleRules?: ScreenComponentNode['styleRules'],
  ): ScreenComponentNode {
    return {
      ...component('metric', 0, null, { type: 'static', value }),
      style: { color: '#ffffff', fontWeight: '400' },
      ...(styleRules === undefined ? {} : { styleRules }),
    };
  }

  function flush(): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < 8; index++) chain = chain.then(() => undefined);
    return chain;
  }

  it('CSP-P2-C01 merges base → document rules → port overrides with per-key override', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      conditionalStylePort: {
        resolve: () => ({ color: '#00ff00', fontWeight: '900' }),
      },
    });
    const rules = [
      {
        id: 'warn',
        when: { path: [], operator: 'gt' as const, value: 10 },
        style: { color: '#ffaa00' },
      },
    ];

    expect(renderer.render(document([portComponent(150, rules)])).ok).toBe(true);
    // 端口覆盖同键后写优先（规则的红被端口绿覆盖），未覆盖键保留规则结果。
    expect(root.children[0]?.model?.style).toEqual({ color: '#00ff00', fontWeight: '900' });
  });

  it('CSP-P2-C02 receives componentId with the full dataState and re-evaluates on refresh', async () => {
    const root = new FakeRoot();
    const seen: { componentId: string; status: string; value?: ScreenJsonValue }[] = [];
    let currentValue: ScreenJsonValue = 120;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({ ok: true as const, value: currentValue, diagnostics: [] }),
      },
      conditionalStylePort: {
        resolve: ({ componentId, dataState }) => {
          seen.push({
            componentId,
            status: dataState.status,
            ...(dataState.status === 'ready' ? { value: dataState.value } : {}),
          });
          if (dataState.status !== 'ready') return undefined;
          return typeof dataState.value === 'number' && dataState.value > 100
            ? { color: '#ff0000' }
            : undefined;
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'metrics',
      resourceType: 'dataset',
      params: {},
      binding: null,
    };
    const target: ScreenComponentNode = {
      ...component('metric', 0, null, source),
      style: { color: '#ffffff', fontWeight: '400' },
    };

    expect(renderer.render(document([target])).ok).toBe(true);
    // 首次挂载即收到 loading 态请求：端口可见完整 dataState，自行决定无覆盖。
    expect(seen[0]).toEqual({ componentId: 'metric', status: 'loading' });
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');

    currentValue = 42;
    renderer.refreshData('metric');
    await flush();
    // 数据刷新重求值：不命中返回 undefined，自动回退基础样式。
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');
    expect(seen.every((item) => item.componentId === 'metric')).toBe(true);
    expect(seen.some((item) => item.status === 'ready' && item.value === 42)).toBe(true);
  });

  it('CSP-P2-C03 fails closed on an invalid override: ignores the port and reports one diagnostic', () => {
    const root = new FakeRoot();
    const diagnostics: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      onDiagnostic: (item) => diagnostics.push(item),
      conditionalStylePort: { resolve: () => ({ unknownKey: 'x' }) as never },
    });
    const rules = [
      {
        id: 'warn',
        when: { path: [], operator: 'gt' as const, value: 10 },
        style: { color: '#ffaa00' },
      },
    ];

    const result = renderer.render(document([portComponent(150, rules)]));

    // 渲染继续：非法覆盖不抵达物料，保留 base+规则结果。
    expect(result.ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffaa00', fontWeight: '400' });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      path: ['components', 'metric', 'conditionalStyle'],
    });
  });

  it('CSP-P2-C04 isolates a throwing resolve: ignores overrides, render continues', () => {
    const root = new FakeRoot();
    const diagnostics: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      onDiagnostic: (item) => diagnostics.push(item),
      conditionalStylePort: {
        resolve: ({ componentId }) => {
          if (componentId === 'metric') throw new Error('port boom');
          return { color: '#00ff00' };
        },
      },
    });
    const metric = portComponent(120);
    const other = { ...portComponent(120), id: 'other', name: 'other' };

    const result = renderer.render(document([metric, other]));

    expect(result.ok).toBe(true);
    // 抛异常组件回退基础样式；其他组件不受影响正常获得覆盖。
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffffff', fontWeight: '400' });
    expect(root.children[1]?.model?.style.color).toBe('#00ff00');
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'metric', 'conditionalStyle'],
        message: 'Conditional style port resolve raised an exception.',
      },
    ]);
  });

  it('CSP-P2-C05 keeps a port-less renderer and an undefined-returning port byte-identical', () => {
    const rules = [
      {
        id: 'warn',
        when: { path: [], operator: 'gt' as const, value: 10 },
        style: { color: '#ffaa00' },
      },
    ];
    const render = (options?: {
      conditionalStylePort?: { resolve(): ScreenJsonObject | undefined };
    }): string => {
      const root = new FakeRoot();
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createPortCatalog(),
        mode: 'viewer',
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: undefined,
        ...(options?.conditionalStylePort === undefined
          ? {}
          : { conditionalStylePort: options.conditionalStylePort }),
      });
      renderer.render(document([portComponent(150, rules)]));
      return JSON.stringify(root.children[0]?.model?.style);
    };

    expect(render()).toBe(render({ conditionalStylePort: { resolve: () => undefined } }));
  });
});
