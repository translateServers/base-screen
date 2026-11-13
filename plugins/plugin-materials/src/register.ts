import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { PluginBoardBorderBoxElement } from './board/border-box.js';
import { PluginBoardBorderPickerElement } from './board/border-picker.js';
import { PluginBoardCapsuleProgressElement } from './board/capsule-progress.js';
import { PluginBoardDigitalFlopElement } from './board/digital-flop.js';
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
} from './board/identity.js';
import { PluginBoardMarqueeElement } from './board/marquee.js';
import { PluginBoardPipelineElement } from './board/pipeline.js';
import { PluginBoardScrollBoardElement } from './board/scroll-board.js';
import { PluginBoardStatusGridElement } from './board/status-grid.js';
import { PluginBoardWaterLevelElement } from './board/water-level.js';
import { PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER } from './echarts/chart-data-adapter.js';
import type { ChartFamilyKind } from './echarts/chart-option.js';
import { PluginEchartsElement } from './echarts/element.js';
import {
  PLUGIN_ECHARTS_MATERIAL_MANIFESTS,
  PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
} from './echarts/manifest.js';
import { PluginEchartsSeriesPickerElement } from './echarts/series-picker.js';
import { PLUGIN_ECHARTS_TAG_NAME } from './plugin.js';

const familyConstructors = new Map<string, CustomElementConstructor>();

function familyConstructor(manifest: BaseScreenMaterialManifest): CustomElementConstructor {
  const existing = familyConstructors.get(manifest.type);
  if (existing !== undefined) return existing;
  const kind = manifest.type.slice('plugin.chart.'.length) as ChartFamilyKind;
  class ChartElement extends PluginEchartsElement {
    static override readonly manifest = manifest;
    static readonly tabularDataAdapter = PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER;
    constructor() {
      super();
      this.chartFamily = kind;
    }
  }
  familyConstructors.set(manifest.type, ChartElement);
  return ChartElement;
}

/**
 * 浏览器环境调用：管理器 preflight 经宿主 registry 反查构造函数，因此自定义元素
 * 必须先注册。与清单声明分离，保证 runtime 本身无 DOM 依赖。
 *
 * 注册 19 个物料标签与 2 个检查器控件标签。检查器控件同样要注册，但它是否被
 * 实例化由 plugin-manager 的授权目录决定——注册不等于授权。本插件没有面板贡献，
 * 因此不再注册任何左栏面板元素。
 */
export function registerPluginMaterials(): void {
  define(PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME, PluginBoardDigitalFlopElement);
  define(PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME, PluginBoardScrollBoardElement);
  define(PLUGIN_BOARD_WATER_LEVEL_TAG_NAME, PluginBoardWaterLevelElement);
  define(PLUGIN_BOARD_BORDER_BOX_TAG_NAME, PluginBoardBorderBoxElement);
  define(PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME, PluginBoardCapsuleProgressElement);
  define(PLUGIN_BOARD_MARQUEE_TAG_NAME, PluginBoardMarqueeElement);
  define(PLUGIN_BOARD_STATUS_GRID_TAG_NAME, PluginBoardStatusGridElement);
  define(PLUGIN_BOARD_PIPELINE_TAG_NAME, PluginBoardPipelineElement);
  define(PLUGIN_BOARD_BORDER_PICKER_TAG_NAME, PluginBoardBorderPickerElement);
  define(PLUGIN_ECHARTS_TAG_NAME, PluginEchartsElement);
  for (const manifest of PLUGIN_ECHARTS_MATERIAL_MANIFESTS.slice(1)) {
    define(manifest.tagName, familyConstructor(manifest));
  }
  define(PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME, PluginEchartsSeriesPickerElement);
}

function define(tagName: string, constructor: CustomElementConstructor): void {
  if (customElements.get(tagName) === undefined) customElements.define(tagName, constructor);
}
