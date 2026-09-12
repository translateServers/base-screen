import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { prepareCandidates } from '../../src/renderer/renderer-candidates.js';
import { component, createCatalog, document } from './__fixtures__/renderer-test-harness.js';

const emptyCache = { entries: new Map() };

function contributionIndex(options: {
  resourceTypes?: readonly string[];
}): BaseScreenRuntimeContributionIndex {
  const known = new Set(options.resourceTypes ?? []);
  return {
    getResourceType: (resourceType) =>
      known.has(resourceType)
        ? {
            kind: 'dataResourceType',
            id: resourceType,
            name: resourceType,
            configSchema: { kind: 'object', properties: {}, required: [] },
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

describe('renderer candidate contribution gating', () => {
  it('R9 fails closed for host-resource types without an active contribution', () => {
    const hostResource = component('host-1', 0, null, {
      type: 'host-resource',
      resourceType: 'dataset',
      resourceId: 'dataset-1',
      params: {},
      binding: null,
    });

    const unknown = prepareCandidates(
      document([hostResource]),
      createCatalog(),
      'design',
      false,
      contributionIndex({ resourceTypes: [] }),
      {},
      false,
      emptyCache,
    );
    const admitted = prepareCandidates(
      document([hostResource]),
      createCatalog(),
      'design',
      false,
      contributionIndex({ resourceTypes: ['dataset'] }),
      {},
      false,
      emptyCache,
    );
    const ungated = prepareCandidates(
      document([hostResource]),
      createCatalog(),
      'design',
      false,
      undefined,
      {},
      false,
      emptyCache,
    );

    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.diagnostics).toMatchObject([
        {
          severity: 'error',
          code: 'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
          path: ['components', 0, 'dataSource', 'resourceType'],
        },
      ]);
    }
    expect(admitted.ok).toBe(true);
    expect(ungated.ok).toBe(true);
  });
});
