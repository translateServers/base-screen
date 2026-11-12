import type { BaseScreenChartData } from '@base-screen/plugin-core';
import {
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER } from '../src/chart-data-adapter.js';
import { buildChartFamilyOption, buildPluginEchartsOption } from '../src/chart-option.js';
import {
  PLUGIN_ECHARTS_MATERIAL_MANIFEST,
  PLUGIN_ECHARTS_MATERIAL_MANIFESTS,
} from '../src/manifest.js';
import { createPluginEchartsRuntime, PLUGIN_ECHARTS_ID } from '../src/plugin.js';

const chartData: BaseScreenChartData = {
  series: [
    {
      id: 'north',
      label: 'north',
      points: [
        { x: 'a', y: 1 },
        { x: 'b', y: 2 },
      ],
    },
  ],
};

const OPTION_BASE = {
  textColor: '#ffffff',
  gridColor: '#374151',
  seriesColor: '#38bdf8',
} as const;

describe('plugin-echarts material manifest', () => {
  it('parses as a canonical material manifest', () => {
    expect(parseBaseScreenMaterialManifest(PLUGIN_ECHARTS_MATERIAL_MANIFEST).ok).toBe(true);
  });

  it('保留十个图表家族稳定身份和完整数据契约', () => {
    expect(PLUGIN_ECHARTS_MATERIAL_MANIFESTS.map((manifest) => manifest.type)).toEqual([
      'plugin.echarts',
      ...[
        'line',
        'area',
        'bar',
        'hbar',
        'pie',
        'donut',
        'gauge',
        'radar',
        'scatter',
        'heatmap',
      ].map((kind) => `plugin.chart.${kind}`),
    ]);
    for (const manifest of PLUGIN_ECHARTS_MATERIAL_MANIFESTS) {
      expect(parseBaseScreenMaterialManifest(manifest).ok, manifest.type).toBe(true);
      expect(manifest.staticData?.kind).toBe('tabular');
    }
  });

  it.each([
    'line',
    'area',
    'bar',
    'hbar',
    'pie',
    'donut',
    'gauge',
    'radar',
    'scatter',
    'heatmap',
  ] as const)('家族%s生成对应图形而非回退折线', (kind) => {
    const option = buildChartFamilyOption(kind, {
      data: chartData,
      titleText: '',
      showTooltip: true,
      seriesType: 'line',
      ...OPTION_BASE,
      props: { showLegend: false },
    });
    const series = option.series as Array<Record<string, unknown>>;
    const expected =
      kind === 'hbar' ? 'bar' : kind === 'area' ? 'line' : kind === 'donut' ? 'pie' : kind;
    expect(series[0]?.type).toBe(expected);
    expect(option.legend).toBeUndefined();
    if (kind === 'hbar') expect(option.yAxis).toMatchObject({ type: 'category', inverse: true });
    if (kind === 'scatter')
      expect(series[0]?.data).toEqual([
        [0, 1],
        [1, 2],
      ]);
    if (kind === 'heatmap')
      expect(series[0]?.data).toEqual([
        [0, 0, 1],
        [1, 0, 2],
      ]);
    if (kind === 'gauge') expect(series[0]?.data).toEqual([{ value: 2, name: '' }]);
  });

  it('does not collide with the core library material type', () => {
    expect(PLUGIN_ECHARTS_MATERIAL_MANIFEST.type).not.toBe('base.echarts');
  });

  it('accepts every chart type the option builder implements', () => {
    const schema = PLUGIN_ECHARTS_MATERIAL_MANIFEST.propsSchema.properties.seriesType;
    expect(schema?.kind).toBe('enum');
    expect(schema?.kind === 'enum' ? schema.values : []).toEqual(['line', 'bar', 'area', 'pie']);
  });
});

