import { describe, expect, it } from 'vitest';
import {
  type CompiledComponent,
  type CompiledScreenDocument,
  compileScreenIntent,
  type IntentReferences,
} from '../../src/index.js';
import { COMPILE_CATALOG, flatOutput, intentOf } from './fixtures.js';

/**
 * ADR-0114 S1：引用数据集的参数与实例共享。
 *
 * 运行时缺参数会回落 `defaultValue`；必填又没有默认值时整次查询失败。所以编译器显式写默认值，
 * 缺必填参数的块不编出实例，同一数据集 + 同一组参数只建一个实例。
 */

const ORDERS = {
  datasetId: 'orders',
  name: '订单',
  columns: [
    { id: 'day', type: 'string' },
    { id: 'amount', type: 'number' },
  ],
} as const;

function refs(...datasets: IntentReferences['datasets'][number][]): IntentReferences {
  return { assets: [], datasets };
}

function compile(blocks: readonly Record<string, unknown>[], references: IntentReferences) {
  const outcome = compileScreenIntent({
    intent: intentOf(flatOutput(blocks)),
    catalog: COMPILE_CATALOG,
    references,
  });
  if (!outcome.ok) throw new Error(`compile failed: ${outcome.diagnostics[0]?.code}`);
  return outcome.value;
}

function charts(document: CompiledScreenDocument): readonly CompiledComponent[] {
  return document.components.filter((node) => node.type === 'base.chart');
}

describe('referenced dataset parameters', () => {
  it('writes declared defaults into the data source instance', () => {
    const result = compile(
      [{ type: 'base.chart', title: '订单', span: 4, datasetId: 'orders' }],
      refs({
        ...ORDERS,
        parameters: [
          { name: 'line', required: true, defaultValue: 'LINE-A', allowedValues: ['LINE-A'] },
          { name: 'limit', required: false, defaultValue: 48 },
          { name: 'level', required: false },
        ],
      }),
    );

    expect(result.document.dataSources).toEqual([
      {
        id: 'agent-ds-1',
        name: '订单',
        source: { kind: 'dataset', datasetId: 'orders' },
        params: {
          line: { kind: 'inline', value: 'LINE-A' },
          limit: { kind: 'inline', value: 48 },
        },
      },
    ]);
    expect(result.warnings.some((item) => item.code === 'AGENT_DATASET_PARAM_REQUIRED')).toBe(
      false,
    );
  });

  it('skips the block instead of compiling an instance that must fail at runtime', () => {
    const result = compile(
      [
        { type: 'base.chart', title: '订单', span: 2, datasetId: 'orders' },
        { type: 'base.text', title: '要点', span: 2, text: '甲' },
      ],
      refs({
        ...ORDERS,
        parameters: [
          {
            name: 'line',
            required: true,
            allowedValues: ['LINE-A', 'LINE-B', 'LINE-C'],
          },
        ],
      }),
    );

    expect(result.document.dataSources ?? []).toEqual([]);
    expect(charts(result.document)).toEqual([]);
    expect(result.document.components.some((node) => node.name === '订单')).toBe(false);
    expect(result.document.components.some((node) => node.name === '要点')).toBe(true);
    const missing = result.warnings.filter((item) => item.code === 'AGENT_DATASET_PARAM_REQUIRED');
    expect(missing).toEqual([
      expect.objectContaining({
        severity: 'warning',
        path: 'blocks[0]',
        detail: {
          datasetId: 'orders',
          dataset: '订单',
          params: 'line',
          allowed: 'LINE-A / LINE-B / LINE-C',
        },
      }),
    ]);
  });

  it('keeps the parameterless behaviour when the host sends no parameter definitions', () => {
    const result = compile(
      [{ type: 'base.chart', title: '订单', span: 4, datasetId: 'orders' }],
      refs(ORDERS),
    );

    expect(result.document.dataSources).toEqual([
      {
        id: 'agent-ds-1',
        name: '订单',
        source: { kind: 'dataset', datasetId: 'orders' },
        params: {},
      },
    ]);
  });

  it('shares one instance between blocks that read the same dataset with the same parameters', () => {
    const result = compile(
      [
        { type: 'base.chart', title: '订单趋势', span: 2, datasetId: 'orders' },
        { type: 'base.chart', title: '订单构成', span: 2, datasetId: 'orders' },
      ],
      refs({ ...ORDERS, parameters: [{ name: 'limit', required: false, defaultValue: 10 }] }),
    );

    expect(result.document.dataSources).toHaveLength(1);
    const bound = charts(result.document).map((node) => node.dataValue);
    expect(bound).toEqual([
      { kind: 'data-source-field', dataSourceId: 'agent-ds-1', path: [] },
      { kind: 'data-source-field', dataSourceId: 'agent-ds-1', path: [] },
    ]);
  });
});
