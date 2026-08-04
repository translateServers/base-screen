import type { BaseScreenPluginManifest, BaseScreenPluginRuntime } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenPluginManager } from './manager.js';

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
  it('rejects duplicate plugin identities before any lifecycle hook', async () => {
    let calls = 0;
    const first = runtime(manifest({ id: 'acme.duplicate' }), () => {
      calls++;
    });
    const second = runtime(manifest({ id: 'acme.duplicate' }), () => {
      calls++;
    });

    const result = await manager([first, second]).activate();

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics.map((item) => item.code)).toContain(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
    );
    expect(calls).toBe(0);
  });

  it('rejects contribution identities claimed by separate plugins', async () => {
    const first = runtime(
      manifest({
        id: 'acme.first',
        contributions: [
          {
            kind: 'dataResourceType',
            id: 'dataset',
            name: 'Dataset',
            configSchema: { kind: 'object', properties: {}, required: [] },
          },
        ],
      }),
    );
    const second = runtime(
      manifest({
        id: 'acme.second',
        contributions: [
          {
            kind: 'dataResourceType',
            id: 'dataset',
            name: 'Dataset copy',
            configSchema: { kind: 'object', properties: {}, required: [] },
          },
        ],
      }),
    );

    const result = await manager([first, second]).activate();

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics.map((item) => item.code)).toContain(
      'PLUGIN_CORE_CONTRIBUTION_CONFLICT',
    );
  });

  it('rejects requested capabilities that the host did not approve', async () => {
    let activated = false;
    const plugin = runtime(manifest({ capabilities: ['command.execute'] }), () => {
      activated = true;
    });

    const result = await manager([plugin]).activate();

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics.map((item) => item.code)).toContain(
      'PLUGIN_CORE_CAPABILITY_UNAUTHORIZED',
    );
    expect(activated).toBe(false);
  });
});