describe('plugin-echarts runtime', () => {
  it('parses as a canonical plugin manifest', () => {
    const runtime = createPluginEchartsRuntime();
    expect(parseBaseScreenPluginManifest(runtime.manifest).ok).toBe(true);
    expect(runtime.manifest.id).toBe(PLUGIN_ECHARTS_ID);
  });

  it('carries the out-moved capability on four bearing surfaces', () => {
    const runtime = createPluginEchartsRuntime();
    expect(runtime.manifest.capabilities).toEqual(['command.execute', 'design.read']);
    expect(runtime.manifest.contributions.filter((item) => item.kind === 'material')).toHaveLength(
      11,
    );
    expect(
      runtime.manifest.contributions
        .filter((item) => item.kind !== 'material')
        .map((item) => item.kind),
    ).toEqual(['command', 'inspectorControl', 'panel']);
    expect(runtime.commands && Object.keys(runtime.commands)).toEqual([
      'base-screen.echarts.toggle-series-type',
    ]);
  });

  it('toggles the focused chart series type through the document command port', async () => {
    const runtime = createPluginEchartsRuntime();
    const executed: unknown[] = [];
    const documentValue = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [
        {
          id: 'chart-1',
          type: PLUGIN_ECHARTS_MATERIAL_MANIFEST.type,
          name: 'Chart',
          parentId: null,
          position: { x: 0, y: 0 },
          size: { width: 480, height: 280 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: { titleText: '', showTooltip: true, seriesType: 'line' },
          style: {},
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    };
    const context = {
      instanceId: 'test',
      pluginId: 'base-screen.echarts',
      grantedCapabilities: ['command.execute', 'design.read'],
      commandPort: {
        execute: async (request: { commandId: string; args: unknown }) => {
          executed.push(request);
          return { ok: true as const, value: null, diagnostics: [] };
        },
      },
      designReadPort: {
        read: async () => ({
          ok: true as const,
          value: {
            document: JSON.parse(JSON.stringify(documentValue)),
            selectedComponentIds: ['chart-1'],
            focusedComponentId: 'chart-1',
          },
          diagnostics: [],
        }),
      },
    };
    const activation = runtime.activate(context as never);
    if (activation instanceof Promise) await activation;
    const handler = runtime.commands?.['base-screen.echarts.toggle-series-type'];
    expect(handler).toBeDefined();
    const result = await handler!('ignored' as never);
    expect(typeof result === 'object' && result !== null && result.ok === true).toBe(true);
    expect(executed).toHaveLength(1);
    // props 整体替换：必须带齐必填字段，否则 schema 会拒绝这条事务。
    expect(executed[0]).toMatchObject({
      commandId: 'update-components',
      args: {
        componentIds: ['chart-1'],
        patch: {
          props: { titleText: '', showTooltip: true, seriesType: 'bar' },
        },
      },
    });
  });
});

describe('buildPluginEchartsOption', () => {
  it('maps bar data with axis and gradient bars', () => {
    const option = buildPluginEchartsOption({
      data: chartData,
      titleText: '',
      showTooltip: true,
      seriesType: 'bar',
      ...OPTION_BASE,
    });
    expect(option.xAxis).toMatchObject({
      type: 'category',
      data: ['a', 'b'],
      boundaryGap: true,
    });
    expect(option.yAxis).toMatchObject({ type: 'value' });
    expect(option.series).toMatchObject([
      { name: 'north', type: 'bar', data: [1, 2], barMaxWidth: 28 },
    ]);
    expect(option.title).toBeUndefined();
    expect(option.animation).toBe(false);
  });

  it('renders an area series with a gradient fill and no symbols', () => {
    const option = buildPluginEchartsOption({
      data: chartData,
      titleText: '',
      showTooltip: true,
      seriesType: 'area',
      ...OPTION_BASE,
    });
    const series = (option.series as Array<Record<string, unknown>>)[0];
    expect(series).toMatchObject({ type: 'line', smooth: true, showSymbol: false });
    expect(series?.areaStyle).toBeDefined();
  });

  it('drops the cartesian frame for a pie and maps points to slices', () => {
    const option = buildPluginEchartsOption({
      data: chartData,
      titleText: '占比',
      showTooltip: true,
      seriesType: 'pie',
      ...OPTION_BASE,
    });
    expect(option.xAxis).toBeUndefined();
    expect(option.yAxis).toBeUndefined();
    expect(option.grid).toBeUndefined();
    const series = (option.series as Array<Record<string, unknown>>)[0];
    expect(series).toMatchObject({
      type: 'pie',
      radius: ['48%', '68%'],
      data: [
        { name: 'a', value: 1 },
        { name: 'b', value: 2 },
      ],
    });
    expect(option.title).toMatchObject({ text: '占比' });
  });

  it('compresses ISO timestamps to HH:mm on the category axis', () => {
    const option = buildPluginEchartsOption({
      data: {
        series: [
          {
            id: 'value',
            label: 'value',
            points: [
              { x: '2026-01-01T08:30:00.000Z', y: 1 },
              { x: '2026-01-01T09:30:00.000Z', y: 2 },
            ],
          },
        ],
      },
      titleText: '',
      showTooltip: false,
      seriesType: 'line',
      ...OPTION_BASE,
    });
    expect((option.xAxis as { data: string[] }).data).toEqual(['08:30', '09:30']);
    expect(option.tooltip).toMatchObject({ show: false, trigger: 'axis' });
  });
});

describe('plugin-echarts tabular adapter', () => {
  it('projects dimension and measures into chart series', () => {
    const dimension = { id: 't', label: '时间', valueType: 'string' as const };
    const measure = { id: 'value', label: '订单量', valueType: 'number' as const };
    const result = PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER.adapt({
      dataset: {
        fields: [dimension, measure],
        rows: [
          { t: '08:00', value: 12 },
          { t: '09:00', value: 18 },
        ],
      },
      fields: { dimension: [dimension], measures: [measure] },
    });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toEqual({
      series: [
        {
          id: 'value',
          label: '订单量',
          points: [
            { x: '08:00', y: 12 },
            { x: '09:00', y: 18 },
          ],
        },
      ],
    });
  });

  it('fails closed when the binding has no measures', () => {
    const result = PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER.adapt({
      dataset: { fields: [], rows: [] },
      fields: {},
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.diagnostics[0]?.code : undefined).toBe(
      'HOST_DATASET_BINDING_INVALID',
    );
  });
});
