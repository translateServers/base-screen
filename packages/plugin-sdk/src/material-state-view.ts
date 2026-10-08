import type { ScreenMaterialErrorCode } from '@base-screen/contracts';
import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import { createMaterialLoadingView, resolveMaterialLoadingLabel } from './material-loading.js';

/** 状态视图的文案与外观选项；文案只在这里定义一份。 */
export interface BaseScreenMaterialStateViewOptions {
  /** loading 态的可访问文案，按文本渲染，绝不作为 HTML 解释。 */
  readonly label?: string;
  /** 空数据集态的文案。 */
  readonly emptyLabel?: string;
}

const DEFAULT_EMPTY_LABEL = '暂无数据';
const STATE_VIEW_ATTRIBUTE = 'data-base-screen-material-state';

/**
 * 物料非 ready 态的唯一呈现入口。
 *
 * 四个状态共用同一个满盒容器，切换时不改变几何（样式稳定性：不得抖动）。
 * `ready` 返回 `undefined`，由物料自己画内容；`idle` 表示"还没有发起请求"，
 * 因此占位但不给任何文案——把"还没查"说成"没数据"是错的。
 * 元素只在自己的子节点上写 `width/height:100%`：渲染器会把 canonical
 * `component.size` 写成宿主元素的像素宽高并强制宿主 `display`，物料不得覆写。
 */
export function createBaseScreenMaterialStateView(
  ownerDocument: Document,
  dataState: BaseScreenMaterialDataState,
  options: BaseScreenMaterialStateViewOptions = {},
): HTMLElement | undefined {
  switch (dataState.status) {
    case 'ready':
      return undefined;
    case 'loading': {
      const view = createMaterialLoadingView(ownerDocument, resolveMaterialLoadingLabel(options));
      view.element.setAttribute(STATE_VIEW_ATTRIBUTE, 'loading');
      return view.element;
    }
    case 'error':
      return createBaseScreenMaterialErrorView(ownerDocument, dataState.code, dataState.message);
    case 'idle':
      return createStateShell(ownerDocument, 'idle');
  }
}

/**
 * 错误 chrome。`message` 已由 contracts 侧脱敏并限长（`normalizeScreenMaterialError`），
 * 这里按文本渲染、不解释为 HTML；`code` 落到 data-* 属性供宿主埋点读取（用 setAttribute
 * 而不是 dataset：物料在无 DOM 环境下以最小元素桩渲染）。
 *
 * 物料在数据 ready 但形状不符合自己的契约时也可以直接调用它，给出领域专属文案。
 */
export function createBaseScreenMaterialErrorView(
  ownerDocument: Document,
  code: ScreenMaterialErrorCode,
  message: string,
): HTMLElement {
  const element = createStateShell(ownerDocument, 'error');
  element.setAttribute('role', 'alert');
  element.setAttribute('data-base-screen-material-error-code', code);
  element.textContent = message;
  return element;
}

/**
 * 空数据集态：数据已 ready 但没有任何行。与 `idle` 区分——这是"查过了，没有结果"。
 */
export function createBaseScreenMaterialEmptyView(
  ownerDocument: Document,
  options: BaseScreenMaterialStateViewOptions = {},
): HTMLElement {
  const element = createStateShell(ownerDocument, 'empty');
  element.textContent = options.emptyLabel ?? DEFAULT_EMPTY_LABEL;
  return element;
}

function createStateShell(ownerDocument: Document, status: string): HTMLElement {
  const element = ownerDocument.createElement('div');
  element.setAttribute(STATE_VIEW_ATTRIBUTE, status);
  element.style.cssText =
    'display: grid; place-items: center; box-sizing: border-box; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; opacity: .72; font: 13px/1.4 sans-serif;';
  return element;
}
