import type { ScreenDatasetDefinition, ScreenTabularDataset } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  enumerateScreenDataCandidates,
  profileScreenDataset,
  type ScreenCandidateMaterial,
} from '../../src/index.js';

/**
 * ADR-0114 S2：字段画像与候选枚举。夹具按示例后端 `monitor.*` 的四种形状：
 * 已汇总的班组（crew）、明细事件（alarms）、按时间汇总的序列、单行指标；另加编号列与全空列。
 */

const CHART: ScreenCandidateMaterial = {
  type: 'base.chart',
  name: '图表',
  roles: [
    {
      id: 'dimension',
      minFields: 1,
      maxFields: 1,
      valueTypes: ['string', 'number', 'boolean', 'date'],
    },
    { id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] },
  ],
};
const TABLE: ScreenCandidateMaterial = {
  type: 'base.table',
  name: '表格',
  roles: [
    {
      id: 'columns',
      minFields: 1,
      maxFields: 256,
      valueTypes: ['string', 'number', 'boolean', 'date'],
    },
  ],
};
const TEXT: ScreenCandidateMaterial = {
  type: 'base.text',
  name: '文本',
  roles: [
    {
      id: 'value',
      minFields: 1,
      maxFields: 1,
      valueTypes: ['string', 'number', 'boolean', 'date'],
    },
  ],
};
const MATERIALS = [CHART, TABLE, TEXT];

function definition(
  fields: ScreenDatasetDefinition['fields'],
  extra: Partial<ScreenDatasetDefinition> = {},
): ScreenDatasetDefinition {
  return {
    datasetId: 'ds',
    name: '数据集',
    description: null,
    fields,
    parameters: [],
    ...extra,
  };
}

const CREW_FIELDS: ScreenDatasetDefinition['fields'] = [
  { id: 'crew', label: '班组', valueType: 'string' },
  { id: 'output', label: '产量', valueType: 'number' },
  { id: 'oee', label: 'OEE', valueType: 'number', unit: '%' },
];
const CREW: ScreenTabularDataset = {
  fields: CREW_FIELDS,
  rows: [
    { crew: '甲班', output: 1200, oee: 86.5 },
    { crew: '乙班', output: 1100, oee: 82.1 },
    { crew: '丙班', output: 980, oee: 79.4 },
  ],
  totalRowCount: 3,
};

const ALARM_FIELDS: ScreenDatasetDefinition['fields'] = [
  { id: 'id', label: '告警编号', valueType: 'string' },
  { id: 't', label: '时间', valueType: 'date' },
  { id: 'level', label: '等级', valueType: 'string' },
  { id: 'deviceName', label: '设备', valueType: 'string' },
];
const ALARMS: ScreenTabularDataset = {
  fields: ALARM_FIELDS,
  rows: [
    { id: 'A-1', t: '2026-01-01T00:01:00Z', level: 'critical', deviceName: '冲压-1' },
    { id: 'A-2', t: '2026-01-01T00:05:00Z', level: 'warning', deviceName: '冲压-1' },
    { id: 'A-3', t: '2026-01-01T00:05:00Z', level: 'warning', deviceName: '冲压-1' },
  ],
};

describe('profileScreenDataset', () => {
  it('profiles an aggregated table deterministically', () => {
    const def = definition(CREW_FIELDS, {
      parameters: [
        { name: 'line', label: '产线', valueType: 'string', required: true, allowedValues: ['A'] },
        { name: 'limit', label: '条数', valueType: 'number', required: false, defaultValue: 6 },
        { name: 'window', label: '窗', valueType: 'number', required: false },
      ],
    });
    const first = profileScreenDataset(def, CREW);
    const second = profileScreenDataset(def, CREW);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.fields.map((field) => [field.id, field.kind])).toEqual([
      ['crew', 'dimension'],
      ['output', 'measure'],
      ['oee', 'measure'],
    ]);
    expect(first.grain).toEqual({ keys: ['crew'], unique: true });
    expect(first.rows).toEqual({ sampled: 3, total: 3, truncated: false });
    expect(first.fields[2]).toMatchObject({
      unit: '%',
      number: { min: 79.4, max: 86.5, integer: false, nonNegative: true },
    });
    expect(first.params.map((item) => [item.name, item.resolved])).toEqual([
      ['line', 'missing'],
      ['limit', 'default'],
      ['window', 'optional'],
    ]);
  });

  it('marks detail-level data as not unique and spots identifiers and time', () => {
    const profile = profileScreenDataset(definition(ALARM_FIELDS), ALARMS);

    expect(profile.fields.map((field) => [field.id, field.kind])).toEqual([
      ['id', 'identifier'],
      ['t', 'time'],
      ['level', 'dimension'],
      ['deviceName', 'dimension'],
    ]);
    expect(profile.grain.unique).toBe(false);
    expect(profile.fields[1]?.time).toEqual({
      min: '2026-01-01T00:01:00Z',
      max: '2026-01-01T00:05:00Z',
      granularity: 'minute',
    });
  });

  it('does not take a numeric id column for a measure', () => {
    const fields: ScreenDatasetDefinition['fields'] = [
      { id: 'device_no', label: '设备编号', valueType: 'number' },
      { id: 'load', label: '负载', valueType: 'number' },
      { id: 'note', label: '备注', valueType: 'string' },
    ];
    const profile = profileScreenDataset(definition(fields), {
      fields,
      rows: [
        { device_no: 1001, load: 40, note: null },
        { device_no: 1002, load: 40, note: null },
      ],
    });

    expect(profile.fields.map((field) => field.kind)).toEqual(['identifier', 'measure', 'empty']);
    expect(profile.fields[2]?.nullRatio).toBe(1);
  });

  it('reports truncation and falls back to describe-only kinds without a sample', () => {
    const truncated = profileScreenDataset(definition(CREW_FIELDS), {
      ...CREW,
      totalRowCount: 40,
    });
    expect(truncated.rows.truncated).toBe(true);

    const bare = profileScreenDataset(definition(ALARM_FIELDS));
    expect(bare.sampled).toBe(false);
    expect(bare.grain.unique).toBe(false);
    // 没有样本就判不出编号：按类型归类。
    expect(bare.fields.map((field) => field.kind)).toEqual([
      'dimension',
      'time',
      'dimension',
      'dimension',
    ]);
  });
});

