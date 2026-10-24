import { PluginBoardBorderBoxElement } from './border-box.js';
import { PluginBoardBorderPickerElement } from './border-picker.js';
import { PluginBoardCapsuleProgressElement } from './capsule-progress.js';
import { PluginBoardDigitalFlopElement } from './digital-flop.js';
import {
  PLUGIN_BOARD_BORDER_BOX_TAG_NAME,
  PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME,
  PLUGIN_BOARD_MARQUEE_TAG_NAME,
  PLUGIN_BOARD_PIPELINE_TAG_NAME,
  PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  PLUGIN_BOARD_STATUS_GRID_TAG_NAME,
  PLUGIN_BOARD_WATER_LEVEL_TAG_NAME,
} from './identity.js';
import { PluginBoardMarqueeElement } from './marquee.js';
import { PluginBoardPipelineElement } from './pipeline.js';
import { PluginBoardScrollBoardElement } from './scroll-board.js';
import { PluginBoardStatusGridElement } from './status-grid.js';
import { PluginBoardWaterLevelElement } from './water-level.js';

/**
 * 浏览器环境调用：管理器 preflight 经宿主 registry 反查构造函数，因此自定义元素
 * 必须先注册。与清单声明分离，保证 runtime 本身无 DOM 依赖。
 *
 * 九个标签一次注册：八个物料 + 一个检查器控件。检查器控件同样要注册，但它是否被
 * 实例化由 plugin-manager 的授权目录决定——注册不等于授权。
 */
export function registerPluginBoardMaterials(): void {
  define(PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME, PluginBoardDigitalFlopElement);
  define(PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME, PluginBoardScrollBoardElement);
  define(PLUGIN_BOARD_WATER_LEVEL_TAG_NAME, PluginBoardWaterLevelElement);
  define(PLUGIN_BOARD_BORDER_BOX_TAG_NAME, PluginBoardBorderBoxElement);
  define(PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME, PluginBoardCapsuleProgressElement);
  define(PLUGIN_BOARD_MARQUEE_TAG_NAME, PluginBoardMarqueeElement);
  define(PLUGIN_BOARD_STATUS_GRID_TAG_NAME, PluginBoardStatusGridElement);
  define(PLUGIN_BOARD_PIPELINE_TAG_NAME, PluginBoardPipelineElement);
  define(PLUGIN_BOARD_BORDER_PICKER_TAG_NAME, PluginBoardBorderPickerElement);
}

function define(tagName: string, constructor: CustomElementConstructor): void {
  if (customElements.get(tagName) === undefined) customElements.define(tagName, constructor);
}
