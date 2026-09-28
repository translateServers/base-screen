import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';

/**
 * 三端共有的宿主自有物料「指标卡」manifest：React / Vue / Vanilla 三个前端
 * 各自用自己的技术栈实现元素，但 type / tagName / schema 完全一致——种子文档
 * （host-api）因此可以在三个前端里渲染同一份 canonical 文档。
 */
export const KPI_CARD_TYPE = 'host-app.kpi-card';
export const KPI_CARD_TAG = 'host-app-kpi-card';

export const KPI_CARD_MANIFEST: BaseScreenMaterialManifest = {
  type: KPI_CARD_TYPE,
  tagName: KPI_CARD_TAG,
  name: '指标卡',
  category: '宿主业务',
  keywords: ['指标', 'KPI'],
  defaultSize: { width: 260, height: 120 },
  defaultProps: { label: 'CPU 使用率', unit: '%' },
  defaultData: {
    fields: [{ id: 'value', label: '当前值', valueType: 'number' }],
    rows: [{ value: 0 }],
  },
  staticData: { kind: 'tabular', defaultBinding: { fields: { value: ['value'] } } },
  defaultStyle: {},
  styleSchema: { kind: 'object', properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object',
    properties: {
      label: { kind: 'string' },
      unit: { kind: 'string' },
    },
    required: ['label'],
  },
  propertyPanel: [
    { prop: 'label', label: '名称', control: 'text' },
    { prop: 'unit', label: '单位', control: 'text' },
  ],
  events: [],
  dataCapabilities: ['static', 'host-resource'],
  dataBinding: {
    roles: [{ id: 'value', minFields: 1, maxFields: 1, valueTypes: ['number'] }],
  },
  designCapabilities: { resize: true, rotate: false, children: false },
};

/** KPI 卡的视图模型投影：表格数据 -> `{ value }`。 */
export interface KpiCardViewModel {
  readonly value: number;
}
