import { describe, expect, it } from 'vitest';
import { parseScreenDocument } from '../../src/document/parse.js';
import { migrateScreenDocument } from '../../src/migration/migrate-document.js';
import type { ScreenComponentNode, ScreenDocument } from '../../src/types/document.js';

/**
 * 迁移器是「旧 → 新」的唯一转换路径：映射表逐条可测，语义丢失必须记成 `rejected`
 * 而不是静默丢弃，且迁移产物必须能重新通过 `parseScreenDocument`。
 */

const canvas = { width: 1920, height: 1080, backgroundColor: '#000000' };

function component(dataSource: Record<string, unknown> | null): Record<string, unknown> {
  return {
    id: 'c1',
    type: 'acme.kpi-card',
    name: 'KPI Card',
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

function document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canvas,
    components: [],
    variables: [],
    blueprint: { relations: [] },
    ...overrides,
  };
}

function migrate(input: Record<string, unknown>): ScreenDocument {
  const result = migrateScreenDocument(input);
  if (!result.ok) {
    throw new Error(`migration failed: ${result.diagnostics[0]?.code ?? 'unknown'}`);
  }
  return result.document;
}

function firstComponent(document_: ScreenDocument): ScreenComponentNode {
  const component_ = document_.components[0];
  if (component_ === undefined) throw new Error('expected a component');
  return component_;
}

