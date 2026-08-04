import { describe, expect, it } from 'vitest';
import {
  type BaseScreenMaterialConstructor,
  createBaseScreenMaterialCatalog,
  createBaseScreenPluginCatalog,
  parseBaseScreenMaterialEventDetail,
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
  parsePluginCommandRequest,
  validateBaseScreenMaterialIdentity,
  validateBaseScreenMaterialProps,
} from './index.js';

function materialManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'acme.kpi-card',
    tagName: 'acme-kpi-card',
    name: 'KPI Card',
    category: 'Charts',
    keywords: ['kpi', 'metric'],
    defaultSize: { width: 320, height: 160 },
    defaultProps: { title: 'Revenue', threshold: 80 },
    defaultStyle: { color: '#00ff00' },
    propsSchema: {
      kind: 'object',
      properties: {
        title: { kind: 'string', minLength: 1 },
        threshold: { kind: 'number', minimum: 0, maximum: 100 },
      },
      required: ['title'],
    },
    propertyPanel: [
      { prop: 'title', label: 'Title', control: 'text' },
      { prop: 'threshold', label: 'Threshold', control: 'number' },
    ],
    events: ['valueClick'],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: true, children: false },
    ...overrides,
  };
}

function pluginManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acme.analytics',
    dependencies: [],
    capabilities: ['command.execute'],
    contributions: [
      {
        kind: 'material',
        type: 'acme.kpi-card',
        tagName: 'acme-kpi-card',
      },
      {
        kind: 'command',
        id: 'refresh',
        name: 'Refresh',
        requiredCapability: 'command.execute',
      },
    ],
    ...overrides,
  };
}

describe('material identity and manifests', () => {
  it('parses a strict detached material manifest', () => {
    const input = materialManifest();
    const result = parseBaseScreenMaterialManifest(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(input);
      expect(result.value).not.toBe(input);
      expect(result.value.defaultProps).not.toBe(input.defaultProps);
    }
  });

  it('rejects malformed type/tag bindings and unknown fields', () => {
    const identity = validateBaseScreenMaterialIdentity('acme.kpi-card', 'acme');
    const manifest = parseBaseScreenMaterialManifest(materialManifest({ unrecognized: true }));

    expect(identity.ok).toBe(false);
    if (!identity.ok) {
      expect(identity.diagnostics[0]?.code).toBe('PLUGIN_CORE_TAG_NAME_INVALID');
    }
    expect(manifest.ok).toBe(false);
    if (!manifest.ok) {
      expect(manifest.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD');
    }
  });

  it('rejects unsafe data and default props that do not match the schema', () => {
    let invoked = false;
    const unsafe = materialManifest({
      defaultProps: Object.defineProperty({}, 'title', {
        enumerable: true,
        get() {
          invoked = true;
          return 'Revenue';
        },
      }),
    });
    const mismatch = parseBaseScreenMaterialManifest(
      materialManifest({ defaultProps: { threshold: 101 } }),
    );

    expect(parseBaseScreenMaterialManifest(unsafe).ok).toBe(false);
    expect(invoked).toBe(false);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.diagnostics.some((item) => item.path[0] === 'defaultProps')).toBe(true);
    }
  });

  it('rejects executable, cyclic, and dangerous Manifest data without invoking it', () => {
    let invoked = false;
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const dangerous = {} as Record<string, unknown>;
    Object.defineProperty(dangerous, '__proto__', { enumerable: true, value: 'unsafe' });
    const manifests = [
      materialManifest({ defaultStyle: { render: () => (invoked = true) } }),
      materialManifest({ defaultStyle: cyclic }),
      materialManifest({ defaultStyle: dangerous }),
    ];

    for (const input of manifests) {
      expect(parseBaseScreenMaterialManifest(input).ok).toBe(false);
    }
    expect(invoked).toBe(false);
  });

  it('applies the material manifest resource budget before cloning', () => {
    const result = parseBaseScreenMaterialManifest(
      materialManifest({ defaultStyle: { value: 'a'.repeat(256 * 1024) } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIMIT_EXCEEDED');
    }
  });

  it('validates props through the manifest schema and returns detached JSON', () => {
    const manifest = parseBaseScreenMaterialManifest(materialManifest());
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) {
      return;
    }
    const props = { title: 'Revenue', threshold: 50 };
    const result = validateBaseScreenMaterialProps(props, manifest.value.propsSchema);
    props.title = 'Changed';

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: 'Revenue', threshold: 50 });
    }
    expect(validateBaseScreenMaterialProps({ title: '' }, manifest.value.propsSchema).ok).toBe(
      false,
    );
  });
});

