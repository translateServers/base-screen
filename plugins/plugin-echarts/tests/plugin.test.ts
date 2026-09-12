import type { BaseScreenChartData } from '@base-screen/plugin-core';
import {
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { buildPluginEchartsOption } from '../src/chart-option.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from '../src/manifest.js';
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

describe('plugin-echarts material manifest', () => {
  it('parses as a canonical material manifest', () => {
    expect(parseBaseScreenMaterialManifest(PLUGIN_ECHARTS_MATERIAL_MANIFEST).ok).toBe(true);
  });

  it('does not collide with the core library material type', () => {
    expect(PLUGIN_ECHARTS_MATERIAL_MANIFEST.type).not.toBe('base.echarts');
  });
});

describe('plugin-echarts runtime', () => {
  it('parses as a canonical plugin manifest', () => {
    const runtime = createPluginEchartsRuntime();
    expect(parseBaseScreenPluginManifest(runtime.manifest).ok).toBe(true);
    expect(runtime.manifest.id).toBe(PLUGIN_ECHARTS_ID);
  });

  it('contributes exactly the one material it registers', () => {
    const runtime = createPluginEchartsRuntime();
    expect(runtime.manifest.contributions).toHaveLength(1);
    expect(runtime.manifest.contributions[0]).toEqual({
      kind: 'material',
      type: PLUGIN_ECHARTS_MATERIAL_MANIFEST.type,
      tagName: PLUGIN_ECHARTS_MATERIAL_MANIFEST.tagName,
    });
  });
});

describe('buildPluginEchartsOption', () => {
  it('maps canonical chart data to a plain option object', () => {
    const option = buildPluginEchartsOption({
      data: chartData,
      titleText: '',
      showTooltip: true,
      seriesType: 'bar',
      textColor: '#ffffff',
      gridColor: '#374151',
    });
    expect(option.xAxis).toEqual({
      type: 'category',
      data: ['a', 'b'],
      splitLine: { show: true, lineStyle: { color: '#374151' } },
    });
    expect(option.series).toEqual([{ name: 'north', type: 'bar', data: [1, 2] }]);
    expect(option.title).toBeUndefined();
  });

  it('adds a title only when the text is non-empty', () => {
    const option = buildPluginEchartsOption({
      data: chartData,
      titleText: 'T',
      showTooltip: false,
      seriesType: 'line',
      textColor: '#ffffff',
      gridColor: '#374151',
    });
    expect(option.title).toEqual({ text: 'T', textStyle: { color: '#ffffff' } });
    expect(option.tooltip).toEqual({ show: false, trigger: 'axis' });
  });
});
