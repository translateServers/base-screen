import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';

export const PLUGIN_ECHARTS_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'plugin.echarts',
  tagName: 'base-screen-plugin-echarts',
  name: 'ECharts 图表',
  category: '数据',
  keywords: ['图表', 'ECharts', '折线', '柱状'],
  defaultSize: { width: 480, height: 280 },
  defaultProps: {
    titleText: '',
    showTooltip: true,
    seriesType: 'line',
  },
  defaultStyle: {
    backgroundColor: '#111827',
    color: '#f9fafb',
    gridColor: '#374151',
    opacity: 1,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      gridColor: { kind: 'string' },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
    },
    required: ['backgroundColor', 'color', 'gridColor'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color' },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'gridColor', label: '网格色', control: 'color' },
  ],
  propsSchema: {
    kind: 'object',
    properties: {
      titleText: { kind: 'string' },
      showTooltip: { kind: 'boolean' },
      seriesType: { kind: 'enum', values: ['line', 'bar'] },
    },
    required: ['titleText', 'showTooltip', 'seriesType'],
  },
  propertyPanel: [
    { prop: 'titleText', label: '标题', control: 'text' },
    { prop: 'showTooltip', label: '提示框', control: 'boolean' },
    { prop: 'seriesType', label: '图表类型', control: 'select' },
  ],
  events: ['seriesClick'],
  dataCapabilities: ['static', 'dataset', 'variable'],
  designCapabilities: { resize: true, rotate: true, children: false },
};
