import { describe, expect, it } from 'vitest';
import {
  applyIntentOps,
  type CompiledScreenDocument,
  compileScreenIntent,
  createIntentSession,
  editIntent,
  type IntentCatalog,
  type IntentReferences,
  parseIntentBlock,
  parseIntentKpi,
  parseScreenIntent,
} from '../../src/index.js';
import { COMPILE_CATALOG, flatOutput } from './fixtures.js';

/**
 * ADR-0114 S3：显式绑定、参数、候选引用与绑定数据的指标卡。
 * 目录在 `COMPILE_CATALOG` 上补了角色的 `valueTypes`，文本物料带上唯一的 `value` 角色（与真实目录一致）。
 */

const ALL = ['string', 'number', 'boolean', 'date'] as const;

const CATALOG: IntentCatalog = {
  ...COMPILE_CATALOG,
  materials: COMPILE_CATALOG.materials.map((material) => {
    if (material.type === 'base.text') {
      return { ...material, roles: [{ id: 'value', min: 1, max: 1, valueTypes: [...ALL] }] };
    }
    if (material.type === 'base.chart') {
      return {
        ...material,
        roles: [
          { id: 'dimension', min: 1, max: 1, valueTypes: [...ALL] },
          { id: 'measures', min: 1, max: 8, valueTypes: ['number' as const] },
        ],
      };
    }
    return material;
  }),
  candidates: [
    {
      id: 'c1',
      fact: 'categorization',
      datasetId: 'crew',
      type: 'base.chart',
      fields: { dimension: ['crew'], measures: ['oee'] },
    },
  ],
};

const CREW = {
  datasetId: 'crew',
  name: '班组绩效',
  columns: [
    { id: 'crew', type: 'string', label: '班组' },
    { id: 'output', type: 'number', label: '产量' },
    { id: 'oee', type: 'number', label: 'OEE', unit: '%' },
  ],
  parameters: [
    {
      name: 'line',
      required: true,
      valueType: 'string' as const,
      allowedValues: ['LINE-A', 'LINE-B', 'LINE-C'],
    },
    { name: 'limit', required: false, valueType: 'number' as const, defaultValue: 6 },
  ],
  rows: { sampled: 3, total: 3 },
};
const PLANT = {
  datasetId: 'plant',
  name: '全厂指标',
  columns: [{ id: 'oee', type: 'number', label: 'OEE', unit: '%' }],
  rows: { sampled: 1, total: 1 },
};
const REFS: IntentReferences = { assets: [], datasets: [CREW, PLANT] };

function compile(output: Record<string, unknown>) {
  const parsed = parseScreenIntent(output, { catalog: CATALOG });
  if (parsed.intent === undefined) throw new Error(JSON.stringify(parsed.diagnostics));
  const outcome = compileScreenIntent({
    intent: parsed.intent,
    catalog: CATALOG,
    references: REFS,
  });
  if (!outcome.ok) throw new Error(`compile failed: ${outcome.diagnostics[0]?.code}`);
  return { parsed, result: outcome.value };
}

function codes(items: readonly { code: string; path: string }[]): string[] {
  return items
    .filter((item) => item.code !== 'INTENT_SHELL_UNAVAILABLE')
    .map((item) => `${item.code}@${item.path}`);
}

function named(document: CompiledScreenDocument, name: string) {
  return document.components.filter((node) => node.name === name);
}

