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

  it('carries the out-moved capability on four bearing surfaces', () => {
    const runtime = createPluginEchartsRuntime();
    expect(runtime.manifest.capabilities).toEqual(['command.execute', 'design.read']);
    expect(runtime.manifest.contributions.map((item) => item.kind)).toEqual([
      'material',
      'command',
      'inspectorControl',
      'panel',
    ]);
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
    expect(executed[0]).toMatchObject({
      commandId: 'update-components',
      args: {
        componentIds: ['chart-1'],
        patch: { props: { seriesType: 'bar' } },
      },
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
