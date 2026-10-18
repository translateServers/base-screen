import type { BaseScreenChartData } from '@base-screen/plugin-core';

export interface PluginEchartsOptionInput {
  readonly data: BaseScreenChartData;
  readonly titleText: string;
  readonly showTooltip: boolean;
  readonly seriesType: string;
  readonly textColor: string;
  readonly gridColor: string;
  readonly seriesColor: string;
}

/** 多系列时的备用色板：首个系列用作者选的图形色，其余取同明度的邻近色相。 */
const SERIES_PALETTE = ['#38bdf8', '#22d3ee', '#818cf8', '#f472b6', '#facc15', '#34d399'];

/**
 * 纯映射：canonical 图表数据 + JSON-safe props 转成一份普通对象 option，不含第三方类型。
 *
 * 四种图型共享一套取色与字号：line / area 是同一族（面积只是折线加渐变填充），
 * bar 用纵向渐变，pie 走环形布局——它不需要直角坐标系，因此不生成 grid/xAxis/yAxis。
 */
export function buildPluginEchartsOption(input: PluginEchartsOptionInput): Record<string, unknown> {
  const seriesType = normalizeSeriesType(input.seriesType);
  if (seriesType === 'pie') return buildPieOption(input);
  return buildCartesianOption(input, seriesType);
}

function buildCartesianOption(
  input: PluginEchartsOptionInput,
  seriesType: 'line' | 'bar' | 'area',
): Record<string, unknown> {
  const categories = input.data.series[0]?.points.map((point) => formatCategory(point.x)) ?? [];
  const series = input.data.series.map((entry, index) => {
    const color = seriesColorAt(input.seriesColor, index);
    const data = entry.points.map((point) => point.y);
    if (seriesType === 'bar') {
      return {
        name: entry.label,
        type: 'bar',
        data,
        barMaxWidth: 28,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color },
              { offset: 1, color: withAlpha(color, 0.15) },
            ],
          },
        },
      };
    }
    const line = {
      name: entry.label,
      type: 'line',
      data,
      smooth: seriesType === 'area',
      showSymbol: false,
      lineStyle: { width: 2, color },
      itemStyle: { color },
    };
    if (seriesType !== 'area') return line;
    return {
      ...line,
      areaStyle: {
        opacity: 1,
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: withAlpha(color, 0.42) },
            { offset: 1, color: withAlpha(color, 0) },
          ],
        },
      },
    };
  });

  const option: Record<string, unknown> = {
    backgroundColor: 'transparent',
    animation: false,
    color: SERIES_PALETTE.map((_, index) => seriesColorAt(input.seriesColor, index)),
    textStyle: { color: input.textColor },
    tooltip: {
      show: input.showTooltip,
      trigger: 'axis',
      backgroundColor: 'rgba(7, 22, 40, .92)',
      borderColor: input.gridColor,
      textStyle: { color: input.textColor, fontSize: 12 },
    },
    grid: {
      left: 44,
      right: 20,
      top: input.titleText === '' ? 20 : 44,
      bottom: 28,
    },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: seriesType === 'bar',
      axisLine: { lineStyle: { color: input.gridColor } },
      axisTick: { show: false },
      axisLabel: { color: input.textColor, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: input.textColor, fontSize: 11 },
      splitLine: { show: true, lineStyle: { color: input.gridColor, opacity: 0.6 } },
    },
    series,
  };
  if (input.titleText !== '') {
    option.title = {
      text: input.titleText,
      left: 8,
      top: 4,
      textStyle: { color: input.textColor, fontSize: 13, fontWeight: 600 },
    };
  }
  if (input.data.series.length > 1) {
    option.legend = {
      top: 6,
      right: 8,
      icon: 'roundRect',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: input.textColor, fontSize: 11 },
    };
  }
  return option;
}

/** 环形图：分类取横轴值，数值取第一个度量；多度量时只画第一条（环形不适合并列多系列）。 */
function buildPieOption(input: PluginEchartsOptionInput): Record<string, unknown> {
  const first = input.data.series[0];
  const slices =
    first?.points.map((point) => ({
      name: formatCategory(point.x),
      value: point.y,
    })) ?? [];
  const option: Record<string, unknown> = {
    backgroundColor: 'transparent',
    animation: false,
    color: SERIES_PALETTE.map((_, index) => seriesColorAt(input.seriesColor, index)),
    textStyle: { color: input.textColor },
    tooltip: {
      show: input.showTooltip,
      trigger: 'item',
      backgroundColor: 'rgba(7, 22, 40, .92)',
      borderColor: input.gridColor,
      textStyle: { color: input.textColor, fontSize: 12 },
    },
    legend: {
      bottom: 4,
      left: 'center',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: input.textColor, fontSize: 11 },
    },
    series: [
      {
        name: first?.label ?? '',
        type: 'pie',
        radius: ['48%', '68%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: 'rgba(5, 13, 26, .85)',
          borderWidth: 2,
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          label: {
            show: true,
            color: input.textColor,
            fontSize: 13,
            fontWeight: 600,
            formatter: '{b}\n{d}%',
          },
        },
        data: slices,
      },
    ],
  };
  if (input.titleText !== '') {
    option.title = {
      text: input.titleText,
      left: 'center',
      top: 4,
      textStyle: { color: input.textColor, fontSize: 13, fontWeight: 600 },
    };
  }
  return option;
}

function normalizeSeriesType(value: string): 'line' | 'bar' | 'area' | 'pie' {
  return value === 'bar' || value === 'area' || value === 'pie' ? value : 'line';
}

function seriesColorAt(base: string, index: number): string {
  return index === 0 ? base : (SERIES_PALETTE[index % SERIES_PALETTE.length] ?? base);
}

/** ISO 时间标签压缩成 HH:mm；其余分类原样展示。 */
function formatCategory(value: unknown): string {
  const text = String(value);
  const matched = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(text);
  return matched === null ? text : `${matched[1]}:${matched[2]}`;
}

/** 给十六进制颜色追加透明度；非 #rrggbb 输入原样返回，避免拼出非法 CSS。 */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const hex = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${hex}`;
}