describe('parse', () => {
  it('reads explicit fields and params on a dataset block', () => {
    const { value } = parseIntentBlock(
      {
        type: 'base.chart',
        title: '班组 OEE',
        datasetId: 'crew',
        fields: { dimension: 'crew', measures: ['oee'] },
        params: { line: 'LINE-B' },
      },
      CATALOG,
      'blocks[0]',
      { grid: true },
    );
    expect(value?.bind).toEqual({
      kind: 'dataset',
      datasetId: 'crew',
      fields: { dimension: ['crew'], measures: ['oee'] },
      params: { line: 'LINE-B' },
    });
  });

  it('rejects a block that gives both a dataset and a sample table', () => {
    const { value, diagnostics } = parseIntentBlock(
      {
        type: 'base.chart',
        title: '班组',
        datasetId: 'crew',
        table: { columns: [{ id: 'a', label: 'a', type: 'number' }], rows: [{ a: 1 }] },
      },
      CATALOG,
      'blocks[0]',
      { grid: true },
    );
    expect(value).toBeUndefined();
    expect(diagnostics.map((item) => `${item.severity}:${item.code}`)).toEqual([
      'error:AGENT_BIND_CONFLICT',
    ]);
  });

  it('expands a candidate reference and rejects an unknown one', () => {
    const expanded = parseIntentBlock(
      { candidate: 'c1', title: '班组 OEE', params: { line: 'LINE-A' } },
      CATALOG,
      'blocks[0]',
      { grid: true },
    );
    expect(expanded.value).toMatchObject({
      type: 'base.chart',
      candidate: 'c1',
      bind: {
        kind: 'dataset',
        datasetId: 'crew',
        fields: { dimension: ['crew'], measures: ['oee'] },
        params: { line: 'LINE-A' },
      },
    });

    const unknown = parseIntentBlock({ candidate: 'c9', title: 'x' }, CATALOG, 'blocks[1]', {
      grid: true,
    });
    expect(unknown.value).toBeUndefined();
    expect(unknown.diagnostics[0]?.code).toBe('AGENT_CANDIDATE_UNKNOWN');
  });

  it('reads a bound KPI and rejects one that also gives a literal value', () => {
    const bound = parseIntentKpi(
      { label: 'OEE', bind: { datasetId: 'plant', field: 'oee' }, precision: 1 },
      'kpis[0]',
    );
    expect(bound.value).toEqual({
      label: 'OEE',
      value: null,
      bind: { datasetId: 'plant', field: 'oee' },
      origin: 'kpis[0]',
    });
    expect(bound.diagnostics.map((item) => item.code)).toEqual(['AGENT_KPI_PRECISION_IGNORED']);

    const conflict = parseIntentKpi(
      { label: 'OEE', value: 84, bind: { datasetId: 'plant', field: 'oee' } },
      'kpis[1]',
    );
    expect(conflict.value).toBeUndefined();
    expect(conflict.diagnostics[0]?.code).toBe('AGENT_BIND_CONFLICT');
  });
});

