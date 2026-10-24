import { validateScreenDocumentInput } from './screen-document-guard';

/**
 * 实时告警演示大屏种子：1920×1080，专供「外部告警系统 → 宿主条件样式」这条链路。
 *
 * 与 `board-monitor-document.ts` 的分工：那张屏证明数据层四通道全覆盖，这张屏只把
 * 「告警」一条线做深——流水、读数、等级色块三块共用同一套等级语义。
 *
 * | 区块 | 组件 | 数据来自 |
 * | --- | --- | --- |
 * | 告警流水 | `board.scroll-board` | `monitor.alarms`（`describe/query`，参数由变量槽位求值） |
 * | KPI 读数 | `board.digital-flop` ← `kpi-alarm-value` | `host-resource` `demo_metric` `alarm_open` |
 * | 等级色块 | 3 组「矩形色块 + 翻牌读数」 | `demo_metric` `alarm_critical` / `alarm_warning` / `alarm_info` |
 *
 * **演示 key 的对齐是这张屏的存在理由**：宿主的 `host-alarm-bindings.ts` 把
 * `alarm.open` 映射到两个**组件 id**（`kpi-alarm-value`、`top-notice`），而绑定表是
 * 全局的、不区分大屏。因此这里的两个组件刻意沿用与生产监控屏相同的 id 与基础色，
 * 宿主侧一行都不用改，`POST /api/demo/alarms/raise { key: 'alarm.open' }` 就能让
 * 这张屏的未处理告警读数与告警播报换色。反过来说，**文档里没有告警 key、阈值或
 * 样式规则**——告警判定与视觉映射都归宿主。
 *
 * 等级色板的单一来源是 `plugin-board-materials` 的 `BOARD_ALARM_LEVEL_COLORS`。后端
 * 不 import 插件包（CJS 宿主不依赖 ESM 插件），所以这里写同值字面量，由根测试
 * `tests/examples/board-alarm-document.test.ts` 逐色比对，避免两处各改一半。
 *
 * 版式纪律（与其余种子同）：所有组件都是**根节点**，组壳几何由引擎持有；把色块当
 * 父节点会在第一次无关编辑时被压平。
 *
 * 数据纪律：文档里只写"形状"，不写时间戳与随机值；读数全部来自演示指标接口与宿主
 * 变量，因此整份种子是确定性的，可被根级文档测试逐字段断言。
 */

/** 告警等级色板：与 `BOARD_ALARM_LEVEL_COLORS` 同值（测试会比对）。 */
const LEVEL_COLORS = {
  critical: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
} as const;

/** 等级色块的底色：同色相降透明度，避免整屏高饱和红铺满。 */
const LEVEL_TINTS = {
  critical: 'rgba(245, 34, 45, .16)',
  warning: 'rgba(250, 140, 22, .16)',
  info: 'rgba(22, 119, 255, .16)',
} as const;

type LevelKey = keyof typeof LEVEL_COLORS;

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

/** 绑定变量的文本（`base.text` 只渲染字符串，播报/时钟/状态都走它）。 */
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
    style: { borderColor: '#22364d', borderWidth: 0, opacity: 1, ...style },
    dataSource: null,
  });
}

/** 装饰边框：`dataSource: null`（纯装饰不承载数据）。 */
function frame(id: string, name: string, box: Box): void {
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
    props: { borderStyle: 'corner-brackets', bracketSize: 16, lineWidth: 2 },
    style: {
      backgroundColor: 'rgba(10, 16, 26, .55)',
      borderColor: '#7a2a33',
      color: '#c98b93',
    },
    dataSource: null,
  });
}

/** 翻牌读数：只投影标量（`demo_metric` 的最新一个点）。 */
function flop(
  id: string,
  name: string,
  box: Box,
  resourceId: string,
  options: { readonly color: string; readonly accentColor: string } = {
    color: '#7ff0ff',
    accentColor: '#0e3b5c',
  },
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
      decimals: 0,
      thousandsSeparator: true,
      flipAnimation: true,
    },
    style: {
      backgroundColor: 'transparent',
      color: options.color,
      accentColor: options.accentColor,
      fontSize: 44,
    },
    dataSource: {
      type: 'host-resource',
      resourceType: 'demo_metric',
      resourceId,
      // `points` 只是取最近窗口：读数=最新一个点，与生产监控屏的 KPI 同口径。
      params: { points: { kind: 'literal', value: 24 } },
      binding: { fields: { value: ['value'] } },
    },
  });
}

