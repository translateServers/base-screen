import {
  SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY,
  type ScreenDatasetField,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenTabularDataset,
} from '../../../packages/contracts/src/index.ts';
import {
  applyBackgroundColorOrGradient,
  BaseScreenOfficialMaterialElement,
} from '../../../packages/material/src/base-material.ts';
import type {
  BaseScreenChartData,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialEditorDescriptor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialTabularDataAdapter,
} from '../../../packages/plugin-core/src/index.ts';
import { parseBaseScreenChartData } from '../../../packages/plugin-core/src/index.ts';
import { createMaterialDefinition } from '../../../packages/plugin-sdk/src/index.ts';

/**
 * 语义图表演示物料（仅存在于本验证工程，不随任何包发布）。
 *
 * 它承载的是 Base Screen 的受限 Editor Descriptor 参考用法：分组、高级折叠、
 * 条件字段、可重排数组、字段选择器与结构化事件声明。渲染层只是让断言能观察
 * 到「有 svg / 有数据点」的最小近似物，不代表任何具体图表库。
 */

const NUMBER = (minimum?: number, maximum?: number) => ({
  kind: 'number' as const,
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const STRING = (maxLength?: number) =>
  maxLength === undefined ? { kind: 'string' as const } : { kind: 'string' as const, maxLength };
const BOOLEAN = { kind: 'boolean' as const };
const ENUM = (values: readonly (string | number | boolean)[]) => ({
  kind: 'enum' as const,
  values,
});

export const HARNESS_SEMANTIC_CHART_PROPS_SCHEMA = {
  kind: 'object' as const,
  properties: {
    title: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        text: STRING(128),
        color: STRING(),
        fontSize: NUMBER(8, 64),
      },
      required: [],
    },
    legend: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        position: ENUM(['top', 'bottom', 'left', 'right']),
        fontSize: NUMBER(8, 32),
      },
      required: [],
    },
    grid: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        top: NUMBER(0, 200),
        right: NUMBER(0, 200),
        bottom: NUMBER(0, 200),
        left: NUMBER(0, 200),
      },
      required: [],
    },
    xAxis: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        name: STRING(64),
        color: STRING(),
        fontSize: NUMBER(8, 32),
      },
      required: [],
    },
    yAxis: {
      kind: 'object' as const,
      properties: { show: BOOLEAN, name: STRING(64), color: STRING() },
      required: [],
    },
    yAxis2: {
      kind: 'object' as const,
      properties: { show: BOOLEAN, name: STRING(64), color: STRING() },
      required: [],
    },
    series: {
      kind: 'array' as const,
      items: {
        kind: 'object' as const,
        properties: {
          name: STRING(128),
          type: ENUM(['line', 'bar', 'area']),
          xField: STRING(256),
          yField: STRING(256),
          yAxisIndex: ENUM([0, 1]),
          color: STRING(),
          lineWidth: NUMBER(1, 8),
        },
        required: [],
      },
      minItems: 0,
      maxItems: 16,
    },
    tooltip: {
      kind: 'object' as const,
      properties: { show: BOOLEAN, trigger: ENUM(['axis', 'item']) },
      required: [],
    },
    interactions: {
      kind: 'object' as const,
      properties: {
        hover: BOOLEAN,
        select: BOOLEAN,
        click: ENUM(['none', 'host-event']),
      },
      required: [],
    },
    advanced: {
      kind: 'object' as const,
      properties: {
        showDataLabels: BOOLEAN,
        axisLabelRotate: NUMBER(0, 90),
        symbolSize: NUMBER(2, 12),
        areaOpacity: NUMBER(0, 1),
      },
      required: [],
    },
  },
  required: [],
};

