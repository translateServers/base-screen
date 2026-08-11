import type {
  BaseScreenMaterialConstructor,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  type CreateMaterialDefinitionOptions,
  type CreateMaterialPackageOptions,
  createMaterialPackage,
} from '../src/index.js';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    type: 'acme.kpi-card',
    tagName: 'acme-kpi-card',
    name: 'KPI Card',
    category: 'Charts',
    keywords: ['kpi'],
    defaultSize: { width: 320, height: 160 },
    defaultProps: { title: 'Revenue' },
    defaultStyle: {},
    styleSchema: { kind: 'object' as const, properties: {}, required: [] },
    stylePanel: [],
    propsSchema: {
      kind: 'object' as const,
      properties: { title: { kind: 'string' as const } },
      required: ['title'],
    },
    propertyPanel: [{ prop: 'title', label: 'Title', control: 'text' as const }],
    events: [],
    dataCapabilities: ['static' as const],
    designCapabilities: { resize: true, rotate: true, children: false },
    ...overrides,
  };
}

function options(
  item: { readonly type?: string; readonly tagName?: string; readonly name?: string } = {},
): CreateMaterialDefinitionOptions {
  const value = manifest({
    ...(item.type === undefined ? {} : { type: item.type }),
    ...(item.tagName === undefined ? {} : { tagName: item.tagName }),
    ...(item.name === undefined ? {} : { name: item.name }),
  });
  class Element {
    static readonly manifest = value;
  }
  return {
    manifest: value,
    element: Element as unknown as CreateMaterialDefinitionOptions['element'],
  };
}

function adapter(): BaseScreenMaterialTabularDataAdapter {
  return {
    adapt: () => ({ ok: true as const, value: null, diagnostics: [] }),
  };
}

function withStubRegistry(run: () => void): void {
  const registrations = new Map<string, CustomElementConstructor>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: {
      get: (name: string) => registrations.get(name),
      define: (name: string, element: CustomElementConstructor) => registrations.set(name, element),
    },
  });
  try {
    run();
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, 'customElements');
    } else {
      Object.defineProperty(globalThis, 'customElements', previous);
    }
  }
}

