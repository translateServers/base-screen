import { validateScreenDocumentInput } from './screen-document-guard';

/**
 * 生产监控大屏种子：1920×1080，**四种 dataSource 全覆盖**。
 *
 * 这张屏是「数据层接入」的活证据，因此每个区块都刻意用了不同的数据通道：
 *
 * | 通道 | 组件 | 说明 |
 * | --- | --- | --- |
 * | `static` | 标题/标签/选择器表格/班组表 | 不依赖接口的文字与示例表 |
 * | `dataset` | 设备灯阵 ← `monitor.devices`、告警流水 ← `monitor.alarms`、工序链 ← `monitor.pipeline` | 走 `describe/query`，参数由变量槽位求值 |
 * | `variable` | 产线/时间窗/状态/播报/时钟/更新时间 | 3 个 static 变量可交互，3 个 `production.*` 由宿主只读提供 |
 * | `host-resource` | 5 张 KPI + 产量趋势 + 产线负载排行 | 旧的 `demo_metric/series/ranking` 通道，用来证明新链路没有挤掉旧链路 |
 *
 * 版式纪律（与 `datav-demo-document.ts` 同）：所有组件都是**根节点**。宿主配置
 * `groupMaterialType` 后组壳几何由引擎持有，把面板当父节点会在第一次无关编辑时被压平。
 *
 * 数据纪律：这里只写"形状"，不写任何时间戳或随机值——数值全部来自后端与宿主变量，
 * 因此种子本身是确定性的，可被根级文档测试逐字段断言。
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

const LABEL_STYLE = {
  color: '#7fa6c4',
  fontSize: 12,
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
}

type Box = readonly [number, number, number, number];

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
    style: { ...LABEL_STYLE, ...options },
    dataSource: { type: 'static', value },
  });
}

/** 绑定变量的文本（`base.text` 只渲染字符串，因此状态/播报/时钟都走它）。 */
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
    style: { ...LABEL_STYLE, ...options },
    dataSource: { type: 'variable', variableId },
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
    style: { borderColor: '#12395b', borderWidth: 0, opacity: 1, ...style },
    dataSource: null,
  });
}

/** 装饰边框：三个分区各一个，`dataSource: null`（纯装饰不承载数据）。 */
function frame(id: string, name: string, box: Box): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'datav.border-box',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: { borderStyle: 'corner-brackets', bracketSize: 16, lineWidth: 2 },
    style: {
      backgroundColor: 'rgba(8, 26, 46, .55)',
      borderColor: '#1d5b8f',
      color: '#7fb0cf',
    },
    dataSource: null,
  });
}

function metricSource(resourceId: string, points = 24): unknown {
  return {
    type: 'host-resource',
    resourceType: 'demo_metric',
    resourceId,
    params: { points: { kind: 'literal', value: points } },
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

function rankingSource(dimension: string, limit: number): unknown {
  return {
    type: 'host-resource',
    resourceType: 'demo_ranking',
    resourceId: dimension,
    params: { limit: { kind: 'literal', value: limit } },
    binding: { fields: { dimension: ['name'], measures: ['value'] } },
  };
}

function flop(id: string, name: string, box: Box, resourceId: string, decimals: number): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'datav.digital-flop',
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
      fontSize: 40,
    },
    dataSource: metricSource(resourceId),
  });
}

function chart(
  id: string,
  name: string,
  box: Box,
  seriesType: 'line' | 'bar' | 'area',
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

/** 静态表格：`base.table` 的 `staticData.kind='tabular'` 要求同时给 binding。 */
function staticTable(
  id: string,
  name: string,
  box: Box,
  fields: readonly { readonly id: string; readonly label: string; readonly valueType: string }[],
  rows: readonly Readonly<Record<string, unknown>>[],
  columns: readonly string[],
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'base.table',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {
      backgroundColor: 'rgba(9, 26, 44, .7)',
      color: '#cfe9ff',
      headerBackgroundColor: 'rgba(14, 44, 72, .9)',
      borderColor: '#143a5c',
      fontSize: 12,
      rowHeight: 22,
      opacity: 1,
    },
    dataSource: {
      type: 'static',
      value: { fields, rows },
      binding: { fields: { columns } },
    },
  });
}

