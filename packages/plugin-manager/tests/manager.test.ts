import {
  type BaseScreenMaterialConstructor,
  type BaseScreenPluginActivationContext,
  type BaseScreenPluginDesignSnapshot,
  type BaseScreenPluginManifest,
  type BaseScreenPluginRuntime,
  createBaseScreenMaterialCatalog,
  type PluginCommandPort,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenPluginManager } from '../src/manager.js';
import type { BaseScreenPluginManagerOptions } from '../src/types.js';

function materialManifest(overrides: Record<string, unknown> = {}) {
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

function pluginManifest(
  overrides: Partial<BaseScreenPluginManifest> = {},
): BaseScreenPluginManifest {
  return {
    id: 'acme.plugin',
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

function designSnapshot(componentIds: readonly string[]): BaseScreenPluginDesignSnapshot {
  return {
    document: { canvas: {}, components: [], variables: [], blueprint: {} },
    selectedComponentIds: componentIds,
    focusedComponentId: componentIds[0] ?? null,
  } as unknown as BaseScreenPluginDesignSnapshot;
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
  it('creates an inactive session without querying the registry or running lifecycle hooks', () => {
    let queries = 0;
    let hooks = 0;
    const plugin = runtime(pluginManifest(), {
      activate: () => {
        hooks++;
      },
    });

    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      registry: {
        get: () => {
          queries++;
          return undefined;
        },
      },
    });

    expect(manager.status).toBe('inactive');
    expect(manager.snapshot).toBeUndefined();
    expect(queries).toBe(0);
    expect(hooks).toBe(0);
  });

  it('activates plugins without any command capability when createCommandPort is omitted', async () => {
    const options: Record<string, unknown> = { ...managerOptions([runtime(pluginManifest())]) };
    delete options.createCommandPort;
    const manager = createBaseScreenPluginManager(
      options as unknown as Parameters<typeof createBaseScreenPluginManager>[0],
    );

    const activated = await manager.activate();
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.value.plugins.get('acme.plugin')).toBeDefined();
    await manager.deactivate();
  });

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
        dependencies: [{ id: 'acme.base' }],
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

  it('carries a catalog dataset adapter across the registry boundary into the activated snapshot', async () => {
    const material = materialManifest();
    const datasetAdapter = {
      adapt: () => ({ ok: true as const, value: null, diagnostics: [] }),
    };
    const constructor = constructorFor(material);
    const catalog = createBaseScreenMaterialCatalog([
      { manifest: material, constructor, tabularDataAdapter: datasetAdapter },
    ]);
    expect(catalog.get(material.type)?.tabularDataAdapter).toBe(datasetAdapter);

    const plugin = runtime(
      pluginManifest({
        id: 'acme.material',
        contributions: [{ kind: 'material', type: material.type, tagName: material.tagName }],
      }),
    );
    const manager = createBaseScreenPluginManager(
      managerOptions([plugin], new Map([[material.tagName, constructor]])),
    );

    const activated = await manager.activate();
    expect(activated.ok).toBe(true);
    if (!activated.ok) {
      return;
    }
    expect(activated.value.materials.get(material.type)?.tabularDataAdapter).toBe(datasetAdapter);
    expect(manager.snapshot?.materials.get(material.type)?.tabularDataAdapter).toBe(datasetAdapter);
    await manager.deactivate();
    expect(manager.snapshot).toBeUndefined();
  });

  it('isolates a dependency cycle: failing plugins are recorded without hooks or ports', async () => {
    let hooksCalled = 0;
    let portsCreated = 0;
    const first = runtime(
      pluginManifest({ id: 'acme.first', dependencies: [{ id: 'acme.second' }] }),
      {
        activate: () => {
          hooksCalled++;
        },
      },
    );
    const second = runtime(
      pluginManifest({ id: 'acme.second', dependencies: [{ id: 'acme.first' }] }),
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures.map((failure) => failure.pluginId)).toEqual([
      'acme.first',
      'acme.second',
    ]);
    expect(
      result.value.failures.every((failure) =>
        failure.diagnostics.some((item) => item.code === 'PLUGIN_CORE_DEPENDENCY_CYCLE'),
      ),
    ).toBe(true);
    expect(hooksCalled).toBe(0);
    expect(portsCreated).toBe(0);
    expect(result.value.plugins.list()).toHaveLength(0);
    expect(manager.status).toBe('active');
  });

  it('isolates a failing plugin and keeps successful plugins active with valid ports', async () => {
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(log).toEqual(['activate:base']);
    expect(manager.status).toBe('active');
    expect(result.value.failures).toMatchObject([{ pluginId: 'acme.failing', index: 1 }]);
    expect(result.value.failures[0]?.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    expect(result.value.plugins.list().map((entry) => entry.manifest.id)).toEqual(['acme.base']);
    // base 的会话端口保持有效；失败插件的 JSON 凭据不进入任何快照诊断。
    expect(JSON.stringify(result.value.failures)).not.toContain('canary secret must not escape');
    const executed = await capturedPort?.execute({ commandId: 'run', args: null });
    expect(executed?.ok).toBe(true);

    const deactivated = await manager.deactivate();
    expect(deactivated.ok).toBe(true);
    expect(log).toEqual(['activate:base', 'deactivate:base']);
  });

  it('isolates unknown Blueprint capability contributions', async () => {
    const plugin = runtime(
      pluginManifest({
        id: 'acme.unknown-capability',
        capabilities: ['blueprint.unknown'],
        contributions: [
          {
            kind: 'blueprintCapability',
            id: 'blueprint.unknown',
            name: 'Unknown capability',
          },
        ],
      }),
    );
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: { 'acme.unknown-capability': ['blueprint.unknown'] },
    });

    const activated = await manager.activate();
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.value.failures).toHaveLength(1);
    expect(activated.value.failures[0]).toMatchObject({ pluginId: 'acme.unknown-capability' });
    expect(
      activated.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
      ),
    ).toBe(true);
    expect(activated.value.plugins.list()).toHaveLength(0);
    expect(activated.value.contributions.hasBlueprintCapability('blueprint.unknown')).toBe(false);
  });

  it('accepts the native component visibility Blueprint capability', async () => {
    const plugin = runtime(
      pluginManifest({
        id: 'acme.visibility',
        capabilities: ['blueprint.action.component-visibility'],
        contributions: [
          {
            kind: 'blueprintCapability',
            id: 'blueprint.action.component-visibility',
            name: 'Component visibility',
          },
        ],
      }),
    );
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: {
        'acme.visibility': ['blueprint.action.component-visibility'],
      },
    });

    const activated = await manager.activate();
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(
      activated.value.contributions.hasBlueprintCapability('blueprint.action.component-visibility'),
    ).toBe(true);
  });

  it('publishes query-only runtime contribution authority with its catalogs', async () => {
    const plugin = runtime(
      pluginManifest({
        id: 'acme.runtime',
        capabilities: ['blueprint.value.variable'],
        contributions: [
          {
            kind: 'dataResourceType',
            id: 'dataset',
            name: 'Dataset',
            configSchema: {
              kind: 'object',
              properties: { limit: { kind: 'number' } },
              required: ['limit'],
            },
          },
          {
            kind: 'blueprintCapability',
            id: 'blueprint.value.variable',
            name: 'Blueprint variable',
          },
        ],
      }),
    );
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: { 'acme.runtime': ['blueprint.value.variable'] },
    });

    const activated = await manager.activate();
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.value.plugins.get('acme.runtime')?.contributions).toEqual(
      plugin.manifest.contributions,
    );
    expect(activated.value.contributions.getResourceType('dataset')?.configSchema.required).toEqual(
      ['limit'],
    );
    expect(activated.value.contributions.hasBlueprintCapability('blueprint.value.variable')).toBe(
      true,
    );
    const resourceTypes = activated.value.contributions.listResourceTypes?.();
    expect(resourceTypes?.map((item) => item.id)).toEqual(['dataset']);
    expect(resourceTypes?.[0]?.name).toBe('Dataset');
    expect(Object.isFrozen(resourceTypes)).toBe(true);
    expect('resourceTypes' in activated.value.contributions).toBe(false);
    await manager.deactivate();
    expect(manager.snapshot).toBeUndefined();
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

  it('keeps contribution authorities isolated between manager sessions', async () => {
    const firstPlugin = runtime(
      pluginManifest({
        id: 'acme.first-authority',
        capabilities: ['blueprint.value.variable'],
        contributions: [
          {
            kind: 'blueprintCapability',
            id: 'blueprint.value.variable',
            name: 'Variable',
          },
        ],
      }),
    );
    const first = createBaseScreenPluginManager({
      ...managerOptions([firstPlugin]),
      grantedCapabilities: { 'acme.first-authority': ['blueprint.value.variable'] },
    });
    const second = createBaseScreenPluginManager(managerOptions([]));

    expect((await first.activate()).ok).toBe(true);
    expect((await second.activate()).ok).toBe(true);
    expect(first.snapshot?.contributions.hasBlueprintCapability('blueprint.value.variable')).toBe(
      true,
    );
    expect(second.snapshot?.contributions.hasBlueprintCapability('blueprint.value.variable')).toBe(
      false,
    );
  });

  it('keeps standalone material resolution as a global gate', async () => {
    let hooks = 0;
    const invalid = {
      manifest: {
        id: 'acme.invalid',
        dependencies: [],
        capabilities: [],
        contributions: [],
        extra: true,
      },
      activate: () => {
        hooks++;
      },
      deactivate: () => undefined,
      dispose: () => undefined,
    } as unknown as BaseScreenPluginRuntime;
    const manager = createBaseScreenPluginManager({
      ...managerOptions([invalid]),
      standaloneMaterialTagNames: ['acme-kpi-card'],
      registry: {
        get: () => undefined,
      },
    });

    const result = await manager.activate();

    // 插件清单失败可隔离，但宿主自营物料解析失败是全局门：整体保持未激活。
    expect(result.ok).toBe(false);
    expect(
      result.ok
        ? []
        : result.diagnostics.some((item) => item.path[0] === 'standaloneMaterialTagNames'),
    ).toBe(true);
    expect(hooks).toBe(0);
    expect(manager.snapshot).toBeUndefined();
    expect(manager.status).toBe('inactive');
  });

  it('isolates a plugin whose manifest fails to parse', async () => {
    let hooks = 0;
    const invalid = {
      manifest: {
        id: 'acme.invalid',
        dependencies: [],
        capabilities: [],
        contributions: [],
        extra: true,
      },
      activate: () => {
        hooks++;
      },
      deactivate: () => undefined,
      dispose: () => undefined,
    } as unknown as BaseScreenPluginRuntime;
    const standalone = constructorFor(materialManifest());
    const manager = createBaseScreenPluginManager({
      ...managerOptions([invalid], new Map([['acme-kpi-card', standalone]])),
      standaloneMaterialTagNames: ['acme-kpi-card'],
      registry: {
        get: (tagName) => (tagName === 'acme-kpi-card' ? standalone : undefined),
      },
    });

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]?.index).toBe(0);
    expect(result.value.failures[0]?.diagnostics.length).toBeGreaterThan(0);
    expect(hooks).toBe(0);
    expect(result.value.plugins.list()).toHaveLength(0);
    expect(result.value.materials.list()).toHaveLength(1);
  });

  it('enforces the standalone material limit before registry queries', async () => {
    let queries = 0;
    const manager = createBaseScreenPluginManager({
      ...managerOptions([]),
      standaloneMaterialTagNames: Array.from({ length: 513 }, (_, index) => `acme-card-${index}`),
      registry: {
        get: () => {
          queries++;
          return undefined;
        },
      },
    });

    const result = await manager.activate();

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics.map((item) => item.code)).toContain(
      'PLUGIN_CORE_LIMIT_EXCEEDED',
    );
    expect(queries).toBe(0);
  });

  it('isolates a plugin with missing dependencies before creating a session', async () => {
    let ports = 0;
    let hooks = 0;
    const plugin = runtime(
      pluginManifest({
        id: 'acme.needs-missing',
        capabilities: ['command.execute'],
        dependencies: [{ id: 'acme.missing' }],
      }),
      {
        activate: () => {
          hooks++;
        },
      },
    );
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: { 'acme.needs-missing': ['command.execute'] },
      createCommandPort: () => {
        ports++;
        return { execute: async () => ({ ok: true as const, value: null, diagnostics: [] }) };
      },
    });

    const result = await manager.activate();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]).toMatchObject({ pluginId: 'acme.needs-missing' });
    expect(result.value.failures[0]?.diagnostics.map((item) => item.code)).toContain(
      'PLUGIN_CORE_DEPENDENCY_MISSING',
    );
    expect(ports).toBe(0);
    expect(hooks).toBe(0);
  });

  it('cascades runtime failure to dependents while independent plugins stay active', async () => {
    const log: string[] = [];
    const base = runtime(pluginManifest({ id: 'acme.base' }), {
      activate: () => Promise.reject(new Error('base failed')),
    });
    const dependent = runtime(
      pluginManifest({ id: 'acme.dependent', dependencies: [{ id: 'acme.base' }] }),
      {
        activate: () => {
          log.push('activate:dependent');
        },
      },
    );
    const independent = runtime(pluginManifest({ id: 'acme.independent' }), {
      activate: () => {
        log.push('activate:independent');
      },
    });
    const manager = createBaseScreenPluginManager(managerOptions([base, dependent, independent]));

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(log).toEqual(['activate:independent']);
    expect(result.value.failures.map((failure) => failure.pluginId)).toEqual([
      'acme.base',
      'acme.dependent',
    ]);
    expect(result.value.failures[0]?.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    expect(result.value.failures[1]?.diagnostics[0]?.code).toBe('PLUGIN_CORE_DEPENDENCY_MISSING');
    expect(result.value.plugins.list().map((entry) => entry.manifest.id)).toEqual([
      'acme.independent',
    ]);
  });

  it('publishes an empty catalog snapshot when every plugin fails', async () => {
    const failing = runtime(pluginManifest({ id: 'acme.failing' }), {
      activate: () => {
        throw new Error('boom');
      },
    });
    const isolated = runtime(
      pluginManifest({
        id: 'acme.isolated',
        capabilities: ['blueprint.unknown'],
        contributions: [{ kind: 'blueprintCapability', id: 'blueprint.unknown', name: 'Unknown' }],
      }),
    );
    const manager = createBaseScreenPluginManager({
      ...managerOptions([failing, isolated]),
      grantedCapabilities: { 'acme.isolated': ['blueprint.unknown'] },
    });

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures.map((failure) => failure.pluginId)).toEqual([
      'acme.failing',
      'acme.isolated',
    ]);
    expect(result.value.plugins.list()).toHaveLength(0);
    expect(manager.status).toBe('active');
    expect((await manager.deactivate()).ok).toBe(true);
    expect(manager.snapshot).toBeUndefined();
  });

  it('rejects a tag that resolves to different constructors', async () => {
    const material = materialManifest();
    const first = constructorFor(material);
    const second = constructorFor(material);
    let calls = 0;
    const manager = createBaseScreenPluginManager({
      ...managerOptions([]),
      standaloneMaterialTagNames: [material.tagName, material.tagName],
      registry: {
        get: () => (calls++ === 0 ? first : second),
      },
    });

    const result = await manager.activate();

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics.map((item) => item.code)).toContain(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
    );
  });

  it('freezes the granted capability snapshot supplied to plugin activation', async () => {
    let granted: readonly string[] | undefined;
    const plugin = runtime(
      pluginManifest({ id: 'acme.frozen', capabilities: ['command.execute'] }),
      {
        activate: (context) => {
          granted = context.grantedCapabilities;
        },
      },
    );
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: { 'acme.frozen': ['command.execute'] },
      createCommandPort: () => ({
        execute: async () => ({ ok: true as const, value: null, diagnostics: [] }),
      }),
    });

    expect((await manager.activate()).ok).toBe(true);
    expect(granted).toEqual(['command.execute']);
    expect(Object.isFrozen(granted)).toBe(true);
  });

  it('shares the first dispose operation and releases a runtime once', async () => {
    let disposed = 0;
    const plugin = runtime(pluginManifest({ id: 'acme.dispose-once' }), {
      dispose: async () => {
        disposed++;
      },
    });
    const manager = createBaseScreenPluginManager(managerOptions([plugin]));

    expect((await manager.activate()).ok).toBe(true);
    const first = manager.dispose();
    const second = manager.dispose();

    expect(first).toBe(second);
    expect((await first).ok).toBe(true);
    expect(disposed).toBe(1);
    expect(manager.status).toBe('disposed');
  });

  it('enters failed after deactivate errors while allowing final disposal', async () => {
    let disposed = 0;
    const plugin = runtime(pluginManifest({ id: 'acme.deactivate-fails' }), {
      deactivate: () => Promise.reject(new Error('canary secret must not escape')),
      dispose: () => {
        disposed++;
      },
    });
    const manager = createBaseScreenPluginManager(managerOptions([plugin]));

    expect((await manager.activate()).ok).toBe(true);
    expect((await manager.deactivate()).ok).toBe(false);
    expect(manager.status).toBe('failed');
    expect((await manager.dispose()).ok).toBe(true);
    expect(disposed).toBe(1);
    expect(manager.status).toBe('disposed');
  });

  it('preserves stable ordering across equivalent candidate permutations', async () => {
    const log: string[] = [];
    const alpha = runtime(pluginManifest({ id: 'acme.alpha' }), {
      activate: () => {
        log.push('alpha');
      },
    });
    const beta = runtime(pluginManifest({ id: 'acme.beta' }), {
      activate: () => {
        log.push('beta');
      },
    });
    const first = createBaseScreenPluginManager(managerOptions([beta, alpha]));
    const second = createBaseScreenPluginManager(managerOptions([alpha, beta]));

    const firstResult = await first.activate();
    const secondResult = await second.activate();

    expect(
      firstResult.ok && firstResult.value.plugins.list().map((entry) => entry.manifest.id),
    ).toEqual(['acme.alpha', 'acme.beta']);
    expect(
      secondResult.ok && secondResult.value.plugins.list().map((entry) => entry.manifest.id),
    ).toEqual(['acme.alpha', 'acme.beta']);
    expect(log).toEqual(['alpha', 'beta', 'alpha', 'beta']);
  });

  it('disposes a reactivated runtime only once', async () => {
    let disposed = 0;
    const plugin = runtime(pluginManifest({ id: 'acme.reactivated' }), {
      dispose: () => {
        disposed++;
      },
    });
    const manager = createBaseScreenPluginManager(managerOptions([plugin]));

    expect((await manager.activate()).ok).toBe(true);
    expect((await manager.deactivate()).ok).toBe(true);
    expect((await manager.activate()).ok).toBe(true);
    expect((await manager.dispose()).ok).toBe(true);
    expect(disposed).toBe(1);
  });

  it('dispatches declared contribution commands and invalidates them after deactivate', async () => {
    let calls = 0;
    const plugin = runtime(
      pluginManifest({
        id: 'acme.commands',
        capabilities: ['command.execute'],
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
          },
        ],
      }),
    );
    Object.defineProperty(plugin, 'commands', {
      value: {
        refresh: () => {
          calls++;
          return { ok: true as const, value: { ran: true }, diagnostics: [] };
        },
      },
    });
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: { 'acme.commands': ['command.execute'] },
      createCommandPort: () => ({
        execute: async () => ({ ok: true as const, value: null, diagnostics: [] }),
      }),
    });

    expect((await manager.activate()).ok).toBe(true);
    const executed = await manager.executeContributionCommand({ commandId: 'refresh', args: null });
    expect(executed.ok).toBe(true);
    if (executed.ok) expect(executed.value).toEqual({ ran: true });
    expect(calls).toBe(1);
    expect((await manager.deactivate()).ok).toBe(true);
    const after = await manager.executeContributionCommand({ commandId: 'refresh', args: null });
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    }
  });

  it('isolates command handlers that are not declared as contributions', async () => {
    const plugin = runtime(pluginManifest({ id: 'acme.extra-handler' }));
    Object.defineProperty(plugin, 'commands', {
      value: { extra: () => undefined },
    });
    const activated = await createBaseScreenPluginManager(managerOptions([plugin])).activate();
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.value.failures).toHaveLength(1);
    expect(activated.value.failures[0]?.pluginId).toBe('acme.extra-handler');
    expect(
      activated.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
      ),
    ).toBe(true);
  });

  it('exposes a design read port that stops serving after deactivate', async () => {
    let context: BaseScreenPluginActivationContext | undefined;
    const snapshot = designSnapshot(['title']);
    const plugin = runtime(pluginManifest({ id: 'acme.reader', capabilities: ['design.read'] }), {
      activate: (activation) => {
        context = activation;
      },
    });
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: { 'acme.reader': ['design.read'] },
      createDesignReadPort: () => ({
        read: async () => ({ ok: true as const, value: snapshot, diagnostics: [] }),
      }),
    });

    expect((await manager.activate()).ok).toBe(true);
    expect(context?.designReadPort).toBeDefined();
    const read = await context?.designReadPort?.read();
    expect(read?.ok).toBe(true);
    if (read?.ok) expect(read.value?.selectedComponentIds).toEqual(['title']);

    expect((await manager.deactivate()).ok).toBe(true);
    const stale = await context?.designReadPort?.read();
    expect(stale?.ok).toBe(false);
    if (stale !== undefined && !stale.ok) {
      expect(stale.diagnostics[0]?.code).toBe('PLUGIN_CORE_SESSION_INVALID');
    }
  });

  it('isolates design.read granted without a read port factory', async () => {
    const plugin = runtime(pluginManifest({ id: 'acme.readless', capabilities: ['design.read'] }));
    const activated = await createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      grantedCapabilities: { 'acme.readless': ['design.read'] },
    }).activate();

    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.value.failures).toHaveLength(1);
    expect(activated.value.failures[0]?.pluginId).toBe('acme.readless');
    expect(
      activated.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
      ),
    ).toBe(true);
  });

  it('never builds a read port for plugins without design.read', async () => {
    let builds = 0;
    let context: BaseScreenPluginActivationContext | undefined;
    const plugin = runtime(pluginManifest({ id: 'acme.no-read' }), {
      activate: (activation) => {
        context = activation;
      },
    });
    const manager = createBaseScreenPluginManager({
      ...managerOptions([plugin]),
      createDesignReadPort: () => {
        builds++;
        return {
          read: async () => ({ ok: true as const, value: designSnapshot([]), diagnostics: [] }),
        };
      },
    });

    expect((await manager.activate()).ok).toBe(true);
    expect(builds).toBe(0);
    expect(context?.designReadPort).toBeUndefined();
  });

  it('activates with manager options that omit createDesignReadPort', async () => {
    const plugin = runtime(pluginManifest({ id: 'acme.legacy-options' }));
    const options = managerOptions([plugin]) as BaseScreenPluginManagerOptions;

    expect((await createBaseScreenPluginManager(options).activate()).ok).toBe(true);
  });

  function panelPlugin(pluginId: string, panelId: string, tagName: string) {
    return runtime(
      pluginManifest({
        id: pluginId,
        contributions: [{ kind: 'panel', id: panelId, name: 'Monitor', tagName }],
      }),
    );
  }

  it('resolves declared panels from the host registry into the snapshot', async () => {
    const panelConstructor = class {} as unknown as BaseScreenMaterialConstructor;
    const plugin = panelPlugin('acme.panelist', 'acme.monitor', 'acme-monitor');
    const manager = createBaseScreenPluginManager(
      managerOptions([plugin], new Map([['acme-monitor', panelConstructor]])),
    );

    expect((await manager.activate()).ok).toBe(true);
    const entry = manager.snapshot?.panels.get('acme.monitor');
    expect(entry?.pluginId).toBe('acme.panelist');
    expect(entry?.contribution.tagName).toBe('acme-monitor');
    expect(entry?.constructor).toBe(panelConstructor);
    expect(manager.snapshot?.panels.list()).toHaveLength(1);
  });

  it('isolates a declared panel tag that is not registered', async () => {
    const manager = createBaseScreenPluginManager(
      managerOptions([panelPlugin('acme.panelist', 'acme.monitor', 'acme-monitor')]),
    );

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]?.pluginId).toBe('acme.panelist');
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_IDENTITY_INVALID',
      ),
    ).toBe(true);
    expect(result.value.panels.list()).toHaveLength(0);
  });

  it('isolates a plugin whose panel registry query throws', async () => {
    const manager = createBaseScreenPluginManager({
      ...managerOptions([panelPlugin('acme.panelist', 'acme.monitor', 'acme-monitor')]),
      registry: {
        get: () => {
          throw new Error('registry unavailable');
        },
      },
    });

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]?.pluginId).toBe('acme.panelist');
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_IDENTITY_INVALID',
      ),
    ).toBe(true);
  });

  it('keeps the first panel claim and isolates the conflicting plugin', async () => {
    const shared = class {} as unknown as BaseScreenMaterialConstructor;
    const manager = createBaseScreenPluginManager(
      managerOptions(
        [
          panelPlugin('acme.one', 'acme.monitor', 'acme-monitor'),
          panelPlugin('acme.two', 'acme.gauge', 'acme-monitor'),
        ],
        new Map([['acme-monitor', shared]]),
      ),
    );

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.panels.get('acme.monitor')?.pluginId).toBe('acme.one');
    expect(result.value.panels.list()).toHaveLength(1);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]).toMatchObject({ pluginId: 'acme.two' });
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_IDENTITY_CONFLICT',
      ),
    ).toBe(true);
  });

  function controlPlugin(pluginId: string, controlId: string, tagName: string) {
    return runtime(
      pluginManifest({
        id: pluginId,
        contributions: [{ kind: 'inspectorControl', id: controlId, name: 'Control', tagName }],
      }),
    );
  }

  it('resolves declared inspector controls into the authorized catalog', async () => {
    const controlConstructor = class {} as unknown as BaseScreenMaterialConstructor;
    const manager = createBaseScreenPluginManager(
      managerOptions(
        [controlPlugin('acme.controls', 'acme.wheel', 'acme-wheel')],
        new Map([['acme-wheel', controlConstructor]]),
      ),
    );

    expect((await manager.activate()).ok).toBe(true);
    const byId = manager.snapshot?.inspectorControls.get('acme.wheel');
    expect(byId?.pluginId).toBe('acme.controls');
    expect(manager.snapshot?.inspectorControls.getByTagName('acme-wheel')).toBe(byId);
    expect(manager.snapshot?.inspectorControls.has('acme-wheel')).toBe(true);
    expect(manager.snapshot?.inspectorControls.has('acme-never-registered')).toBe(false);
  });

  it('isolates a declared inspector control tag that is not registered', async () => {
    const manager = createBaseScreenPluginManager(
      managerOptions([controlPlugin('acme.controls', 'acme.wheel', 'acme-wheel')]),
    );

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]?.pluginId).toBe('acme.controls');
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_IDENTITY_INVALID',
      ),
    ).toBe(true);
    expect(result.value.inspectorControls.list()).toHaveLength(0);
  });

  it('keeps the first inspector control claim and isolates the conflicting plugin', async () => {
    const shared = class {} as unknown as BaseScreenMaterialConstructor;
    const manager = createBaseScreenPluginManager(
      managerOptions(
        [
          controlPlugin('acme.one', 'acme.wheel', 'acme-shared'),
          controlPlugin('acme.two', 'acme.dial', 'acme-shared'),
        ],
        new Map([['acme-shared', shared]]),
      ),
    );

    const result = await manager.activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inspectorControls.get('acme.wheel')?.pluginId).toBe('acme.one');
    expect(result.value.inspectorControls.list()).toHaveLength(1);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]).toMatchObject({ pluginId: 'acme.two' });
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_IDENTITY_CONFLICT',
      ),
    ).toBe(true);
  });
});
