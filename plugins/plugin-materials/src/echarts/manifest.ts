import {
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialEditorFieldInput,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenMaterialPropSchema,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';
import {
  createBaseScreenChartLegendConfig,
  createBaseScreenChartTitleConfig,
  createBaseScreenNumberFormatConfig,
  mergeBaseScreenMaterialConfigGroups,
} from '@base-screen/plugin-sdk';

export const PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME = 'base-screen-plugin-echarts-series-picker';

/**
 * 图表的通用配置走配置组（base-screen-docs ADR-0102 §11）：标题、图例与仪表盘的数值格式在
 * 所有图表里同键、同顺序、同控件。字段不写 control，由解析期按语义推导。
 */
const CHART_TITLE = createBaseScreenChartTitleConfig();
const CHART_LEGEND = createBaseScreenChartLegendConfig();
const GAUGE_NUMBER_FORMAT = createBaseScreenNumberFormatConfig({
  unit: true,
  decimals: 1,
  maxDecimals: 4,
});

/** 仪表盘的量程：无界数字，按语义推导为数字框。 */
const GAUGE_RANGE_PROPERTIES: Readonly<Record<string, BaseScreenMaterialPropSchema>> = {
  min: { kind: 'number' },
  max: { kind: 'number' },
};

const SHOW_TOOLTIP_FIELD: BaseScreenMaterialEditorFieldInput = {
  id: 'showTooltip',
  target: 'props',
  path: ['showTooltip'],
  label: '显示提示框',
};

const CHART_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    gridColor: { kind: 'string' },
    seriesColor: { kind: 'string' },
    opacity: { kind: 'number', minimum: 0, maximum: 1 },
  },
  required: ['backgroundColor', 'color', 'gridColor', 'seriesColor'],
} satisfies BaseScreenMaterialObjectSchema;

const PLUGIN_ECHARTS_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    ...CHART_TITLE.properties,
    showTooltip: { kind: 'boolean' },
    seriesType: { kind: 'enum', values: ['line', 'bar', 'area', 'pie'] },
  },
  required: [...CHART_TITLE.required, 'showTooltip', 'seriesType'],
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
  styleSchema: CHART_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: PLUGIN_ECHARTS_PROPS_SCHEMA,
  propertyPanel: [],
  events: ['seriesClick'],
  editorDescriptor: parseChartEditorDescriptor('plugin.echarts', PLUGIN_ECHARTS_PROPS_SCHEMA, {
    seriesPicker: true,
  }),
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
    const gauge = kind === 'gauge';
    const groups = mergeBaseScreenMaterialConfigGroups(
      gauge ? [CHART_TITLE, CHART_LEGEND, GAUGE_NUMBER_FORMAT] : [CHART_TITLE, CHART_LEGEND],
    );
    const propsSchema: BaseScreenMaterialObjectSchema = {
      kind: 'object',
      properties: {
        ...groups.properties,
        showTooltip: { kind: 'boolean' },
        ...(gauge ? GAUGE_RANGE_PROPERTIES : {}),
      },
      required: [...groups.required, 'showTooltip', ...(gauge ? ['min', 'max'] : [])],
    };
    const type = `plugin.chart.${kind}`;
    const { editorDescriptor: _descriptor, ...base } = PLUGIN_ECHARTS_MATERIAL_MANIFEST;
    return {
      ...base,
      type,
      tagName: `base-screen-plugin-chart-${kind}`,
      name,
      keywords: ['图表', name],
      defaultSize: { width, height },
      defaultProps: {
        ...groups.defaults,
        showTooltip: true,
        ...(gauge ? { min: 0, max: 100 } : {}),
      },
      defaultStyle: {
        backgroundColor: 'transparent',
        color: '#94a3b8',
        gridColor: '#1e3a5f',
        seriesColor: '#36cfc9',
        opacity: 1,
      },
      propsSchema,
      propertyPanel: [],
      editorDescriptor: parseChartEditorDescriptor(type, propsSchema, { legend: true, gauge }),
    };
  }),
];

/**
 * 图表检查器（ADR-0099 §2.4 外观区顺序）：读数格式（仅仪表盘）→ 结构 → 文字 → 填充与描边。
 * 通用图表的系列类型用插件自带的选择器（`custom`），其余字段都按语义推导控件。
 */
function parseChartEditorDescriptor(
  materialType: string,
  propsSchema: BaseScreenMaterialObjectSchema,
  options: {
    readonly seriesPicker?: boolean;
    readonly legend?: boolean;
    readonly gauge?: boolean;
  },
): BaseScreenMaterialEditorDescriptor {
  const structure: BaseScreenMaterialEditorFieldInput[] = [
    ...(options.seriesPicker === true
      ? [
          {
            id: 'seriesType',
            target: 'props' as const,
            path: ['seriesType'],
            label: '图表类型',
            control: 'custom' as const,
            tagName: PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
          },
        ]
      : []),
    ...CHART_TITLE.fields,
    ...(options.legend === true ? CHART_LEGEND.fields : []),
    SHOW_TOOLTIP_FIELD,
    ...(options.gauge === true
      ? [
          { id: 'min', target: 'props' as const, path: ['min'], label: '最小值' },
          { id: 'max', target: 'props' as const, path: ['max'], label: '最大值' },
        ]
      : []),
  ];
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        ...(options.gauge === true
          ? [{ id: 'format', label: '读数格式', fields: GAUGE_NUMBER_FORMAT.fields }]
          : []),
        { id: 'structure', label: '结构', fields: structure },
        {
          id: 'text',
          label: '文字',
          fields: [{ id: 'color', target: 'style', path: ['color'], label: '文字色' }],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            { id: 'backgroundColor', target: 'style', path: ['backgroundColor'], label: '背景色' },
            { id: 'gridColor', target: 'style', path: ['gridColor'], label: '网格色' },
            { id: 'seriesColor', target: 'style', path: ['seriesColor'], label: '图形色' },
          ],
        },
      ],
    },
    propsSchema,
    CHART_STYLE_SCHEMA,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error(
      `${materialType} editor descriptor is invalid: ${parsed.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(', ')}`,
    );
  }
  return parsed.value;
}
