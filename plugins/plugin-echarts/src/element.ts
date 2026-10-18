import {
  BASE_SCREEN_MATERIAL_EVENT,
  type BaseScreenMaterialModel,
  parseBaseScreenChartData,
} from '@base-screen/plugin-core';
import {
  createEchartsChartHandle,
  type EchartsChartHandle,
  type EchartsSeriesClickPayload,
} from './chart-adapter.js';
import { PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER } from './chart-data-adapter.js';
import { buildPluginEchartsOption } from './chart-option.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from './manifest.js';

export class PluginEchartsElement extends HTMLElement {
  static readonly manifest = PLUGIN_ECHARTS_MATERIAL_MANIFEST;

  #model: BaseScreenMaterialModel | undefined;
  #handle: EchartsChartHandle | undefined;
  #resizeObserver: ResizeObserver | undefined;

  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) {
      throw new Error('Plugin echarts model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    this.#model = value;
    this.renderMaterial();
  }

  connectedCallback(): void {
    this.renderMaterial();
  }

  disconnectedCallback(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#handle?.dispose();
    this.#handle = undefined;
  }

  renderMaterial(): void {
    const model = this.#model;
    if (model === undefined || !this.isConnected) {
      return;
    }
    // 只设 display：宿主元素的宽高由渲染器按 canonical `component.size` 写死，
    // 这里再写 `100%` 会把组件撑满画布（曾被 E2E 的几何门禁捕获）。
    this.style.display = 'block';
    this.style.backgroundColor = readString(model.style.backgroundColor, 'transparent');
    const handle = this.#ensureHandle();
    if (model.dataState.status !== 'ready') {
      handle.render({});
      return;
    }
    const parsed = parseBaseScreenChartData(model.dataState.value);
    if (!parsed.ok) {
      handle.render({});
      return;
    }
    handle.render(
      buildPluginEchartsOption({
        data: parsed.value,
        titleText: readString(model.props.titleText),
        showTooltip: model.props.showTooltip !== false,
        seriesType: readString(model.props.seriesType, 'line'),
        textColor: readString(model.style.color, '#f9fafb'),
        gridColor: readString(model.style.gridColor, '#374151'),
        seriesColor: readString(model.style.seriesColor, '#38bdf8'),
      }),
    );
  }

  /** 私有 adapter 的持有者：外部拿不到图表实例，也拿不到第三方类型。 */
  #ensureHandle(): EchartsChartHandle {
    if (this.#handle !== undefined) {
      return this.#handle;
    }
    const host = this.ownerDocument.createElement('div');
    host.style.cssText = 'width:100%;height:100%';
    this.replaceChildren(host);
    const handle = createEchartsChartHandle(host);
    handle.onSeriesClick((payload) => this.#emitSeriesClick(payload));
    this.#handle = handle;
    // 设计器里改尺寸只改宿主盒，canvas 不会自己跟着变；观察自身尺寸后显式 resize。
    const ResizeObserverCtor = this.ownerDocument.defaultView?.ResizeObserver;
    if (ResizeObserverCtor !== undefined) {
      this.#resizeObserver = new ResizeObserverCtor(() => this.#handle?.resize());
      this.#resizeObserver.observe(this);
    }
    return handle;
  }

  #emitSeriesClick(payload: EchartsSeriesClickPayload): void {
    if (this.#model?.interactive !== true) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          name: 'seriesClick',
          payload: {
            seriesIndex: payload.seriesIndex,
            seriesName: payload.seriesName,
            pointIndex: payload.pointIndex,
            x: payload.x,
            y: payload.y,
          },
        },
      }),
    );
  }
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

// 管理器按 tagName 反查构造函数时会读取这个静态属性；没有它，图表物料在
// host-resource / dataset 绑定下会在候选阶段被拒（adapter 根本轮不到执行）。
Object.defineProperty(PluginEchartsElement, 'tabularDataAdapter', {
  value: PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER,
});
