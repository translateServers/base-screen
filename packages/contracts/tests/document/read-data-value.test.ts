import { describe, expect, it } from 'vitest';
import {
  readScreenComponentDataBinding,
  readScreenComponentValueRef,
  readScreenDocumentDataSources,
  readScreenVariableRecord,
} from '../../src/document/read-data-value.js';
import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenVariableEntry,
} from '../../src/types/document.js';

/**
 * 读取适配窗口是过渡期唯一知道旧形态的地方：新字段优先、旧形态就地推导等价视图。
 * 它只读——这里同时验证「同一文档两次读取结果一致」与「不改动入参」。
 */

const canvas = { width: 1, height: 1, backgroundColor: '#000000' };

function component(overrides: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id: 'c1',
    type: 'acme.kpi-card',
    name: 'Card',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

function document(overrides: Partial<ScreenDocument> = {}): ScreenDocument {
  return { canvas, components: [], variables: [], blueprint: { rules: [] }, ...overrides };
}

describe('readScreenComponentValueRef', () => {
  it('prefers the dataValue field', () => {
    const value = readScreenComponentValueRef(
      component({ dataSource: null, dataValue: { kind: 'inline', value: 1 } }),
    );
    expect(value).toEqual({ kind: 'inline', value: 1 });
  });

  it('derives an equivalent reference from every old form', () => {
    expect(
      readScreenComponentValueRef(component({ dataSource: { type: 'static', value: { a: 1 } } })),
    ).toEqual({ kind: 'inline', value: { a: 1 } });
    expect(
      readScreenComponentValueRef(
        component({ dataSource: { type: 'variable', variableId: 'tenant' } }),
      ),
    ).toEqual({ kind: 'variable', variableId: 'tenant' });
    expect(
      readScreenComponentValueRef(
        component({
          dataSource: {
            type: 'dataset',
            datasetId: 'orders',
            params: {},
            binding: null,
          },
        }),
      ),
    ).toEqual({ kind: 'data-source-field', dataSourceId: 'data-source-c1', path: [] });
    expect(
      readScreenComponentValueRef(
        component({
          dataSource: {
            type: 'host-resource',
            resourceType: 'xj_metric',
            resourceId: 'cpu',
            params: {},
            binding: null,
          },
        }),
      ),
    ).toEqual({ kind: 'data-source-field', dataSourceId: 'data-source-c1', path: [] });
  });

  it('reads null for a component without a value', () => {
    expect(readScreenComponentValueRef(component())).toBeNull();
  });
});

describe('readScreenComponentDataBinding', () => {
  it('prefers dataBinding and falls back to the old binding', () => {
    expect(
      readScreenComponentDataBinding(component({ dataBinding: { fields: { rows: ['id'] } } })),
    ).toEqual({ fields: { rows: ['id'] } });
    expect(
      readScreenComponentDataBinding(
        component({
          dataSource: {
            type: 'dataset',
            datasetId: 'orders',
            params: {},
            binding: { fields: { rows: ['id'] } },
          },
        }),
      ),
    ).toEqual({ fields: { rows: ['id'] } });
    expect(readScreenComponentDataBinding(component())).toBeNull();
  });
});

describe('readScreenDocumentDataSources', () => {
  it('returns declared instances unchanged when there is nothing to derive', () => {
    const declared = [
      {
        id: 'ds-1',
        name: 'orders',
        source: { kind: 'dataset' as const, datasetId: 'orders' },
        params: {},
      },
    ];
    expect(readScreenDocumentDataSources(document({ dataSources: declared }))).toEqual(declared);
  });

  it('synthesises one instance per old component and old variable', () => {
    const input = document({
      components: [
        component({
          dataSource: {
            type: 'dataset',
            datasetId: 'orders',
            params: {
              limit: { kind: 'literal', value: 5 },
              tenant: { kind: 'variable', variableId: 'tenant' },
            },
            binding: null,
          },
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
          autoUpdate: { intervalSeconds: 20 },
        },
      ],
    });
    const dataSources = readScreenDocumentDataSources(input);
    expect(dataSources).toEqual([
      {
        id: 'data-source-c1',
        name: 'orders',
        source: { kind: 'dataset', datasetId: 'orders' },
        params: {
          limit: { kind: 'inline', value: 5 },
          tenant: { kind: 'variable', variableId: 'tenant' },
        },
      },
      {
        id: 'data-source-tenant',
        name: 'tenant',
        source: { kind: 'host-catalog', sourceId: 'tenant-context' },
        params: {},
        updatePolicy: { mode: 'auto', intervalSeconds: 20 },
      },
    ]);
  });

  it('is deterministic and does not mutate the document', () => {
    const input = document({
      components: [
        component({
          dataSource: { type: 'dataset', datasetId: 'orders', params: {}, binding: null },
        }),
      ],
    });
    const before = JSON.stringify(input);
    const first = readScreenDocumentDataSources(input);
    expect(readScreenDocumentDataSources(input)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('readScreenVariableRecord', () => {
  it('returns a single-form record unchanged', () => {
    const record = {
      id: 'v1',
      name: 'v1',
      initialValue: 0,
      value: { kind: 'inline' as const, value: 0 },
      controlled: false,
    };
    expect(readScreenVariableRecord(record)).toBe(record);
  });

  it('derives records from every old variable form', () => {
    const entries: readonly ScreenVariableEntry[] = [
      { type: 'static', id: 'count', name: 'count', initialValue: 2 },
      {
        type: 'data-source',
        id: 'tenant',
        name: 'tenant',
        initialValue: null,
        sourceId: 'tenant-context',
        controlled: true,
      },
      {
        type: 'url-query',
        id: 'region',
        name: 'region',
        initialValue: null,
        sourceId: 'region-code',
        controlled: false,
        processorId: 'pick-region',
      },
    ];
    expect(readScreenVariableRecord(entries[0]!)).toEqual({
      id: 'count',
      name: 'count',
      initialValue: 2,
      value: { kind: 'inline', value: 2 },
      controlled: false,
    });
    expect(readScreenVariableRecord(entries[1]!)).toEqual({
      id: 'tenant',
      name: 'tenant',
      initialValue: null,
      value: { kind: 'data-source-field', dataSourceId: 'data-source-tenant', path: [] },
      controlled: true,
    });
    expect(readScreenVariableRecord(entries[2]!)).toEqual({
      id: 'region',
      name: 'region',
      initialValue: null,
      value: { kind: 'data-source-field', dataSourceId: 'data-source-region', path: [] },
      controlled: false,
    });
  });
});
