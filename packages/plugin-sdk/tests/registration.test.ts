import type {
  BaseScreenMaterialConstructor,
  BaseScreenPluginRuntime,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  type BaseScreenMaterialDefinition,
  type CreatePluginRegistrationOptions,
  createMaterialDefinition,
  createMaterialPackage,
  createPluginPackage,
  createPluginRegistration,
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

function materialDefinition(tagName: string, type = 'acme.kpi-card'): BaseScreenMaterialDefinition {
  const value = manifest({ tagName, type });
  class Element {
    static readonly manifest = value;
  }
  const created = createMaterialDefinition({
    manifest: value,
    element: Element as unknown as BaseScreenMaterialConstructor,
  });
  if (!created.ok) {
    throw new Error(`fixture definition invalid: ${JSON.stringify(created.diagnostics)}`);
  }
  return created.value;
}

function runtime(id = 'acme.plugin'): BaseScreenPluginRuntime {
  return {
    manifest: {
      id,
      dependencies: [],
      capabilities: [],
      contributions: [],
    },
    activate: () => undefined,
    deactivate: () => undefined,
    dispose: () => undefined,
  };
}

function withStubRegistry(run: (registrations: Map<string, CustomElementConstructor>) => void) {
  const registrations = new Map<string, CustomElementConstructor>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: {
      get: (name: string) => registrations.get(name),
      define: (name: string, element: CustomElementConstructor) => {
        registrations.set(name, element);
      },
    },
  });
  try {
    run(registrations);
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, 'customElements');
    } else {
      Object.defineProperty(globalThis, 'customElements', previous);
    }
  }
}

describe('createPluginRegistration', () => {
  it('registers materials, packages and elements in one call and derives manager input', () => {
    withStubRegistry((registrations) => {
      const materialPackage = createMaterialPackage({
        id: 'acme.standalone',
        materials: [materialDefinition('acme-pack-card', 'acme.pack-card')],
      });
      expect(materialPackage.ok).toBe(true);
      if (!materialPackage.ok) return;
      const result = createPluginRegistration({
        plugins: [runtime()],
        materials: [
          materialPackage.value,
          materialDefinition('acme-single-card', 'acme.single-card'),
        ],
        elements: [
          { tagName: 'acme-panel', element: class {} as unknown as CustomElementConstructor },
        ],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const defined = result.value.define();
      expect(defined.ok).toBe(true);
      if (!defined.ok) return;
      expect(defined.value.plugins.map((item) => item.manifest.id)).toEqual(['acme.plugin']);
      expect(defined.value.standaloneMaterialTagNames).toEqual([
        'acme-pack-card',
        'acme-single-card',
      ]);
      expect(registrations.has('acme-pack-card')).toBe(true);
      expect(registrations.has('acme-single-card')).toBe(true);
      expect(registrations.has('acme-panel')).toBe(true);
      expect(Object.isFrozen(defined.value)).toBe(true);
    });
  });

  it('keeps plugin package materials out of standaloneMaterialTagNames', () => {
    withStubRegistry((registrations) => {
      const pluginPackage = createPluginPackage({
        id: 'acme.combo',
        plugin: runtime('acme.combo'),
        materials: [materialDefinition('acme-bundled-card', 'acme.bundled-card')],
      });
      expect(pluginPackage.ok).toBe(true);
      if (!pluginPackage.ok) return;
      const result = createPluginRegistration({ plugins: [pluginPackage.value] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const defined = result.value.define();
      expect(defined.ok).toBe(true);
      if (!defined.ok) return;
      expect(defined.value.plugins.map((item) => item.manifest.id)).toEqual(['acme.combo']);
      expect(defined.value.standaloneMaterialTagNames).toEqual([]);
      expect(registrations.has('acme-bundled-card')).toBe(true);
    });
  });

  it('fails closed before any define when the registry already binds a tag', () => {
    withStubRegistry((registrations) => {
      class Occupant {}
      registrations.set('acme-single-card', Occupant as unknown as CustomElementConstructor);
      const result = createPluginRegistration({
        plugins: [runtime()],
        materials: [materialDefinition('acme-single-card', 'acme.single-card')],
        elements: [
          { tagName: 'acme-panel', element: class {} as unknown as CustomElementConstructor },
        ],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const defined = result.value.define();
      expect(defined.ok).toBe(false);
      if (defined.ok) return;
      expect(defined.diagnostics).toMatchObject([
        {
          severity: 'error',
          code: 'PLUGIN_CORE_IDENTITY_CONFLICT',
          path: ['materials', 0, 'tagName'],
        },
      ]);
      expect(registrations.has('acme-panel')).toBe(false);
    });
  });

  it('treats replaying the same constructor as idempotent', () => {
    const registrations = new Map<string, CustomElementConstructor>();
    class Panel {}
    const panelConstructor = Panel as unknown as CustomElementConstructor;
    registrations.set('acme-panel', panelConstructor);
    const result = createPluginRegistration({
      elements: [{ tagName: 'acme-panel', element: panelConstructor }],
      registry: {
        get: (name: string) => registrations.get(name),
        define: (name: string, element: CustomElementConstructor) => {
          registrations.set(name, element);
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const defined = result.value.define();
    expect(defined.ok).toBe(true);
  });

  it('rejects duplicate tags and invalid entries at creation time without touching the registry', () => {
    withStubRegistry((registrations) => {
      const duplicate = createPluginRegistration({
        materials: [
          materialDefinition('acme-dup-card', 'acme.dup-one'),
          materialDefinition('acme-dup-card', 'acme.dup-two'),
        ],
      });
      expect(duplicate.ok).toBe(false);
      if (duplicate.ok) return;
      expect(duplicate.diagnostics).toMatchObject([
        { code: 'PLUGIN_CORE_IDENTITY_CONFLICT', path: ['materials', 1, 'tagName'] },
      ]);

      const invalidTag = createPluginRegistration({
        elements: [{ tagName: 'panel', element: class {} as unknown as CustomElementConstructor }],
      });
      expect(invalidTag.ok).toBe(false);
      if (invalidTag.ok) return;
      expect(invalidTag.diagnostics).toMatchObject([
        { code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID', path: ['elements', 0] },
      ]);

      const invalidRuntime = createPluginRegistration({
        plugins: [{ manifest: { id: '' } } as unknown as BaseScreenPluginRuntime],
      });
      expect(invalidRuntime.ok).toBe(false);
      if (invalidRuntime.ok) return;
      expect(invalidRuntime.diagnostics.every((item) => item.path[0] === 'plugins')).toBe(true);

      expect(registrations.size).toBe(0);
    });
  });

  it('rejects an unusable registry option', () => {
    const result = createPluginRegistration({
      registry: { get: () => undefined } as unknown as NonNullable<
        NonNullable<CreatePluginRegistrationOptions['registry']>
      >,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toMatchObject([
      { code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID', path: ['registry'] },
    ]);
  });
});
