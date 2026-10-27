import {
  AIR_QUALITY_DATASET_IDS,
  AIR_QUALITY_DEFAULT_CITY,
} from '../datasets/air-quality-datasets';
import { AIR_QUALITY_LATEST, AIR_QUALITY_META } from '../datasets/air-quality-snapshot';
import { validateScreenDocumentInput } from './screen-document-guard';

/**
 * 城市空气质量监测大屏：真实数据案例，1920×1080。
 *
 * 版式按 OpenDesign 评审稿重排（深海青「环境监测指挥台」）：
 * - 左栏是一条 8 城 AQI 榜单，同时承担排名与城市选择；
 * - 右侧第一落点是当前城市主视觉（AQI + 等级 + 首要污染物 + PM2.5 标准比 + 24h 优良率 + 健康提示）；
 * - 当前城市下方是六项污染物横条，再下方是 AQI / 颗粒物双趋势；
 * - 时间窗只作用于两张趋势图，24h 指标与榜单保持快照口径。
 *
 * 数据链路只走自建 SQLite 数据源（custom.air-live / trend / rank），启动时由
 * `DatasourceSeedService` 幂等生成 `city-air.db`；数据来源与 AQI 口径见
 * `datasets/air-quality-snapshot.ts` 文件头。
 *
 * 14 个 live 组件引用**同一个**文档级 `dataSources.live` 实例（trend/rank 同理），
 * 因此切城市只发一次 live + 一次 trend；不要退回每个组件各写 `dataSource` 的旧形态，
 * 那会为每个组件合成独立实例（请求身份=实例），导致相同查询被放大。
 *
 * 已知物料边界（评审稿里已标注）：
 * - scroll-board 的列只能等宽、状态色板只有 critical/warning/info/default 四个键，
 *   因此榜单保留完整的中文等级文字，等级色条用 default 青色；等级颜色语义由
 *   主视觉/图例承担。
 * - scroll-board 没有“选中行”样式，当前城市由主视觉与榜单标题的当前城市文字表达。
 * - ECharts 物料不暴露轴范围，双趋势图使用自适应量程，不伪造固定刻度。
 * - 时间窗用两个可点击文本 + 背景按钮实现，激活态由图表数据变化表达。
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
  readonly dataValue?: unknown;
  readonly dataBinding?: unknown;
  readonly styleRules?: readonly StyleRule[];
}

type StyleRuleOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';

interface StyleRule {
  readonly id: string;
  readonly when: {
    readonly path: readonly string[];
    readonly operator: StyleRuleOperator;
    readonly value?: unknown;
  };
  readonly style: Readonly<Record<string, unknown>>;
}

const components: DemoComponent[] = [];
let zIndex = 0;

function push(component: Omit<DemoComponent, 'zIndex'>): void {
  zIndex += 1;
  components.push({ ...component, zIndex });
}

/** 条件样式规则以组件自身 dataState.value 为条件源（ADR-0058），这里用于等级/超标着色。 */
function addStyleRules(id: string, rules: readonly StyleRule[]): void {
  const index = components.findIndex((component) => component.id === id);
  if (index < 0) throw new Error(`style rule target not found: ${id}`);
  components[index] = { ...components[index]!, styleRules: rules };
}

type Box = readonly [number, number, number, number];

const TEXT_STYLE = {
  color: '#E8F3F5',
  fontSize: 14,
  fontWeight: '400',
  textAlign: 'left',
  verticalAlign: 'middle',
} as const;

interface TextOptions {
  readonly color?: string;
  readonly fontSize?: number;
  readonly fontWeight?: '400' | '700';
  readonly textAlign?: 'left' | 'center' | 'right';
  readonly verticalAlign?: 'top' | 'middle' | 'bottom';
  readonly letterSpacing?: number;
  readonly lineHeight?: number;
}