describe('createMaterialPackage', () => {
  it('creates a validated package without touching browser globals', () => {
    let registryReads = 0;
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      get: () => {
        registryReads++;
        return undefined;
      },
    });
    try {
      const result = createMaterialPackage({
        id: 'acme.kpi',
        materials: [options(), options({ type: 'acme.metric-card', tagName: 'acme-metric-card' })],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('acme.kpi');
        expect(result.value.materials).toHaveLength(2);
        expect(Object.isFrozen(result.value.materials)).toBe(true);
      }
      expect(registryReads).toBe(0);
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'customElements');
      } else {
        Object.defineProperty(globalThis, 'customElements', previous);
      }
    }
  });

  it('rejects an invalid package id', () => {
    const result = createMaterialPackage({ id: 'not valid!', materials: [options()] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['id']);
    }
  });

  it('rejects an empty materials list', () => {
    const result = createMaterialPackage({ id: 'acme.kpi', materials: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['materials']);
    }
  });

  it('rejects a duplicate material type with a located diagnostic', () => {
    const result = createMaterialPackage({
      id: 'acme.kpi',
      materials: [options(), options({ tagName: 'acme-other-card' })],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_CONFLICT');
      expect(result.diagnostics[0]?.path).toEqual(['materials', 1, 'type']);
    }
  });

  it('rejects a duplicate tag name with a located diagnostic', () => {
    const result = createMaterialPackage({
      id: 'acme.kpi',
      materials: [options(), options({ type: 'acme.other-card' })],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_CONFLICT');
      expect(result.diagnostics[0]?.path).toEqual(['materials', 1, 'tagName']);
    }
  });

  it('rejects an invalid material manifest with a located diagnostic', () => {
    const invalid = manifest({ name: 42 });
    class Element {
      static readonly manifest = invalid;
    }
    const result = createMaterialPackage({
      id: 'acme.kpi',
      materials: [{ manifest: invalid, element: Element as unknown as never }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
      expect(result.diagnostics[0]?.path[0]).toBe('materials');
      expect(result.diagnostics[0]?.path[1]).toBe(0);
    }
  });

  it('rejects a static manifest that differs from the declared manifest', () => {
    class Element {
      static readonly manifest = manifest({ type: 'acme.other-card' });
    }
    const result = createMaterialPackage({
      id: 'acme.kpi',
      materials: [
        {
          manifest: manifest(),
          element: Element as unknown as CreateMaterialDefinitionOptions['element'],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_CONFLICT');
      expect(result.diagnostics[0]?.path).toEqual(['materials', 0, 'element', 'manifest']);
    }
  });

  it('define registers every material and returns catalog entries', () => {
    withStubRegistry(() => {
      const created = createMaterialPackage({
        id: 'acme.kpi',
        materials: [options(), options({ type: 'acme.metric-card', tagName: 'acme-metric-card' })],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const defined = created.value.define();
      expect(defined.ok).toBe(true);
      if (!defined.ok) return;
      expect(defined.value).toHaveLength(2);
      expect(defined.value.map((entry) => entry.manifest.type).sort()).toEqual([
        'acme.kpi-card',
        'acme.metric-card',
      ]);
      const catalog = createBaseScreenMaterialCatalog(defined.value);
      expect(catalog.has('acme.kpi-card')).toBe(true);
      expect(catalog.list()).toHaveLength(2);
    });
  });

  it('define is idempotent for the same package', () => {
    withStubRegistry(() => {
      const created = createMaterialPackage({ id: 'acme.kpi', materials: [options()] });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.define().ok).toBe(true);
      expect(created.value.define().ok).toBe(true);
    });
  });

  it('define fails closed on a conflicting tag binding with a located diagnostic', () => {
    withStubRegistry(() => {
      const conflict = manifest({ type: 'acme.other-card' });
      class Other {
        static readonly manifest = conflict;
      }
      customElements.define('acme-kpi-card', Other as unknown as CustomElementConstructor);
      const created = createMaterialPackage({ id: 'acme.kpi', materials: [options()] });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const defined = created.value.define();
      expect(defined.ok).toBe(false);
      if (!defined.ok) {
        expect(defined.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_CONFLICT');
        expect(defined.diagnostics[0]?.path).toEqual(['materials', 0, 'tagName']);
      }
    });
  });

  it('reports every preflight tag conflict with sorted located diagnostics', () => {
    withStubRegistry(() => {
      customElements.define('acme-kpi-card', class {} as CustomElementConstructor);
      customElements.define('acme-metric-card', class {} as CustomElementConstructor);
      const created = createMaterialPackage({
        id: 'acme.kpi',
        materials: [options(), options({ type: 'acme.metric-card', tagName: 'acme-metric-card' })],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const defined = created.value.define();
      expect(defined.ok).toBe(false);
      if (!defined.ok) {
        expect(defined.diagnostics).toHaveLength(2);
        expect(defined.diagnostics.map((item) => item.path)).toEqual([
          ['materials', 0, 'tagName'],
          ['materials', 1, 'tagName'],
        ]);
        expect(
          defined.diagnostics.every(
            (item) => item.code === 'PLUGIN_CORE_IDENTITY_CONFLICT' && item.path[2] === 'tagName',
          ),
        ).toBe(true);
      }
    });
  });

  it('define does not partially register when a later tag conflicts', () => {
    withStubRegistry(() => {
      const conflict = manifest({ type: 'acme.metric-card', tagName: 'acme-metric-card' });
      class Other {
        static readonly manifest = conflict;
      }
      customElements.define('acme-metric-card', Other as unknown as CustomElementConstructor);
      const created = createMaterialPackage({
        id: 'acme.kpi',
        materials: [options(), options({ type: 'acme.metric-card', tagName: 'acme-metric-card' })],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const defined = created.value.define();
      expect(defined.ok).toBe(false);
      if (!defined.ok) {
        expect(defined.diagnostics[0]?.path).toEqual(['materials', 1, 'tagName']);
      }
      expect(customElements.get('acme-kpi-card')).toBeUndefined();
    });
  });

  it('rejects a non-object package options input without throwing', () => {
    const result = createMaterialPackage(null as unknown as CreateMaterialPackageOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_NOT_OBJECT');
    }
  });

  it('rejects a non-array materials input without throwing', () => {
    const result = createMaterialPackage({ id: 'acme.kpi', materials: 'bad' as never });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['materials']);
    }
  });

  it('rejects a null material entry without throwing', () => {
    const result = createMaterialPackage({
      id: 'acme.kpi',
      materials: [options(), null as unknown as CreateMaterialDefinitionOptions],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_NOT_OBJECT');
      expect(result.diagnostics[0]?.path).toEqual(['materials', 1]);
    }
  });

  it('rejects a package above the material count limit', () => {
    const many = Array.from({ length: 513 }, (_, index) =>
      options({ type: `acme.m-${index}`, tagName: `acme-m-${index}` }),
    );
    const result = createMaterialPackage({ id: 'acme.kpi', materials: many });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['materials']);
    }
  });

  it('define reports unavailable custom elements per material without throwing', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
    Reflect.deleteProperty(globalThis, 'customElements');
    try {
      const created = createMaterialPackage({ id: 'acme.kpi', materials: [options()] });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const defined = created.value.define();
      expect(defined.ok).toBe(false);
      if (!defined.ok) {
        expect(defined.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
        expect(defined.diagnostics[0]?.path).toEqual(['materials', 0]);
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'customElements');
      } else {
        Object.defineProperty(globalThis, 'customElements', previous);
      }
    }
  });

  it('rejects a package whose options accessor throws', () => {
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom');
        },
      },
    );
    const result = createMaterialPackage(hostile as unknown as CreateMaterialPackageOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual([]);
    }
  });

  it('rejects a material entry whose accessor throws', () => {
    const entry = new Proxy(options(), {
      get: () => {
        throw new Error('boom');
      },
    });
    const result = createMaterialPackage({
      id: 'acme.kpi',
      materials: [entry as unknown as CreateMaterialDefinitionOptions],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['materials', 0]);
    }
  });

  it('rejects an invalid dataset adapter with a located diagnostic', () => {
    const invalid = options();
    const constructor = invalid.element as BaseScreenMaterialConstructor;
    Object.defineProperty(constructor, 'tabularDataAdapter', { value: { adapt: 'nope' } });
    const result = createMaterialPackage({ id: 'acme.kpi', materials: [invalid] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual([
        'materials',
        0,
        'element',
        'tabularDataAdapter',
      ]);
    }
  });

  it('define returns a located diagnostic when the registry rejects a definition', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      value: {
        get: () => undefined,
        define: () => {
          throw new Error('NotSupported');
        },
      },
    });
    try {
      const created = createMaterialPackage({ id: 'acme.kpi', materials: [options()] });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const defined = created.value.define();
      expect(defined.ok).toBe(false);
      if (!defined.ok) {
        expect(defined.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_CONFLICT');
        expect(defined.diagnostics[0]?.path).toEqual(['materials', 0, 'tagName']);
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'customElements');
      } else {
        Object.defineProperty(globalThis, 'customElements', previous);
      }
    }
  });

  it('recreating a package with the same constructor stays idempotent', () => {
    withStubRegistry(() => {
      const material = options();
      const first = createMaterialPackage({ id: 'acme.kpi', materials: [material] });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value.define().ok).toBe(true);
      const second = createMaterialPackage({ id: 'acme.kpi', materials: [material] });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.define().ok).toBe(true);
    });
  });

  it('carries dataset adapters into catalog entries', () => {
    const withAdapter = options({ type: 'acme.metric-card', tagName: 'acme-metric-card' });
    const constructor = withAdapter.element as BaseScreenMaterialConstructor;
    Object.defineProperty(constructor, 'tabularDataAdapter', { value: adapter() });
    withStubRegistry(() => {
      const created = createMaterialPackage({
        id: 'acme.kpi',
        materials: [options(), withAdapter],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const defined = created.value.define();
      expect(defined.ok).toBe(true);
      if (!defined.ok) return;
      const entry = defined.value.find((item) => item.manifest.type === 'acme.metric-card');
      expect(entry?.tabularDataAdapter).toBeDefined();
    });
  });
});
