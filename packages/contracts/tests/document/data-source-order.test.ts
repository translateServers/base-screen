import { describe, expect, it } from 'vitest';
import {
  diagnoseDataSourceCycles,
  screenDataSourceOrder,
} from '../../src/document/data-source-order.js';
import type { ScreenDataSource, ScreenDocument, ScreenValueRef } from '../../src/types/document.js';

/**
 * `screenDataSourceOrder` / `diagnoseDataSourceCycles` 是拓扑序与成环诊断的唯一实现，
 * 因此这里同时兜住「结果确定」与「报告路径稳定」两件事。
 */

function source(id: string, params: Record<string, ScreenValueRef> = {}): ScreenDataSource {
  return {
    id,
    name: id,
    source: { kind: 'dataset', datasetId: id },
    params,
  };
}

function dependsOn(dataSourceId: string): ScreenValueRef {
  return { kind: 'data-source-field', dataSourceId, path: [] };
}

function document(dataSources: readonly ScreenDataSource[]): ScreenDocument {
  return {
    canvas: { width: 1, height: 1, backgroundColor: '#000000' },
    components: [],
    dataSources,
    variables: [],
    blueprint: { rules: [] },
  };
}

describe('screenDataSourceOrder', () => {
  it('returns an empty order for a document without data sources', () => {
    const withoutDataSources: ScreenDocument = {
      canvas: { width: 1, height: 1, backgroundColor: '#000000' },
      components: [],
      variables: [],
      blueprint: { rules: [] },
    };
    expect(screenDataSourceOrder(document([]))).toEqual([]);
    expect(screenDataSourceOrder(withoutDataSources)).toEqual([]);
  });

  it('orders a dependency chain with dependencies first', () => {
    const document_ = document([
      source('ds-a', { upstream: dependsOn('ds-b') }),
      source('ds-b', { upstream: dependsOn('ds-c') }),
      source('ds-c'),
    ]);
    expect(screenDataSourceOrder(document_)).toEqual(['ds-c', 'ds-b', 'ds-a']);
  });

  it('keeps independent roots in document order', () => {
    const document_ = document([
      source('ds-a'),
      source('ds-b', { upstream: dependsOn('ds-c') }),
      source('ds-c'),
      source('ds-d'),
    ]);
    expect(screenDataSourceOrder(document_)).toEqual(['ds-a', 'ds-c', 'ds-b', 'ds-d']);
  });

  it('is stable across repeated calls', () => {
    const document_ = document([
      source('ds-a', { upstream: dependsOn('ds-b'), filter: dependsOn('ds-c') }),
      source('ds-b'),
      source('ds-c'),
    ]);
    const first = screenDataSourceOrder(document_);
    expect(screenDataSourceOrder(document_)).toEqual(first);
    expect(screenDataSourceOrder(structuredCloneDocument(document_))).toEqual(first);
  });

  it('ignores self references when ordering', () => {
    const document_ = document([source('ds-a', { self: dependsOn('ds-a') })]);
    expect(screenDataSourceOrder(document_)).toEqual(['ds-a']);
  });

  it('omits instances that take part in a cycle', () => {
    const binary = document([
      source('ds-a', { upstream: dependsOn('ds-b') }),
      source('ds-b', { upstream: dependsOn('ds-a') }),
      source('ds-free'),
    ]);
    expect(screenDataSourceOrder(binary)).toEqual(['ds-free']);
  });
});

describe('diagnoseDataSourceCycles', () => {
  it('reports nothing for an acyclic document', () => {
    const document_ = document([source('ds-a', { upstream: dependsOn('ds-b') }), source('ds-b')]);
    expect(diagnoseDataSourceCycles(document_)).toEqual([]);
  });

  it('reports one diagnostic for a binary cycle at the lowest document index', () => {
    const document_ = document([
      source('ds-a', { upstream: dependsOn('ds-b') }),
      source('ds-b', { upstream: dependsOn('ds-a') }),
    ]);
    const cycles = diagnoseDataSourceCycles(document_);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ severity: 'error', code: 'DATA_SOURCE_PARAM_CYCLE' });
    expect(cycles[0]?.path).toEqual(['dataSources', 0, 'params', 'upstream', 'dataSourceId']);
  });

  it('reports one diagnostic per cycle component for a ternary cycle', () => {
    const document_ = document([
      source('ds-free'),
      source('ds-a', { upstream: dependsOn('ds-b') }),
      source('ds-b', { upstream: dependsOn('ds-c') }),
      source('ds-c', { upstream: dependsOn('ds-a') }),
    ]);
    const cycles = diagnoseDataSourceCycles(document_);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.path).toEqual(['dataSources', 1, 'params', 'upstream', 'dataSourceId']);
    expect(cycles[0]?.message).toContain('3');
  });

  it('reports two components when a document has two independent cycles', () => {
    const document_ = document([
      source('ds-a', { upstream: dependsOn('ds-b') }),
      source('ds-b', { upstream: dependsOn('ds-a') }),
      source('ds-c', { upstream: dependsOn('ds-d') }),
      source('ds-d', { upstream: dependsOn('ds-c') }),
    ]);
    const cycles = diagnoseDataSourceCycles(document_);
    expect(cycles.map((cycle) => cycle.path)).toEqual([
      ['dataSources', 0, 'params', 'upstream', 'dataSourceId'],
      ['dataSources', 2, 'params', 'upstream', 'dataSourceId'],
    ]);
  });

  it('keeps the reported path stable when parameters are declared in another order', () => {
    const alpha = document([
      source('ds-a', { zebra: dependsOn('ds-b'), alpha: dependsOn('ds-b') }),
      source('ds-b', { upstream: dependsOn('ds-a') }),
    ]);
    const reordered = document([
      source('ds-a', { alpha: dependsOn('ds-b'), zebra: dependsOn('ds-b') }),
      source('ds-b', { upstream: dependsOn('ds-a') }),
    ]);
    const first = diagnoseDataSourceCycles(alpha);
    expect(diagnoseDataSourceCycles(alpha)).toEqual(first);
    expect(diagnoseDataSourceCycles(reordered)).toEqual(first);
    expect(first[0]?.path).toEqual(['dataSources', 0, 'params', 'alpha', 'dataSourceId']);
  });

  it('does not treat self references as cycles', () => {
    const document_ = document([source('ds-a', { self: dependsOn('ds-a') })]);
    expect(diagnoseDataSourceCycles(document_)).toEqual([]);
  });
});

function structuredCloneDocument(input: ScreenDocument): ScreenDocument {
  return JSON.parse(JSON.stringify(input)) as ScreenDocument;
}