export const HARNESS_SEMANTIC_CHART_EDITOR_DESCRIPTOR: BaseScreenMaterialEditorDescriptor = {
  appearance: [
    {
      id: 'surface',
      label: '组件',
      fields: [
        {
          id: 'backgroundColor',
          target: 'style',
          path: ['backgroundColor'],
          label: '背景色',
          control: 'color',
          allowGradient: true,
          batchable: true,
        },
        {
          id: 'textColor',
          target: 'style',
          path: ['color'],
          label: '文字色',
          control: 'color',
          batchable: true,
        },
        {
          id: 'gridColor',
          target: 'style',
          path: ['gridColor'],
          label: '网格色',
          control: 'color',
          batchable: true,
        },
      ],
    },
    {
      id: 'title',
      label: '标题',
      fields: [
        {
          id: 'titleShow',
          target: 'props',
          path: ['title', 'show'],
          label: '显示标题',
          control: 'boolean',
        },
        {
          id: 'titleText',
          target: 'props',
          path: ['title', 'text'],
          label: '标题文本',
          control: 'text',
        },
        {
          id: 'titleColor',
          target: 'props',
          path: ['title', 'color'],
          label: '标题颜色',
          control: 'color',
        },
        {
          id: 'titleSize',
          target: 'props',
          path: ['title', 'fontSize'],
          label: '字号',
          control: 'stepper',
          unit: 'px',
          min: 8,
          max: 64,
        },
      ],
    },
    {
      id: 'legend',
      label: '图例',
      fields: [
        {
          id: 'legendShow',
          target: 'props',
          path: ['legend', 'show'],
          label: '显示图例',
          control: 'boolean',
        },
        {
          id: 'legendPosition',
          target: 'props',
          path: ['legend', 'position'],
          label: '位置',
          control: 'select',
        },
        {
          id: 'legendSize',
          target: 'props',
          path: ['legend', 'fontSize'],
          label: '字号',
          control: 'unit-number',
          unit: 'px',
        },
      ],
    },
    {
      id: 'grid',
      label: '网格',
      fields: [
        {
          id: 'gridShow',
          target: 'props',
          path: ['grid', 'show'],
          label: '显示网格',
          control: 'boolean',
        },
        {
          id: 'gridTop',
          target: 'props',
          path: ['grid', 'top'],
          label: '上边距',
          control: 'unit-number',
          unit: 'px',
        },
        {
          id: 'gridRight',
          target: 'props',
          path: ['grid', 'right'],
          label: '右边距',
          control: 'unit-number',
          unit: 'px',
        },
        {
          id: 'gridBottom',
          target: 'props',
          path: ['grid', 'bottom'],
          label: '下边距',
          control: 'unit-number',
          unit: 'px',
        },
        {
          id: 'gridLeft',
          target: 'props',
          path: ['grid', 'left'],
          label: '左边距',
          control: 'unit-number',
          unit: 'px',
        },
      ],
    },
    {
      id: 'axes',
      label: '坐标轴',
      fields: [
        {
          id: 'xAxisShow',
          target: 'props',
          path: ['xAxis', 'show'],
          label: '显示 X 轴',
          control: 'boolean',
        },
        {
          id: 'xAxisName',
          target: 'props',
          path: ['xAxis', 'name'],
          label: 'X 轴名称',
          control: 'text',
        },
        {
          id: 'yAxisShow',
          target: 'props',
          path: ['yAxis', 'show'],
          label: '显示 Y 轴',
          control: 'boolean',
        },
        {
          id: 'yAxisName',
          target: 'props',
          path: ['yAxis', 'name'],
          label: 'Y 轴名称',
          control: 'text',
        },
        {
          id: 'yAxis2Show',
          target: 'props',
          path: ['yAxis2', 'show'],
          label: '显示次 Y 轴',
          control: 'boolean',
        },
        {
          id: 'yAxis2Name',
          target: 'props',
          path: ['yAxis2', 'name'],
          label: '次 Y 轴名称',
          control: 'text',
          when: [{ path: ['yAxis2', 'show'], operator: 'eq', value: true }],
        },
      ],
    },
    {
      id: 'series',
      label: '系列',
      fields: [
        {
          id: 'series',
          target: 'props',
          path: ['series'],
          label: '系列',
          control: 'reorderable-array',
          itemLabel: '系列 {index}',
          itemFields: [
            {
              id: 'seriesName',
              target: 'props',
              path: ['name'],
              label: '名称',
              control: 'text',
            },
            {
              id: 'seriesType',
              target: 'props',
              path: ['type'],
              label: '类型',
              control: 'select',
            },
            {
              id: 'seriesXField',
              target: 'props',
              path: ['xField'],
              label: 'X 字段',
              control: 'field-selector',
            },
            {
              id: 'seriesYField',
              target: 'props',
              path: ['yField'],
              label: 'Y 字段',
              control: 'field-selector',
            },
            {
              id: 'seriesYAxis',
              target: 'props',
              path: ['yAxisIndex'],
              label: 'Y 轴',
              control: 'select',
            },
            {
              id: 'seriesColor',
              target: 'props',
              path: ['color'],
              label: '颜色',
              control: 'color',
            },
            {
              id: 'seriesLineWidth',
              target: 'props',
              path: ['lineWidth'],
              label: '线宽',
              control: 'unit-number',
              unit: 'px',
            },
          ],
        },
      ],
    },
    {
      id: 'advanced',
      label: '高级',
      advanced: true,
      fields: [
        {
          id: 'showDataLabels',
          target: 'props',
          path: ['advanced', 'showDataLabels'],
          label: '显示数据标签',
          control: 'boolean',
        },
        {
          id: 'axisLabelRotate',
          target: 'props',
          path: ['advanced', 'axisLabelRotate'],
          label: '轴标签旋转',
          control: 'unit-number',
          unit: '°',
        },
        {
          id: 'symbolSize',
          target: 'props',
          path: ['advanced', 'symbolSize'],
          label: '标记大小',
          control: 'unit-number',
          unit: 'px',
        },
        {
          id: 'areaOpacity',
          target: 'props',
          path: ['advanced', 'areaOpacity'],
          label: '面积透明度',
          control: 'number',
          min: 0,
          max: 1,
        },
      ],
    },
  ],
  data: [
    {
      id: 'binding',
      label: '数据绑定',
      fields: [
        {
          id: 'dimensionField',
          target: 'data',
          path: ['binding', 'fields', 'dimension', 0],
          label: '维度字段',
          control: 'field-selector',
        },
        {
          id: 'measureField',
          target: 'data',
          path: ['binding', 'fields', 'measures', 0],
          label: '主指标字段',
          control: 'field-selector',
        },
        {
          id: 'secondMeasureField',
          target: 'data',
          path: ['binding', 'fields', 'measures', 1],
          label: '次指标字段',
          control: 'field-selector',
        },
      ],
    },
  ],
  interaction: [
    {
      id: 'behaviors',
      label: '交互',
      fields: [
        {
          id: 'tooltipShow',
          target: 'interaction',
          projection: 'props',
          path: ['tooltip', 'show'],
          label: '显示提示',
          control: 'boolean',
        },
        {
          id: 'tooltipTrigger',
          target: 'interaction',
          projection: 'props',
          path: ['tooltip', 'trigger'],
          label: '提示触发',
          control: 'select',
        },
        {
          id: 'hover',
          target: 'interaction',
          projection: 'props',
          path: ['interactions', 'hover'],
          label: '悬停高亮',
          control: 'boolean',
        },
        {
          id: 'select',
          target: 'interaction',
          projection: 'props',
          path: ['interactions', 'select'],
          label: '选中高亮',
          control: 'boolean',
        },
        {
          id: 'click',
          target: 'interaction',
          projection: 'props',
          path: ['interactions', 'click'],
          label: '点击行为',
          control: 'select',
          help: 'host-event 可被 Blueprint 事件规则使用',
        },
      ],
    },
  ],
  events: [
    {
      name: 'seriesClick',
      label: '系列点击',
      hint: '点击系列数据点触发',
      maxPayloadBytes: 65536,
      triggerContexts: ['blueprint'],
      requiredCapability: SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY,
      payloadSchema: {
        kind: 'object',
        properties: {
          seriesIndex: { kind: 'number' },
          seriesName: { kind: 'string' },
          pointIndex: { kind: 'number' },
          x: { kind: 'string' },
          y: { kind: 'number' },
        },
        required: [],
      },
    },
  ],
};

