import { PluginDatavBorderBoxElement } from './border-box.js';
import { PluginDatavBorderPickerElement } from './border-picker.js';
import { PluginDatavCapsuleProgressElement } from './capsule-progress.js';
import { PluginDatavDigitalFlopElement } from './digital-flop.js';
import {
  PLUGIN_DATAV_BORDER_BOX_TAG_NAME,
  PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
  PLUGIN_DATAV_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME,
  PLUGIN_DATAV_MARQUEE_TAG_NAME,
  PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME,
  PLUGIN_DATAV_WATER_LEVEL_TAG_NAME,
} from './identity.js';
import { PluginDatavMarqueeElement } from './marquee.js';
import { PluginDatavScrollBoardElement } from './scroll-board.js';
import { PluginDatavWaterLevelElement } from './water-level.js';

/**
 * 浏览器环境调用：管理器 preflight 经宿主 registry 反查构造函数，因此自定义元素
 * 必须先注册。与清单声明分离，保证 runtime 本身无 DOM 依赖。
 *
 * 七个标签一次注册：六个物料 + 一个检查器控件。检查器控件同样要注册，但它是否被
 * 实例化由 plugin-manager 的授权目录决定——注册不等于授权。
 */
export function registerPluginDatavMaterials(): void {
  define(PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME, PluginDatavDigitalFlopElement);
  define(PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME, PluginDatavScrollBoardElement);
  define(PLUGIN_DATAV_WATER_LEVEL_TAG_NAME, PluginDatavWaterLevelElement);
  define(PLUGIN_DATAV_BORDER_BOX_TAG_NAME, PluginDatavBorderBoxElement);
  define(PLUGIN_DATAV_CAPSULE_PROGRESS_TAG_NAME, PluginDatavCapsuleProgressElement);
  define(PLUGIN_DATAV_MARQUEE_TAG_NAME, PluginDatavMarqueeElement);
  define(PLUGIN_DATAV_BORDER_PICKER_TAG_NAME, PluginDatavBorderPickerElement);
}

function define(tagName: string, constructor: CustomElementConstructor): void {
  if (customElements.get(tagName) === undefined) customElements.define(tagName, constructor);
}
