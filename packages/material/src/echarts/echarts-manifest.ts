import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { BASE_SCREEN_ECHARTS_EDITOR_DESCRIPTOR } from './echarts-editor-descriptor.js';
import { BASE_SCREEN_ECHARTS_PROPS_SCHEMA } from './echarts-props-schema.js';

export const BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.echarts',
  tagName: 'base-screen-echarts',
  name: 'ECharts 图表',
  category: '数据',
  keywords: ['图表', 'ECharts', '折线', '柱状'],
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
  propsSchema: BASE_SCREEN_ECHARTS_PROPS_SCHEMA,
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
  editorDescriptor: BASE_SCREEN_ECHARTS_EDITOR_DESCRIPTOR,
};