function text(id: string, name: string, box: Box, value: string, options: TextOptions = {}): void {
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
    props: { autoWidth: false },
    style: { ...TEXT_STYLE, ...options },
    dataSource: { type: 'static', value },
  });
}

function variableText(
  id: string,
  name: string,
  box: Box,
  variableId: string,
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
    props: { autoWidth: false },
    style: { ...TEXT_STYLE, ...options },
    dataSource: { type: 'variable', variableId },
  });
}

const LIVE_REF = { kind: 'data-source-field' as const, dataSourceId: 'live', path: [] };
const TREND_REF = { kind: 'data-source-field' as const, dataSourceId: 'trend', path: [] };
const RANK_REF = { kind: 'data-source-field' as const, dataSourceId: 'rank', path: [] };

interface DataWiring {
  readonly dataSource: unknown;
  readonly dataValue?: unknown;
  readonly dataBinding?: unknown;
}

/** 14 个 live 组件共享一个文档级实例：参数只求值/取数一次。 */
function liveWiring(field: string): DataWiring {
  return {
    dataSource: null,
    dataValue: LIVE_REF,
    dataBinding: { fields: { value: [field] } },
  };
}

function trendWiring(measures: readonly string[]): DataWiring {
  return {
    dataSource: null,
    dataValue: TREND_REF,
    dataBinding: { fields: { dimension: ['时间'], measures } },
  };
}

function rankWiring(columns: readonly string[]): DataWiring {
  return {
    dataSource: null,
    dataValue: RANK_REF,
    dataBinding: { fields: { columns } },
  };
}

function variableWiring(variableId: string): DataWiring {
  return { dataSource: { type: 'variable', variableId } };
}

function liveText(
  id: string,
  name: string,
  box: Box,
  field: string,
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
    props: { autoWidth: false },
    style: { ...TEXT_STYLE, ...options },
    ...liveWiring(field),
  });
}

function rectangle(
  id: string,
  name: string,
  box: Box,
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
    style: {
      borderColor: '#1B3741',
      borderWidth: 0,
      borderRadius: 0,
      opacity: 1,
      ...style,
    },
    dataSource: null,
  });
}

function rule(
  id: string,
  name: string,
  box: Box,
  axis: 'horizontal' | 'vertical',
  color = '#1A343D',
  thickness = 1,
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'base.rule',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: { axis },
    style: { color, thickness, dash: 'solid', opacity: 1 },
    dataSource: null,
  });
}

function flop(
  id: string,
  name: string,
  box: Box,
  source: DataWiring,
  options: {
    readonly fontSize?: number;
    readonly color?: string;
    readonly decimals?: number;
    readonly suffix?: string;
    readonly flipAnimation?: boolean;
  } = {},
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
      suffix: options.suffix ?? '',
      decimals: options.decimals ?? 0,
      thousandsSeparator: true,
      flipAnimation: options.flipAnimation ?? true,
    },
    style: {
      backgroundColor: 'transparent',
      color: options.color ?? '#E8F3F5',
      accentColor: '#0D2A32',
      fontSize: options.fontSize ?? 38,
    },
    ...source,
  });
}

function chart(
  id: string,
  name: string,
  box: Box,
  seriesType: 'line' | 'bar' | 'area',
  source: DataWiring,
  seriesColor: string,
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
    props: { titleText: '', showTooltip: false, seriesType },
    style: {
      backgroundColor: 'transparent',
      color: '#7E99A2',
      gridColor: '#143A3F',
      seriesColor,
      opacity: 1,
    },
    ...source,
  });
}

const PANEL_STYLE = {
  fill: '#081A20',
  borderColor: '#1B3741',
  borderWidth: 1,
  borderRadius: 4,
} as const;

const MUTED = '#7E99A2';
const ACCENT = '#5BD8C2';
const SOFT = '#A6BCC3';

