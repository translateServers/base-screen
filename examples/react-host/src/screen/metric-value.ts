import type {
  BaseScreenFragmentDefinition,
  BaseScreenMaterialManifest,
} from 'base-screen/plugin-core';

/**
 * 三端共有的宿主自有物料「指标读数」manifest：React / Vue / Vanilla 三个前端
 * 各自用自己的技术栈实现元素，但 type / tagName / schema 完全一致——种子文档
 * （shared-backend）因此可以在三个前端里渲染同一份 canonical 文档。
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

export const METRIC_VALUE_CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  height: '100%',
  padding: 'var(--bs-host-space-5) var(--bs-host-space-6)',
  color: 'var(--bs-host-text-primary)',
  font: 'var(--bs-host-font-size-sm) / 1.4 var(--bs-host-font-family)',
  boxSizing: 'border-box',
  overflow: 'hidden',
} as const;

export const METRIC_VALUE_NUMBER_STYLE = {
  fontSize: '30px',
  fontWeight: 600,
  color: 'var(--bs-host-accent)',
  fontVariantNumeric: 'tabular-nums',
} as const;

export const METRIC_VALUE_MANIFEST: BaseScreenMaterialManifest = {
  type: METRIC_VALUE_TYPE,
  tagName: METRIC_VALUE_TAG,
  name: '指标读数',
  category: '业务指标',
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

/**
 * 三端共有的宿主分片「指标卡」（ADR-0100）：容器底座 + 标题文本 + 指标读数三件套。
 *
 * 物料库里带「组合」角标，点击或拖入画布即展开为三个普通组件（父子成组、一次撤销）；
 * 展开后与手工搭的组合没有任何区别，文档里不留分片引用。外观由外壳 `base.container` 承担，
 * 标题是独立的 `base.text`——读数物料保持原子，不为「卡片」长出标题或边框属性。
 */
export const METRIC_CARD_FRAGMENT: BaseScreenFragmentDefinition = {
  id: 'host-app.metric-card',
  name: '指标卡',
  category: '业务指标',
  keywords: ['指标', '卡片', 'KPI'],
  shell: {
    key: 'card',
    materialType: 'base.container',
    name: '指标卡',
    size: { width: 240, height: 128 },
    style: {
      fill: 'rgba(15, 23, 42, 0.72)',
      borderColor: 'rgba(148, 163, 184, 0.35)',
      borderWidth: 1,
    },
  },
  nodes: [
    {
      key: 'title',
      materialType: 'base.text',
      name: '指标名称',
      offset: { x: 20, y: 16 },
      size: { width: 200, height: 28 },
      style: { color: '#94a3b8', fontSize: 16 },
      dataSource: { type: 'static', value: '在线率' },
    },
    {
      key: 'value',
      materialType: METRIC_VALUE_TYPE,
      offset: { x: 20, y: 52 },
      size: { width: 200, height: 64 },
    },
  ],
};
