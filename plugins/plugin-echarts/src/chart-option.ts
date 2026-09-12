import type { BaseScreenChartData } from '@base-screen/plugin-core';

export interface PluginEchartsOptionInput {
  readonly data: BaseScreenChartData;
  readonly titleText: string;
  readonly showTooltip: boolean;
  readonly seriesType: string;
  readonly textColor: string;
  readonly gridColor: string;
}

/** 纯映射：canonical 图表数据 + JSON-safe props 转成一份普通对象 option，不含第三方类型。 */
export function buildPluginEchartsOption(input: PluginEchartsOptionInput): Record<string, unknown> {
  const categories = input.data.series[0]?.points.map((point) => String(point.x)) ?? [];
  const series = input.data.series.map((entry) => ({
    name: entry.label,
    type: input.seriesType === 'bar' ? 'bar' : 'line',
    data: entry.points.map((point) => point.y),
  }));
  const option: Record<string, unknown> = {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: input.textColor },
    tooltip: { show: input.showTooltip, trigger: 'axis' },
    grid: { left: 8, right: 16, top: input.titleText === '' ? 24 : 48, bottom: 24 },
    xAxis: {
      type: 'category',
      data: categories,
      splitLine: { show: true, lineStyle: { color: input.gridColor } },
    },
    yAxis: {
      type: 'value',
      splitLine: { show: true, lineStyle: { color: input.gridColor } },
    },
    series,
  };
  if (input.titleText !== '') {
    option.title = { text: input.titleText, textStyle: { color: input.textColor } };
  }
  return option;
}
