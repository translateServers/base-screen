import type {
  BaseScreenMaterialConstructor,
  BaseScreenPluginManifest,
  BaseScreenPluginRuntime,
  PluginCommandPort,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenPluginManager } from './manager.js';

function materialManifest(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: 1 as const,
    type: 'acme.kpi-card/v1',
    implementationVersion: '1.0.0',
    tagName: 'acme-kpi-card-v1',
    name: 'KPI Card',
    category: 'Charts',
    keywords: ['kpi'],
    defaultSize: { width: 320, height: 160 },
    defaultProps: { title: 'Revenue' },
    defaultStyle: {},
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

function pluginManifest(
  overrides: Partial<BaseScreenPluginManifest> = {},
): BaseScreenPluginManifest {
  return {
    apiVersion: 1,
    id: 'acme.plugin',
    version: '1.0.0',
    dependencies: [],
    capabilities: [],
    contributions: [],
    ...overrides,
  };
}

function runtime(
  manifest: BaseScreenPluginManifest,
  hooks: Partial<Pick<BaseScreenPluginRuntime, 'activate' | 'deactivate' | 'dispose'>> = {},
): BaseScreenPluginRuntime {
  return {
    manifest,
    activate: hooks.activate ?? (() => undefined),
    deactivate: hooks.deactivate ?? (() => undefined),
    dispose: hooks.dispose ?? (() => undefined),
  };
}

function constructorFor(
  manifest: ReturnType<typeof materialManifest>,
): BaseScreenMaterialConstructor {
  return class {
    static readonly manifest = manifest;
  } as unknown as BaseScreenMaterialConstructor;
}

function managerOptions(
  plugins: readonly BaseScreenPluginRuntime[],
  materials = new Map<string, BaseScreenMaterialConstructor>(),
) {
  return {
    instanceId: 'screen-a',
    standaloneMaterialTagNames: [],
    plugins,
    grantedCapabilities: {},
    registry: { get: (tagName: string) => materials.get(tagName) },
    createCommandPort: undefined,
  };
}

describe('BaseScreenPluginManager', () => {
  it('activates dependencies in deterministic order then atomically publishes catalogs', async () => {
    const log: string[] = [];
    const material = materialManifest();
    const materials = new Map([[material.tagName, constructorFor(material)]]);
    const base = runtime(
      pluginManifest({
        id: 'acme.base',
        contributions: [{ kind: 'material', type: material.type, tagName: material.tagName }],
      }),
      {
        activate: () => {
          log.push('activate:base');
        },
        deactivate: () => {
          log.push('deactivate:base');
        },
      },
    );
    const chart = runtime(
      pluginManifest({
        id: 'acme.chart',
        dependencies: [{ id: 'acme.base', range: '^1.0.0' }],
      }),
      {
        activate: () => {
          log.push('activate:chart');
        },
        deactivate: () => {
          log.push('deactivate:chart');
        },
      },
    );
    const manager = createBaseScreenPluginManager(managerOptions([chart, base], materials));

    const activated = await manager.activate();
    expect(activated.ok).toBe(true);
    expect(log).toEqual(['activate:base', 'activate:chart']);
    expect(manager.snapshot?.materials.has(material.type)).toBe(true);
    expect(manager.snapshot?.plugins.list().map((entry) => entry.manifest.id)).toEqual([
      'acme.base',
      'acme.chart',
    ]);

    expect((await manager.deactivate()).ok).toBe(true);
    expect(log).toEqual(['activate:base', 'activate:chart', 'deactivate:chart', 'deactivate:base']);
    expect(manager.snapshot).toBeUndefined();
  });

  it('finishes all preflight failures before creating ports or calling hooks', async () => {
    let hooksCalled = 0;
    let portsCreated = 0;
    const first = runtime(
      pluginManifest({ id: 'acme.first', dependencies: [{ id: 'acme.second', range: '^1.0.0' }] }),
      {
        activate: () => {
          hooksCalled++;
        },
      },
    );
    const second = runtime(
      pluginManifest({ id: 'acme.second', dependencies: [{ id: 'acme.first', range: '^1.0.0' }] }),
      {
        activate: () => {
          hooksCalled++;
        },
      },
    );
    const manager = createBaseScreenPluginManager({
      ...managerOptions([first, second]),
      createCommandPort: () => {
        portsCreated++;
        return { execute: async () => ({ ok: true as const, value: null, diagnostics: [] }) };
      },
    });

    const result = await manager.activate();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.code === 'PLUGIN_CORE_DEPENDENCY_CYCLE')).toBe(
        true,
      );
    }
    expect(hooksCalled).toBe(0);
    expect(portsCreated).toBe(0);
    expect(manager.snapshot).toBeUndefined();
  });

  it('rolls back successful plugins and invalidates their session ports after activation failure', async () => {
    const log: string[] = [];
    let capturedPort: PluginCommandPort | undefined;
    const base = runtime(pluginManifest({ id: 'acme.base', capabilities: ['command.execute'] }), {
      activate: (context) => {
        capturedPort = context.commandPort;
        log.push('activate:base');
      },
      deactivate: () => {
        log.push('deactivate:base');
      },
    });
    const failing = runtime(pluginManifest({ id: 'acme.failing' }), {
      activate: () => Promise.reject(new Error('canary secret must not escape')),
    });
    const manager = createBaseScreenPluginManager({
      ...managerOptions([base, failing]),
      grantedCapabilities: { 'acme.base': ['command.execute'] },
      createCommandPort: () => ({
        execute: async () => ({ ok: true as const, value: null, diagnostics: [] }),
      }),
    });

    const result = await manager.activate();
    expect(result.ok).toBe(false);
    expect(log).toEqual(['activate:base', 'deactivate:base']);
    expect(manager.status).toBe('inactive');
    expect(manager.snapshot).toBeUndefined();
    const afterRollback = await capturedPort?.execute({ commandId: 'run', args: null });
    expect(afterRollback?.ok).toBe(false);
    if (afterRollback?.ok === false) {
      expect(afterRollback.diagnostics[0]?.code).toBe('PLUGIN_CORE_SESSION_INVALID');
    }
  });

  it('keeps manager sessions and catalogs isolated', async () => {
    const material = materialManifest();
    const constructor = constructorFor(material);
    const plugin = runtime(
      pluginManifest({
        id: 'acme.material',
        contributions: [{ kind: 'material', type: material.type, tagName: material.tagName }],
      }),
    );
    const first = createBaseScreenPluginManager(
      managerOptions([plugin], new Map([[material.tagName, constructor]])),
    );
    const second = createBaseScreenPluginManager(managerOptions([]));

    await first.activate();
    await second.activate();
    expect(first.snapshot?.materials.has(material.type)).toBe(true);
    expect(second.snapshot?.materials.has(material.type)).toBe(false);
    await first.dispose();
    expect(second.status).toBe('active');
  });
});