// ── 页头 ──────────────────────────────────────────────────────────────────
text('page-title', '主标题', [40, 28, 700, 38], '全国重点城市空气质量监测', {
  color: '#E8F3F5',
  fontSize: 30,
  fontWeight: '700',
});
text('page-subtitle', '副标题', [40, 68, 700, 16], 'CAMS 真实快照 · 8 城 · HJ 633-2012', {
  color: MUTED,
  fontSize: 12,
  letterSpacing: 1,
});
text('page-meta-source', '快照来源', [1200, 36, 680, 18], 'CAMS 快照 · 8/8 城', {
  color: SOFT,
  fontSize: 13,
  textAlign: 'right',
});
text(
  'page-meta-updated',
  '快照时间',
  [1200, 60, 680, 18],
  `更新 ${AIR_QUALITY_LATEST[0]?.updated_at ?? AIR_QUALITY_META.windowEnd}`,
  { color: MUTED, fontSize: 13, textAlign: 'right' },
);
rule('page-divider', '页头分隔线', [40, 96, 1840, 1], 'horizontal', '#1A343D');

// ── 左栏：城市榜 ──────────────────────────────────────────────────────────
rectangle('city-panel', '城市榜面板', [40, 112, 442, 928], PANEL_STYLE);
text('city-title', '城市榜标题', [64, 144, 394, 28], '城市空气榜', {
  color: '#E8F3F5',
  fontSize: 22,
  fontWeight: '700',
});
text('city-sub-prefix', '城市榜副标题前缀', [64, 180, 150, 16], '按 AQI 降序 · 当前', {
  color: MUTED,
  fontSize: 12,
});
variableText('city-sub-current', '城市榜当前城市', [214, 180, 72, 16], 'city', {
  color: ACCENT,
  fontSize: 12,
  fontWeight: '700',
});
text('city-sub-suffix', '城市榜副标题后缀', [288, 180, 170, 16], '· 点击行切换', {
  color: MUTED,
  fontSize: 12,
});

// 表头：scroll-board 的列 id 必须是 ASCII，表头文案由文档层承担。
text('city-head-rank', '排名表头', [60, 232, 82, 24], '排名', { color: MUTED, fontSize: 12 });
text('city-head-city', '城市表头', [142, 232, 82, 24], '城市', { color: MUTED, fontSize: 12 });
text('city-head-aqi', 'AQI表头', [224, 232, 82, 24], 'AQI', { color: MUTED, fontSize: 12 });
text('city-head-level', '等级表头', [306, 232, 82, 24], '等级', { color: MUTED, fontSize: 12 });
text('city-head-primary', '首要污染物表头', [388, 232, 82, 24], '首要污染物', {
  color: MUTED,
  fontSize: 12,
  textAlign: 'right',
});
rule('city-head-rule', '榜单表头分隔线', [60, 256, 394, 1], 'horizontal', '#14303A');

