import type { BaseScreenPluginFragmentContribution } from '@base-screen/plugin-core';
import {
  BOARD_DEFAULT_SURFACE,
  BOARD_SECONDARY_COLOR,
  PLUGIN_BOARD_BORDER_BOX_TYPE,
  PLUGIN_BOARD_STATUS_GRID_TYPE,
  PLUGIN_BOARD_STATUS_LEGEND_TYPE,
  PLUGIN_BOARD_TITLE_DECOR_TYPE,
} from './identity.js';

/**
 * 设备状态的两份组合分片（ADR-0100）。分片只组合物料、不新增渲染逻辑：标题是 `base.text`（F3），
 * 底座由官方 `base.container` 承担，插件只引用本插件与官方物料（F8）。插入后就是普通组件。
 *
 * 2026-11-22 按调研重做（Grafana 电梯状态看板、DataEase 智慧工厂 / 媒体设备模板、ThingsBoard
 * SCADA 演示）。共同结论：设备一多，监控屏靠**汇总**（总数 + 占比 + 各状态计数）表达设备状态，
 * 逐台格子只适合几十台以内。所以拆成两份：
 * - 「设备状态概览」= 标题 + 状态分布，任何规模都适用；
 * - 「设备状态卡」= 概览 + 状态灯阵，适合小规模、要看到每一台的场景。
 *
 * 尺寸按 1920×1080 设计稿上一张卡片的量级给（DataEase 指标卡默认 600×300、GoView 500×300），
 * 而不是半屏；作者再按需拉伸。
 *
 * 两个读数物料的默认示例是同一份（`device-sample.ts`），插入后计数与格数一一对得上。绑定真实数据
 * 时两者应读同一个文档级数据源实例（ADR-0100 F4）——分片无法预置它：文档级数据源只有 dataset /
 * host-resource / url-query / host-catalog 四种来源，插件不知道宿主的数据集 id。
 */
export const PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT_ID = 'base-screen.board.device-status-card';
export const PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT_ID = 'base-screen.board.device-status-overview';

/** 卡片底座：透明填充 + 一道暗描边，不和大屏背景抢层级。 */
const CARD_SHELL_STYLE = {
  fill: 'transparent',
  borderColor: BOARD_DEFAULT_SURFACE.borderColor,
  borderWidth: 1,
};

const CARD_TITLE_STYLE = { color: BOARD_SECONDARY_COLOR, fontSize: 16 };

export const PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT: BaseScreenPluginFragmentContribution = {
  kind: 'fragment',
  id: PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT_ID,
  name: '设备状态概览',
  category: '指标',
  keywords: ['设备', '状态', '汇总', '分布', '占比', '卡片'],
  shell: {
    key: 'card',
    materialType: 'base.container',
    name: '设备状态概览',
    size: { width: 280, height: 100 },
    style: CARD_SHELL_STYLE,
  },
  nodes: [
    {
      key: 'title',
      materialType: 'base.text',
      name: '卡片标题',
      offset: { x: 16, y: 10 },
      size: { width: 200, height: 24 },
      style: CARD_TITLE_STYLE,
      dataSource: { type: 'static', value: '设备状态' },
    },
    {
      key: 'summary',
      materialType: PLUGIN_BOARD_STATUS_LEGEND_TYPE,
      offset: { x: 16, y: 42 },
      size: { width: 248, height: 48 },
    },
  ],
};

export const PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT: BaseScreenPluginFragmentContribution = {
  kind: 'fragment',
  id: PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT_ID,
  name: '设备状态卡',
  category: '指标',
  keywords: ['设备', '状态', '灯阵', '分布', '卡片'],
  shell: {
    key: 'card',
    materialType: 'base.container',
    name: '设备状态卡',
    size: { width: 320, height: 188 },
    style: CARD_SHELL_STYLE,
  },
  nodes: [
    {
      key: 'title',
      materialType: 'base.text',
      name: '卡片标题',
      offset: { x: 16, y: 10 },
      size: { width: 220, height: 24 },
      style: CARD_TITLE_STYLE,
      dataSource: { type: 'static', value: '设备状态' },
    },
    {
      key: 'summary',
      materialType: PLUGIN_BOARD_STATUS_LEGEND_TYPE,
      offset: { x: 16, y: 42 },
      size: { width: 288, height: 48 },
    },
    {
      key: 'grid',
      materialType: PLUGIN_BOARD_STATUS_GRID_TYPE,
      offset: { x: 8, y: 96 },
      size: { width: 304, height: 84 },
    },
  ],
};

