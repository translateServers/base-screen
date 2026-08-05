import { createBaseScreenPluginManager } from '@base-screen/plugin-manager';
import { describe, expect, it } from 'vitest';
import { runPluginManagerConformance } from '../src/plugin-manager.js';

describe('runPluginManagerConformance', () => {
  it('consumes the public Manager API without production reverse dependencies', async () => {
    const result = await runPluginManagerConformance({
      createManager: () =>
        createBaseScreenPluginManager({
          instanceId: 'testing-instance',
          standaloneMaterialTagNames: [],
          plugins: [],
          grantedCapabilities: {},
          registry: { get: () => undefined },
          createCommandPort: undefined,
        }),
    });

    expect(result.scenarios).toEqual(['activate', 'deactivate', 'dispose', 'repeat-dispose']);
  });
});
