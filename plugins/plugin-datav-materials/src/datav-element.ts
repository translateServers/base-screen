import type {
  BaseScreenMaterialDataState,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialStateView } from '@base-screen/plugin-sdk';
import { DatavElementBase } from './element-base.js';

/** 渲染路径上的 model：守卫过后必然存在，用具名别名避免每处都写 NonNullable<...>。 */
export type DatavMaterialModel = BaseScreenMaterialModel;

/**
 * 本插件自己的物料基类。
 *
 * 插件不能依赖 `@base-screen/material`（官方物料实现不在外围插件的允许依赖里），
 * 因此这里按同一 ABI 自行实现最小骨架：宿主写 `model`，`connectedCallback` 时也要
 * 能安全渲染。它同时是一份证据——物料元素契约不依赖任何官方包就能被外部作者实现。
 *
 * **尺寸由渲染器拥有，物料不得改写。** Renderer 在 `applyMaterial` 里把
 * `component.size` 写成宿主元素的像素 `width`/`height`，然后才写 `model`。因此
 * `renderMaterial()` 里再写 `this.style.width/height` 会覆盖掉声明的尺寸——`100%`
 * 会把组件撑满容器。内部布局用子元素的 `width/height: 100%` 表达，宿主元素本身不要碰。
 */
export abstract class DatavMaterialElement extends DatavElementBase {
  #model: BaseScreenMaterialModel | undefined;

  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) {
      throw new Error('Datav material model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    this.#model = value;
    // 数据状态进 dataset：E2E 与样式钩子据此观察四态，不必依赖具体物料内部结构。
    this.dataset.baseScreenDataState = value.dataState.status;
    this.renderMaterial();
  }

  connectedCallback(): void {
    this.renderMaterial();
  }

  protected get materialModel(): BaseScreenMaterialModel | undefined {
    return this.#model;
  }

  /**
   * 非 ready 态统一交给 `@base-screen/plugin-sdk` 的状态视图：chrome 与兜底文案全仓只有一份，
   * `idle` 表示"还没发起请求"，因此占位但不给文案。视图自带内联样式，插件既不依赖宿主
   * CSS 载入顺序，也不污染宿主样式。
   */
  protected appendDataStatePlaceholder(state: BaseScreenMaterialDataState): void {
    const view = createBaseScreenMaterialStateView(this.ownerDocument, state);
    if (view !== undefined) this.replaceChildren(view);
  }

  protected abstract renderMaterial(): void;
}