describe('enumerateScreenDataCandidates', () => {
  it('offers categorization, proportion and detail for an aggregated table', () => {
    const profile = profileScreenDataset(definition(CREW_FIELDS), CREW);
    const candidates = enumerateScreenDataCandidates([profile], MATERIALS);

    expect(candidates.map((item) => [item.id, item.fact, item.type, item.fields])).toEqual([
      ['c1', 'categorization', 'base.chart', { dimension: ['crew'], measures: ['output'] }],
      ['c2', 'categorization', 'base.chart', { dimension: ['crew'], measures: ['oee'] }],
      ['c3', 'proportion', 'base.chart', { dimension: ['crew'], measures: ['output'] }],
      ['c4', 'proportion', 'base.chart', { dimension: ['crew'], measures: ['oee'] }],
      ['c5', 'detail', 'base.table', { columns: ['crew', 'output', 'oee'] }],
    ]);
    // 多行结果不出指标卡（文本物料只读第一行）。
    expect(candidates.some((item) => item.fact === 'value')).toBe(false);
  });

  it('offers only detail for detail-level data, never a trend', () => {
    const profile = profileScreenDataset(definition(ALARM_FIELDS), ALARMS);
    const candidates = enumerateScreenDataCandidates([profile], MATERIALS);

    expect(candidates.map((item) => item.fact)).toEqual(['detail']);
    expect(candidates[0]?.fields).toEqual({ columns: ['id', 't', 'level', 'deviceName'] });
  });

  it('offers a trend for a series keyed by time', () => {
    const fields: ScreenDatasetDefinition['fields'] = [
      { id: 'day', label: '日期', valueType: 'date' },
      { id: 'orders', label: '订单', valueType: 'number' },
    ];
    const profile = profileScreenDataset(definition(fields), {
      fields,
      rows: [
        { day: '2026-01-01', orders: 3 },
        { day: '2026-01-02', orders: 5 },
        { day: '2026-01-03', orders: 4 },
      ],
    });
    const candidates = enumerateScreenDataCandidates([profile], MATERIALS);

    expect(profile.fields[0]?.time?.granularity).toBe('day');
    expect(candidates[0]).toMatchObject({
      fact: 'trend',
      type: 'base.chart',
      fields: { dimension: ['day'], measures: ['orders'] },
    });
  });

  it('offers a value card only for a single-row result', () => {
    const fields: ScreenDatasetDefinition['fields'] = [
      { id: 'oee', label: 'OEE', valueType: 'number' },
    ];
    const profile = profileScreenDataset(definition(fields), {
      fields,
      rows: [{ oee: 84.2 }],
      totalRowCount: 1,
    });
    const candidates = enumerateScreenDataCandidates([profile], MATERIALS);

    expect(candidates[0]).toMatchObject({
      fact: 'value',
      type: 'base.text',
      fields: { value: ['oee'] },
    });
  });

  it('numbers candidates across datasets and caps each dataset', () => {
    const crew = profileScreenDataset(definition(CREW_FIELDS, { datasetId: 'crew' }), CREW);
    const alarms = profileScreenDataset(definition(ALARM_FIELDS, { datasetId: 'alarms' }), ALARMS);
    const candidates = enumerateScreenDataCandidates([crew, alarms], MATERIALS, {
      maxPerDataset: 2,
    });

    expect(candidates.map((item) => [item.id, item.datasetId])).toEqual([
      ['c1', 'crew'],
      ['c2', 'crew'],
      ['c3', 'alarms'],
    ]);
  });

  it('offers only detail when there is no sample', () => {
    const profile = profileScreenDataset(definition(CREW_FIELDS));
    const candidates = enumerateScreenDataCandidates([profile], MATERIALS);

    expect(candidates.map((item) => item.fact)).toEqual(['detail']);
  });
});
