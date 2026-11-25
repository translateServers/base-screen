export {
  appendDegradedBadge,
  BOARD_DEGRADATION_FALLBACK,
  BOARD_DEGRADATION_TEXT,
  BOARD_DEGRADED_ATTRIBUTE,
  BOARD_DEGRADED_BADGE_ATTRIBUTE,
  clearDegradedBadge,
  degradationText,
  shouldKeepFrame,
} from './board-degradation.js';
export { BoardMaterialElement } from './board-element.js';
export {
  definePluginBoardBorderBoxMaterial,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  PluginBoardBorderBoxElement,
} from './border-box.js';
export { PluginBoardBorderPickerElement } from './border-picker.js';
export {
  definePluginBoardCapsuleProgressMaterial,
  PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST,
  PluginBoardCapsuleProgressElement,
} from './capsule-progress.js';
export { BOARD_DEVICE_SAMPLE_DATA } from './device-sample.js';
export {
  definePluginBoardDigitalFlopMaterial,
  formatNumericText,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PluginBoardDigitalFlopElement,
} from './digital-flop.js';
export {
  PLUGIN_BOARD_DEVICE_FRAGMENTS,
  PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT,
  PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT_ID,
  PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT,
  PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT_ID,
  PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT,
  PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT_ID,
  PLUGIN_BOARD_FRAGMENTS,
  PLUGIN_BOARD_TITLE_BAR_FRAGMENT,
  PLUGIN_BOARD_TITLE_BAR_FRAGMENT_ID,
} from './fragments.js';
export {
  BOARD_ALARM_LEVEL_COLORS,
  BOARD_BORDER_STYLE_LABELS,
  BOARD_BORDER_STYLES,
  BOARD_DEFAULT_SURFACE,
  BOARD_DEGRADED_COLOR,
  BOARD_SECONDARY_COLOR,
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  BOARD_STATUS_PRIORITY,
  BOARD_STATUS_TEXT_COLORS,
  BOARD_TITLE_DECOR_STYLE_LABELS,
  BOARD_TITLE_DECOR_STYLES,
  type BoardAlarmLevelKey,
  type BoardBorderStyle,
  type BoardStatusKey,
  type BoardTitleDecorStyle,
  isBoardAbnormalStatus,
  isBoardBorderStyle,
  isBoardStatusKey,
  isBoardTitleDecorStyle,
  normalizeBoardStatus,
  PLUGIN_BOARD_BORDER_BOX_TAG_NAME,
  PLUGIN_BOARD_BORDER_BOX_TYPE,
  PLUGIN_BOARD_BORDER_PICKER_ID,
  PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE,
  PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME,
  PLUGIN_BOARD_DIGITAL_FLOP_TYPE,
  PLUGIN_BOARD_MARQUEE_TAG_NAME,
  PLUGIN_BOARD_MARQUEE_TYPE,
  PLUGIN_BOARD_PIPELINE_TAG_NAME,
  PLUGIN_BOARD_PIPELINE_TYPE,
  PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  PLUGIN_BOARD_SCROLL_BOARD_TYPE,
  PLUGIN_BOARD_STATUS_GRID_TAG_NAME,
  PLUGIN_BOARD_STATUS_GRID_TYPE,
  PLUGIN_BOARD_STATUS_LEGEND_TAG_NAME,
  PLUGIN_BOARD_STATUS_LEGEND_TYPE,
  PLUGIN_BOARD_TABS_TAG_NAME,
  PLUGIN_BOARD_TABS_TYPE,
  PLUGIN_BOARD_TITLE_DECOR_PICKER_ID,
  PLUGIN_BOARD_TITLE_DECOR_PICKER_TAG_NAME,
  PLUGIN_BOARD_TITLE_DECOR_TAG_NAME,
  PLUGIN_BOARD_TITLE_DECOR_TYPE,
  PLUGIN_BOARD_WATER_LEVEL_TAG_NAME,
  PLUGIN_BOARD_WATER_LEVEL_TYPE,
  statusColorMap,
} from './identity.js';
export {
  definePluginBoardMarqueeMaterial,
  PLUGIN_BOARD_MARQUEE_MANIFEST,
  PluginBoardMarqueeElement,
} from './marquee.js';
export {
  definePluginBoardPipelineMaterial,
  layoutPipelineStages,
  PIPELINE_MIN_NODE_WIDTH,
  PIPELINE_NODE_GAP,
  PIPELINE_PADDING,
  PLUGIN_BOARD_PIPELINE_MANIFEST,
  PluginBoardPipelineElement,
} from './pipeline.js';
export {
  BOARD_SCALAR_VALUE_ADAPTER,
  BOARD_TEXT_VALUE_ADAPTER,
} from './scalar-adapter.js';
export {
  definePluginBoardScrollBoardMaterial,
  PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
  PLUGIN_BOARD_SCROLL_BOARD_TABULAR_DATA_ADAPTER,
  PluginBoardScrollBoardElement,
} from './scroll-board.js';
export {
  computeStatusGridLayout,
  computeStatusGridTileSize,
  definePluginBoardStatusGridMaterial,
  PLUGIN_BOARD_STATUS_GRID_MANIFEST,
  PluginBoardStatusGridElement,
  STATUS_GRID_MAX_COLUMNS,
  STATUS_GRID_MIN_TILE_SIZE,
  sortStatusGridItems,
  statusGridTileTextLines,
  summarizeStatusGridOverflow,
} from './status-grid.js';
export {
  buildStatusLegend,
  definePluginBoardStatusLegendMaterial,
  PLUGIN_BOARD_STATUS_LEGEND_MANIFEST,
  PluginBoardStatusLegendElement,
  readStatusLegendCounts,
  STATUS_LEGEND_ORDER,
  STATUS_LEGEND_TABULAR_DATA_ADAPTER,
  type StatusLegendCounts,
  statusLegendBarSegments,
} from './status-legend.js';
export {
  type BoardTabItem,
  definePluginBoardTabsMaterial,
  PLUGIN_BOARD_TABS_MANIFEST,
  PLUGIN_BOARD_TABS_TABULAR_DATA_ADAPTER,
  PluginBoardTabsElement,
  readBoardTabItems,
  TABS_MAX_ITEMS,
} from './tabs.js';
export {
  type BoardStateRow,
  createBoardColumnsAdapter,
  createBoardStateAdapter,
  readBoardStateRows,
} from './tabular-columns-adapter.js';
export {
  definePluginBoardTitleDecorMaterial,
  PLUGIN_BOARD_TITLE_DECOR_MANIFEST,
  PluginBoardTitleDecorElement,
} from './title-decor.js';
export { PluginBoardTitleDecorPickerElement } from './title-decor-picker.js';
export {
  clampPercent,
  definePluginBoardWaterLevelMaterial,
  formatWaterLevelLabel,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
  PluginBoardWaterLevelElement,
} from './water-level.js';
