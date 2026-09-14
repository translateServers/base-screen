import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';
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

  /** 只读的"数据不可用"提示；loading/error/idle 三态共用，避免各物料各写一份。 */
  protected appendDataStatePlaceholder(
    status: BaseScreenMaterialModel['dataState']['status'],
  ): void {
    const element = this.ownerDocument.createElement('div');
    element.className = 'datav-state-placeholder';
    element.dataset.datavStatePlaceholder = status;
    element.textContent =
      status === 'loading' ? '加载中' : status === 'error' ? '数据不可用' : '暂无数据';
    // 内联样式而非全局样式表：插件不得依赖宿主的 CSS 载入顺序，也不该污染宿主样式。
    element.style.cssText =
      'display:grid;place-items:center;width:100%;height:100%;font:13px/1.4 sans-serif;opacity:.72;';
    this.replaceChildren(element);
  }

  protected abstract renderMaterial(): void;
}
