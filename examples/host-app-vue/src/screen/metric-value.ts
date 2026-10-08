import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';

/**
 * 三端共有的宿主自有物料「指标读数」manifest：React / Vue / Vanilla 三个前端
 * 各自用自己的技术栈实现元素，但 type / tagName / schema 完全一致——种子文档
 * （host-api）因此可以在三个前端里渲染同一份 canonical 文档。
 *
 * dataCapabilities 声明 `host-resource`：物料经宿主数据通道消费后端
 * `/api/metrics/series` 的 mock 数据；`staticData` 让作者在未绑定数据时也能看到示例值。
 * 官方物料里只有 `base.image` 支持宿主资源，所以「绑宿主资源的读数」本身就是宿主自有物料的位置。
 *
 * 物料是原子的：只画「数值 + 单位」，`unit` 属于读数本身的构成。卡片外观不在这里——标题由
 * 文档层另放一个 `base.text`，底座与边框由 `base.container`（或边框物料）承担；需要成套搬运
 * 这份组合时，用 `insertComponentFragment` 一次插入。
 */
export const METRIC_VALUE_TYPE = 'host-app.metric-value';
export const METRIC_VALUE_TAG = 'host-app-metric-value';

export const METRIC_VALUE_MANIFEST: BaseScreenMaterialManifest = {
  type: METRIC_VALUE_TYPE,
  tagName: METRIC_VALUE_TAG,
  name: '指标读数',
  category: '宿主业务',
  keywords: ['指标', '读数', 'KPI'],
  defaultSize: { width: 200, height: 64 },
  defaultProps: { unit: '%' },
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
      unit: { kind: 'string' },
    },
    required: [],
  },
  propertyPanel: [{ prop: 'unit', label: '单位', control: 'text' }],
  events: [],
  dataCapabilities: ['static', 'host-resource'],
  dataBinding: {
    roles: [{ id: 'value', minFields: 1, maxFields: 1, valueTypes: ['number'] }],
  },
  designCapabilities: { resize: true, rotate: false, children: false },
};