/**
 * 选择器：**用 `datav.scroll-board` 而不是 `base.table`**。
 *
 * 原因：蓝图联动走物料的 `rowClick` 事件，而 `base.table` 的 `td` 上挂了
 * `stopPropagation` 的 `cellClick`，真实点击永远先命中单元格、`rowClick` 不会触发；
 * `scroll-board` 的行是 div，点击即 `rowClick`，payload 里带整行 `{ row }`，正是
 * 「点一行 → 取该行的 line/window/level 写进变量」需要的形状。
 */
function selectorBoard(
  id: string,
  name: string,
  box: Box,
  fields: readonly { readonly id: string; readonly label: string; readonly valueType: string }[],
  rows: readonly Readonly<Record<string, unknown>>[],
  columns: readonly string[],
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'datav.scroll-board',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: {
      headerVisible: true,
      rowCount: 3,
      intervalMs: 3000,
      // 选择器必须静止：轮播会让「点第二行」变成点到一个不断移动的目标。
      autoScroll: false,
      statusColumn: '',
      statusPalette: {},
    },
    style: {
      backgroundColor: 'rgba(9, 26, 44, .7)',
      color: '#cfe9ff',
      headerColor: '#5f9ec7',
      accentColor: '#38bdf8',
      borderColor: '#143a5c',
      fontSize: 12,
      rowHeight: 22,
    },
    dataSource: {
      type: 'static',
      value: { fields, rows },
      binding: { fields: { columns } },
    },
  });
}

// ── 顶栏 ──────────────────────────────────────────────────────────────────
rectangle('top-bg', '顶栏底', [0, 0, 1920, 96], {
  fill: 'linear-gradient(180deg, rgba(12, 52, 88, .82) 0%, rgba(6, 16, 28, 0) 100%)',
});
text('top-title', '主标题', [24, 18, 420, 32], '一号车间 · 生产监控', {
  color: '#eaf6ff',
  fontSize: 26,
  fontWeight: '700',
});
text('top-subtitle', '副标题', [24, 54, 300, 18], '当班 A 组 · 三班制', {
  color: '#4f88b5',
  fontSize: 12,
  letterSpacing: 1,
});
text('top-line-label', '产线前缀', [286, 54, 52, 18], '产线：', {
  color: '#56b7e8',
  fontSize: 12,
  textAlign: 'right',
});
variableText('top-line', '当前产线', [340, 54, 120, 18], 'line', {
  color: '#7ff0ff',
  fontSize: 14,
  fontWeight: '700',
});
push({
  id: 'top-window',
  type: 'datav.digital-flop',
  name: '时间窗读数',
  parentId: null,
  position: { x: 470, y: 48 },
  size: { width: 70, height: 26 },
  rotation: 0,
  status: { locked: false, hidden: false },
  // 绑定变量而不是数据集：`window` 是 static 变量，用户切选择器时它整屏联动。
  props: { prefix: '', suffix: '', decimals: 0, thousandsSeparator: false, flipAnimation: true },
  style: { backgroundColor: 'transparent', color: '#7ff0ff', accentColor: '#0e3b5c', fontSize: 22 },
  dataSource: { type: 'variable', variableId: 'window' },
});
text('top-window-unit', '时间窗单位', [544, 54, 110, 18], '分钟 · 时间窗', {
  color: '#4f88b5',
  fontSize: 12,
});
variableText('top-status', '数据源状态', [664, 54, 280, 18], 'status', {
  color: '#8fd6ff',
  fontSize: 13,
});
variableText('top-notice', '告警播报', [960, 54, 620, 18], 'notice', {
  color: '#ffd591',
  fontSize: 13,
});
variableText('top-clock', '当前时间', [1600, 20, 296, 18], 'clock', {
  color: '#6fa8cc',
  fontSize: 13,
  textAlign: 'right',
});