export const HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'harness.semantic-chart',
  tagName: 'harness-semantic-chart',
  name: '语义图表',
  category: '数据',
  keywords: ['图表', '语义', '折线', '柱状'],
  defaultSize: { width: 480, height: 280 },
  defaultProps: {
    title: { show: true, text: '标题', color: '#111827', fontSize: 16 },
    legend: { show: true, position: 'top', fontSize: 12 },
    grid: { show: true, top: 32, right: 24, bottom: 24, left: 48 },
    xAxis: { show: true, name: '', color: '#6b7280', fontSize: 12 },
    yAxis: { show: true, name: '', color: '#6b7280' },
    yAxis2: { show: false, name: '', color: '#9ca3af' },
    series: [
      {
        name: '系列 1',
        type: 'line',
        xField: '',
        yField: '',
        yAxisIndex: 0,
        color: '#38bdf8',
        lineWidth: 2,
      },
    ],
    tooltip: { show: true, trigger: 'axis' },
    interactions: { hover: true, select: false, click: 'none' },
    advanced: { showDataLabels: false, axisLabelRotate: 0, symbolSize: 4, areaOpacity: 0.2 },
  },
  defaultData: {
    fields: [
      { id: 'region', label: '区域', valueType: 'string', nullable: false },
      { id: 'amount', label: '订单金额', valueType: 'number', nullable: false },
    ],
    rows: [
      { region: 'north', amount: 42 },
      { region: 'south', amount: 36 },
      { region: 'east', amount: 28 },
      { region: 'west', amount: 24 },
      { region: 'central', amount: 19 },
    ],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { dimension: ['region'], measures: ['amount'] } },
  },
  defaultStyle: {
    backgroundColor: '#111827',
    color: '#f9fafb',
    gridColor: '#374151',
    opacity: 1,
    flipX: false,
    flipY: false,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      gridColor: { kind: 'string' },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
      flipX: { kind: 'boolean' },
      flipY: { kind: 'boolean' },
    },
    required: ['backgroundColor', 'color', 'gridColor'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'gridColor', label: '网格色', control: 'color' },
  ],
  propsSchema: HARNESS_SEMANTIC_CHART_PROPS_SCHEMA,
  propertyPanel: [],
  events: ['seriesClick'],
  dataCapabilities: ['static', 'dataset', 'variable'],
  dataBinding: {
    roles: [
      {
        id: 'dimension',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['string', 'number', 'boolean', 'date'],
      },
      { id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
  editorDescriptor: HARNESS_SEMANTIC_CHART_EDITOR_DESCRIPTOR,
};

const SEMANTIC_CHART_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#4ade80', '#facc15', '#fb7185'];

export class HarnessSemanticChartMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    applyBackgroundColorOrGradient(this, stringValue(model.style.backgroundColor));
    this.style.color = stringValue(model.style.color);
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', '语义图表');

    if (model.dataState.status !== 'ready') {
      this.renderState(
        model.dataState.status === 'loading'
          ? '加载中'
          : model.dataState.status === 'error'
            ? '数据不可用'
            : '暂无数据',
      );
      return;
    }
    const parsed = parseBaseScreenChartData(model.dataState.value);
    if (!parsed.ok) {
      this.renderState('数据格式无效');
      return;
    }
    this.renderChart(parsed.value, model);
  }

  private renderChart(
    data: BaseScreenChartData,
    model: NonNullable<typeof this.materialModel>,
  ): void {
    const props = model.props;
    const read = (path: readonly string[]): ScreenJsonValue | undefined => readPath(props, path);
    const svg = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 62');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText =
      'display: block; width: 100%; height: 100%; padding: 4px 12px 10px; box-sizing: border-box;';
    const gridColor = stringValue(model.style.gridColor);
    const titleText = stringValue(read(['title', 'text']));
    const showTitle = booleanValue(read(['title', 'show']), false);
    const showGrid = booleanValue(read(['grid', 'show']), true);
    const showDataLabels = booleanValue(read(['advanced', 'showDataLabels']), false);
    const symbolSize = numberValue(read(['advanced', 'symbolSize']), 4);
    const hover = booleanValue(read(['interactions', 'hover']), true);
    const select = booleanValue(read(['interactions', 'select']), false);
    const seriesProps = arrayValue(read(['series']));

    if (showTitle && titleText !== '') {
      const text = this.svgElement('text', {
        x: 50,
        y: 6,
        'text-anchor': 'middle',
        fill: stringValue(read(['title', 'color'])) || 'currentColor',
        'font-size': numberValue(read(['title', 'fontSize']), 16),
        'font-weight': 'bold',
      });
      text.textContent = titleText;
      svg.appendChild(text);
    }
    const plot = { top: 10, right: 92, bottom: 54, left: 8 };
    if (showGrid) {
      for (const y of [16, 28, 40]) {
        svg.appendChild(
          this.svgElement('line', {
            x1: plot.left,
            x2: plot.right,
            y1: y,
            y2: y,
            stroke: gridColor,
            'stroke-width': 0.35,
          }),
        );
      }
    }
    const values = data.series.flatMap((series) => series.points.map((point) => point.y));
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    data.series.forEach((series, seriesIndex) => {
      const seriesConfig = seriesProps[seriesIndex];
      const color =
        stringValue(seriesConfig?.color) || SEMANTIC_CHART_COLORS[seriesIndex] || '#38bdf8';
      const lineWidth = numberValue(seriesConfig?.lineWidth, 2);
      const kind = stringValue(seriesConfig?.type) || 'line';
      const points = series.points.map((point, pointIndex) => {
        const x =
          series.points.length <= 1
            ? (plot.left + plot.right) / 2
            : plot.left + (pointIndex * (plot.right - plot.left)) / (series.points.length - 1);
        const y = plot.bottom - ((point.y - min) / (max - min)) * 32;
        return { x, y, point, pointIndex };
      });
      if (kind === 'bar') {
        const barWidth = Math.min(8, (plot.right - plot.left) / (series.points.length * 2.2));
        for (const point of points) {
          svg.appendChild(
            this.svgElement('rect', {
              x: point.x - barWidth / 2,
              y: point.y,
              width: barWidth,
              height: Math.max(1, plot.bottom - point.y),
              fill: color,
              opacity: 0.85,
            }),
          );
        }
      } else {
        if (kind === 'area') {
          svg.appendChild(
            this.svgElement('polygon', {
              points: `${points[0]?.x ?? plot.left},${plot.bottom} ${points
                .map((point) => `${point.x},${point.y}`)
                .join(' ')} ${points[points.length - 1]?.x ?? plot.right},${plot.bottom}`,
              fill: color,
              opacity: numberValue(read(['advanced', 'areaOpacity']), 0.2),
            }),
          );
        }
        svg.appendChild(
          this.svgElement('polyline', {
            points: points.map((point) => `${point.x},${point.y}`).join(' '),
            fill: 'none',
            stroke: color,
            'stroke-width': lineWidth,
            'vector-effect': 'non-scaling-stroke',
          }),
        );
      }
      for (const point of points) {
        const circle = this.svgElement('circle', {
          cx: point.x,
          cy: point.y,
          r: hover || select ? symbolSize / 3 : 1.2,
          fill: color,
        });
        // 原生 CSS/悬停交互（光标与 hover 放大）与点击事件同受 interactive 门控：
        // 设计态「事件」开关关闭时圆点保持静态，开启（或 Viewer）时才出现交互示意。
        if (model.interactive) {
          circle.style.cursor = 'pointer';
          circle.addEventListener('mouseenter', () => {
            circle.setAttribute('r', String(symbolSize / 2));
          });
          circle.addEventListener('mouseleave', () => {
            circle.setAttribute('r', String(hover || select ? symbolSize / 3 : 1.2));
          });
        }
        circle.addEventListener('click', () =>
          this.emitSeriesClick(seriesIndex, series, point.point, point.pointIndex),
        );
        svg.appendChild(circle);
        if (showDataLabels) {
          const label = this.svgElement('text', {
            x: point.x,
            y: point.y - 2,
            'text-anchor': 'middle',
            fill: 'currentColor',
            'font-size': 4,
          });
          label.textContent = String(point.point.y);
          svg.appendChild(label);
        }
      }
    });
    this.appendChild(svg);
  }

  private renderState(message: string): void {
    const element = this.ownerDocument.createElement('div');
    element.textContent = message;
    element.style.cssText =
      'display: grid; place-items: center; height: 100%; opacity: .72; font: 13px sans-serif;';
    this.appendChild(element);
  }

  private emitSeriesClick(
    seriesIndex: number,
    series: BaseScreenChartData['series'][number],
    point: BaseScreenChartData['series'][number]['points'][number],
    pointIndex: number,
  ): void {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: {
          name: 'seriesClick',
          payload: {
            seriesIndex,
            seriesName: series.label,
            pointIndex,
            x: String(point.x),
            y: point.y,
          },
        },
      }),
    );
  }

  private svgElement(name: string, attributes: Record<string, number | string>): SVGElement {
    const element = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }
}

export function defineHarnessSemanticChartMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST,
    element: HarnessSemanticChartMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}

export const HARNESS_SEMANTIC_CHART_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({
    dataset,
    fields,
  }: {
    dataset: ScreenTabularDataset;
    fields: Readonly<Record<string, readonly ScreenDatasetField[]>>;
  }) {
    const dimension = fields.dimension?.[0];
    const measures = fields.measures;
    if (dimension === undefined || measures === undefined || measures.length === 0) {
      return invalidSemanticChartProjection();
    }
    return {
      ok: true,
      value: {
        series: measures.map((measure) => ({
          id: measure.id,
          label: measure.label,
          points: dataset.rows.flatMap((row) => {
            const x = row[dimension.id];
            const y = row[measure.id];
            return x === undefined || x === null || y === null
              ? []
              : typeof y === 'number' && Number.isFinite(y)
                ? [{ x, y }]
                : [];
          }),
        })),
      },
      diagnostics: [],
    };
  },
};

Object.defineProperty(HarnessSemanticChartMaterialElement, 'tabularDataAdapter', {
  value: HARNESS_SEMANTIC_CHART_TABULAR_DATA_ADAPTER,
});

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function arrayValue(value: unknown): readonly (Record<string, ScreenJsonValue> | undefined)[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, ScreenJsonValue>)
      : undefined,
  );
}

function readPath(
  record: Readonly<Record<string, ScreenJsonValue>>,
  path: readonly string[],
): ScreenJsonValue | undefined {
  let current: unknown = record;
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Readonly<Record<string, ScreenJsonValue>>)[segment];
  }
  return current as ScreenJsonValue | undefined;
}

function invalidSemanticChartProjection(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path: [],
        message: 'Semantic chart dataset binding is invalid.',
      },
    ],
  };
}
