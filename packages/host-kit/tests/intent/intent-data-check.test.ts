import type {
  ScreenHostDatasetPort,
  ScreenJsonObject,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  type IntentDataContext,
  intentDatasetQueryKey,
  validateIntentData,
} from '../../src/index.js';

/**
 * ADR-0114 S5：采纳前的样例验证。端口是内存假实现：按参数返回不同结果，记下每次查询。
 */

const CREW_FIELDS = [
  { id: 'crew', label: '班组', valueType: 'string' as const },
  { id: 'oee', label: 'OEE', valueType: 'number' as const },
];

function table(rows: ScreenJsonObject[]): ScreenTabularDataset {
  return { fields: CREW_FIELDS, rows };
}

function port(
  answer: (params: ScreenJsonObject) => ScreenTabularDataset | 'fail' | 'hang',
  queries: ScreenJsonObject[],
): ScreenHostDatasetPort {
  return {
    list: async () => ({ ok: true, value: { items: [] }, diagnostics: [] }),
    describe: async () => ({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'HOST_RESOURCE_UNAVAILABLE', path: [], message: '' },
      ],
    }),
    query: async ({ params }, { signal }) => {
      queries.push(params);
      const value = answer(params);
      if (value === 'fail') throw new Error('boom');
      if (value === 'hang') {
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
        return {
          ok: false,
          diagnostics: [
            { severity: 'error', code: 'HOST_RESOURCE_UNAVAILABLE', path: [], message: '' },
          ],
        };
      }
      return { ok: true, value, diagnostics: [] };
    },
  };
}

function source(id: string, line: string) {
  return {
    id,
    name: `班组绩效 ${line}`,
    source: { kind: 'dataset', datasetId: 'crew' },
    params: { line: { kind: 'inline', value: line }, limit: { kind: 'inline', value: 6 } },
  };
}

function bound(id: string, dataSourceId: string, fields: Record<string, string[]>) {
  return {
    id,
    dataValue: { kind: 'data-source-field', dataSourceId, path: [] },
    dataBinding: { fields },
  };
}

const signal = new AbortController().signal;

describe('validateIntentData', () => {
  it('passes a binding whose fields come back with values', async () => {
    const queries: ScreenJsonObject[] = [];
    const result = await validateIntentData({
      document: {
        components: [
          { id: 'agent-r1-b0-shell' },
          bound('agent-r1-b0-1', 'agent-ds-1', { dimension: ['crew'], measures: ['oee'] }),
        ],
        dataSources: [source('agent-ds-1', 'LINE-B')],
      },
      sources: { 'agent-r1-b0-1': 'regions[1].blocks[0]' },
      port: port(() => table([{ crew: '甲班', oee: 86.5 }]), queries),
      signal,
    });

    expect(result).toEqual({
      issues: [],
      verified: ['班组绩效 LINE-B'],
      unverified: [],
      empty: [],
    });
    expect(queries).toEqual([{ line: 'LINE-B', limit: 6 }]);
  });

  it('reuses the profile sample for the same parameters instead of querying again', async () => {
    const queries: ScreenJsonObject[] = [];
    const context = {
      samples: new Map([
        [
          intentDatasetQueryKey('crew', { limit: 6, line: 'LINE-A' }),
          table([{ crew: '甲班', oee: 1 }]),
        ],
      ]),
    } as unknown as IntentDataContext;
    const result = await validateIntentData({
      document: {
        components: [bound('c', 'agent-ds-1', { dimension: ['crew'], measures: ['oee'] })],
        dataSources: [source('agent-ds-1', 'LINE-A')],
      },
      sources: { c: 'blocks[0]' },
      port: port(() => 'fail', queries),
      context,
      signal,
    });

    expect(queries).toEqual([]);
    expect(result.verified).toEqual(['班组绩效 LINE-A']);
  });

  it('reports absent fields, all-null fields and multi-row KPI cards by model path, but not empty results', async () => {
    const result = await validateIntentData({
      document: {
        components: [
          bound('empty', 'agent-ds-1', { dimension: ['crew'], measures: ['oee'] }),
          bound('absent', 'agent-ds-2', { dimension: ['crew'], measures: ['output'] }),
          bound('blank', 'agent-ds-2', { dimension: ['crew'], measures: ['oee'] }),
          bound('kpi', 'agent-ds-3', { value: ['oee'] }),
        ],
        dataSources: [
          source('agent-ds-1', 'LINE-C'),
          source('agent-ds-2', 'LINE-B'),
          source('agent-ds-3', 'LINE-A'),
        ],
      },
      sources: {
        empty: 'regions[1].blocks[0]',
        absent: 'regions[1].blocks[1]',
        blank: 'regions[2].main[0]',
        kpi: 'regions[0].items[0]',
      },
      port: port((params) => {
        if (params.line === 'LINE-C') return table([]);
        if (params.line === 'LINE-B')
          return table([
            { crew: '甲班', oee: null },
            { crew: '乙班', oee: null },
          ]);
        return table([
          { crew: '甲班', oee: 86.5 },
          { crew: '乙班', oee: 82.1 },
        ]);
      }, []),
      signal,
    });

    // 按用户条件查不到数据不怪模型：不进修复，只记在 empty 里。
    expect(result.empty).toEqual(['班组绩效 LINE-C']);
    expect(result.issues).toEqual([
      { code: 'DATA_FIELD_ABSENT', path: 'regions[1].blocks[1]' },
      { code: 'DATA_FIELD_ALL_NULL', path: 'regions[2].main[0]' },
      { code: 'AGENT_KPI_MULTI_ROW', path: 'regions[0].items[0]' },
    ]);
  });

  it('treats a failing or timed-out query as unverified, not as the model’s fault', async () => {
    const result = await validateIntentData({
      document: {
        components: [
          bound('a', 'agent-ds-1', { dimension: ['crew'], measures: ['oee'] }),
          bound('b', 'agent-ds-2', { dimension: ['crew'], measures: ['oee'] }),
        ],
        dataSources: [source('agent-ds-1', 'LINE-A'), source('agent-ds-2', 'LINE-B')],
      },
      sources: { a: 'blocks[0]', b: 'blocks[1]' },
      port: port((params) => (params.line === 'LINE-A' ? 'fail' : 'hang'), []),
      signal,
      timeoutMs: 20,
    });

    expect(result).toEqual({
      issues: [],
      verified: [],
      unverified: ['班组绩效 LINE-A', '班组绩效 LINE-B'],
      empty: [],
    });
  });

  it('skips data sources nobody binds and those whose parameters read variables', async () => {
    const queries: ScreenJsonObject[] = [];
    const result = await validateIntentData({
      document: {
        components: [bound('a', 'agent-ds-2', { dimension: ['crew'], measures: ['oee'] })],
        dataSources: [
          source('agent-ds-1', 'LINE-A'),
          {
            id: 'agent-ds-2',
            name: '按变量',
            source: { kind: 'dataset', datasetId: 'crew' },
            params: { line: { kind: 'variable', variableId: 'line' } },
          },
        ],
      },
      sources: { a: 'blocks[0]' },
      port: port(() => table([]), queries),
      signal,
    });

    expect(queries).toEqual([]);
    expect(result).toEqual({ issues: [], verified: [], unverified: [], empty: [] });
  });
});
