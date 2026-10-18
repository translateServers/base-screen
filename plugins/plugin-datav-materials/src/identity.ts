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
export const PLUGIN_DATAV_ID = 'base-screen.datav-materials';

export const PLUGIN_DATAV_DIGITAL_FLOP_TYPE = 'datav.digital-flop';
export const PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME = 'base-screen-datav-digital-flop';

export const PLUGIN_DATAV_SCROLL_BOARD_TYPE = 'datav.scroll-board';
export const PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME = 'base-screen-datav-scroll-board';

export const PLUGIN_DATAV_WATER_LEVEL_TYPE = 'datav.water-level';
export const PLUGIN_DATAV_WATER_LEVEL_TAG_NAME = 'base-screen-datav-water-level';

export const PLUGIN_DATAV_BORDER_BOX_TYPE = 'datav.border-box';
export const PLUGIN_DATAV_BORDER_BOX_TAG_NAME = 'base-screen-datav-border-box';

export const PLUGIN_DATAV_CAPSULE_PROGRESS_TYPE = 'datav.capsule-progress';
export const PLUGIN_DATAV_CAPSULE_PROGRESS_TAG_NAME = 'base-screen-datav-capsule-progress';

export const PLUGIN_DATAV_MARQUEE_TYPE = 'datav.marquee';
export const PLUGIN_DATAV_MARQUEE_TAG_NAME = 'base-screen-datav-marquee';

/** 本插件自己的检查器控件：装饰边框的样式选择器，经 editorDescriptor 的 `control: 'custom'` 授权使用。 */
export const PLUGIN_DATAV_BORDER_PICKER_ID = 'base-screen.datav.border-style-picker';
export const PLUGIN_DATAV_BORDER_PICKER_TAG_NAME = 'base-screen-datav-border-picker';

/** 文档事务命令：在选中的装饰边框上轮换样式（走 command.execute，天然可撤销）。 */
export const PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID = 'base-screen.datav.cycle-border-style';

/**
 * 装饰边框样式词汇。DataV 以"十几种边框"著称，此处收敛为六种几何上确实互不相同的
 * 形态：与其凑数，不如让每一种都真的由不同的图元组合构成。
 */
export const DATAV_BORDER_STYLES = [
  'plain',
  'corner-brackets',
  'double-line',
  'dashed',
  'notch',
  'glow-corner',
] as const;

export type DatavBorderStyle = (typeof DATAV_BORDER_STYLES)[number];

export const DATAV_BORDER_STYLE_LABELS: Readonly<Record<DatavBorderStyle, string>> = {
  plain: '实线',
  'corner-brackets': '四角括号',
  'double-line': '双线',
  dashed: '虚线',
  notch: '切角',
  'glow-corner': '发光角',
};

export function isDatavBorderStyle(value: unknown): value is DatavBorderStyle {
  return typeof value === 'string' && (DATAV_BORDER_STYLES as readonly string[]).includes(value);
}

/** 大屏组件共用的默认配色，避免每个 manifest 各写一份十六进制字面量。 */
export const DATAV_DEFAULT_SURFACE = {
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
export const DATAV_STATUS_COLORS = {
  running: '#52c41a',
  standby: '#fa8c16',
  fault: '#f5222d',
  offline: '#6b7d8f',
  unknown: '#6b7d8f',
} as const;

export type DatavStatusKey = keyof typeof DATAV_STATUS_COLORS;

/** 告警等级三色（+ 兜底）：与设备五态是两套语义，故单列一张表。 */
export const DATAV_ALARM_LEVEL_COLORS = {
  critical: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
  unknown: '#6b7d8f',
} as const;

export type DatavAlarmLevelKey = keyof typeof DATAV_ALARM_LEVEL_COLORS;

/** 降级角标色：橙、只用一处，避免「错误态红色铺底」（红是告警语义专用）。 */
export const DATAV_DEGRADED_COLOR = '#fa8c16';

/** 默认表头/次级文本色（与各 manifest 的 `headerColor` 默认值同源）。 */
export const DATAV_SECONDARY_COLOR = '#8aa4c0';
