import { validateScreenDocumentInput } from './screen-document-guard';

/**
 * 成品大屏风格的种子：1920×1080，四个 KPI、三块中部面板、三块底部分区与页脚。
 *
 * 这里用一个极小的构造器而不是一整份手写 JSON：同一个物料在文档里重复十几次，
 * 手写会把「props 必填键漏一个」变成几十处需要人眼复核的地方。构造器只负责拼形状，
 * 真正的合法性仍由 contracts 的 canonical 解析器和各 manifest 的 schema 把关
 * （见 tests/examples/board-demo-document.test.ts）。
 *
 * 版式约定：所有组件都是根节点。组壳几何由引擎持有，配置 groupMaterialType 后
 * 任何一次事务都会把 base.container 吸附到子孙包围盒——把面板当父节点会在第一次
 * 无关编辑时压平内缩留白。
 */

interface DemoComponent {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: null;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly rotation: number;
  readonly zIndex: number;
  readonly status: { readonly locked: boolean; readonly hidden: boolean };
  readonly props: Readonly<Record<string, unknown>>;
  readonly style: Readonly<Record<string, unknown>>;
  readonly dataSource: unknown;
}

const components: DemoComponent[] = [];
let zIndex = 0;

function push(component: Omit<DemoComponent, 'zIndex'>): void {
  zIndex += 1;
  components.push({ ...component, zIndex });
}

function metricSource(resourceId: string): unknown {
  return {
    type: 'host-resource',
    resourceType: 'demo_metric',
    resourceId,
    params: { points: { kind: 'literal', value: 24 } },
    binding: { fields: { value: ['value'] } },
  };
}

function seriesSource(resourceId: string): unknown {
  return {
    type: 'host-resource',
    resourceType: 'demo_series',
    resourceId,
    params: { points: { kind: 'literal', value: 24 } },
    binding: { fields: { dimension: ['t'], measures: ['value'] } },
  };
}

function rankingSource(
  dimension: 'region' | 'channel',
  limit: number,
  role: 'chart' | 'columns',
): unknown {
  return {
    type: 'host-resource',
    resourceType: 'demo_ranking',
    resourceId: dimension,
    params: { limit: { kind: 'literal', value: limit } },
    binding: {
      fields:
        role === 'columns'
          ? { columns: ['name', 'value'] }
          : { dimension: ['name'], measures: ['value'] },
    },
  };
}

const TEXT_DEFAULT = {
  color: '#8fb6d1',
  fontSize: 13,
  fontWeight: '400',
  textAlign: 'left',
  verticalAlign: 'middle',
  letterSpacing: 0,
} as const;

interface TextOptions {
  readonly color?: string;
  readonly fontSize?: number;
  readonly fontWeight?: '400' | '700';
  readonly textAlign?: 'left' | 'center' | 'right';
  readonly verticalAlign?: 'top' | 'middle' | 'bottom';
  readonly letterSpacing?: number;
}

function text(
  id: string,
  name: string,
  box: readonly [number, number, number, number],
  value: string,
  options: TextOptions = {},
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'base.text',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { ...TEXT_DEFAULT, ...options },
    dataSource: { type: 'static', value },
  });
}

function rectangle(
  id: string,
  name: string,
  box: readonly [number, number, number, number],
  style: Readonly<Record<string, unknown>>,
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'base.rectangle',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { borderColor: '#0f3559', borderWidth: 0, opacity: 1, ...style },
    dataSource: null,
  });
}

function rule(
  id: string,
  box: readonly [number, number, number, number],
  color: string,
  thickness = 1,
  dash: 'solid' | 'dashed' | 'dotted' = 'solid',
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'base.rule',
    name: '分割线',
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: { axis: 'horizontal' },
    style: { color, thickness, dash, opacity: 1 },
    dataSource: null,
  });
}

function frame(
  id: string,
  name: string,
  box: readonly [number, number, number, number],
  style: Readonly<Record<string, unknown>> = {},
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'board.border-box',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: { borderStyle: 'corner-brackets', bracketSize: 18, lineWidth: 2 },
    style: {
      backgroundColor: 'rgba(8, 26, 46, .72)',
      borderColor: '#1d5b8f',
      color: '#7fb0cf',
      ...style,
    },
    dataSource: null,
  });
}

function flop(
  id: string,
  name: string,
  box: readonly [number, number, number, number],
  resourceId: string,
  decimals: number,
  fontSize = 46,
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'board.digital-flop',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: {
      prefix: '',
      suffix: '',
      decimals,
      thousandsSeparator: true,
      flipAnimation: true,
    },
    style: {
      backgroundColor: 'transparent',
      color: '#7ff0ff',
      accentColor: '#0e3b5c',
      fontSize,
    },
    dataSource: metricSource(resourceId),
  });
}

function chart(
  id: string,
  name: string,
  box: readonly [number, number, number, number],
  seriesType: 'line' | 'bar' | 'area' | 'pie',
  source: unknown,
  seriesColor = '#38bdf8',
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'plugin.echarts',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: { titleText: '', showTooltip: true, seriesType },
    style: {
      backgroundColor: 'transparent',
      color: '#8fb6d1',
      gridColor: '#143a5c',
      seriesColor,
      opacity: 1,
    },
    dataSource: source,
  });
}

