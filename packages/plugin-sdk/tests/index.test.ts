import { describe, expect, it } from 'vitest';
import {
  type CreateMaterialDefinitionOptions,
  createMaterialDefinition,
  defineBaseScreenFragment,
  definePlugin,
} from '../src/index.js';

const manifest = {
  type: 'acme.label',
  tagName: 'acme-label',
  name: 'Label',
  category: 'Basic',
  keywords: ['label'],
  defaultSize: { width: 100, height: 20 },
  defaultProps: { text: 'Label' },
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object' as const,
    properties: { text: { kind: 'string' as const } },
    required: ['text'],
  },
  propertyPanel: [{ prop: 'text', label: 'Text', control: 'text' as const }],
  events: [],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: true, children: false },
};

function options(): CreateMaterialDefinitionOptions {
  class LabelElement {
    static readonly manifest = manifest;
  }
  return {
    manifest,
    element: LabelElement as unknown as CreateMaterialDefinitionOptions['element'],
  };
}

describe('createMaterialDefinition', () => {
  it('checks the static manifest without accessing browser globals', () => {
    const definition = createMaterialDefinition(options());
    expect(definition.ok).toBe(true);
  });

  it('requires a matching own static manifest data property', () => {
    class MissingManifest {}
    const result = createMaterialDefinition({
      manifest,
      element: MissingManifest as unknown as CreateMaterialDefinitionOptions['element'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
    }
  });

  it('registers idempotently and rejects a conflicting constructor', () => {
    const registrations = new Map<string, CustomElementConstructor>();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      value: {
        get: (name: string) => registrations.get(name),
        define: (name: string, element: CustomElementConstructor) =>
          registrations.set(name, element),
      },
    });
    try {
      const first = createMaterialDefinition(options());
      const second = createMaterialDefinition(options());
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }
      expect(first.value.define().ok).toBe(true);
      expect(first.value.define().ok).toBe(true);
      expect(second.value.define().ok).toBe(false);
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'customElements');
      } else {
        Object.defineProperty(globalThis, 'customElements', previous);
      }
    }
  });
});

describe('definePlugin', () => {
  it('returns a runtime only after its manifest passes the Plugin Core parser', () => {
    const runtime = {
      manifest: {
        id: 'acme.example',
        dependencies: [],
        capabilities: [],
        contributions: [],
      },
      activate: () => undefined,
      deactivate: () => undefined,
      dispose: () => undefined,
    };
    expect(definePlugin(runtime).ok).toBe(true);
  });

  it('requires command handlers to match command contributions exactly', () => {
    const manifest = {
      id: 'acme.commands',
      dependencies: [],
      capabilities: ['command.execute'],
      contributions: [
        {
          kind: 'command' as const,
          id: 'refresh',
          name: 'Refresh',
          requiredCapability: 'command.execute',
        },
      ],
    };
    const missing = definePlugin({
      manifest,
      activate: () => undefined,
      deactivate: () => undefined,
      dispose: () => undefined,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
    }
    const extra = definePlugin({
      manifest: {
        id: 'acme.example',
        dependencies: [],
        capabilities: [],
        contributions: [],
      },
      commands: { extra: () => undefined },
      activate: () => undefined,
      deactivate: () => undefined,
      dispose: () => undefined,
    });
    expect(extra.ok).toBe(false);
    const matched = definePlugin({
      manifest,
      commands: { refresh: () => undefined },
      activate: () => undefined,
      deactivate: () => undefined,
      dispose: () => undefined,
    });
    expect(matched.ok).toBe(true);
  });
});

describe('defineBaseScreenFragment', () => {
  const fragment = {
    id: 'acme.kpi-card',
    name: 'KPI 卡',
    category: '指标',
    keywords: ['kpi'],
    nodes: [
      { key: 'title', materialType: 'base.text', offset: { x: 0, y: 0 } },
      { key: 'value', materialType: 'acme.label', offset: { x: 0, y: 32 } },
    ],
  };

  it('returns a frozen fragment contribution that a plugin manifest accepts', () => {
    const defined = defineBaseScreenFragment(fragment);

    expect(defined.ok).toBe(true);
    if (!defined.ok) return;
    expect(defined.value.kind).toBe('fragment');
    expect(Object.isFrozen(defined.value)).toBe(true);
    const plugin = definePlugin({
      manifest: {
        id: 'acme.plugin',
        dependencies: [],
        capabilities: [],
        contributions: [defined.value],
      },
      activate() {},
      deactivate() {},
      dispose() {},
    });
    expect(plugin.ok).toBe(true);
  });

  it('fails closed on an invalid definition', () => {
    const defined = defineBaseScreenFragment({ ...fragment, nodes: [] });

    expect(defined.ok).toBe(false);
    expect(defined.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIMIT_EXCEEDED');
  });
});