// ── KPI 五卡 ──────────────────────────────────────────────────────────────
const KPI_CARDS = [
  { id: 'kpi-oee', label: 'OEE（%）', metric: 'oee', kind: 'flop', decimals: 1 },
  {
    id: 'kpi-online',
    label: '设备在线率（%）',
    metric: 'device_online_rate',
    kind: 'flop',
    decimals: 1,
  },
  { id: 'kpi-output', label: '当班产量（件）', metric: 'output_count', kind: 'flop', decimals: 0 },
  {
    id: 'kpi-target',
    label: '目标达成（%）',
    metric: 'target_completion',
    kind: 'capsule',
    decimals: 1,
  },
  { id: 'kpi-alarm', label: '未处理告警（条）', metric: 'alarm_open', kind: 'flop', decimals: 0 },
] as const;

KPI_CARDS.forEach((card, index) => {
  const x = 24 + index * 376;
  rectangle(`${card.id}-bg`, `${card.label}卡片底`, [x, 104, 360, 140], {
    fill: 'rgba(9, 26, 44, .78)',
    borderColor: '#12395b',
    borderWidth: 1,
  });
  text(`${card.id}-label`, `${card.label}标签`, [x + 16, 114, 300, 18], card.label, {
    color: '#7fa6c4',
    fontSize: 12,
  });
  if (card.kind === 'capsule') {
    push({
      id: `${card.id}-value`,
      type: 'datav.capsule-progress',
      name: `${card.label}读数`,
      parentId: null,
      position: { x: x + 16, y: 148 },
      size: { width: 328, height: 30 },
      rotation: 0,
      status: { locked: false, hidden: false },
      props: { segments: 20, showValue: true, decimals: card.decimals, glow: true },
      style: {
        backgroundColor: 'transparent',
        color: '#cfe9ff',
        trackColor: '#12304d',
        fillColor: '#38bdf8',
        fontSize: 14,
      },
      dataSource: metricSource(card.metric),
    });
  } else {
    flop(
      `${card.id}-value`,
      `${card.label}读数`,
      [x + 16, 140, 328, 78],
      card.metric,
      card.decimals,
    );
  }
});

