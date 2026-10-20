import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { prepareCandidates } from '../../src/renderer/renderer-candidates.js';
import { DataSourceRuntime } from '../../src/resource/data-source-runtime.js';
import { SourceQueryPort } from '../../src/resource/source-query-port.js';
import { component, createCatalog, document } from './__fixtures__/renderer-test-harness.js';

const emptyCache = { entries: new Map() };

function runtime(): DataSourceRuntime {
  return new DataSourceRuntime({
    sourcePort: new SourceQueryPort(undefined, undefined, undefined),
    coordinator: undefined,
    isSuspended: () => false,
    createExecutionContext: () => ({
      instanceId: 'test',
      mode: 'viewer',
      trigger: 'manual',
      traceId: '',
    }),
    emit: () => {},
    onChanged: () => {},
  });
}

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
    const prepared = (index: BaseScreenRuntimeContributionIndex | undefined) => {
      const dataSources = runtime();
      dataSources.ensure(document([hostResource]), {}, { trigger: 'manual', traceId: '' });
      return prepareCandidates(
        document([hostResource]),
        createCatalog(),
        'design',
        false,
        index,
        dataSources,
        emptyCache,
      );
    };

    const unknown = prepared(contributionIndex({ resourceTypes: [] }));
    const admitted = prepared(contributionIndex({ resourceTypes: ['dataset'] }));
    const ungated = prepared(undefined);

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
