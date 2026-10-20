import { describe, expect, it } from 'vitest';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

/**
 * 数据源实例的解析规则：形状、id 唯一性、来源分支、刷新策略交叉约束，
 * 以及参数的自引用与跨实例成环（fail-closed，任何一条 error 都不返回文档）。
 */

function instance(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ds-1',
    name: 'orders',
    source: { kind: 'dataset', datasetId: 'orders' },
    params: {},
    ...overrides,
  };
}

describe('data source instance shape', () => {
  it('accepts all four source kinds', () => {
    const result = parse(
      document({
        dataSources: [
          instance(),
          instance({
            id: 'ds-2',
            name: 'metric',
            source: { kind: 'host-resource', resourceType: 'xj_metric', resourceId: 'cpu' },
          }),
          instance({ id: 'ds-3', name: 'region', source: { kind: 'url-query', sourceId: 'r' } }),
          instance({ id: 'ds-4', name: 'tenant', source: { kind: 'host-catalog', sourceId: 't' } }),
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('rejects unknown fields on an instance', () => {
    const result = parse(document({ dataSources: [instance({ extra: true })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(result.diagnostics[0]?.path).toEqual(['dataSources', 0, 'extra']);
    }
  });

  it('rejects a duplicate data source id', () => {
    const result = parse(document({ dataSources: [instance(), instance()] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DATA_SOURCE_ID_DUPLICATE');
      expect(result.diagnostics[0]?.path).toEqual(['dataSources', 1, 'id']);
    }
  });

  it('rejects an unknown source kind and a missing source field', () => {
    const unknownKind = parse(
      document({ dataSources: [instance({ source: { kind: 'sql', query: 'x' } })] }),
    );
    expect(unknownKind.ok).toBe(false);
    if (!unknownKind.ok) {
      expect(unknownKind.diagnostics[0]?.code).toBe('DATA_SOURCE_SOURCE_INVALID');
      expect(unknownKind.diagnostics[0]?.path).toEqual(['dataSources', 0, 'source', 'kind']);
    }
    const missingField = parse(
      document({ dataSources: [instance({ source: { kind: 'dataset' } })] }),
    );
    expect(missingField.ok).toBe(false);
    if (!missingField.ok) {
      expect(missingField.diagnostics[0]?.code).toBe('DATA_SOURCE_SOURCE_INVALID');
      expect(missingField.diagnostics[0]?.path).toEqual(['dataSources', 0, 'source', 'datasetId']);
    }
  });
});

describe('update policy', () => {
  it('accepts auto with an interval and manual without one', () => {
    expect(
      parse(
        document({
          dataSources: [instance({ updatePolicy: { mode: 'auto', intervalSeconds: 30 } })],
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      parse(document({ dataSources: [instance({ updatePolicy: { mode: 'manual' } })] })),
    ).toMatchObject({ ok: true });
  });

  it('rejects auto without an interval', () => {
    const result = parse(document({ dataSources: [instance({ updatePolicy: { mode: 'auto' } })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
    }
  });

  it('rejects an interval on a non-auto mode', () => {
    const result = parse(
      document({ dataSources: [instance({ updatePolicy: { mode: 'once', intervalSeconds: 5 } })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
      expect(result.diagnostics[0]?.path).toEqual([
        'dataSources',
        0,
        'updatePolicy',
        'intervalSeconds',
      ]);
    }
  });

  it('rejects an out-of-range interval', () => {
    for (const intervalSeconds of [0, 86_401, 1.5]) {
      expect(
        parse(
          document({
            dataSources: [instance({ updatePolicy: { mode: 'auto', intervalSeconds } })],
          }),
        ),
      ).toMatchObject({ ok: false });
    }
  });
});

describe('parameter references', () => {
  it('rejects a self reference', () => {
    const result = parse(
      document({
        dataSources: [
          instance({
            params: { upstream: { kind: 'data-source-field', dataSourceId: 'ds-1', path: [] } },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DATA_SOURCE_PARAM_SELF_REFERENCE');
      expect(result.diagnostics[0]?.path).toEqual([
        'dataSources',
        0,
        'params',
        'upstream',
        'dataSourceId',
      ]);
    }
  });

  it('rejects a cross-instance cycle', () => {
    const result = parse(
      document({
        dataSources: [
          instance({
            id: 'ds-a',
            params: { upstream: { kind: 'data-source-field', dataSourceId: 'ds-b', path: [] } },
          }),
          instance({
            id: 'ds-b',
            params: { upstream: { kind: 'data-source-field', dataSourceId: 'ds-a', path: [] } },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DATA_SOURCE_PARAM_CYCLE');
      expect(result.diagnostics[0]?.path).toEqual([
        'dataSources',
        0,
        'params',
        'upstream',
        'dataSourceId',
      ]);
    }
  });

  it('rejects a parameter pointing at a missing target', () => {
    const result = parse(
      document({
        dataSources: [
          instance({
            params: { upstream: { kind: 'data-source-field', dataSourceId: 'ghost', path: [] } },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('VALUE_REF_TARGET_MISSING');
    }
  });

  it('accepts an acyclic dependency between instances referenced by a component', () => {
    const result = parse(
      document({
        components: [
          component({
            dataValue: { kind: 'data-source-field', dataSourceId: 'ds-b', path: ['rows'] },
          }),
        ],
        dataSources: [
          instance(),
          instance({
            id: 'ds-b',
            name: 'derived',
            params: { upstream: { kind: 'data-source-field', dataSourceId: 'ds-1', path: [] } },
          }),
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
  });
});