// ── 主区：设备灯阵 / 产量趋势 / 产线负载排行 ──────────────────────────────
frame('main-frame', '主区边框', [16, 252, 1880, 456]);
text('grid-title', '灯阵标题', [32, 262, 300, 20], '设备状态灯阵', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
push({
  id: 'grid-devices',
  type: 'datav.status-grid',
  name: '设备状态灯阵',
  parentId: null,
  position: { x: 24, y: 288 },
  size: { width: 604, height: 412 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: {
    columns: 8,
    showLegend: true,
    // 灯阵不带单位（adapter 只投影值），负载的具体数值由用户按需打开；
    // 面板标题里的「设备状态」+ 图例已足够表达"这是什么"。
    showValue: false,
    labelVisible: false,
    emptyText: '无设备数据',
  },
  style: {
    backgroundColor: 'transparent',
    color: '#e6f1ff',
    labelColor: '#8aa4c0',
    legendColor: '#8aa4c0',
    runningColor: '#52c41a',
    standbyColor: '#fa8c16',
    faultColor: '#f5222d',
    offlineColor: '#6b7d8f',
    unknownColor: '#6b7d8f',
    tileGap: 6,
    tileRadius: 4,
    fontSize: 11,
  },
  dataSource: {
    type: 'dataset',
    datasetId: 'monitor.devices',
    // 参数顺序与 `describe().parameters` 一致；`line` 走变量槽位，切产线即整屏联动。
    params: {
      line: { kind: 'variable', variableId: 'line' },
      limit: { kind: 'literal', value: 48 },
    },
    binding: { fields: { items: ['name', 'status', 'load'] } },
  },
});

text('trend-title', '趋势标题', [652, 262, 320, 20], '产量趋势（最近 24 个采样点）', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
chart('trend-output', '产量趋势', [644, 288, 644, 412], 'area', seriesSource('output_count'));

text('rank-title', '排行标题', [1312, 262, 320, 18], '产线负载排行', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
chart(
  'rank-line',
  '产线负载排行',
  [1304, 284, 592, 190],
  'bar',
  rankingSource('line', 3),
  '#22d3ee',
);

// 主区右列纵向拆三段：排行（上）＋ 主轴负载水位 ／ 能耗达成胶囊（下并排）。
// 这两块是 PRD 的 C16 / C17——补齐前种子里只有 KPI 那一个胶囊、没有水位图。
text('load-water-label', '主轴负载标签', [1304, 478, 288, 16], '主轴负载（%）', {
  color: '#7fa6c4',
  fontSize: 12,
});
push({
  id: 'load-water',
  type: 'datav.water-level',
  name: '主轴负载水位',
  parentId: null,
  position: { x: 1304, y: 496 },
  size: { width: 288, height: 180 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: { shape: 'rect', decimals: 1, showLabel: true, waveAnimation: true },
  style: {
    backgroundColor: 'transparent',
    color: '#e6f1ff',
    waterColor: '#1d4ed8',
    waveColor: '#38bdf8',
    borderColor: '#12405f',
    fontSize: 24,
  },
  // `line_load` 走 15s 节拍（负载变化慢），points 取 12 让读数落在最近窗口。
  dataSource: metricSource('line_load', 12),
});

text('energy-capsule-label', '能耗达成标签', [1608, 478, 288, 16], '能耗达成', {
  color: '#7fa6c4',
  fontSize: 12,
});
push({
  id: 'energy-capsule',
  type: 'datav.capsule-progress',
  name: '能耗达成',
  parentId: null,
  position: { x: 1608, y: 496 },
  size: { width: 288, height: 180 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: { segments: 20, showValue: true, decimals: 1, glow: true },
  style: {
    backgroundColor: 'transparent',
    color: '#cfe9ff',
    trackColor: '#12304d',
    fillColor: '#22d3ee',
    fontSize: 18,
  },
  dataSource: metricSource('energy_ratio', 12),
});

// ── 副区：告警流水 / 工序链 / 班组绩效 ────────────────────────────────────
frame('sub-frame', '副区边框', [16, 708, 1888, 216]);
text('alarm-title', '告警标题', [32, 718, 320, 20], '告警流水（所选时间窗）', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
push({
  id: 'alarm-stream',
  type: 'datav.scroll-board',
  name: '告警流水',
  parentId: null,
  position: { x: 24, y: 744 },
  size: { width: 868, height: 172 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: {
    headerVisible: true,
    rowCount: 8,
    intervalMs: 3000,
    autoScroll: true,
    // 等级色列：`level` 是绑定里的第二列，行左侧出现状态色条 + 文本染色。
    statusColumn: 'level',
    statusPalette: {
      critical: '#f5222d',
      warning: '#fa8c16',
      info: '#1677ff',
      default: '#6b7d8f',
    },
  },
  style: {
    backgroundColor: 'transparent',
    color: '#cfe9ff',
    headerColor: '#5f9ec7',
    accentColor: '#38bdf8',
    borderColor: '#143a5c',
    fontSize: 12,
    rowHeight: 20,
  },
  dataSource: {
    type: 'dataset',
    datasetId: 'monitor.alarms',
    // 三个参数都来自变量：切产线/时间窗/等级时，这条流水的每一列都会跟着变。
    params: {
      line: { kind: 'variable', variableId: 'line' },
      window: { kind: 'variable', variableId: 'window' },
      level: { kind: 'variable', variableId: 'severity' },
      limit: { kind: 'literal', value: 20 },
    },
    binding: { fields: { columns: ['t', 'level', 'deviceName', 'message'] } },
  },
});

text('stage-title', '工序标题', [916, 718, 320, 20], '产线工序链', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
push({
  id: 'stage-pipeline',
  type: 'datav.pipeline',
  name: '产线工序链',
  parentId: null,
  position: { x: 908, y: 744 },
  size: { width: 604, height: 172 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: {
    showValue: true,
    decimals: 0,
    nameLines: 1,
    statusVisible: true,
    emptyText: '该产线无工序配置',
  },
  style: {
    backgroundColor: 'transparent',
    color: '#e6f1ff',
    labelColor: '#8aa4c0',
    legendColor: '#8aa4c0',
    runningColor: '#52c41a',
    standbyColor: '#fa8c16',
    faultColor: '#f5222d',
    offlineColor: '#6b7d8f',
    unknownColor: '#6b7d8f',
    nodeBackground: '#0b1a2b',
    nodeBorderColor: '#1e3a5f',
    connectorColor: '#38bdf8',
    connectorWidth: 1.5,
    valueColor: '#8aa4c0',
    fontSize: 12,
  },
  dataSource: {
    type: 'dataset',
    datasetId: 'monitor.pipeline',
    params: { line: { kind: 'variable', variableId: 'line' } },
    // 行序即工序顺序：服务端保序，物料不排序。
    binding: { fields: { stages: ['name', 'status', 'throughput'] } },
  },
});

text('crew-title', '班组标题', [1536, 718, 320, 20], '班组绩效', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
staticTable(
  'crew-table',
  '班组绩效',
  [1528, 744, 368, 172],
  [
    { id: 'crew', label: '班组', valueType: 'string' },
    { id: 'output', label: '产量', valueType: 'number' },
    { id: 'oee', label: 'OEE', valueType: 'number' },
  ],
  [
    { crew: '甲班', output: 4120, oee: 86.4 },
    { crew: '乙班', output: 3980, oee: 83.2 },
    { crew: '丙班', output: 3640, oee: 79.5 },
    { crew: '丁班', output: 3410, oee: 76.8 },
  ],
  ['crew', 'output', 'oee'],
);

// ── 选择器（static 表格 + 蓝图 rowClick → 变量）───────────────────────────
frame('picker-frame', '选择器边框', [16, 928, 872, 116]);
text('sel-line-label', '产线选择器标签', [24, 934, 300, 16], '产线切换', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
selectorBoard(
  'sel-line',
  '产线选择器',
  [24, 952, 300, 88],
  [
    { id: 'name', label: '产线', valueType: 'string' },
    { id: 'line', label: '代码', valueType: 'string' },
  ],
  [
    { line: 'LINE-A', name: 'A 线·总装' },
    { line: 'LINE-B', name: 'B 线·焊装' },
    { line: 'LINE-C', name: 'C 线·试制' },
  ],
  ['name', 'line'],
);
text('sel-window-label', '时间窗选择器标签', [340, 934, 260, 16], '时间窗切换', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
selectorBoard(
  'sel-window',
  '时间窗选择器',
  [340, 952, 260, 88],
  [
    { id: 'label', label: '时间窗', valueType: 'string' },
    { id: 'window', label: '分钟', valueType: 'number' },
  ],
  [
    { window: 60, label: '近 1 小时' },
    { window: 240, label: '近 4 小时' },
    { window: 1440, label: '近 24 小时' },
  ],
  ['label', 'window'],
);
text('sel-severity-label', '等级筛选标签', [616, 934, 260, 16], '告警等级筛选', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
selectorBoard(
  'sel-severity',
  '等级筛选',
  [616, 952, 260, 88],
  [
    { id: 'label', label: '等级', valueType: 'string' },
    { id: 'level', label: '取值', valueType: 'string' },
  ],
  [
    { level: 'all', label: '全部' },
    { level: 'critical', label: '严重' },
    { level: 'warning', label: '警告' },
    { level: 'info', label: '提示' },
  ],
  ['label', 'level'],
);

// ── 底栏 ──────────────────────────────────────────────────────────────────
text('footer-updated-label', '更新时间标签', [24, 1052, 76, 18], '数据更新', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
variableText('footer-updated', '更新时间', [104, 1052, 340, 18], 'clock', {
  color: '#8fd6ff',
  fontSize: 12,
});
text(
  'footer-note',
  '口径说明',
  [1200, 1052, 696, 18],
  '未处理告警为当前快照；告警流水为所选时间窗明细',
  { color: '#2f5d80', fontSize: 11, textAlign: 'right' },
);

export const DATAV_MONITOR_DOCUMENT = {
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: '#06101c',
    background: {
      type: 'linear-gradient' as const,
      angle: 160,
      stops: [
        { color: '#08182a', position: 0 },
        { color: '#06101c', position: 52 },
        { color: '#04101a', position: 100 },
      ],
    },
  },
  components,
  variables: [
    // `name` 必须是 ASCII 标识符（canonical schema 的 `VARIABLE_NAME_INVALID` 会拒绝中文），
    // 中文说明放 `description`。
    {
      id: 'line',
      name: 'line',
      description: '当前产线',
      type: 'static' as const,
      initialValue: 'LINE-A',
    },
    {
      id: 'window',
      name: 'window',
      description: '告警时间窗（分钟）',
      type: 'static' as const,
      initialValue: 60,
    },
    {
      id: 'severity',
      name: 'severity',
      description: '告警等级筛选',
      type: 'static' as const,
      initialValue: 'all',
    },
    // data-source：宿主只读，由宿主的 `hostCatalogPort.resolve` 每次求值。
    {
      id: 'clock',
      name: 'clock',
      description: '当前时间',
      type: 'data-source' as const,
      sourceId: 'production.clock',
      controlled: false,
      initialValue: '--:--:--',
    },
    {
      id: 'notice',
      name: 'notice',
      description: '告警播报',
      type: 'data-source' as const,
      sourceId: 'production.notice',
      controlled: false,
      initialValue: '本班无重大异常',
    },
    {
      id: 'status',
      name: 'status',
      description: '数据源状态',
      type: 'data-source' as const,
      sourceId: 'production.status',
      controlled: false,
      initialValue: '数据源在线',
    },
  ],
  blueprint: {
    // 三条规则的形态完全一致：选择器表格 rowClick → set-variable。
    // `event-payload` 的路径取自物料事件 payload：`{ rowIndex, row }`。
    rules: [
      {
        id: 'rule-line',
        trigger: {
          type: 'material-event' as const,
          componentId: 'sel-line',
          eventName: 'rowClick',
        },
        actions: [
          {
            type: 'set-variable' as const,
            variableId: 'line',
            value: { kind: 'event-payload' as const, path: ['row', 'line'] },
          },
        ],
      },
      {
        id: 'rule-window',
        trigger: {
          type: 'material-event' as const,
          componentId: 'sel-window',
          eventName: 'rowClick',
        },
        actions: [
          {
            type: 'set-variable' as const,
            variableId: 'window',
            value: { kind: 'event-payload' as const, path: ['row', 'window'] },
          },
        ],
      },
      {
        id: 'rule-severity',
        trigger: {
          type: 'material-event' as const,
          componentId: 'sel-severity',
          eventName: 'rowClick',
        },
        actions: [
          {
            type: 'set-variable' as const,
            variableId: 'severity',
            value: { kind: 'event-payload' as const, path: ['row', 'level'] },
          },
        ],
      },
    ],
  },
} as const;

/** 序列化生产监控种子；启动期即校验，写错时立刻失败而不是等前端加载。 */
export function serializeDatavMonitorDocument(): string {
  const validation = validateScreenDocumentInput(DATAV_MONITOR_DOCUMENT);
  if (!validation.ok) {
    throw new Error(`HOST_API_DATAV_MONITOR_INVALID: ${validation.reason}`);
  }
  return validation.serialized;
}