describe('compile', () => {
  it('compiles an explicit binding and the given parameters', () => {
    const { result } = compile(
      flatOutput([
        {
          type: 'base.chart',
          title: '班组产量',
          span: 4,
          datasetId: 'crew',
          fields: { dimension: ['crew'], measures: ['output'] },
          params: { line: 'LINE-B' },
        },
      ]),
    );
    const chart = result.document.components.find((node) => node.type === 'base.chart');
    expect(chart?.dataBinding).toEqual({ fields: { dimension: ['crew'], measures: ['output'] } });
    expect(result.document.dataSources).toEqual([
      {
        id: 'agent-ds-1',
        name: '班组绩效',
        source: { kind: 'dataset', datasetId: 'crew' },
        params: {
          line: { kind: 'inline', value: 'LINE-B' },
          limit: { kind: 'inline', value: 6 },
        },
      },
    ]);
  });

  it('skips blocks that fail the field gate or give a parameter value that is not allowed', () => {
    const { result } = compile(
      flatOutput([
        {
          type: 'base.chart',
          title: '甲',
          span: 1,
          datasetId: 'crew',
          fields: { dimension: ['crew'], measures: ['nope'] },
          params: { line: 'LINE-A' },
        },
        {
          type: 'base.chart',
          title: '乙',
          span: 1,
          datasetId: 'crew',
          fields: { dimension: ['crew'], measures: ['crew'] },
          params: { line: 'LINE-A' },
        },
        { type: 'base.chart', title: '丙', span: 1, datasetId: 'crew', params: { line: 'LINE-Z' } },
        { type: 'base.chart', title: '丁', span: 1, datasetId: 'crew' },
      ]),
    );
    expect(codes(result.warnings)).toEqual([
      'AGENT_BINDING_FIELD_UNKNOWN@blocks[0]',
      'AGENT_BINDING_TYPE_MISMATCH@blocks[1]',
      'AGENT_DATASET_PARAM_INVALID@blocks[2]',
      'AGENT_DATASET_PARAM_REQUIRED@blocks[3]',
    ]);
    expect(result.document.components.some((node) => node.type === 'base.chart')).toBe(false);
    expect(result.document.dataSources ?? []).toEqual([]);
  });

  it('binds a KPI card to a single-row dataset field, with the unit in its label', () => {
    const { result } = compile({
      title: '全厂',
      subtitle: '今日',
      kpis: [{ label: 'OEE', bind: { datasetId: 'plant', field: 'oee' } }],
      blocks: [{ type: 'base.text', title: '要点', span: 4, text: '甲' }],
    });
    expect(named(result.document, '指标名')[0]?.dataValue).toEqual({
      kind: 'inline',
      value: 'OEE（%）',
    });
    const value = named(result.document, '指标值')[0];
    expect(value?.dataValue).toEqual({
      kind: 'data-source-field',
      dataSourceId: 'agent-ds-1',
      path: [],
    });
    expect(value?.dataBinding).toEqual({ fields: { value: ['oee'] } });
    expect(named(result.document, '同比')).toEqual([]);
    expect(codes(result.warnings)).toEqual([]);
  });

  it('draws a placeholder instead of binding a KPI card to a multi-row result', () => {
    const { result } = compile({
      title: '班组',
      subtitle: '今日',
      kpis: [
        { label: 'OEE', bind: { datasetId: 'crew', field: 'oee', params: { line: 'LINE-A' } } },
      ],
      blocks: [{ type: 'base.text', title: '要点', span: 4, text: '甲' }],
    });
    expect(codes(result.warnings)).toEqual(['AGENT_KPI_MULTI_ROW@kpis[0]']);
    // 占位卡：数值是「待接入」占位文字，不是数据源引用，也不带示例标记。
    expect(named(result.document, '指标值')[0]?.dataValue).toMatchObject({ kind: 'inline' });
    expect(named(result.document, '指标值')[0]?.dataValue).not.toHaveProperty('sample');
    expect(result.document.dataSources ?? []).toEqual([]);
  });
});