/** 选择器：用 `board.scroll-board`（行是 div，点击即 `rowClick`，payload 带整行）。 */
function selectorBoard(
  id: string,
  name: string,
  box: Box,
  fields: readonly { readonly id: string; readonly label: string; readonly valueType: string }[],
  rows: readonly Readonly<Record<string, unknown>>[],
  columns: readonly string[],
  rowCount: number,
): void {
  const [x, y, width, height] = box;
  push({
    id,
    type: 'board.scroll-board',
    name,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    status: { locked: false, hidden: false },
    props: {
      headerVisible: true,
      rowCount,
      intervalMs: 3000,
      // 选择器必须静止：轮播会让「点第三行」变成点一个不断移动的目标。
      autoScroll: false,
      statusColumn: '',
      statusPalette: {},
    },
    style: {
      backgroundColor: 'rgba(9, 18, 30, .7)',
      color: '#cfe9ff',
      headerColor: '#5f9ec7',
      accentColor: '#38bdf8',
      borderColor: '#22364d',
      fontSize: 12,
      rowHeight: 20,
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
  fill: 'linear-gradient(180deg, rgba(74, 18, 24, .85) 0%, rgba(6, 12, 20, 0) 100%)',
});
text('top-title', '主标题', [24, 18, 560, 34], '实时告警演示大屏', {
  color: '#eaf6ff',
  fontSize: 26,
  fontWeight: '700',
});
text('top-subtitle', '副标题', [24, 56, 420, 18], '告警系统 SSE 推送 · 等级色板统一', {
  color: '#9f7b80',
  fontSize: 12,
  letterSpacing: 1,
});
text('top-notice-label', '播报前缀', [596, 56, 52, 18], '播报：', {
  color: '#56b7e8',
  fontSize: 12,
  textAlign: 'right',
});
// 与生产监控屏同 id、同基础色：宿主 `alarm.open` 的 warning/critical 覆盖直接命中。
variableText('top-notice', '告警播报', [652, 56, 720, 18], 'notice', {
  color: '#ffd591',
  fontSize: 13,
});
variableText('top-status', '数据源状态', [1396, 56, 200, 18], 'status', {
  color: '#8fd6ff',
  fontSize: 12,
  textAlign: 'right',
});
variableText('top-clock', '当前时间', [1600, 20, 296, 18], 'clock', {
  color: '#6fa8cc',
  fontSize: 13,
  textAlign: 'right',
});

// ── KPI 读数 + 等级色块 ───────────────────────────────────────────────────
text('kpi-section-label', 'KPI 分区标题', [24, 100, 240, 18], 'KPI 读数', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
text(
  'level-section-label',
  '等级色块分区标题',
  [496, 100, 600, 18],
  '等级色块（近 1 小时新增 · 颜色 = 告警等级）',
  { color: '#7fa6c4', fontSize: 12 },
);

// 第一张卡是「总读数」：色板中性，才看得清 alarm.open 推上来的橙/红。
rectangle('kpi-alarm-bg', '未处理告警卡片底', [24, 124, 456, 140], {
  fill: 'rgba(9, 18, 30, .82)',
  borderColor: '#31465e',
  borderWidth: 1,
});
text('kpi-alarm-label', '未处理告警标签', [40, 134, 420, 18], '未处理告警（条）', {
  color: '#7fa6c4',
  fontSize: 12,
});
flop('kpi-alarm-value', '未处理告警读数', [40, 158, 424, 90], 'alarm_open');

const LEVEL_BLOCKS: readonly { readonly key: LevelKey; readonly label: string }[] = [
  { key: 'critical', label: '严重告警（条）· critical' },
  { key: 'warning', label: '警告告警（条）· warning' },
  { key: 'info', label: '提示告警（条）· info' },
];

LEVEL_BLOCKS.forEach((block, index) => {
  const x = 496 + index * 472;
  const color = LEVEL_COLORS[block.key];
  // 色块 = 底 + 左侧 6px 实色条：实色条给冒烟一个可断言的精确色值，底色只负责观感。
  rectangle(`level-${block.key}-bg`, `${block.label}色块底`, [x, 124, 456, 140], {
    fill: LEVEL_TINTS[block.key],
    borderColor: color,
    borderWidth: 1,
    borderRadius: 6,
  });
  rectangle(`level-${block.key}-bar`, `${block.label}色条`, [x, 124, 6, 140], {
    fill: color,
    borderColor: color,
    borderWidth: 0,
    borderRadius: 3,
  });
  text(`kpi-level-${block.key}-label`, `${block.label}标签`, [x + 20, 134, 420, 18], block.label, {
    color,
    fontSize: 12,
    fontWeight: '700',
  });
  flop(
    `kpi-level-${block.key}-value`,
    `${block.label}读数`,
    [x + 20, 158, 420, 90],
    `alarm_${block.key}`,
    { color, accentColor: '#0c1622' },
  );
});

// ── 主区：告警流水（左）＋ 链路/口径说明（右） ────────────────────────────
frame('main-frame', '主区边框', [16, 272, 1892, 616]);
text(
  'alarm-title',
  '告警流水标题',
  [32, 282, 720, 20],
  '告警流水 · 所选产线 / 近 60 分钟 / 按时间倒序',
  { color: '#a8d4ea', fontSize: 14, fontWeight: '700' },
);
push({
  id: 'alarm-stream',
  type: 'board.scroll-board',
  name: '告警流水',
  parentId: null,
  position: { x: 24, y: 312 },
  size: { width: 1240, height: 572 },
  rotation: 0,
  status: { locked: false, hidden: false },
  props: {
    headerVisible: true,
    // LINE-A 近 60 分钟共 14 条，13 行可见 → 触发轮播（数据条数由后端固定）。
    rowCount: 13,
    intervalMs: 3000,
    autoScroll: true,
    // 等级色列：`level` 是绑定的第二列，行左侧出现 4px 色条 + 等级文字染色。
    statusColumn: 'level',
    statusPalette: { ...LEVEL_COLORS, default: '#6b7d8f' },
  },
  style: {
    backgroundColor: 'transparent',
    color: '#e6edf5',
    headerColor: '#8aa4c0',
    accentColor: '#f5222d',
    borderColor: '#22364d',
    fontSize: 13,
    rowHeight: 40,
  },
  dataSource: {
    type: 'dataset',
    datasetId: 'monitor.alarms',
    // 三个参数都走变量：切产线/等级时整条流水重查；window 只由文档里的静态变量给值。
    params: {
      line: { kind: 'variable', variableId: 'line' },
      window: { kind: 'variable', variableId: 'window' },
      level: { kind: 'variable', variableId: 'severity' },
      limit: { kind: 'literal', value: 20 },
    },
    binding: { fields: { columns: ['t', 'level', 'deviceName', 'message'] } },
  },
});

text('guide-title', '演示链路标题', [1280, 282, 608, 20], '演示 key 与样式链路', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
rectangle('guide-card', '演示链路卡片底', [1280, 312, 608, 232], {
  fill: 'rgba(9, 18, 30, .72)',
  borderColor: '#22364d',
  borderWidth: 1,
  borderRadius: 6,
});
const GUIDE_LINES: readonly string[] = [
  '① 宿主把 alarm.open 映射到 kpi-alarm-value 与 top-notice',
  '② warning → #fa8c16 ／ critical → #f5222d，只改样式不改文档',
  '③ SSE 到达即重算条件样式，一帧只失效一次',
  '④ clear 后回到文档基础色，canonical 文档字节不变',
  '⑤ POST /api/demo/alarms/raise { key: "alarm.open", level: "critical" }',
  '⑥ POST /api/demo/alarms/clear { key: "alarm.open" }',
];
GUIDE_LINES.forEach((line, index) => {
  text(
    `guide-line-${index + 1}`,
    `链路说明 ${index + 1}`,
    [1300, 326 + index * 32, 568, 18],
    line,
    {
      color: '#b9cade',
      fontSize: 12,
    },
  );
});

text('caliber-title', '口径标题', [1280, 560, 608, 20], '口径说明', {
  color: '#a8d4ea',
  fontSize: 14,
  fontWeight: '700',
});
rectangle('caliber-card', '口径卡片底', [1280, 590, 608, 284], {
  fill: 'rgba(9, 18, 30, .5)',
  borderColor: '#1b2a3d',
  borderWidth: 1,
  borderRadius: 6,
});
const CALIBER_LINES: readonly string[] = [
  '未处理告警：当前未确认快照，不按产线拆分',
  '等级计数：近 1 小时新增（critical / warning / info）',
  '告警流水：所选产线、近 60 分钟、最多 20 条',
  '等级色板与流水的 statusPalette 同源：#f5222d / #fa8c16 / #1677ff',
  '读数来自演示指标接口，只保证确定性，不对应真实告警台账',
];
CALIBER_LINES.forEach((line, index) => {
  text(
    `caliber-line-${index + 1}`,
    `口径说明 ${index + 1}`,
    [1300, 604 + index * 30, 568, 18],
    line,
    { color: '#8fa8bd', fontSize: 12 },
  );
});

// ── 选择器（static 表格 + 蓝图 rowClick → 变量）───────────────────────────
frame('filter-frame', '筛选区边框', [16, 892, 1892, 140]);
text('sel-line-label', '产线选择器标签', [24, 900, 300, 16], '产线切换', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
selectorBoard(
  'sel-line',
  '产线选择器',
  [24, 920, 300, 92],
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
  3,
);
text('sel-severity-label', '等级筛选标签', [340, 900, 300, 16], '等级筛选', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
selectorBoard(
  'sel-severity',
  '等级筛选',
  [340, 920, 300, 112],
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
  4,
);
text(
  'filter-note-1',
  '筛选说明 1',
  [660, 902, 1200, 18],
  '选择器走蓝图 rowClick → set-variable：产线 / 等级写进变量后，告警流水按变量求值重查。',
  { color: '#8fa8bd', fontSize: 12 },
);
text(
  'filter-note-2',
  '筛选说明 2',
  [660, 932, 1200, 18],
  '等级筛选只作用于流水明细：KPI 与等级色块是快照口径，不随筛选变化。',
  { color: '#6f8ba3', fontSize: 12 },
);
text(
  'filter-note-3',
  '筛选说明 3',
  [660, 962, 1200, 18],
  '告警 key 与样式映射都在宿主侧（src/screen/host-alarm-bindings.ts），文档不持有告警规则。',
  { color: '#6f8ba3', fontSize: 12 },
);

// ── 底栏 ──────────────────────────────────────────────────────────────────
text('footer-updated-label', '更新时间标签', [24, 1040, 76, 18], '数据更新', {
  color: '#56b7e8',
  fontSize: 12,
  fontWeight: '700',
});
variableText('footer-updated', '更新时间', [104, 1040, 340, 18], 'clock', {
  color: '#8fd6ff',
  fontSize: 12,
});
text(
  'footer-note',
  '口径说明',
  [1200, 1040, 696, 18],
  '未处理告警为当前快照；等级计数为近 1 小时新增；告警流水为所选产线明细',
  { color: '#4a6b85', fontSize: 11, textAlign: 'right' },
);

export const BOARD_ALARM_DOCUMENT = {
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: '#050d18',
    background: {
      type: 'linear-gradient' as const,
      angle: 160,
      stops: [
        { color: '#0a1220', position: 0 },
        { color: '#050d18', position: 54 },
        { color: '#04080f', position: 100 },
      ],
    },
  },
  components,
  variables: [
    // `name` 必须是 ASCII 标识符（canonical schema 的 `VARIABLE_NAME_INVALID` 拒绝中文），
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
    // 两条规则形态一致：选择器 rowClick → set-variable；`event-payload` 路径取自物料
    // 事件 payload 的 `{ rowIndex, row }`。
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

/** 序列化告警演示种子；启动期即校验，写错时立刻失败而不是等前端加载。 */
export function serializeBoardAlarmDocument(): string {
  const validation = validateScreenDocumentInput(BOARD_ALARM_DOCUMENT);
  if (!validation.ok) {
    throw new Error(`HOST_API_BOARD_ALARM_INVALID: ${validation.reason}`);
  }
  return validation.serialized;
}
