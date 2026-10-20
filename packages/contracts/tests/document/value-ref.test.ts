import { describe, expect, it } from 'vitest';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

/**
 * `ScreenValueRef` 的形状判定：三种 kind 的正例、越界 kind/危险路径/空 id 的反例，
 * 以及「同一位置只能有一个写入口」的互斥规则。
 */

const staticVariable = { type: 'static', id: 'tenant', name: 'tenant', initialValue: null };

describe('ScreenValueRef shape', () => {
  it('accepts all three kinds on a component dataValue', () => {
    const inline = parse(
      document({ components: [component({ dataValue: { kind: 'inline', value: { a: 1 } } })] }),
    );
    expect(inline).toMatchObject({ ok: true });

    const variable = parse(
      document({
        components: [component({ dataValue: { kind: 'variable', variableId: 'tenant' } })],
        variables: [staticVariable],
      }),
    );
    expect(variable).toMatchObject({ ok: true });

    const field = parse(
      document({
        components: [
          component({
            dataValue: { kind: 'data-source-field', dataSourceId: 'ds-1', path: ['rows', 'total'] },
          }),
        ],
        dataSources: [
          {
            id: 'ds-1',
            name: 'orders',
            source: { kind: 'dataset', datasetId: 'orders' },
            params: {},
          },
        ],
      }),
    );
    expect(field).toMatchObject({ ok: true });
  });

  it('accepts a null dataValue as “takes no value”', () => {
    expect(parse(document({ components: [component({ dataValue: null })] }))).toMatchObject({
      ok: true,
    });
  });

  it('accepts all three kinds inside data source params', () => {
    const result = parse(
      document({
        variables: [staticVariable],
        dataSources: [
          {
            id: 'ds-source',
            name: 'source',
            source: { kind: 'host-catalog', sourceId: 'tenant-context' },
            params: {},
          },
          {
            id: 'ds-1',
            name: 'orders',
            source: { kind: 'dataset', datasetId: 'orders' },
            params: {
              limit: { kind: 'inline', value: 5 },
              tenant: { kind: 'variable', variableId: 'tenant' },
              upstream: { kind: 'data-source-field', dataSourceId: 'ds-source', path: [] },
            },
          },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('rejects an unknown kind', () => {
    const result = parse(
      document({ components: [component({ dataValue: { kind: 'expression', value: 1 } })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_VALUE_REF_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'dataValue', 'kind']);
    }
  });

  it('rejects an inline reference without a value', () => {
    const result = parse(document({ components: [component({ dataValue: { kind: 'inline' } })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_VALUE_REF_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'dataValue', 'value']);
    }
  });

  it('rejects a non-object value reference', () => {
    const result = parse(document({ components: [component({ dataValue: 5 })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_VALUE_REF_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'dataValue']);
    }
  });

  it('rejects prototype-polluting path segments', () => {
    for (const segment of ['__proto__', 'prototype', 'constructor']) {
      const result = parse(
        document({
          dataSources: [
            {
              id: 'ds-1',
              name: 'orders',
              source: { kind: 'dataset', datasetId: 'orders' },
              params: {
                filter: { kind: 'data-source-field', dataSourceId: 'ds-1', path: [segment] },
              },
            },
          ],
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('DOCUMENT_VALUE_REF_INVALID');
        expect(result.diagnostics[0]?.path).toEqual([
          'dataSources',
          0,
          'params',
          'filter',
          'path',
          0,
        ]);
      }
    }
  });

  it('rejects empty or non-identifier reference ids', () => {
    const emptyId = parse(
      document({
        components: [
          component({ dataValue: { kind: 'data-source-field', dataSourceId: '', path: [] } }),
        ],
      }),
    );
    expect(emptyId.ok).toBe(false);
    if (!emptyId.ok) {
      expect(emptyId.diagnostics[0]?.code).toBe('DOCUMENT_VALUE_REF_INVALID');
      expect(emptyId.diagnostics[0]?.path).toEqual(['components', 0, 'dataValue', 'dataSourceId']);
    }
    const badVariableId = parse(
      document({
        components: [component({ dataValue: { kind: 'variable', variableId: 'bad id' } })],
      }),
    );
    expect(badVariableId.ok).toBe(false);
    if (!badVariableId.ok) {
      expect(badVariableId.diagnostics[0]?.path).toEqual([
        'components',
        0,
        'dataValue',
        'variableId',
      ]);
    }
  });

  it('rejects unknown fields inside a value reference', () => {
    const result = parse(
      document({
        components: [component({ dataValue: { kind: 'inline', value: 1, extra: true } })],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'dataValue', 'extra']);
    }
  });

  it('rejects a component that declares dataSource together with dataValue', () => {
    const result = parse(
      document({
        components: [
          component({
            dataSource: { type: 'static', value: 1 },
            dataValue: { kind: 'inline', value: 2 },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'dataValue']);
    }
  });

  it('reports a missing reference target', () => {
    const missingVariable = parse(
      document({
        components: [component({ dataValue: { kind: 'variable', variableId: 'ghost' } })],
      }),
    );
    expect(missingVariable.ok).toBe(false);
    if (!missingVariable.ok) {
      expect(missingVariable.diagnostics[0]?.code).toBe('VALUE_REF_TARGET_MISSING');
      expect(missingVariable.diagnostics[0]?.path).toEqual([
        'components',
        0,
        'dataValue',
        'variableId',
      ]);
    }
    const missingDataSource = parse(
      document({
        components: [
          component({ dataValue: { kind: 'data-source-field', dataSourceId: 'ghost', path: [] } }),
        ],
      }),
    );
    expect(missingDataSource.ok).toBe(false);
    if (!missingDataSource.ok) {
      expect(missingDataSource.diagnostics[0]?.code).toBe('VALUE_REF_TARGET_MISSING');
      expect(missingDataSource.diagnostics[0]?.path).toEqual([
        'components',
        0,
        'dataValue',
        'dataSourceId',
      ]);
    }
  });
});

describe('variable value reference', () => {
  it('accepts inline and data source field values', () => {
    const inline = parse(
      document({
        variables: [
          {
            id: 'tenant',
            name: 'tenant',
            initialValue: null,
            value: { kind: 'inline', value: 'a' },
            controlled: false,
          },
        ],
      }),
    );
    expect(inline).toMatchObject({ ok: true });
    const field = parse(
      document({
        dataSources: [
          {
            id: 'ds-1',
            name: 'orders',
            source: { kind: 'dataset', datasetId: 'orders' },
            params: {},
          },
        ],
        variables: [
          {
            id: 'total',
            name: 'total',
            initialValue: 0,
            value: { kind: 'data-source-field', dataSourceId: 'ds-1', path: ['rows', 'total'] },
            controlled: true,
          },
        ],
      }),
    );
    expect(field).toMatchObject({ ok: true });
  });

  it('rejects a variable aliasing another variable', () => {
    const result = parse(
      document({
        variables: [
          staticVariable,
          {
            id: 'alias',
            name: 'alias',
            initialValue: null,
            value: { kind: 'variable', variableId: 'tenant' },
            controlled: false,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('VARIABLE_VALUE_REF_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['variables', 1, 'value']);
    }
  });

  it('rejects a malformed variable record', () => {
    const missingValue = parse(
      document({ variables: [{ id: 'v1', name: 'v1', initialValue: 0, controlled: false }] }),
    );
    expect(missingValue.ok).toBe(false);
    if (!missingValue.ok) {
      expect(missingValue.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
      expect(missingValue.diagnostics[0]?.path).toEqual(['variables', 0, 'value']);
    }
    const unknownField = parse(
      document({
        variables: [
          {
            id: 'v1',
            name: 'v1',
            initialValue: 0,
            value: { kind: 'inline', value: 0 },
            controlled: false,
            extra: true,
          },
        ],
      }),
    );
    expect(unknownField.ok).toBe(false);
    if (!unknownField.ok) {
      expect(unknownField.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(unknownField.diagnostics[0]?.path).toEqual(['variables', 0, 'extra']);
    }
  });
});