describe('migrateScreenDocument component values', () => {
  it('maps a static component value to an inline reference', () => {
    const migrated = migrate(
      document({
        components: [
          component({
            type: 'static',
            value: { rows: [] },
            binding: { fields: { rows: ['id'] } },
          }),
        ],
      }),
    );
    const migratedComponent = firstComponent(migrated);
    expect(migratedComponent.dataValue).toEqual({ kind: 'inline', value: { rows: [] } });
    expect(migratedComponent.dataBinding).toEqual({ fields: { rows: ['id'] } });
    expect(migratedComponent.dataSource).toBeNull();
    expect(migrated.dataSources).toEqual([]);
  });

  it('maps a variable component value and records the dropped processorId', () => {
    const result = migrateScreenDocument(
      document({
        components: [
          component({ type: 'variable', variableId: 'tenant', processorId: 'resolve-tenant' }),
        ],
        variables: [{ type: 'static', id: 'tenant', name: 'tenant', initialValue: null }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(firstComponent(result.document).dataValue).toEqual({
      kind: 'variable',
      variableId: 'tenant',
    });
    const rejected = result.decisions.find(
      (decision) => decision.action === 'rejected' && decision.path.includes('processorId'),
    );
    expect(rejected).toMatchObject({ kind: 'component-value', action: 'rejected' });
  });

  it('creates one instance per dataset component and does not merge them', () => {
    const migrated = migrate(
      document({
        components: [
          {
            ...component({
              type: 'dataset',
              datasetId: 'orders',
              params: { limit: { kind: 'literal', value: 5 } },
              binding: null,
            }),
          },
          {
            ...component({
              type: 'dataset',
              datasetId: 'orders',
              params: { limit: { kind: 'literal', value: 5 } },
              binding: null,
            }),
            id: 'c2',
          },
        ],
      }),
    );
    expect(migrated.dataSources).toHaveLength(2);
    expect(migrated.dataSources?.map((instance) => instance.id)).toEqual([
      'data-source-1',
      'data-source-2',
    ]);
    expect(migrated.dataSources?.[0]?.source).toEqual({ kind: 'dataset', datasetId: 'orders' });
    expect(migrated.dataSources?.[0]?.params).toEqual({ limit: { kind: 'inline', value: 5 } });
    expect(migrated.dataSources?.[0]?.name).toBe('orders');
    expect(migrated.components[1]?.dataValue).toEqual({
      kind: 'data-source-field',
      dataSourceId: 'data-source-2',
      path: [],
    });
  });

  it('creates a host resource instance from the host-resource component value', () => {
    const result = migrateScreenDocument(
      document({
        components: [
          component({
            type: 'host-resource',
            resourceType: 'xj_metric',
            resourceId: 'agent_demo_cpu_usage',
            params: { tenant: { kind: 'variable', variableId: 'tenant' } },
            binding: { fields: { measures: ['avg_cpu_usage_percent'] } },
          }),
        ],
        variables: [{ type: 'static', id: 'tenant', name: 'tenant', initialValue: null }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const instance = result.document.dataSources?.[0];
    expect(instance?.source).toEqual({
      kind: 'host-resource',
      resourceType: 'xj_metric',
      resourceId: 'agent_demo_cpu_usage',
    });
    expect(instance?.params).toEqual({ tenant: { kind: 'variable', variableId: 'tenant' } });
    expect(instance?.name).toBe('agent_demo_cpu_usage');
    expect(firstComponent(result.document).dataBinding).toEqual({
      fields: { measures: ['avg_cpu_usage_percent'] },
    });
  });

  it('maps components without a value to a null dataValue', () => {
    const migrated = migrate(document({ components: [component(null)] }));
    expect(firstComponent(migrated).dataValue).toBeNull();
  });
});

describe('migrateScreenDocument variables', () => {
  it('maps a static variable to a controlled-false record with an inline value', () => {
    const result = migrateScreenDocument(
      document({
        variables: [
          { type: 'static', id: 'count', name: 'count', description: 'Count', initialValue: 3 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.variables).toEqual([
      {
        id: 'count',
        name: 'count',
        description: 'Count',
        initialValue: 3,
        value: { kind: 'inline', value: 3 },
        controlled: false,
      },
    ]);
    expect(result.decisions.some((decision) => decision.kind === 'variable')).toBe(true);
  });

  it('moves autoUpdate and processorId from a data source variable to its instance', () => {
    const result = migrateScreenDocument(
      document({
        variables: [
          {
            type: 'data-source',
            id: 'tenant',
            name: 'tenant',
            initialValue: null,
            sourceId: 'tenant-context',
            processorId: 'resolve-tenant',
            controlled: true,
            autoUpdate: { intervalSeconds: 30 },
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.variables).toEqual([
      {
        id: 'tenant',
        name: 'tenant',
        initialValue: null,
        value: { kind: 'data-source-field', dataSourceId: 'data-source-1', path: [] },
        controlled: true,
      },
    ]);
    expect(result.document.dataSources).toEqual([
      {
        id: 'data-source-1',
        name: 'tenant',
        source: { kind: 'host-catalog', sourceId: 'tenant-context' },
        params: {},
        updatePolicy: { mode: 'auto', intervalSeconds: 30 },
        processorId: 'resolve-tenant',
      },
    ]);
    const decision = result.decisions.find(
      (entry) => entry.kind === 'variable' && entry.action === 'mapped',
    );
    expect(decision).toMatchObject({ createdDataSourceId: 'data-source-1' });
  });

  it('maps a url query variable to a url-query instance with a manual policy', () => {
    const migrated = migrate(
      document({
        variables: [
          {
            type: 'url-query',
            id: 'region',
            name: 'region',
            initialValue: null,
            sourceId: 'region-code',
            controlled: false,
          },
        ],
      }),
    );
    expect(migrated.dataSources).toEqual([
      {
        id: 'data-source-1',
        name: 'region',
        source: { kind: 'url-query', sourceId: 'region-code' },
        params: {},
        updatePolicy: { mode: 'manual' },
      },
    ]);
    expect(migrated.variables[0]).toMatchObject({
      value: { kind: 'data-source-field', dataSourceId: 'data-source-1', path: [] },
      controlled: false,
    });
  });
});

describe('migrateScreenDocument decisions and failure', () => {
  it('keeps the migrated document parseable and idempotent', () => {
    const input = document({
      components: [
        component({
          type: 'dataset',
          datasetId: 'orders',
          params: {
            limit: { kind: 'literal', value: 5 },
            tenant: { kind: 'variable', variableId: 'tenant' },
          },
          binding: { fields: { rows: ['id'] } },
        }),
      ],
      variables: [
        {
          type: 'data-source',
          id: 'tenant',
          name: 'tenant',
          initialValue: null,
          sourceId: 'tenant-context',
          controlled: true,
        },
      ],
    });
    const result = migrateScreenDocument(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseScreenDocument(result.document);
    expect(parsed).toMatchObject({ ok: true });
    const again = migrateScreenDocument(result.document);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.document).toEqual(result.document);
    expect(again.decisions).toEqual([]);
    expect(again.diagnostics).toEqual([]);
  });

  it('records every parameter rename as a readable decision', () => {
    const result = migrateScreenDocument(
      document({
        components: [
          component({
            type: 'dataset',
            datasetId: 'orders',
            params: { limit: { kind: 'literal', value: 5 } },
            binding: null,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decision = result.decisions.find((entry) => entry.kind === 'parameter');
    expect(decision).toMatchObject({
      action: 'renamed',
      path: ['components', 0, 'dataSource', 'params', 'limit', 'kind'],
    });
    expect(decision?.detail).not.toHaveLength(0);
  });

  it('returns no partial document when the input is invalid', () => {
    const result = migrateScreenDocument(
      document({ components: [{ ...component(null), unexpected: true }] }),
    );
    expect(result.ok).toBe(false);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns no partial document when the input is not an object', () => {
    const result = migrateScreenDocument(42);
    expect(result).toMatchObject({ ok: false, document: undefined });
    expect(result.decisions).toEqual([]);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe('DOCUMENT_NOT_OBJECT');
  });
});
