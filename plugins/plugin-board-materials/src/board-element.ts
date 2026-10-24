import type {
  BaseScreenMaterialDataState,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialStateView } from '@base-screen/plugin-sdk';
import {
  appendDegradedBadge,
  clearDegradedBadge,
  degradationText,
  shouldKeepFrame,
} from './board-degradation.js';
import { BoardElementBase } from './element-base.js';

/** 渲染路径上的 model：守卫过后必然存在，用具名别名避免每处都写 NonNullable<...>。 */
export type BoardMaterialModel = BaseScreenMaterialModel;

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
export abstract class BoardMaterialElement extends BoardElementBase {
  #model: BaseScreenMaterialModel | undefined;

  /** 是否已成功渲染过一帧：决定失败时「保留上次画面」还是「显示 SDK 占位」。 */
  #hasFrame = false;

  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) {
      throw new Error('Board material model has not been set.');
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

  /** 上一帧是否存在（子类如需区分「首屏」与「降级保留」可直接读它）。 */
  protected get hasFrame(): boolean {
    return this.#hasFrame;
  }

  /**
   * 就位一帧画面的**唯一入口**：成功渲染的收尾一律走它，不要直接 `replaceChildren`。
   *
   * 它同时承担「恢复」语义：清掉降级角标与宿主属性。因此物料不需要自己维护
   * 「上次成功的快照」——元素的子节点本来就是上次成功的画面，只要非 ready 态不清屏即可。
   * 这也比 `cloneNode` 缓存安全：不会丢事件监听（降级态下表格行点击仍然可用）。
   */
  protected commit(frame: Node): void {
    this.#hasFrame = true;
    this.replaceChildren(frame);
    clearDegradedBadge(this);
  }

  /**
   * 非 ready 态的统一处理（PRD §7.3 / §8.6）：
   *
   * ① 从未成功过 → 交给 `@base-screen/plugin-sdk` 的状态视图（chrome 与兜底文案全仓一份）；
   * ② 已经画过画面 → **永不清屏**：`loading`/`idle` 保持原样（避免 3–5 秒轮询的闪烁），
   *    `error` 只在右上角加/更新一个 12 px 角标。恢复由下一次 `commit()` 完成。
   */
  protected appendDataStatePlaceholder(state: BaseScreenMaterialDataState): void {
    if (!shouldKeepFrame(state, this.#hasFrame)) {
      const view = createBaseScreenMaterialStateView(this.ownerDocument, state);
      if (view !== undefined) this.replaceChildren(view);
      return;
    }
    // 已画过画面：只有 error 需要留下痕迹，其余状态保持静默。
    if (state.status !== 'error') return;
    appendDegradedBadge(this.ownerDocument, this, degradationText(state.code));
  }

  protected abstract renderMaterial(): void;
}
