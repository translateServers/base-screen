import { describe, expect, it } from 'vitest';
import {
  type CreateMaterialDefinitionOptions,
  createMaterialDefinition,
  definePlugin,
} from './index.js';

const manifest = {
  apiVersion: 1 as const,
  type: 'acme.label/v1',
  implementationVersion: '1.0.0',
  tagName: 'acme-label-v1',
  name: 'Label',
  category: 'Basic',
  keywords: ['label'],
  defaultSize: { width: 100, height: 20 },
  defaultProps: { text: 'Label' },
  defaultStyle: {},
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
        apiVersion: 1 as const,
        id: 'acme.example',
        version: '1.0.0',
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
});