describe('events and plugin command data', () => {
  it('validates detached standard event details', () => {
    const result = parseBaseScreenMaterialEventDetail({
      name: 'valueClick',
      payload: { value: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.payload).toEqual({ value: 1 });
    }
  });

  it('rejects invalid event details and malformed command requests', () => {
    const event = parseBaseScreenMaterialEventDetail({ name: 'not valid', payload: null });
    const command = parsePluginCommandRequest({
      commandId: 'run',
      args: { value: 1 },
      extra: true,
    });

    expect(event.ok).toBe(false);
    expect(command.ok).toBe(false);
    if (!command.ok) {
      expect(command.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD');
    }
  });

  it('rejects cyclic event payloads and keeps diagnostics deterministic and minimal', () => {
    const payload: Record<string, unknown> = {};
    payload.self = payload;
    const input = { name: 'valueClick', payload };
    const first = parseBaseScreenMaterialEventDetail(input);
    const second = parseBaseScreenMaterialEventDetail(input);

    expect(first).toEqual(second);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.diagnostics[0]?.code).toBe('JSON_CYCLE');
      expect(first.diagnostics[0]?.message).not.toContain('self');
    }
  });
});

describe('plugin manifests and catalogs', () => {
  it('parses a strict plugin manifest with finite contributions', () => {
    const result = parseBaseScreenPluginManifest(pluginManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contributions).toHaveLength(2);
    }
  });

  it('rejects duplicate contribution identities and malformed dependencies', () => {
    const duplicate = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
          },
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh again',
            requiredCapability: 'command.execute',
          },
        ],
      }),
    );
    const dependency = parseBaseScreenPluginManifest(
      pluginManifest({ dependencies: [{ id: 'acme.base', unexpected: true }] }),
    );

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(
        duplicate.diagnostics.some((item) => item.code === 'PLUGIN_CORE_CONTRIBUTION_DUPLICATE'),
      ).toBe(true);
    }
    expect(dependency.ok).toBe(false);
  });

  it('creates ordered read-only catalog snapshots without mutable entry APIs', () => {
    const parsedMaterial = parseBaseScreenMaterialManifest(materialManifest());
    const parsedPlugin = parseBaseScreenPluginManifest(pluginManifest());
    expect(parsedMaterial.ok).toBe(true);
    expect(parsedPlugin.ok).toBe(true);
    if (!parsedMaterial.ok || !parsedPlugin.ok) {
      return;
    }
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    const materials = createBaseScreenMaterialCatalog([
      { manifest: parsedMaterial.value, constructor },
    ]);
    const plugins = createBaseScreenPluginCatalog([
      {
        manifest: parsedPlugin.value,
        grantedCapabilities: ['command.execute'],
        contributions: parsedPlugin.value.contributions,
      },
    ]);

    expect(materials.get('acme.kpi-card')?.constructor).toBe(constructor);
    expect(materials.has('missing')).toBe(false);
    expect(materials.list()).toHaveLength(1);
    expect(plugins.list()[0]?.manifest.id).toBe('acme.analytics');
    expect('register' in materials).toBe(false);
    expect('delete' in plugins).toBe(false);
  });

  it('detaches catalog snapshots and rejects duplicate identities', () => {
    const parsedMaterial = parseBaseScreenMaterialManifest(materialManifest());
    const parsedPlugin = parseBaseScreenPluginManifest(pluginManifest());
    expect(parsedMaterial.ok).toBe(true);
    expect(parsedPlugin.ok).toBe(true);
    if (!parsedMaterial.ok || !parsedPlugin.ok) {
      return;
    }
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    const catalog = createBaseScreenMaterialCatalog([
      { manifest: parsedMaterial.value, constructor },
    ]);
    const entry = catalog.get('acme.kpi-card');

    expect(entry?.manifest).not.toBe(parsedMaterial.value);
    expect(Object.isFrozen(entry?.manifest)).toBe(true);
    expect(() =>
      createBaseScreenPluginCatalog([
        {
          manifest: parsedPlugin.value,
          grantedCapabilities: [],
          contributions: [],
        },
        {
          manifest: parsedPlugin.value,
          grantedCapabilities: [],
          contributions: [],
        },
      ]),
    ).toThrow(RangeError);
  });

  it('sorts Material Catalogs independently for separate instances', () => {
    const first = parseBaseScreenMaterialManifest(materialManifest({ type: 'acme.zeta-card' }));
    const second = parseBaseScreenMaterialManifest(
      materialManifest({ type: 'acme.alpha-card', tagName: 'acme-alpha-card' }),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    const enabled = createBaseScreenMaterialCatalog([
      { manifest: first.value, constructor },
      { manifest: second.value, constructor },
    ]);
    const excluded = createBaseScreenMaterialCatalog([]);

    expect(enabled.list().map((entry) => entry.manifest.type)).toEqual([
      'acme.alpha-card',
      'acme.zeta-card',
    ]);
    expect(excluded.get('acme.alpha-card')).toBeUndefined();
  });
});