/** 声明顺序即物料库里的展示顺序：先概览（通用），再带灯阵的卡（小规模）。 */
export const PLUGIN_BOARD_DEVICE_FRAGMENTS: readonly BaseScreenPluginFragmentContribution[] = [
  PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT,
  PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT,
];

/**
 * 容器与装饰体系的两份组合（ADR-0101）。
 *
 * 标题文字仍是 `base.text`（F3），放在「标题装饰」里面随它移动——标题装饰只画图元，不长出文案
 * 属性。外壳与装饰的强调色不在分片里写死：新插入时按 `themeStyle` 跟随文档主题的主体色。
 */
export const PLUGIN_BOARD_TITLE_BAR_FRAGMENT_ID = 'base-screen.board.title-bar';
export const PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT_ID = 'base-screen.board.device-status-panel';

const PANEL_TITLE_TEXT_STYLE = {
  color: BOARD_DEFAULT_SURFACE.color,
  fontSize: 16,
  fontWeight: '700',
  verticalAlign: 'middle',
};

export const PLUGIN_BOARD_TITLE_BAR_FRAGMENT: BaseScreenPluginFragmentContribution = {
  kind: 'fragment',
  id: PLUGIN_BOARD_TITLE_BAR_FRAGMENT_ID,
  name: '标题栏',
  category: '装饰',
  keywords: ['标题', '标题栏', '装饰', '卡片'],
  shell: {
    key: 'decor',
    materialType: PLUGIN_BOARD_TITLE_DECOR_TYPE,
    name: '标题栏',
    size: { width: 288, height: 32 },
  },
  nodes: [
    {
      key: 'title',
      materialType: 'base.text',
      name: '标题',
      offset: { x: 14, y: 4 },
      size: { width: 260, height: 24 },
      style: PANEL_TITLE_TEXT_STYLE,
      dataSource: { type: 'static', value: '标题' },
    },
  ],
};

/**
 * 「设备状态面板」：装饰边框做外壳的设备状态卡——指挥中心风格的成品卡片。
 * 内容与「设备状态卡」相同（状态分布 + 状态灯阵，同一份示例数据）。
 */
export const PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT: BaseScreenPluginFragmentContribution = {
  kind: 'fragment',
  id: PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT_ID,
  name: '设备状态面板',
  category: '装饰',
  keywords: ['设备', '状态', '边框', '指挥中心', '卡片'],
  shell: {
    key: 'frame',
    materialType: PLUGIN_BOARD_BORDER_BOX_TYPE,
    name: '设备状态面板',
    size: { width: 320, height: 200 },
  },
  nodes: [
    {
      key: 'decor',
      materialType: PLUGIN_BOARD_TITLE_DECOR_TYPE,
      name: '标题栏',
      offset: { x: 12, y: 10 },
      size: { width: 296, height: 28 },
    },
    {
      key: 'title',
      materialType: 'base.text',
      name: '卡片标题',
      parent: 'decor',
      offset: { x: 26, y: 12 },
      size: { width: 240, height: 24 },
      style: PANEL_TITLE_TEXT_STYLE,
      dataSource: { type: 'static', value: '设备状态' },
    },
    {
      key: 'summary',
      materialType: PLUGIN_BOARD_STATUS_LEGEND_TYPE,
      offset: { x: 16, y: 48 },
      size: { width: 288, height: 48 },
    },
    {
      key: 'grid',
      materialType: PLUGIN_BOARD_STATUS_GRID_TYPE,
      offset: { x: 8, y: 104 },
      size: { width: 304, height: 84 },
    },
  ],
};

/** 插件全部组合分片，声明顺序即物料库顺序。 */
export const PLUGIN_BOARD_FRAGMENTS: readonly BaseScreenPluginFragmentContribution[] = [
  ...PLUGIN_BOARD_DEVICE_FRAGMENTS,
  PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT,
  PLUGIN_BOARD_TITLE_BAR_FRAGMENT,
];