describe('rebind (ADR-0114 D9)', () => {
  const base = () => {
    const parsed = parseScreenIntent(
      flatOutput([
        {
          type: 'base.chart',
          title: '订单',
          span: 4,
          table: {
            columns: [
              { id: 'day', label: '日期', type: 'string' },
              { id: 'n', label: '量', type: 'number' },
            ],
            rows: [
              { day: '1', n: 1 },
              { day: '2', n: 2 },
              { day: '3', n: 3 },
            ],
          },
        },
      ]),
      { catalog: CATALOG },
    );
    if (parsed.intent === undefined) throw new Error('fixture');
    return parsed.intent;
  };

  it('rebinds a block to a candidate and a KPI to a field, keeping title, span and identity', () => {
    const outcome = applyIntentOps(
      base(),
      [
        {
          op: 'rebind',
          target: 'blocks[0]',
          bind: { candidate: 'c1', params: { line: 'LINE-A' } },
        },
        { op: 'rebind', target: 'kpis[0]', bind: { datasetId: 'plant', field: 'oee' } },
      ],
      CATALOG,
    );
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
    const grid = outcome.intent.regions.find((region) => region.kind === 'grid');
    const band = outcome.intent.regions.find((region) => region.kind === 'band');
    const block = grid?.kind === 'grid' ? grid.blocks[0] : undefined;
    const kpi = band?.kind === 'band' ? band.items[0] : undefined;

    expect(block).toMatchObject({
      title: '订单',
      span: 4,
      candidate: 'c1',
      ident: 'blocks[0]',
      bind: {
        kind: 'dataset',
        datasetId: 'crew',
        fields: { dimension: ['crew'], measures: ['oee'] },
        params: { line: 'LINE-A' },
      },
    });
    expect(kpi).toMatchObject({
      label: '总量',
      value: null,
      ident: 'kpis[0]',
      bind: { datasetId: 'plant', field: 'oee' },
    });

    // 绑过数据的项再做别的修改，绑定原样保留（会话里来回改不丢字段与参数）。
    const again = applyIntentOps(
      outcome.intent,
      [
        { op: 'change', target: 'blocks[0]', set: { title: '班组 OEE' } },
        { op: 'change', target: 'kpis[0]', set: { label: '全厂 OEE' } },
      ],
      CATALOG,
    );
    if (!again.ok) throw new Error(JSON.stringify(again.diagnostics));
    const grid2 = again.intent.regions.find((region) => region.kind === 'grid');
    const band2 = again.intent.regions.find((region) => region.kind === 'band');
    expect(grid2?.kind === 'grid' ? grid2.blocks[0]?.bind : undefined).toEqual(block?.bind);
    expect(band2?.kind === 'band' ? band2.items[0]?.bind : undefined).toEqual(kpi?.bind);
  });

  it('rejects a rebind to an unknown candidate or one without a bind', () => {
    const unknown = applyIntentOps(
      base(),
      [{ op: 'rebind', target: 'blocks[0]', bind: { candidate: 'c9' } }],
      CATALOG,
    );
    expect(unknown.ok).toBe(false);
    const malformed = applyIntentOps(base(), [{ op: 'rebind', target: 'blocks[0]' }], CATALOG);
    expect(malformed.ok).toBe(false);
  });
});

describe('rebind through a session', () => {
  it('turns a sample-data chart into a dataset-bound one and brings the data source along', () => {
    const parsed = parseScreenIntent(
      flatOutput([
        {
          type: 'base.chart',
          title: '订单',
          span: 4,
          table: {
            columns: [
              { id: 'day', label: '日期', type: 'string' },
              { id: 'n', label: '量', type: 'number' },
            ],
            rows: [
              { day: '1', n: 1 },
              { day: '2', n: 2 },
              { day: '3', n: 3 },
            ],
          },
        },
      ]),
      { catalog: CATALOG },
    );
    if (parsed.intent === undefined) throw new Error('fixture');
    const compiled = compileScreenIntent({
      intent: parsed.intent,
      catalog: CATALOG,
      references: REFS,
    });
    if (!compiled.ok) throw new Error('compile');
    const session = createIntentSession({
      intent: parsed.intent,
      compiled: compiled.value,
      catalog: CATALOG,
      references: REFS,
      mode: 'llm',
    });
    const other = {
      id: 'agent-ds-1',
      name: '别的',
      source: { kind: 'dataset', datasetId: 'x' },
      params: {},
    };
    const edited = editIntent(
      session,
      [
        {
          op: 'rebind',
          target: 'blocks[0]',
          bind: { candidate: 'c1', params: { line: 'LINE-A' } },
        },
      ],
      {
        canvas: compiled.value.document.canvas as never,
        components: compiled.value.document.components as never,
        dataSources: [other],
      },
    );
    if (!edited.ok) throw new Error(JSON.stringify(edited.diagnostics));

    const replaced = edited.commands.find((command) => command.type === 'replace-data-sources');
    expect(replaced).toEqual({
      type: 'replace-data-sources',
      dataSources: [
        other,
        {
          id: 'agent-ds-1-e2',
          name: '班组绩效',
          source: { kind: 'dataset', datasetId: 'crew' },
          params: {
            line: { kind: 'inline', value: 'LINE-A' },
            limit: { kind: 'inline', value: 6 },
          },
        },
      ],
    });
    const update = edited.commands.find(
      (command) =>
        command.type === 'update-components' &&
        JSON.stringify(command).includes('data-source-field'),
    );
    expect(JSON.stringify(update)).toContain('agent-ds-1-e2');
  });
});
