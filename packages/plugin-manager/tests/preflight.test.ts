import type { BaseScreenPluginManifest, BaseScreenPluginRuntime } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenPluginManager } from '../src/manager.js';

function manifest(overrides: Partial<BaseScreenPluginManifest> = {}): BaseScreenPluginManifest {
  return {
    id: 'acme.plugin',
    dependencies: [],
    capabilities: [],
    contributions: [],
    ...overrides,
  };
}

function runtime(
  manifestValue: BaseScreenPluginManifest,
  activate = () => undefined,
): BaseScreenPluginRuntime {
  return {
    manifest: manifestValue,
    activate,
    deactivate: () => undefined,
    dispose: () => undefined,
  };
}

function manager(plugins: readonly BaseScreenPluginRuntime[], grantedCapabilities = {}) {
  return createBaseScreenPluginManager({
    instanceId: 'preflight',
    standaloneMaterialTagNames: [],
    plugins,
    grantedCapabilities,
    registry: { get: () => undefined },
    createCommandPort: undefined,
  });
}

describe('Plugin Manager preflight', () => {
  it('isolates duplicate plugin identities with first-wins resolution', async () => {
    let calls = 0;
    const first = runtime(manifest({ id: 'acme.duplicate' }), () => {
      calls++;
    });
    const second = runtime(manifest({ id: 'acme.duplicate' }), () => {
      calls++;
    });

    const result = await manager([first, second]).activate();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toBe(1);
    expect(result.value.plugins.list().map((entry) => entry.manifest.id)).toEqual([
      'acme.duplicate',
    ]);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]).toMatchObject({ pluginId: 'acme.duplicate' });
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_IDENTITY_CONFLICT',
      ),
    ).toBe(true);
  });

  it('isolates contribution identities claimed by separate plugins with first-wins resolution', async () => {
    const contribution = {
      kind: 'dataResourceType' as const,
      id: 'dataset',
      name: 'Dataset',
      configSchema: { kind: 'object' as const, properties: {}, required: [] },
    };
    const first = runtime(manifest({ id: 'acme.first', contributions: [contribution] }));
    const second = runtime(
      manifest({
        id: 'acme.second',
        contributions: [{ ...contribution, name: 'Dataset copy' }],
      }),
    );

    const result = await manager([first, second]).activate();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]).toMatchObject({ pluginId: 'acme.second' });
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_CONTRIBUTION_CONFLICT',
      ),
    ).toBe(true);
    expect(result.value.contributions.getResourceType('dataset')?.name).toBe('Dataset');
  });

  it('isolates requested capabilities that the host did not approve', async () => {
    let activated = false;
    const plugin = runtime(manifest({ capabilities: ['command.execute'] }), () => {
      activated = true;
    });

    const result = await manager([plugin]).activate();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(activated).toBe(false);
    expect(result.value.failures).toHaveLength(1);
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_CAPABILITY_UNAUTHORIZED',
      ),
    ).toBe(true);
  });

  it('isolates command contributions that lack matching handlers', async () => {
    const plugin = runtime(
      manifest({
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
    const result = await manager([plugin], { 'acme.plugin': ['command.execute'] }).activate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ),
    ).toBe(true);
  });

  // 命令与蓝图动作共用同一条声明门：哪些 kind 要求把能力写进清单 `capabilities`，由
  // plugin-core 的贡献类型描述符回答。蓝图动作曾经只经授权交集失败关闭、不产诊断，
  // 于是一个引用了未声明能力动作会静默留在清单里却永不执行。
  it('reports a blueprint action whose required capability was never declared', async () => {
    const plugin = runtime(
      manifest({
        capabilities: ['data.process'],
        contributions: [
          {
            kind: 'blueprintAction',
            id: 'acme.plugin.spotlight',
            name: 'Spotlight',
            payloadSchema: { kind: 'object', properties: {}, required: [] },
            requiredCapability: 'blueprint.action.execute',
          },
        ],
      }),
    );
    Object.defineProperty(plugin, 'blueprintActions', {
      value: {
        'acme.plugin.spotlight': () => ({ ok: true as const, value: null, diagnostics: [] }),
      },
    });

    const result = await manager([plugin], { 'acme.plugin': ['data.process'] }).activate();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]).toMatchObject({ pluginId: 'acme.plugin' });
    expect(
      result.value.failures[0]?.diagnostics.some(
        (item) => item.code === 'PLUGIN_CORE_CAPABILITY_UNDECLARED',
      ),
    ).toBe(true);
  });
});
