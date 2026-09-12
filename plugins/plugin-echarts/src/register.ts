import { PluginEchartsElement } from './element.js';
import { PLUGIN_ECHARTS_TAG_NAME } from './plugin.js';

/**
 * 浏览器环境调用：管理器 preflight 经宿主 registry 反查构造函数，
 * 因此自定义元素必须先注册。与清单声明分离，保证 runtime 本身无 DOM 依赖。
 */
export function registerPluginEcharts(): void {
  if (customElements.get(PLUGIN_ECHARTS_TAG_NAME) === undefined) {
    customElements.define(PLUGIN_ECHARTS_TAG_NAME, PluginEchartsElement);
  }
}
