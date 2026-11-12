import type { BaseScreenChartData } from '@base-screen/plugin-core';

export type ChartFamilyKind =
  | 'line'
  | 'area'
  | 'bar'
  | 'hbar'
  | 'pie'
  | 'donut'
  | 'gauge'
  | 'radar'
  | 'scatter'
  | 'heatmap';

export interface PluginEchartsOptionInput {
  readonly data: BaseScreenChartData;
  readonly titleText: string;
  readonly showTooltip: boolean;
  readonly seriesType: string;
  readonly textColor: string;
  readonly gridColor: string;
  readonly seriesColor: string;
  readonly props?: Readonly<Record<string, unknown>>;
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

export function buildChartFamilyOption(
  kind: ChartFamilyKind,
  input: PluginEchartsOptionInput,
): Record<string, unknown> {
  let option: Record<string, unknown>;
  if (kind === 'line' || kind === 'area' || kind === 'bar') {
    option = buildCartesianOption(input, kind);
  } else if (kind === 'pie' || kind === 'donut') {
    option = buildPieOption(input);
    if (kind === 'pie' && Array.isArray(option.series)) {
      const series = option.series[0];
      if (series !== null && typeof series === 'object') Object.assign(series, { radius: '68%' });
    }
  } else if (kind === 'hbar') {
    option = buildCartesianOption(input, 'bar');
    const category = option.xAxis;
    option.xAxis = option.yAxis;
    option.yAxis = {
      ...(category !== null && typeof category === 'object' ? category : {}),
      inverse: true,
    };
  } else {
    const first = input.data.series[0];
    const categories = first?.points.map((point) => formatCategory(point.x)) ?? [];
    const tooltip = { show: input.showTooltip, trigger: 'item' };
    const frame = buildCartesianOption(input, 'line');
    option = {
      backgroundColor: 'transparent',
      animation: false,
      textStyle: { color: input.textColor },
      tooltip,
    };
    if (kind === 'gauge') {
      const props = input.props ?? {};
      const min = finiteNumber(props.min, 0);
      const max = Math.max(min + 1, finiteNumber(props.max, 100));
      const unit = typeof props.unit === 'string' ? props.unit : '';
      const decimals = Math.trunc(Math.max(0, Math.min(4, finiteNumber(props.decimals, 1))));
      const raw = first?.points.at(-1)?.y ?? 0;
      option.series = [
        {
          type: 'gauge',
          min,
          max,
          startAngle: 210,
          endAngle: -30,
          radius: '92%',
          center: ['50%', '58%'],
          progress: { show: true, width: 10, itemStyle: { color: input.seriesColor } },
          axisLine: { lineStyle: { width: 10, color: [[1, input.gridColor]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            formatter: `{value}${unit}`,
            color: input.textColor,
            fontSize: 24,
            offsetCenter: [0, '38%'],
          },
          data: [{ value: Number(raw.toFixed(decimals)), name: input.titleText }],
        },
      ];
    } else if (kind === 'radar') {
      const max =
        input.data.series.reduce(
          (value, entry) => entry.points.reduce((bound, point) => Math.max(bound, point.y), value),
          1,
        ) * 1.1;
      option.radar = {
        indicator: categories.map((name) => ({ name, max })),
        center: ['50%', '54%'],
        radius: '64%',
        splitLine: { lineStyle: { color: input.gridColor } },
        splitArea: { show: false },
        axisName: { color: input.textColor },
      };
      option.series = [
        {
          type: 'radar',
          data: input.data.series.map((entry, index) => ({
            name: entry.label,
            value: entry.points.map((point) => point.y),
            itemStyle: { color: seriesColorAt(input.seriesColor, index) },
            areaStyle: { opacity: 0.15 },
          })),
        },
      ];
    } else if (kind === 'scatter') {
      option = {
        ...frame,
        tooltip,
        xAxis: {
          type: 'value',
          axisLabel: { color: input.textColor },
          splitLine: { lineStyle: { color: input.gridColor } },
        },
        series: input.data.series.map((entry, index) => ({
          type: 'scatter',
          name: entry.label,
          symbolSize: 8,
          itemStyle: { color: seriesColorAt(input.seriesColor, index) },
          data: entry.points.map((point, offset) => [
            typeof point.x === 'number' ? point.x : offset,
            point.y,
          ]),
        })),
      };
    } else {
      const points = input.data.series.flatMap((entry, row) =>
        entry.points.map((point, column) => [column, row, point.y]),
      );
      const max = input.data.series.reduce(
        (value, entry) => entry.points.reduce((bound, point) => Math.max(bound, point.y), value),
        1,
      );
      option = {
        ...frame,
        tooltip,
        grid: { left: 64, right: 24, top: 40, bottom: 56 },
        xAxis: { type: 'category', data: categories, axisLabel: { color: input.textColor } },
        yAxis: {
          type: 'category',
          data: input.data.series.map((entry) => entry.label),
          axisLabel: { color: input.textColor },
        },
        visualMap: {
          min: 0,
          max,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          textStyle: { color: input.textColor },
          inRange: { color: ['#0f2235', input.seriesColor] },
        },
        series: [{ type: 'heatmap', data: points }],
      };
    }
    if (input.titleText !== '')
      option.title = { text: input.titleText, textStyle: { color: input.textColor } };
    if (input.data.series.length > 1 && kind === 'radar')
      option.legend = { textStyle: { color: input.textColor } };
  }
  if (input.props?.showLegend === false) delete option.legend;
  return option;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
