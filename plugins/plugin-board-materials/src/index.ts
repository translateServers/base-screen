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
export {
  definePluginBoardDigitalFlopMaterial,
  formatNumericText,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PluginBoardDigitalFlopElement,
} from './digital-flop.js';
export {
  BOARD_ALARM_LEVEL_COLORS,
  BOARD_BORDER_STYLE_LABELS,
  BOARD_BORDER_STYLES,
  BOARD_DEFAULT_SURFACE,
  BOARD_DEGRADED_COLOR,
  BOARD_SECONDARY_COLOR,
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  type BoardAlarmLevelKey,
  type BoardBorderStyle,
  type BoardStatusKey,
  isBoardBorderStyle,
  isBoardStatusKey,
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
  PLUGIN_BOARD_ID,
  PLUGIN_BOARD_MARQUEE_TAG_NAME,
  PLUGIN_BOARD_MARQUEE_TYPE,
  PLUGIN_BOARD_PIPELINE_TAG_NAME,
  PLUGIN_BOARD_PIPELINE_TYPE,
  PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  PLUGIN_BOARD_SCROLL_BOARD_TYPE,
  PLUGIN_BOARD_STATUS_GRID_TAG_NAME,
  PLUGIN_BOARD_STATUS_GRID_TYPE,
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
export { createPluginBoardRuntime } from './plugin.js';
export { registerPluginBoardMaterials } from './register.js';
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
  buildStatusLegend,
  computeStatusGridLayout,
  definePluginBoardStatusGridMaterial,
  PLUGIN_BOARD_STATUS_GRID_MANIFEST,
  PluginBoardStatusGridElement,
  STATUS_GRID_LEGEND_ORDER,
  STATUS_GRID_MAX_COLUMNS,
  STATUS_GRID_MIN_TILE_SIZE,
} from './status-grid.js';
export {
  type BoardStateRow,
  createBoardColumnsAdapter,
  createBoardStateAdapter,
  readBoardStateRows,
} from './tabular-columns-adapter.js';
export {
  clampPercent,
  definePluginBoardWaterLevelMaterial,
  formatWaterLevelLabel,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
  PluginBoardWaterLevelElement,
} from './water-level.js';
