import { styleColor } from './json-values.js';

/**
 * 大屏组件包的标识与词汇。
 *
 * 这些物料对标的是一类真实的业务形态：指挥中心/监控大屏上反复出现的"指标与装饰"
 * 组件族（翻牌器、轮播列表、水位图、装饰边框）。它们此前只能由宿主自己实现，
 * 这里作为一个外围插件交付，用来验证插件通道能承载真正的产品内容，而不只是验证用
 * 的探针物料。
 *
 * 与 `plugin-echarts`（渲染类 + 第三方依赖）和 `plugin-metrics`（纯声明、零元素）
 * 相比，本插件的定位是：**渲染类 + 零第三方依赖**——大屏组件用原生 DOM/SVG 即可
 * 表达，不需要打包任何图表库，这也是外围插件分区"依赖隔离"之外的一条正面样本。
 */
export const PLUGIN_BOARD_ID = 'base-screen.board-materials';

export const PLUGIN_BOARD_DIGITAL_FLOP_TYPE = 'board.digital-flop';
export const PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME = 'base-screen-board-digital-flop';

export const PLUGIN_BOARD_SCROLL_BOARD_TYPE = 'board.scroll-board';
export const PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME = 'base-screen-board-scroll-board';

export const PLUGIN_BOARD_WATER_LEVEL_TYPE = 'board.water-level';
export const PLUGIN_BOARD_WATER_LEVEL_TAG_NAME = 'base-screen-board-water-level';

export const PLUGIN_BOARD_BORDER_BOX_TYPE = 'board.border-box';
export const PLUGIN_BOARD_BORDER_BOX_TAG_NAME = 'base-screen-board-border-box';

export const PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE = 'board.capsule-progress';
export const PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME = 'base-screen-board-capsule-progress';

export const PLUGIN_BOARD_MARQUEE_TYPE = 'board.marquee';
export const PLUGIN_BOARD_MARQUEE_TAG_NAME = 'base-screen-board-marquee';

export const PLUGIN_BOARD_STATUS_GRID_TYPE = 'board.status-grid';
export const PLUGIN_BOARD_STATUS_GRID_TAG_NAME = 'base-screen-board-status-grid';

export const PLUGIN_BOARD_PIPELINE_TYPE = 'board.pipeline';
export const PLUGIN_BOARD_PIPELINE_TAG_NAME = 'base-screen-board-pipeline';

/** 本插件自己的检查器控件：装饰边框的样式选择器，经 editorDescriptor 的 `control: 'custom'` 授权使用。 */
export const PLUGIN_BOARD_BORDER_PICKER_ID = 'base-screen.board.border-style-picker';
export const PLUGIN_BOARD_BORDER_PICKER_TAG_NAME = 'base-screen-board-border-picker';

/** 文档事务命令：在选中的装饰边框上轮换样式（走 command.execute，天然可撤销）。 */
export const PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID = 'base-screen.board.cycle-border-style';

/**
 * 装饰边框样式词汇。同类成品大屏产品常以"十几种边框"为卖点，此处收敛为六种几何上确实互不相同的
 * 形态：与其凑数，不如让每一种都真的由不同的图元组合构成。
 */
export const BOARD_BORDER_STYLES = [
  'plain',
  'corner-brackets',
  'double-line',
  'dashed',
  'notch',
  'glow-corner',
] as const;

export type BoardBorderStyle = (typeof BOARD_BORDER_STYLES)[number];

export const BOARD_BORDER_STYLE_LABELS: Readonly<Record<BoardBorderStyle, string>> = {
  plain: '实线',
  'corner-brackets': '四角括号',
  'double-line': '双线',
  dashed: '虚线',
  notch: '切角',
  'glow-corner': '发光角',
};

export function isBoardBorderStyle(value: unknown): value is BoardBorderStyle {
  return typeof value === 'string' && (BOARD_BORDER_STYLES as readonly string[]).includes(value);
}

