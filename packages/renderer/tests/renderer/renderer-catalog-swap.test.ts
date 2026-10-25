import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import { component, document, FakeRoot } from './__fixtures__/renderer-test-harness.js';

class TrackingElementA {
  static instances: TrackingElementA[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  removed = false;
  modelWrites = 0;
  #model: BaseScreenMaterialModel | undefined;

  constructor() {
    TrackingElementA.instances.push(this);
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
  remove(): void {
    this.removed = true;
  }
}

class TrackingElementB extends TrackingElementA {
  static override instances: TrackingElementB[] = [];

  constructor() {
    super();
    TrackingElementB.instances.push(this);
  }
}

function manifest(overrides: Partial<BaseScreenMaterialManifest> = {}): BaseScreenMaterialManifest {
  return {
    type: 'base.test',
    tagName: 'test-a',
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
    ...overrides,
  };
}

function catalog(
  constructor: typeof TrackingElementA | typeof TrackingElementB,
  overrides: Partial<BaseScreenMaterialManifest> = {},
): BaseScreenMaterialCatalog {
  return createBaseScreenMaterialCatalog([
    {
      manifest: manifest(overrides),
      constructor: constructor as unknown as BaseScreenMaterialConstructor,
    },
  ]);
}

function rendererWith(catalogValue: BaseScreenMaterialCatalog) {
  const root = new FakeRoot();
  const renderer = createBaseScreenRenderer({
    root: root as unknown as HTMLElement,
    catalog: catalogValue,
    mode: 'design',
    interactive: false,
    onMaterialEvent: undefined,
    resourcePort: undefined,
  });
  return { root, renderer };
}

// 同一份文档对象模拟 canonical document 的结构共享：未变组件的引用必须跨 render 保持相同。
const testDocument = (() => {
  const value = document([component('c1', 0)]);
  return () => value;
})();

describe('BaseScreenRenderer catalog swap', () => {
  it('reuses mounted elements for an unchanged definition', () => {
    TrackingElementA.instances = [];
    const { renderer } = rendererWith(catalog(TrackingElementA));
    expect(renderer.render(testDocument()).ok).toBe(true);
    const first = TrackingElementA.instances[0]!;
    expect(first.modelWrites).toBe(1);

    expect(renderer.setCatalog(catalog(TrackingElementA)).ok).toBe(true);
    expect(renderer.render(testDocument()).ok).toBe(true);

    expect(TrackingElementA.instances).toHaveLength(1);
    expect(first.modelWrites).toBe(1);
    expect(first.removed).toBe(false);
  });

  it('updates the model without remounting for a manifest-only change', () => {
    TrackingElementA.instances = [];
    const { renderer } = rendererWith(catalog(TrackingElementA));
    expect(renderer.render(testDocument()).ok).toBe(true);
    const first = TrackingElementA.instances[0]!;

    expect(renderer.setCatalog(catalog(TrackingElementA, { name: 'Renamed' })).ok).toBe(true);
    expect(renderer.render(testDocument()).ok).toBe(true);

    expect(TrackingElementA.instances).toHaveLength(1);
    expect(first.removed).toBe(false);
    expect(first.modelWrites).toBe(2);
  });

  it('remounts when the constructor changes', () => {
    TrackingElementA.instances = [];
    TrackingElementB.instances = [];
    const { renderer } = rendererWith(catalog(TrackingElementA));
    expect(renderer.render(testDocument()).ok).toBe(true);
    const first = TrackingElementA.instances[0]!;

    expect(renderer.setCatalog(catalog(TrackingElementB, { tagName: 'test-b' })).ok).toBe(true);
    expect(renderer.render(testDocument()).ok).toBe(true);

    expect(first.removed).toBe(true);
    expect(TrackingElementB.instances).toHaveLength(1);
  });

  it('remounts when only the tag name changes', () => {
    TrackingElementA.instances = [];
    const { renderer } = rendererWith(catalog(TrackingElementA));
    expect(renderer.render(testDocument()).ok).toBe(true);
    const first = TrackingElementA.instances[0]!;

    expect(renderer.setCatalog(catalog(TrackingElementA, { tagName: 'test-b' })).ok).toBe(true);
    expect(renderer.render(testDocument()).ok).toBe(true);

    expect(first.removed).toBe(true);
    expect(TrackingElementA.instances).toHaveLength(2);
  });

  it('removes mounted elements for a removed type', () => {
    TrackingElementA.instances = [];
    const { renderer } = rendererWith(catalog(TrackingElementA));
    expect(renderer.render(testDocument()).ok).toBe(true);
    const first = TrackingElementA.instances[0]!;

    expect(renderer.setCatalog(createBaseScreenMaterialCatalog([])).ok).toBe(true);

    expect(first.removed).toBe(true);
  });
});

describe('BaseScreenRenderer.validateCatalog', () => {
  it('accepts a compatible document without mounting anything', () => {
    const { root, renderer } = rendererWith(catalog(TrackingElementA));
    const result = renderer.validateCatalog(testDocument(), catalog(TrackingElementA));

    expect(result.ok).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it('reports a missing material for the document', () => {
    const { renderer } = rendererWith(catalog(TrackingElementA));
    const result = renderer.validateCatalog(testDocument(), createBaseScreenMaterialCatalog([]));

    expect(result.ok).toBe(false);
    expect(
      !result.ok && result.diagnostics.some((item) => item.code === 'PLUGIN_CORE_IDENTITY_INVALID'),
    ).toBe(true);
  });

  it('reports a schema-incompatible document', () => {
    const { renderer } = rendererWith(catalog(TrackingElementA));
    const incompatible = catalog(TrackingElementA, {
      propsSchema: {
        kind: 'object',
        properties: { source: { kind: 'string' } },
        required: ['source'],
      },
    });

    expect(renderer.validateCatalog(testDocument(), incompatible).ok).toBe(false);
  });
});
