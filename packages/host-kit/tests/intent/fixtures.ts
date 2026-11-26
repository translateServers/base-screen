import { type IntentCatalog, parseScreenIntent, type ScreenIntent } from '../../src/index.js';

/**
 * 编译用例的目录夹具：形状取自示例宿主真实目录的缩略（文本 / 矩形 / 图表 / 图片 / 表格 / 状态宫格）。
 * 单包用例与根级「迁移前后等价」用例共用同一份，保证两边吃的是同一个目录。
 */
export const COMPILE_CATALOG: IntentCatalog = {
  assets: [{ id: 'a-1', name: '远山' }],
  materials: [
    {
      type: 'base.text',
      name: '文本',
      category: '基础',
      data: 'scalar',
      asset: false,
      size: { width: 320, height: 72 },
      props: { autoWidth: { kind: 'boolean' } },
      roles: [],
      defaults: {
        props: { autoWidth: false },
        style: {
          color: '#e9eef5',
          fontSize: 20,
          fontWeight: '400',
          textAlign: 'left',
          lineSpacing: 0,
        },
      },
    },
    {
      type: 'base.rectangle',
      name: '矩形',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 160 },
      props: {},
      roles: [],
      defaults: { props: {}, style: { fill: '#141b24', borderRadius: 12 } },
    },
    {
      type: 'base.chart',
      name: '图表',
      category: '数据',
      data: 'tabular',
      asset: false,
      size: { width: 480, height: 280 },
      props: {},
      roles: [
        { id: 'dimension', min: 1, max: 1 },
        { id: 'measures', min: 1, max: 8 },
      ],
      defaults: { props: {}, style: { backgroundColor: '#111827', color: '#f9fafb' } },
    },
    {
      type: 'base.image',
      name: '图片',
      category: '基础',
      data: 'scalar',
      asset: true,
      size: { width: 240, height: 160 },
      props: {},
      roles: [],
      defaults: { props: {}, style: { objectFit: 'contain', opacity: 1 } },
    },
    {
      type: 'plugin.echarts',
      name: 'ECharts 图表',
      category: '数据',
      data: 'tabular',
      asset: false,
      size: { width: 480, height: 280 },
      props: {
        seriesType: { kind: 'enum', values: ['line', 'bar'] },
        showTooltip: { kind: 'boolean' },
      },
      roles: [
        { id: 'dimension', min: 1, max: 1 },
        { id: 'measures', min: 1, max: 8 },
      ],
      defaults: { props: { seriesType: 'line', showTooltip: true }, style: {} },
    },
    {
      type: 'board.status-grid',
      name: '状态宫格',
      category: '看板',
      data: 'tabular',
      asset: false,
      size: { width: 480, height: 280 },
      props: {},
      roles: [{ id: 'columns', min: 2, max: 4 }],
      defaults: { props: {}, style: {} },
    },
    {
      type: 'base.table',
      name: '表格',
      category: '数据',
      data: 'tabular',
      asset: false,
      size: { width: 560, height: 320 },
      props: {},
      roles: [{ id: 'columns', min: 1, max: 8 }],
      defaults: {
        props: {},
        style: {
          backgroundColor: '#111827',
          color: '#f9fafb',
          headerBackgroundColor: '#1f2937',
          borderColor: '#374151',
          fontSize: 13,
          rowHeight: 32,
        },
      },
    },
  ],
};

/**
 * 带外壳的目录：在 `COMPILE_CATALOG` 之上加一个可容纳子组件的容器（`base.container`，
 * 与真实目录一致：默认样式透明无边框，不进物料库）。编译器据此把指标卡与块编成可整体移动的组合。
 */
export const SHELL_CATALOG: IntentCatalog = {
  ...COMPILE_CATALOG,
  materials: [
    ...COMPILE_CATALOG.materials,
    {
      type: 'base.container',
      name: '容器',
      category: '基础',
      data: 'none',
      asset: false,
      children: true,
      size: { width: 320, height: 180 },
      props: {},
      roles: [],
      defaults: {
        props: {},
        style: { fill: 'transparent', borderColor: 'transparent', borderWidth: 1, opacity: 1 },
      },
    },
  ],
};

/** 真实目录的排序会把 `base.ellipse` 排在 `base.rectangle` 前面：底板不能被它抢走。 */
export const SHAPE_CATALOG: IntentCatalog = {
  assets: [],
  materials: [
    {
      type: 'base.ellipse',
      name: '椭圆',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 120 },
      props: {},
      roles: [],
      defaults: {
        props: {},
        style: { fill: '#2563eb', borderColor: '#1d4ed8', borderWidth: 0, borderRadius: 0 },
      },
    },
    {
      type: 'base.rectangle',
      name: '矩形',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 120 },
      props: {},
      roles: [],
      defaults: {
        props: {},
        style: { fill: '#2563eb', borderColor: '#1d4ed8', borderWidth: 0, borderRadius: 0 },
      },
    },
    {
      type: 'base.text',
      name: '文本',
      category: '基础',
      data: 'scalar',
      asset: false,
      size: { width: 320, height: 72 },
      props: {},
      roles: [],
      defaults: { props: {}, style: { color: '#e9eef5', fontSize: 20, fontWeight: '400' } },
    },
  ],
};

export const TREND_TABLE = {
  columns: [
    { id: 'day', label: '日期', type: 'string' },
    { id: 'amount', label: '金额', type: 'number' },
  ],
  rows: [
    { day: '10-22', amount: 120 },
    { day: '10-23', amount: 164 },
    { day: '10-24', amount: 143 },
  ],
} as const;

export const SIX_ROW_TABLE = {
  columns: [
    { id: 'name', label: '仓库', type: 'string' },
    { id: 'stock', label: '库存', type: 'number' },
    { id: 'turn', label: '周转', type: 'number' },
  ],
  rows: [
    { name: '上海', stock: 120, turn: 21.5 },
    { name: '杭州', stock: 98, turn: 24.1 },
    { name: '南京', stock: 87, turn: 19.8 },
    { name: '苏州', stock: 76, turn: 26.3 },
    { name: '宁波', stock: 65, turn: 22 },
    { name: '合肥', stock: 54, turn: 28.4 },
  ],
} as const;

/** 平铺写法的原始 JSON（模型输出的形态）：指标 3 条，块由调用方给。 */
export function flatOutput(
  blocks: readonly Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    title: '华东渠道周会',
    subtitle: '按周汇总的渠道经营口径',
    kpis: [
      {
        label: '总量',
        value: 286000,
        unit: '件',
        delta: { value: 4.2, unit: 'percent', direction: 'up-good' },
      },
      { label: '周转', value: 31.4, unit: '天' },
      { label: '缺货', value: 12, unit: '家' },
    ],
    blocks,
    ...extra,
  };
}

/** 解析并断言没有任何诊断：夹具本身必须是干净的意图，否则对照就不公平。 */
export function intentOf(output: unknown, catalog: IntentCatalog = COMPILE_CATALOG): ScreenIntent {
  const result = parseScreenIntent(output, { catalog });
  if (result.intent === undefined || result.diagnostics.length > 0) {
    throw new Error(`fixture is not a clean intent: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.intent;
}
