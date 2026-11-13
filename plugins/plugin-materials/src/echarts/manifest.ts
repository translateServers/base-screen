import {
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenMaterialPropSchema,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';

export const PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME = 'base-screen-plugin-echarts-series-picker';

const PLUGIN_ECHARTS_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    titleText: { kind: 'string' },
    showTooltip: { kind: 'boolean' },
    seriesType: { kind: 'enum', values: ['line', 'bar', 'area', 'pie'] },
  },
  required: ['titleText', 'showTooltip', 'seriesType'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_ECHARTS_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'plugin.echarts',
  tagName: 'base-screen-plugin-echarts',
  name: 'ECharts 图表',
  category: '数据',
  keywords: ['图表', 'ECharts', '折线', '面积', '柱状', '环形'],
  defaultSize: { width: 480, height: 280 },
  defaultProps: {
    titleText: '',
    showTooltip: true,
    seriesType: 'line',
  },
  defaultData: {
    fields: [
      { id: 'category', label: '分类', valueType: 'string', nullable: false },
      { id: 'value', label: '数值', valueType: 'number', nullable: false },
    ],
    rows: [
      { category: '00:00', value: 320 },
      { category: '04:00', value: 268 },
      { category: '08:00', value: 512 },
      { category: '12:00', value: 684 },
      { category: '16:00', value: 596 },
      { category: '20:00', value: 742 },
    ],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { dimension: ['category'], measures: ['value'] } },
  },
  defaultStyle: {
    backgroundColor: '#111827',
    color: '#f9fafb',
    gridColor: '#374151',
    seriesColor: '#38bdf8',
    opacity: 1,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      gridColor: { kind: 'string' },
      seriesColor: { kind: 'string' },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
    },
    required: ['backgroundColor', 'color', 'gridColor', 'seriesColor'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color' },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'gridColor', label: '网格色', control: 'color' },
    { style: 'seriesColor', label: '图形色', control: 'color' },
  ],
  propsSchema: PLUGIN_ECHARTS_PROPS_SCHEMA,
  propertyPanel: [
    { prop: 'titleText', label: '标题', control: 'text' },
    { prop: 'showTooltip', label: '提示框', control: 'boolean' },
  ],
  events: ['seriesClick'],
  editorDescriptor: parseEchartsEditorDescriptor(),
  dataCapabilities: ['static', 'dataset', 'variable', 'host-resource'],
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
};

const CHART_FAMILY_IDENTITIES = [
  ['line', '折线图', 640, 320],
  ['area', '面积图', 640, 320],
  ['bar', '柱状图', 560, 320],
  ['hbar', '条形图', 560, 320],
  ['pie', '饼图', 420, 300],
  ['donut', '环形图', 420, 300],
  ['gauge', '仪表盘', 320, 260],
  ['radar', '雷达图', 420, 320],
  ['scatter', '散点图', 560, 320],
  ['heatmap', '热力图', 560, 320],
] as const;

/** 已交付图表家族的稳定身份与角色；与通用图表共享渲染器，不在宿主复制实现。 */
export const PLUGIN_ECHARTS_MATERIAL_MANIFESTS: readonly BaseScreenMaterialManifest[] = [
  PLUGIN_ECHARTS_MATERIAL_MANIFEST,
  ...CHART_FAMILY_IDENTITIES.map(([kind, name, width, height]): BaseScreenMaterialManifest => {
    const extra: Record<string, BaseScreenMaterialPropSchema> =
      kind === 'gauge'
        ? {
            min: { kind: 'number' },
            max: { kind: 'number' },
            unit: { kind: 'string' },
            decimals: { kind: 'number', minimum: 0, maximum: 4 },
          }
        : {};
    const { editorDescriptor: _descriptor, ...base } = PLUGIN_ECHARTS_MATERIAL_MANIFEST;
    return {
      ...base,
      type: `plugin.chart.${kind}`,
      tagName: `base-screen-plugin-chart-${kind}`,
      name,
      keywords: ['图表', name],
      defaultSize: { width, height },
      defaultProps: {
        titleText: '',
        showTooltip: true,
        showLegend: true,
        ...(kind === 'gauge' ? { min: 0, max: 100, unit: '', decimals: 1 } : {}),
      },
      defaultStyle: {
        backgroundColor: 'transparent',
        color: '#94a3b8',
        gridColor: '#1e3a5f',
        seriesColor: '#36cfc9',
        opacity: 1,
      },
      propsSchema: {
        kind: 'object',
        properties: {
          titleText: { kind: 'string' },
          showTooltip: { kind: 'boolean' },
          showLegend: { kind: 'boolean' },
          ...extra,
        },
        required: ['titleText', 'showTooltip', 'showLegend', ...Object.keys(extra)],
      },
      propertyPanel: [
        { prop: 'titleText', label: '标题', control: 'text' },
        { prop: 'showTooltip', label: '提示框', control: 'boolean' },
        { prop: 'showLegend', label: '图例', control: 'boolean' },
        ...(kind === 'gauge'
          ? [
              { prop: 'min', label: '最小值', control: 'number' as const },
              { prop: 'max', label: '最大值', control: 'number' as const },
              { prop: 'unit', label: '单位', control: 'text' as const },
              { prop: 'decimals', label: '小数位', control: 'number' as const },
            ]
          : []),
      ],
    };
  }),
];

function parseEchartsEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        {
          id: 'series',
          label: '系列',
          fields: [
            {
              id: 'seriesType',
              target: 'props',
              path: ['seriesType'],
              label: '图表类型',
              control: 'custom',
              tagName: PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
            },
          ],
        },
      ],
    },
    PLUGIN_ECHARTS_PROPS_SCHEMA,
    undefined,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials chart editor descriptor is invalid.');
  }
  return parsed.value;
}
