import {
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';

export const PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME = 'base-screen-plugin-echarts-series-picker';
export const PLUGIN_ECHARTS_PANEL_TAG_NAME = 'base-screen-plugin-echarts-panel';

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
    throw new Error('plugin-echarts editor descriptor is invalid.');
  }
  return parsed.value;
}
