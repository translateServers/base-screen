import {
  BASE_SCREEN_MATERIAL_EVENT,
  type BaseScreenMaterialModel,
  parseBaseScreenChartData,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialStateView } from '@base-screen/plugin-sdk';
import {
  type EchartsChartAdapter,
  type EchartsChartHandle,
  type EchartsSeriesClickPayload,
  loadEchartsChartAdapter,
} from './chart-adapter.js';
import { PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER } from './chart-data-adapter.js';
import {
  buildChartFamilyOption,
  buildPluginEchartsOption,
  type ChartFamilyKind,
} from './chart-option.js';
import { cancelChartRender, scheduleChartRender } from './chart-render-scheduler.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from './manifest.js';

export class PluginEchartsElement extends HTMLElement {
  static readonly manifest = PLUGIN_ECHARTS_MATERIAL_MANIFEST;

  protected chartFamily: ChartFamilyKind | undefined;
  #model: BaseScreenMaterialModel | undefined;
  #handle: EchartsChartHandle | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #renderQueued = false;
  /** ECharts 运行期正在动态加载：避免同一元素重复发起加载。 */
  #loading = false;
  /** 加载失败终态：按物料降级路径呈现，不做隐式重试。 */
  #loadFailed = false;
  readonly #deferredRender = (): void => {
    this.#renderQueued = false;
    if (this.isConnected) {
      this.#paint();
    }
  };

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
    cancelChartRender(this.#deferredRender);
    this.#renderQueued = false;
    // 运行期加载仍在进行时不取消 Promise：回调会检查连通性，重新挂载时复用已缓存模块。
    this.#releaseHandle();
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
    // 实例化（echarts 按需加载 + init + 首次 setOption）按帧预算排队：多图表同屏时
    // 首帧只出轻量内容，图表随后逐帧补齐；已实例化的图表仍走同步更新。
    if (this.#handle === undefined) {
      if (this.#loadFailed) {
        this.#renderLoadFailure();
        return;
      }
      if (this.#renderQueued || this.#loading) {
        return;
      }
      this.#renderQueued = true;
      scheduleChartRender(this.#deferredRender);
      return;
    }
    this.#paint();
  }

  #paint(): void {
    const model = this.#model;
    if (model === undefined || !this.isConnected) {
      return;
    }
    const handle = this.#ensureHandle();
    if (handle === undefined) {
      // ECharts 运行期仍在加载：本帧不出图表，加载完成后自动补画。
      return;
    }
    if (model.dataState.status !== 'ready') {
      handle.render({});
      return;
    }
    const parsed = parseBaseScreenChartData(model.dataState.value);
    if (!parsed.ok) {
      handle.render({});
      return;
    }
    const input = {
      data: parsed.value,
      titleText: readString(model.props.titleText),
      showTooltip: model.props.showTooltip !== false,
      seriesType: readString(model.props.seriesType, 'line'),
      textColor: readString(model.style.color, '#f9fafb'),
      gridColor: readString(model.style.gridColor, '#374151'),
      seriesColor: readString(model.style.seriesColor, '#38bdf8'),
      props: model.props,
    };
    handle.render(
      this.chartFamily === undefined
        ? buildPluginEchartsOption(input)
        : buildChartFamilyOption(this.chartFamily, input),
    );
  }

  /**
   * 私有 adapter 的持有者：外部拿不到图表实例，也拿不到第三方类型。
   *
   * ECharts 运行期在首个图表出现时才动态加载：加载期间返回 undefined（本帧不出图表，
   * 首屏只出轻量内容），加载完成后自动补画。加载失败不抛到渲染循环外，而是按物料既有
   * 降级路径换成状态视图。
   */
  #ensureHandle(): EchartsChartHandle | undefined {
    if (this.#handle !== undefined) {
      return this.#handle;
    }
    if (this.#loadFailed) {
      this.#renderLoadFailure();
      return undefined;
    }
    if (!this.#loading) {
      this.#loading = true;
      void loadEchartsChartAdapter().then(
        (adapter) => {
          this.#loading = false;
          // 加载期间元素可能已被卸载：此时不创建任何实例，重新挂载会复用已缓存的模块。
          if (!this.isConnected) return;
          try {
            this.#createHandle(adapter);
            this.#paint();
          } catch {
            // 首帧实例化失败同样走降级路径，不能变成未处理的 Promise 拒绝。
            this.#releaseHandle();
            this.#loadFailed = true;
            this.#renderLoadFailure();
          }
        },
        () => {
          this.#loading = false;
          this.#loadFailed = true;
          if (this.isConnected) this.#renderLoadFailure();
        },
      );
    }
    return undefined;
  }

  #createHandle(adapter: EchartsChartAdapter): void {
    const host = this.ownerDocument.createElement('div');
    host.style.cssText = 'width:100%;height:100%';
    this.replaceChildren(host);
    const handle = adapter.createChartHandle(host);
    handle.onSeriesClick((payload) => this.#emitSeriesClick(payload));
    this.#handle = handle;
    // 设计器里改尺寸只改宿主盒，canvas 不会自己跟着变；观察自身尺寸后显式 resize。
    const ResizeObserverCtor = this.ownerDocument.defaultView?.ResizeObserver;
    if (ResizeObserverCtor !== undefined) {
      this.#resizeObserver = new ResizeObserverCtor(() => this.#handle?.resize());
      this.#resizeObserver.observe(this);
    }
  }

  #releaseHandle(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#handle?.dispose();
    this.#handle = undefined;
  }

  /** 加载失败终态：复用插件自己的状态视图，不把异常抛到渲染循环外。 */
  #renderLoadFailure(): void {
    const view = createBaseScreenMaterialStateView(this.ownerDocument, {
      status: 'error',
      code: 'HOST_RESOURCE_FAILED',
      message: '图表引擎加载失败。',
    });
    if (view !== undefined) this.replaceChildren(view);
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
