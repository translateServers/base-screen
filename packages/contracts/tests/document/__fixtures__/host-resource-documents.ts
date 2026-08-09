/**
 * Canonical host-resource document fixtures for the Data Runtime Hardening
 * document-contract tests.
 *
 * Fixtures stay outside `src`, use no version labels, and never carry URLs,
 * SQL, headers, tokens, or connection configuration.
 */

const canvas = { width: 1920, height: 1080, backgroundColor: '#000000' };

function component(dataSource: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'host-metric-card',
    type: 'acme.kpi-card',
    name: 'Host Metric Card',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

function document(components: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    canvas,
    components: [...components],
    variables: [],
    blueprint: { rules: [] },
  };
}

/** A valid host resource whose field binding is explicitly `null` (unbound). */
export const nullBindingDocument = document([
  component({
    type: 'host-resource',
    resourceType: 'xj_metric',
    resourceId: 'agent_demo_cpu_usage',
    params: { limit: { kind: 'literal', value: 5 } },
    binding: null,
  }),
]);

/** A valid host resource with a full canonical role-field binding. */
export const fullBindingDocument = document([
  component({
    type: 'host-resource',
    resourceType: 'xj_metric',
    resourceId: 'agent_demo_cpu_usage',
    params: { limit: { kind: 'literal', value: 5 } },
    binding: {
      fields: {
        dimension: ['host_name'],
        measures: ['avg_cpu_usage_percent', 'avg_memory_usage_percent'],
        columns: ['sample_time', 'host_name', 'avg_cpu_usage_percent'],
      },
    },
  }),
]);

/** Invalid: a host resource that omits the required `binding` field. */
export const missingBindingDocument = document([
  component({
    type: 'host-resource',
    resourceType: 'xj_metric',
    resourceId: 'agent_demo_cpu_usage',
    params: { limit: { kind: 'literal', value: 5 } },
  }),
]);

/** Invalid: a host resource using the legacy arbitrary-JSON parameter shape. */
export const legacyArbitraryParamsDocument = document([
  component({
    type: 'host-resource',
    resourceType: 'xj_metric',
    resourceId: 'agent_demo_cpu_usage',
    params: { limit: 5, filter: { status: 'active' } },
    binding: null,
  }),
]);
