import { parseScreenJsonValue } from '@base-screen/contracts';
import {
  parseBaseScreenMaterialManifest,
  validateBaseScreenMaterialProps,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_ECHARTS_EDITOR_DESCRIPTOR,
  BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST,
  BASE_SCREEN_ECHARTS_PROPS_SCHEMA,
  BASE_SCREEN_ECHARTS_TABULAR_DATA_ADAPTER,
  BaseScreenEChartsMaterialElement,
} from '../src/index.js';

describe('official ECharts semantic material', () => {
  it('AE-EC-C01 publishes a valid manifest with a nested props schema and descriptor', () => {
    const parsed = parseBaseScreenMaterialManifest(BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST);
    expect(parsed.ok, parsed.ok ? undefined : JSON.stringify(parsed.diagnostics)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.propsSchema.properties.series?.kind).toBe('array');
    expect(parsed.value.editorDescriptor?.appearance?.length).toBeGreaterThan(0);
    expect(parsed.value.editorDescriptor?.events?.[0]?.name).toBe('seriesClick');
    const bindingSection = parsed.value.editorDescriptor?.data?.find(
      (section) => section.id === 'binding',
    );
    expect(bindingSection?.fields.map((field) => field.path)).toEqual([
      ['binding', 'fields', 'dimension', 0],
      ['binding', 'fields', 'measures', 0],
      ['binding', 'fields', 'measures', 1],
    ]);
  });

  it('AE-EC-C01 default props satisfy the nested props schema', () => {
    const result = validateBaseScreenMaterialProps(
      BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST.defaultProps,
      BASE_SCREEN_ECHARTS_PROPS_SCHEMA,
    );
    expect(result.ok).toBe(true);
  });

  it('AE-EC-C01 configures common line/bar charts without raw options', () => {
    const parsed = parseScreenJsonValue({
      title: { show: true, text: '销售', color: '#111827', fontSize: 16 },
      legend: { show: true, position: 'top', fontSize: 12 },
      grid: { show: true, top: 32, right: 24, bottom: 24, left: 48 },
      xAxis: { show: true, name: '区域', color: '#6b7280', fontSize: 12 },
      yAxis: { show: true, name: '金额', color: '#6b7280' },
      yAxis2: { show: false, name: '', color: '#9ca3af' },
      series: [
        {
          name: 'A',
          type: 'line',
          xField: 'region',
          yField: 'amount',
          yAxisIndex: 0,
          color: '#38bdf8',
          lineWidth: 2,
        },
        {
          name: 'B',
          type: 'bar',
          xField: 'region',
          yField: 'count',
          yAxisIndex: 1,
          color: '#f97316',
          lineWidth: 2,
        },
      ],
      tooltip: { show: true, trigger: 'axis' },
      interactions: { hover: true, select: true, click: 'host-event' },
      advanced: { showDataLabels: true, axisLabelRotate: 45, symbolSize: 6, areaOpacity: 0.2 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const validated = validateBaseScreenMaterialProps(
      parsed.value as Record<string, unknown>,
      BASE_SCREEN_ECHARTS_PROPS_SCHEMA,
    );
    expect(validated.ok).toBe(true);
  });

  it('AE-EC-C03 rejects invalid semantic values fail closed', () => {
    const invalid = validateBaseScreenMaterialProps(
      { title: { show: true, text: 'x', fontSize: 200 } },
      BASE_SCREEN_ECHARTS_PROPS_SCHEMA,
    );
    expect(invalid.ok).toBe(false);
    const badSeries = validateBaseScreenMaterialProps(
      { series: [{ type: 'pie' }] },
      BASE_SCREEN_ECHARTS_PROPS_SCHEMA,
    );
    expect(badSeries.ok).toBe(false);
  });

  it('AE-EC-C03 keeps multi-axis and advanced fields under schema limits', () => {
    const result = validateBaseScreenMaterialProps(
      BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST.defaultProps,
      BASE_SCREEN_ECHARTS_PROPS_SCHEMA,
    );
    expect(result.ok).toBe(true);
    const descriptor = BASE_SCREEN_ECHARTS_EDITOR_DESCRIPTOR;
    const advancedSection = descriptor.appearance?.find((section) => section.id === 'advanced');
    expect(advancedSection?.advanced).toBe(true);
  });

  it('AE-EC-C02 projects tabular fields and keeps raw option out of the document', () => {
    const dataset = {
      fields: [
        { id: 'region', label: '区域', valueType: 'string' as const },
        { id: 'amount', label: '金额', valueType: 'number' as const },
      ],
      rows: [
        { region: 'north', amount: 42 },
        { region: 'south', amount: 36 },
      ],
    };
    const projected = BASE_SCREEN_ECHARTS_TABULAR_DATA_ADAPTER.adapt({
      dataset,
      fields: {
        dimension: [dataset.fields[0]!],
        measures: [dataset.fields[1]!],
      },
    });
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    const series = projected.value as {
      readonly series: readonly {
        readonly id: string;
        readonly points: readonly { readonly x: unknown; readonly y: number }[];
      }[];
    };
    expect(series.series).toHaveLength(1);
    expect(series.series[0]?.points).toHaveLength(2);
    expect(JSON.stringify(BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST.defaultProps)).not.toContain(
      'rawOption',
    );
  });

  it('AE-EC-C01 accepts the definition through the SDK', () => {
    const definition = createMaterialDefinition({
      manifest: BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST,
      element: BaseScreenEChartsMaterialElement,
    });
    expect(definition.ok, definition.ok ? undefined : JSON.stringify(definition.diagnostics)).toBe(
      true,
    );
  });
});
