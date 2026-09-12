import { PluginEchartsElement } from './element.js';
import {
  PLUGIN_ECHARTS_PANEL_TAG_NAME,
  PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
} from './manifest.js';
import { PluginEchartsPanelElement } from './panel-element.js';
import { PLUGIN_ECHARTS_TAG_NAME } from './plugin.js';
import { PluginEchartsSeriesPickerElement } from './series-picker.js';

/**
 * 浏览器环境调用：管理器 preflight 经宿主 registry 反查构造函数，
 * 因此自定义元素必须先注册。与清单声明分离，保证 runtime 本身无 DOM 依赖。
 * 覆盖物料的画布元素、面板贡献元素与检查器控件贡献元素。
 */
export function registerPluginEcharts(): void {
  if (customElements.get(PLUGIN_ECHARTS_TAG_NAME) === undefined) {
    customElements.define(PLUGIN_ECHARTS_TAG_NAME, PluginEchartsElement);
  }
  if (customElements.get(PLUGIN_ECHARTS_PANEL_TAG_NAME) === undefined) {
    customElements.define(PLUGIN_ECHARTS_PANEL_TAG_NAME, PluginEchartsPanelElement);
  }
  if (customElements.get(PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME) === undefined) {
    customElements.define(PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME, PluginEchartsSeriesPickerElement);
  }
}
