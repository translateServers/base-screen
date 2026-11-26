import type {
  ScreenDatasetDefinition,
  ScreenHostDatasetPort,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { type IntentCatalog, prepareIntentDataContext } from '../../src/index.js';
import { COMPILE_CATALOG } from './fixtures.js';

/**
 * ADR-0114 S4（宿主侧）：引用数据集 → describe → 默认参数取样 → 画像 → 候选。
 * 端口用内存假实现，覆盖：已汇总的数据、缺必填参数不取样、取样失败退为只有 describe 的画像。
 */

const CATALOG: IntentCatalog = {
  ...COMPILE_CATALOG,
  materials: COMPILE_CATALOG.materials.map((material) =>
    material.type === 'base.chart'
      ? {
          ...material,
          roles: [
            {
              id: 'dimension',
              min: 1,
              max: 1,
              valueTypes: ['string', 'number', 'boolean', 'date'],
            },
            { id: 'measures', min: 1, max: 8, valueTypes: ['number'] },
          ],
        }
      : material,
  ),
};

const CREW: ScreenDatasetDefinition = {
  datasetId: 'crew',
  name: '班组绩效',
  description: null,
  fields: [
    { id: 'crew', label: '班组', valueType: 'string' },
    { id: 'oee', label: 'OEE', valueType: 'number', unit: '%' },
  ],
  parameters: [
    { name: 'line', label: '产线', valueType: 'string', required: true, defaultValue: 'LINE-A' },
  ],
};
const PIPELINE: ScreenDatasetDefinition = {
  datasetId: 'pipeline',
  name: '工序链',
  description: null,
  fields: [{ id: 'name', label: '工序', valueType: 'string' }],
  parameters: [
    {
      name: 'line',
      label: '产线',
      valueType: 'string',
      required: true,
      allowedValues: ['LINE-A', 'LINE-B'],
    },
  ],
};
const BROKEN: ScreenDatasetDefinition = { ...CREW, datasetId: 'broken', name: '坏数据集' };

function port(queries: { datasetId: string; params: unknown }[]): ScreenHostDatasetPort {
  const definitions = new Map([CREW, PIPELINE, BROKEN].map((item) => [item.datasetId, item]));
  return {
    list: async () => ({ ok: true, value: { items: [] }, diagnostics: [] }),
    describe: async ({ datasetId }) => {
      const definition = definitions.get(datasetId);
      return definition === undefined
        ? {
            ok: false,
            diagnostics: [
              {
                severity: 'error',
                code: 'HOST_RESOURCE_UNAVAILABLE',
                path: [],
                message: 'missing',
              },
            ],
          }
        : { ok: true, value: definition, diagnostics: [] };
    },
    query: async ({ datasetId, params }) => {
      queries.push({ datasetId, params });
      if (datasetId === 'broken') throw new Error('boom');
      const value: ScreenTabularDataset = {
        fields: CREW.fields,
        rows: [
          { crew: '甲班', oee: 86.5 },
          { crew: '乙班', oee: 82.1 },
        ],
        totalRowCount: 2,
      };
      return { ok: true, value, diagnostics: [] };
    },
  };
}

const signal = new AbortController().signal;

describe('prepareIntentDataContext', () => {
  it('profiles referenced datasets and lists candidates for the prompt and the compiler', async () => {
    const queries: { datasetId: string; params: unknown }[] = [];
    const context = await prepareIntentDataContext({
      datasetIds: ['crew', 'pipeline', 'broken', 'gone'],
      port: port(queries),
      catalog: CATALOG,
      signal,
    });

    // 缺必填参数的 pipeline 用第一个可选值代为取样（只判形状）；其余按默认参数取一次。
    expect(queries).toEqual([
      { datasetId: 'crew', params: { line: 'LINE-A' } },
      { datasetId: 'pipeline', params: { line: 'LINE-A' } },
      { datasetId: 'broken', params: { line: 'LINE-A' } },
    ]);
    expect(context.profiles.map((item) => [item.datasetId, item.sampled])).toEqual([
      ['crew', true],
      ['pipeline', true],
      ['broken', false],
    ]);
    // 代取样不改参数定义：编译时 pipeline 仍按缺参处理。
    expect(context.references[1]?.parameters?.[0]).not.toHaveProperty('defaultValue');
    expect(context.warnings.map((item) => `${item.code}:${item.detail?.datasetId}`)).toEqual([
      'AGENT_DATASET_SAMPLE_UNAVAILABLE:broken',
      'AGENT_DATASET_UNKNOWN:gone',
    ]);
    expect(context.candidates[0]).toEqual({
      id: 'c1',
      fact: 'categorization',
      datasetId: 'crew',
      type: 'base.chart',
      fields: { dimension: ['crew'], measures: ['oee'] },
    });
    expect(context.references[0]).toEqual({
      datasetId: 'crew',
      name: '班组绩效',
      columns: [
        { id: 'crew', type: 'string', label: '班组' },
        { id: 'oee', type: 'number', label: 'OEE', unit: '%' },
      ],
      parameters: [{ name: 'line', required: true, valueType: 'string', defaultValue: 'LINE-A' }],
      rows: { sampled: 2, total: 2 },
    });
    // 取样失败的 broken 不带行数（不知道就不拦指标卡的多行判断）。
    expect(context.references[2]).not.toHaveProperty('rows');
  });
});