push({
  id: 'city-board',
  type: 'board.scroll-board',
  name: '城市空气榜',
  parentId: null,
  position: { x: 40, y: 256 },
  size: { width: 442, height: 660 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: {
    headerVisible: false,
    rowCount: 8,
    intervalMs: 3000,
    autoScroll: false,
    statusColumn: 'level',
    // 色板只接受四个固定键；中文等级值走 default，完整等级文字仍逐行可读。
    statusPalette: { default: '#72D6C2' },
  },
  style: {
    backgroundColor: 'transparent',
    color: '#D3E2E5',
    headerColor: MUTED,
    accentColor: ACCENT,
    borderColor: '#14303A',
    fontSize: 16,
    rowHeight: 80,
  },
  ...rankWiring(['rank', 'city', 'AQI', 'level', 'primary']),
});

// 图例：六等级压缩到四个色键；中度及以上共用 critical。
text('legend-title', '图例标题', [64, 920, 200, 16], '等级图例', { color: MUTED, fontSize: 12 });
const LEGEND = [
  { id: 'excellent', label: '优 0–50', color: '#72D6C2', x: 64, y: 944 },
  { id: 'good', label: '良 51–100', color: '#7FB1DE', x: 200, y: 944 },
  { id: 'light', label: '轻度污染 101–150', color: '#E4B25E', x: 64, y: 972 },
  { id: 'above', label: '中度及以上 151–500', color: '#E47161', x: 214, y: 972 },
] as const;
LEGEND.forEach((item) => {
  rectangle(`legend-dot-${item.id}`, `图例点-${item.id}`, [item.x, item.y + 6, 6, 6], {
    fill: item.color,
    borderWidth: 0,
    borderRadius: 3,
  });
  text(`legend-label-${item.id}`, `图例-${item.id}`, [item.x + 14, item.y, 130, 18], item.label, {
    color: SOFT,
    fontSize: 12,
  });
});
text('legend-note', '图例说明', [64, 1000, 394, 16], '颜色只用于等级判断；榜单行保留完整等级文字', {
  color: MUTED,
  fontSize: 11,
});

// ── 主视觉：当前城市 / PM2.5 标准比 / 24h 优良率 / 健康提示 ──────────────
rectangle('hero-panel', '当前城市面板', [506, 112, 1374, 300], PANEL_STYLE);
rule('hero-rule-1', '英雄区分隔线一', [970, 144, 1, 236], 'vertical', '#18363F');
rule('hero-rule-2', '英雄区分隔线二', [1278, 144, 1, 236], 'vertical', '#18363F');

text('hero-city-label', '当前城市标签', [538, 144, 200, 16], '当前城市', {
  color: MUTED,
  fontSize: 13,
});
variableText('hero-city', '当前城市', [538, 168, 300, 44], 'city', {
  color: '#E8F3F5',
  fontSize: 34,
  fontWeight: '700',
});
text('hero-aqi-label', 'AQI标签', [538, 216, 80, 16], 'AQI', { color: MUTED, fontSize: 12 });
flop('hero-aqi', 'AQI读数', [538, 236, 220, 100], liveWiring('AQI'), {
  fontSize: 96,
  color: '#E8F3F5',
  decimals: 0,
});
liveText('hero-level', '空气质量等级', [770, 252, 160, 24], '等级', {
  color: '#E8F3F5',
  fontSize: 18,
});
text('hero-primary-label', '首要污染物标签', [770, 286, 100, 16], '首要污染物', {
  color: MUTED,
  fontSize: 12,
});
liveText('hero-primary', '首要污染物', [770, 306, 200, 24], '首要污染物', {
  color: SOFT,
  fontSize: 18,
});

text('hero-ratio-label', 'PM2.5标准比标签', [982, 144, 280, 16], 'PM2.5 标准比', {
  color: MUTED,
  fontSize: 13,
});
flop('hero-ratio', 'PM2.5标准比读数', [982, 164, 280, 48], liveWiring('PM2.5标准比'), {
  fontSize: 40,
  color: '#E8F3F5',
  decimals: 1,
  suffix: '%',
  flipAnimation: false,
});
liveText('hero-ratio-status', 'PM2.5达标状态', [982, 214, 280, 18], 'PM2.5状态', {
  color: SOFT,
  fontSize: 12,
});
text('hero-ratio-note', 'PM2.5标准比说明', [982, 238, 280, 16], '24h 均值 / 限值 75 μg/m³', {
  color: MUTED,
  fontSize: 11,
});

text('hero-good-label', '24h优良率标签', [982, 266, 280, 16], '24h 优良率', {
  color: MUTED,
  fontSize: 13,
});
flop('hero-good', '24h优良率读数', [982, 286, 280, 48], liveWiring('优良率'), {
  fontSize: 40,
  color: '#E8F3F5',
  decimals: 1,
  suffix: '%',
  flipAnimation: false,
});
push({
  id: 'hero-good-bar',
  type: 'board.capsule-progress',
  name: '24h优良率进度',
  parentId: null,
  position: { x: 982, y: 336 },
  size: { width: 280, height: 10 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: { segments: 24, showValue: false, decimals: 0, glow: false },
  style: {
    backgroundColor: 'transparent',
    color: MUTED,
    trackColor: '#122C35',
    fillColor: ACCENT,
    fontSize: 10,
  },
  ...liveWiring('优良率'),
});
text('hero-good-note', '24h优良率说明', [982, 352, 280, 16], 'AQI ≤ 100 的小时占比', {
  color: MUTED,
  fontSize: 11,
});

text('hero-advice-label', '健康提示标签', [1292, 144, 556, 16], '健康提示', {
  color: MUTED,
  fontSize: 13,
});
liveText('hero-advice', '健康提示', [1292, 168, 556, 210], '建议', {
  color: '#D3E2E5',
  fontSize: 20,
  lineHeight: 34,
  verticalAlign: 'top',
});
text('hero-advice-note', '健康提示脚注', [1292, 384, 556, 16], '按 HJ 633-2012 等级建议', {
  color: MUTED,
  fontSize: 11,
});

// ── 六项污染物横条 ────────────────────────────────────────────────────────
rectangle('pollutant-panel', '污染物面板', [506, 432, 1374, 132], PANEL_STYLE);
const POLLUTANTS = [
  { id: 'pm25', label: 'PM2.5', field: 'PM2.5显示', unit: 'μg/m³', limit: '限值 75 · 24h' },
  { id: 'pm10', label: 'PM10', field: 'PM10显示', unit: 'μg/m³', limit: '限值 150 · 24h' },
  { id: 'o3', label: 'O₃', field: 'O3显示', unit: 'μg/m³', limit: '限值 160 · 8h' },
  { id: 'no2', label: 'NO₂', field: 'NO2显示', unit: 'μg/m³', limit: '限值 80 · 24h' },
  { id: 'so2', label: 'SO₂', field: 'SO2显示', unit: 'μg/m³', limit: '限值 150 · 24h' },
  { id: 'co', label: 'CO', field: 'CO显示', unit: 'mg/m³', limit: '限值 4 · 24h' },
] as const;
POLLUTANTS.forEach((item, index) => {
  const x = 522 + index * 229;
  text(`${item.id}-label`, `${item.label}标签`, [x, 448, 160, 16], item.label, {
    color: MUTED,
    fontSize: 13,
  });
  liveText(`${item.id}-value`, `${item.label}读数`, [x, 472, 120, 44], item.field, {
    color: '#E8F3F5',
    fontSize: 36,
  });
  text(`${item.id}-unit`, `${item.label}单位`, [x + 124, 486, 80, 20], item.unit, {
    color: MUTED,
    fontSize: 14,
  });
  text(`${item.id}-limit`, `${item.label}限值`, [x, 520, 190, 14], item.limit, {
    color: MUTED,
    fontSize: 11,
  });
});
[735, 964, 1193, 1422, 1651].forEach((x, index) => {
  rule(`pollutant-rule-${index}`, '污染物分隔线', [x, 448, 1, 100], 'vertical', '#18363F');
});

// ── 趋势面板 ──────────────────────────────────────────────────────────────
rectangle('trend-panel', '趋势面板', [506, 584, 1374, 456], PANEL_STYLE);
text('trend-title', '趋势标题', [538, 608, 500, 24], '空气质量趋势', {
  color: '#E8F3F5',
  fontSize: 18,
  fontWeight: '700',
});
text('trend-subtitle', '趋势副标题', [538, 636, 500, 16], 'AQI 与颗粒物 · 滑动均值', {
  color: MUTED,
  fontSize: 12,
});
text('window-label', '时间窗标签', [1460, 618, 120, 20], '时间窗', {
  color: MUTED,
  fontSize: 13,
  textAlign: 'right',
});
text('window-current-label', '当前时间窗标签', [1460, 646, 36, 16], '当前', {
  color: MUTED,
  fontSize: 12,
  textAlign: 'right',
});
flop('window-current', '当前时间窗读数', [1500, 640, 44, 24], variableWiring('hours'), {
  fontSize: 18,
  color: ACCENT,
  decimals: 0,
  flipAnimation: false,
});
text('window-current-unit', '当前时间窗单位', [1548, 646, 32, 16], '小时', {
  color: MUTED,
  fontSize: 12,
});
// 两个可点击文本 + 背景按钮：base.text 的 valueClick 事件写 hours 变量。
[
  { label: '24 小时', hours: 24, x: 1608 },
  { label: '48 小时', hours: 48, x: 1736 },
].forEach((item) => {
  rectangle(`window-${item.hours}-bg`, `${item.label}按钮底`, [item.x, 608, 120, 40], {
    fill: '#0D2A32',
    borderColor: '#1B3741',
    borderWidth: 1,
    borderRadius: 4,
  });
  text(`window-${item.hours}-text`, `${item.label}按钮`, [item.x, 608, 120, 40], item.label, {
    color: '#E8F3F5',
    fontSize: 13,
    textAlign: 'center',
    verticalAlign: 'middle',
  });
});

text('trend-aqi-title', 'AQI趋势标题', [538, 680, 300, 20], 'AQI 趋势', {
  color: '#E8F3F5',
  fontSize: 14,
});
text('trend-aqi-note', 'AQI趋势说明', [538, 700, 300, 14], '24h 滑动均值', {
  color: MUTED,
  fontSize: 11,
});
text('trend-pm-title', '颗粒物趋势标题', [1209, 680, 300, 20], '颗粒物浓度', {
  color: '#E8F3F5',
  fontSize: 14,
});
text('trend-pm-note', '颗粒物趋势说明', [1209, 700, 300, 14], 'PM2.5 / PM10 · μg/m³', {
  color: MUTED,
  fontSize: 11,
});
chart('trend-aqi', 'AQI趋势', [538, 716, 639, 258], 'area', trendWiring(['AQI']), '#58D6C1');
chart(
  'trend-pm',
  '颗粒物趋势',
  [1209, 716, 639, 258],
  'line',
  trendWiring(['PM2.5', 'PM10']),
  '#7FA8D8',
);
text(
  'trend-footnote',
  '趋势脚注',
  [538, 992, 1310, 16],
  '口径：PM2.5 / PM10 / NO₂ / SO₂ / CO 为 24h 滑动均值，O₃ 为 8h 滑动均值 · AQI 按 HJ 633-2012 · 来源 Open-Meteo CAMS · 快照 2026-10-23 10:00',
  { color: MUTED, fontSize: 12 },
);

// 等级/超标着色：状态色只落在等级文字、PM2.5 标准比、达标状态与优良率上。
addStyleRules('hero-level', [
  {
    id: 'level-excellent',
    when: { path: [], operator: 'eq', value: '优' },
    style: { color: '#72D6C2' },
  },
  {
    id: 'level-good',
    when: { path: [], operator: 'eq', value: '良' },
    style: { color: '#7FB1DE' },
  },
  {
    id: 'level-light',
    when: { path: [], operator: 'eq', value: '轻度污染' },
    style: { color: '#E4B25E' },
  },
  {
    id: 'level-moderate',
    when: { path: [], operator: 'eq', value: '中度污染' },
    style: { color: '#E47161' },
  },
  {
    id: 'level-heavy',
    when: { path: [], operator: 'eq', value: '重度污染' },
    style: { color: '#E47161' },
  },
  {
    id: 'level-severe',
    when: { path: [], operator: 'eq', value: '严重污染' },
    style: { color: '#E47161' },
  },
]);
addStyleRules('hero-ratio', [
  {
    id: 'ratio-exceed',
    when: { path: [], operator: 'gt', value: 100 },
    style: { color: '#E4B25E' },
  },
  { id: 'ratio-ok', when: { path: [], operator: 'lte', value: 100 }, style: { color: '#E8F3F5' } },
]);
addStyleRules('hero-ratio-status', [
  {
    id: 'ratio-status-exceed',
    when: { path: [], operator: 'contains', value: '超标准' },
    style: { color: '#E4B25E' },
  },
  {
    id: 'ratio-status-ok',
    when: { path: [], operator: 'eq', value: '达标' },
    style: { color: '#72D6C2' },
  },
]);
addStyleRules('hero-good', [
  { id: 'good-low', when: { path: [], operator: 'lt', value: 50 }, style: { color: '#E4B25E' } },
  { id: 'good-ok', when: { path: [], operator: 'gte', value: 50 }, style: { color: '#E8F3F5' } },
]);

export const BOARD_AIR_QUALITY_DOCUMENT = {
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: '#041014',
    background: {
      type: 'linear-gradient' as const,
      angle: 160,
      stops: [
        { color: '#071A20', position: 0 },
        { color: '#04121A', position: 55 },
        { color: '#030C10', position: 100 },
      ],
    },
  },
  components,
  dataSources: [
    {
      id: 'live',
      name: 'air-live',
      source: { kind: 'dataset' as const, datasetId: AIR_QUALITY_DATASET_IDS.live },
      params: { city: { kind: 'variable' as const, variableId: 'city' } },
    },
    {
      id: 'trend',
      name: 'air-trend',
      source: { kind: 'dataset' as const, datasetId: AIR_QUALITY_DATASET_IDS.trend },
      params: {
        city: { kind: 'variable' as const, variableId: 'city' },
        hours: { kind: 'variable' as const, variableId: 'hours' },
      },
    },
    {
      id: 'rank',
      name: 'air-rank',
      source: { kind: 'dataset' as const, datasetId: AIR_QUALITY_DATASET_IDS.rank },
      params: { limit: { kind: 'inline' as const, value: 8 } },
    },
  ],
  variables: [
    {
      id: 'city',
      name: 'city',
      description: '当前查看的城市',
      type: 'static' as const,
      initialValue: AIR_QUALITY_DEFAULT_CITY,
    },
    {
      id: 'hours',
      name: 'hours',
      description: '趋势窗口（小时）',
      type: 'static' as const,
      initialValue: 24,
    },
  ],
  blueprint: {
    relations: [
      {
        type: 'behavior' as const,
        id: 'rule-city',
        source: {
          kind: 'component' as const,
          componentId: 'city-board',
          event: { type: 'material-event' as const, eventName: 'rowClick' },
        },
        target: { kind: 'variable' as const, variableId: 'city' },
        effect: {
          type: 'set-variable' as const,
          value: { kind: 'event-payload' as const, path: ['row', 'city'] },
        },
      },
      {
        type: 'behavior' as const,
        id: 'rule-window-24',
        source: {
          kind: 'component' as const,
          componentId: 'window-24-text',
          event: { type: 'material-event' as const, eventName: 'valueClick' },
        },
        target: { kind: 'variable' as const, variableId: 'hours' },
        effect: {
          type: 'set-variable' as const,
          value: { kind: 'literal' as const, value: 24 },
        },
      },
      {
        type: 'behavior' as const,
        id: 'rule-window-48',
        source: {
          kind: 'component' as const,
          componentId: 'window-48-text',
          event: { type: 'material-event' as const, eventName: 'valueClick' },
        },
        target: { kind: 'variable' as const, variableId: 'hours' },
        effect: {
          type: 'set-variable' as const,
          value: { kind: 'literal' as const, value: 48 },
        },
      },
    ],
  },
};

/** 序列化空气质量种子；启动期即校验，写错时立刻失败而不是等前端加载。 */
export function serializeBoardAirQualityDocument(): string {
  const validation = validateScreenDocumentInput(BOARD_AIR_QUALITY_DOCUMENT);
  if (!validation.ok) {
    throw new Error(`HOST_API_BOARD_AIR_QUALITY_INVALID: ${validation.reason}`);
  }
  return validation.serialized;
}