/** 大屏组件共用的默认配色，避免每个 manifest 各写一份十六进制字面量。 */
export const BOARD_DEFAULT_SURFACE = {
  backgroundColor: '#0b1a2b',
  color: '#e6f1ff',
  accentColor: '#38bdf8',
  borderColor: '#1e3a5f',
} as const;

/**
 * 设备/工序五态色——**唯一来源**（PRD §10.1）。
 *
 * 任何物料（现状 `scroll-board`，后续 `status-grid` / `pipeline`）与降级角标都从这里
 * 取色，不得再写十六进制字面量；否则同一个「故障红」会在三个物料里出现三个近似值，
 * 值班员就无法用颜色做跨区块对照。
 *
 * 颜色**不是唯一编码**：每处用色都必须同时有文字（`fault` 旁边要有「故障」）。
 */
export const BOARD_STATUS_COLORS = {
  running: '#52c41a',
  standby: '#fa8c16',
  fault: '#f5222d',
  offline: '#6b7d8f',
  unknown: '#6b7d8f',
} as const;

export type BoardStatusKey = keyof typeof BOARD_STATUS_COLORS;

/**
 * 状态词汇（中文展示名）。颜色**不是唯一编码**：每处用色都必须能同时给出这段文字，
 * 否则色盲用户与打印稿都无法读出状态。
 */
export const BOARD_STATUS_LABELS: Readonly<Record<BoardStatusKey, string>> = {
  running: '运行',
  standby: '待机',
  fault: '故障',
  offline: '离线',
  unknown: '未知',
};

/** 五态词汇的位置也在这里：状态归一只有一处实现，物料不得各写一份字符串比较。 */
export function isBoardStatusKey(value: unknown): value is BoardStatusKey {
  return typeof value === 'string' && Object.hasOwn(BOARD_STATUS_COLORS, value);
}

/** 任何不在五态内的字符串（含空串、数字、null）一律归 `unknown`，不抛错。 */
export function normalizeBoardStatus(value: unknown): BoardStatusKey {
  return isBoardStatusKey(value) ? value : 'unknown';
}

/**
 * 从 style 里读出五态色（带 override 语义）：`runningColor` 等扁平键优先，
 * 缺省回落到 `BOARD_STATUS_COLORS`。
 *
 * 为什么不用嵌套 `statusColors` 对象：manifest 的 styleSchema/propertyPanel 对嵌套
 * 字典支持不好（面板无法为子字段各生成一个取色器），扁平键才能让 5 个色都能被编辑。
 * 扁平键也让「五态色的唯一来源」这条约定可被 lint 看见：默认值直接引用本文件的常量。
 */
export function statusColorMap(
  style: Readonly<Record<string, unknown>>,
): Readonly<Record<BoardStatusKey, string>> {
  return {
    running: styleColor(style.runningColor, BOARD_STATUS_COLORS.running),
    standby: styleColor(style.standbyColor, BOARD_STATUS_COLORS.standby),
    fault: styleColor(style.faultColor, BOARD_STATUS_COLORS.fault),
    offline: styleColor(style.offlineColor, BOARD_STATUS_COLORS.offline),
    unknown: styleColor(style.unknownColor, BOARD_STATUS_COLORS.unknown),
  };
}

/** 告警等级三色（+ 兜底）：与设备五态是两套语义，故单列一张表。 */
export const BOARD_ALARM_LEVEL_COLORS = {
  critical: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
  unknown: '#6b7d8f',
} as const;

export type BoardAlarmLevelKey = keyof typeof BOARD_ALARM_LEVEL_COLORS;

/** 降级角标色：橙、只用一处，避免「错误态红色铺底」（红是告警语义专用）。 */
export const BOARD_DEGRADED_COLOR = '#fa8c16';

/** 默认表头/次级文本色（与各 manifest 的 `headerColor` 默认值同源）。 */
export const BOARD_SECONDARY_COLOR = '#8aa4c0';