function capsule(
  id: string,
  name: string,
  box: readonly [number, number, number, number],
  resourceId: string,
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'board.capsule-progress',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: { segments: 24, showValue: true, decimals: 1, glow: true },
    style: {
      backgroundColor: 'transparent',
      color: '#cfe9ff',
      trackColor: '#12304d',
      fillColor: '#38bdf8',
      fontSize: 15,
    },
    dataSource: metricSource(resourceId),
  });
}

// ── 顶栏 ──────────────────────────────────────────────────────────────────
rectangle('header-bg', '顶栏底', [0, 0, 1920, 104], {
  fill: 'linear-gradient(180deg, rgba(12, 52, 88, .78) 0%, rgba(5, 13, 26, 0) 100%)',
});
text('header-title', '主标题', [560, 16, 800, 48], '区域销售运营中心', {
  color: '#eaf6ff',
  fontSize: 32,
  fontWeight: '700',
  textAlign: 'center',
});
text('header-subtitle', '英文副标题', [560, 64, 800, 18], 'REGIONAL SALES OPERATION CENTER', {
  color: '#4f88b5',
  fontSize: 11,
  textAlign: 'center',
  letterSpacing: 5,
});
text('header-date', '日期', [40, 28, 360, 20], '2026-10-18 星期日', {
  color: '#6fa8cc',
  fontSize: 13,
});
text('header-updated', '更新时间', [40, 52, 360, 20], '数据更新 17:20:00', {
  color: '#47779b',
  fontSize: 12,
});
push({
  id: 'header-live-dot',
  type: 'base.ellipse',
  name: 'LIVE 圆点',
  parentId: null,
  position: { x: 1768, y: 34 },
  size: { width: 8, height: 8 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: {},
  style: { fill: '#35e0b0', borderColor: '#35e0b0', borderWidth: 0, opacity: 1 },
  dataSource: null,
});
text('header-live-text', 'LIVE 文案', [1782, 28, 100, 20], '实时数据', {
  color: '#35e0b0',
  fontSize: 12,
});
rule('header-rule', [0, 103, 1920, 2], '#1a4f7c');

// ── KPI 四卡 ──────────────────────────────────────────────────────────────
const KPI_CARDS = [
  {
    id: 'kpi-sales',
    label: '今日销售额（万元）',
    metric: 'sales_total',
    decimals: 1,
    delta: '▲ 12.4% 较昨日',
    deltaColor: '#34d399',
  },
  {
    id: 'kpi-orders',
    label: '今日订单量（单）',
    metric: 'order_count',
    decimals: 0,
    delta: '▲ 8.6% 较昨日',
    deltaColor: '#34d399',
  },
  {
    id: 'kpi-visitors',
    label: '今日访客数（人）',
    metric: 'visitor_count',
    decimals: 0,
    delta: '▲ 15.2% 较昨日',
    deltaColor: '#34d399',
  },
  {
    id: 'kpi-conversion',
    label: '支付转化率（%）',
    metric: 'conversion_rate',
    decimals: 2,
    delta: '▼ 0.6% 较昨日',
    deltaColor: '#f87171',
  },
] as const;

KPI_CARDS.forEach((card, index) => {
  const x = 48 + index * 456;
  frame(`${card.id}-frame`, `${card.label}卡片`, [x, 128, 432, 150]);
  text(`${card.id}-label`, `${card.label}标签`, [x + 22, 146, 320, 20], card.label, {
    color: '#7fb0cf',
    fontSize: 13,
  });
  flop(`${card.id}-value`, `${card.label}读数`, [x + 22, 172, 388, 60], card.metric, card.decimals);
  text(`${card.id}-delta`, `${card.label}同比`, [x + 22, 242, 320, 18], card.delta, {
    color: card.deltaColor,
    fontSize: 12,
  });
});

// ── 中部三面板 ────────────────────────────────────────────────────────────
frame('channel-frame', '渠道占比面板', [48, 298, 560, 330]);
text('channel-title', '渠道占比标题', [72, 316, 320, 22], '渠道销售占比', {
  color: '#a8d4ea',
  fontSize: 15,
  fontWeight: '700',
});
chart(
  'channel-chart',
  '渠道占比环形图',
  [64, 344, 528, 272],
  'pie',
  rankingSource('channel', 4, 'chart'),
);

frame('trend-frame', '趋势面板', [632, 298, 656, 330]);
text('trend-title', '趋势标题', [656, 316, 320, 22], '24 小时订单趋势', {
  color: '#a8d4ea',
  fontSize: 15,
  fontWeight: '700',
});
chart('trend-chart', '24 小时订单趋势', [648, 344, 624, 272], 'area', seriesSource('order_count'));

frame('target-frame', '目标完成面板', [1312, 298, 560, 330]);
text('target-title', '目标完成标题', [1336, 316, 320, 22], '目标完成度', {
  color: '#a8d4ea',
  fontSize: 15,
  fontWeight: '700',
});
push({
  id: 'target-water',
  type: 'board.water-level',
  name: '目标完成水位',
  parentId: null,
  position: { x: 1472, y: 344 },
  size: { width: 240, height: 270 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: { shape: 'circle', decimals: 1, showLabel: true, waveAnimation: true },
  style: {
    backgroundColor: 'transparent',
    color: '#e6f1ff',
    waterColor: '#1d4ed8',
    waveColor: '#38bdf8',
    borderColor: '#12405f',
    fontSize: 26,
  },
  dataSource: metricSource('target_completion'),
});

// ── 底部左侧：核心指标健康度 ──────────────────────────────────────────────
frame('health-frame', '健康度面板', [48, 656, 560, 330]);
text('health-title', '健康度标题', [72, 674, 320, 22], '核心指标健康度', {
  color: '#a8d4ea',
  fontSize: 15,
  fontWeight: '700',
});

const HEALTH_ROWS = [
  { name: '目标完成率', metric: 'target_completion' },
  { name: '服务满意度', metric: 'service_satisfaction' },
  { name: '会员复购率', metric: 'member_repurchase' },
] as const;

HEALTH_ROWS.forEach((row, index) => {
  const y = 716 + index * 76;
  text(`health-${row.metric}-label`, `${row.name}标签`, [72, y, 180, 18], row.name, {
    color: '#8fb6d1',
    fontSize: 13,
  });
  capsule(`health-${row.metric}-value`, `${row.name}进度`, [72, y + 24, 512, 26], row.metric);
});
text('health-footnote', '健康度口径', [72, 944, 480, 18], '数据口径：近 24 小时 · 每 5 分钟刷新', {
  color: '#47779b',
  fontSize: 11,
});

// ── 底部中间：区域订单排行 ────────────────────────────────────────────────
frame('ranking-frame', '排行面板', [632, 656, 656, 330]);
text('ranking-title', '排行标题', [656, 674, 320, 22], '区域订单排行', {
  color: '#a8d4ea',
  fontSize: 15,
  fontWeight: '700',
});
push({
  id: 'ranking-board',
  type: 'board.scroll-board',
  name: '区域订单排行',
  parentId: null,
  position: { x: 648, y: 706 },
  size: { width: 624, height: 272 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: { headerVisible: true, rowCount: 6, intervalMs: 3000, autoScroll: true },
  style: {
    backgroundColor: 'transparent',
    color: '#cfe9ff',
    headerColor: '#5f9ec7',
    accentColor: '#38bdf8',
    borderColor: '#143a5c',
    fontSize: 14,
    rowHeight: 36,
  },
  dataSource: rankingSource('region', 6, 'columns'),
});

// ── 底部右侧：区域订单分布 ────────────────────────────────────────────────
frame('region-frame', '区域分布面板', [1312, 656, 560, 330]);
text('region-title', '区域分布标题', [1336, 674, 320, 22], '区域订单分布', {
  color: '#a8d4ea',
  fontSize: 15,
  fontWeight: '700',
});
chart(
  'region-chart',
  '区域订单柱图',
  [1328, 706, 528, 264],
  'bar',
  rankingSource('region', 6, 'chart'),
  '#22d3ee',
);

// ── 页脚 ──────────────────────────────────────────────────────────────────
rule('footer-rule', [0, 1008, 1920, 2], '#12395b');
text('footer-label', '播报标签', [48, 1020, 88, 20], '实时播报', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
push({
  id: 'footer-marquee',
  type: 'board.marquee',
  name: '实时播报',
  parentId: null,
  position: { x: 144, y: 1018 },
  size: { width: 1560, height: 26 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: { speedSeconds: 26, gap: 72 },
  style: { backgroundColor: 'transparent', color: '#8fd6ff', fontSize: 13 },
  dataSource: {
    type: 'static',
    value:
      '华东区域领跑 · 今日销售额突破 386.4 万元 · 订单量同比增长 12.4% · 目标完成率 72.4% · 服务满意度 96.2%',
  },
});
text('footer-credit', '页脚签名', [1716, 1020, 160, 20], 'BASE SCREEN', {
  color: '#2f5d80',
  fontSize: 10,
  textAlign: 'right',
  letterSpacing: 2,
});

export const BOARD_DEMO_DOCUMENT = {
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: '#050d1a',
    background: {
      type: 'linear-gradient' as const,
      angle: 180,
      stops: [
        { color: '#071528', position: 0 },
        { color: '#050d1a', position: 55 },
        { color: '#071528', position: 100 },
      ],
    },
  },
  components,
  variables: [],
  blueprint: { relations: [] },
} as const;

/** 序列化成品文档；启动期即校验，写错时立刻失败而不是等前端加载。 */
export function serializeBoardDemoDocument(): string {
  const validation = validateScreenDocumentInput(BOARD_DEMO_DOCUMENT);
  if (!validation.ok) {
    throw new Error(`HOST_API_BOARD_DEMO_INVALID: ${validation.reason}`);
  }
  return validation.serialized;
}
