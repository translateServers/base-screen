import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export function datasetAction(
  ownerDocument: Document,
  action: string,
  label: string,
  variant?: string,
  disabled = false,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = action;
  if (variant !== undefined) button.dataset.variant = variant;
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

/** 底部操作条的输入：只描述"现在能不能应用"，不描述摆在哪。 */
export interface DataPanelActionView {
  /** `应用` / `已应用`：同一颗按钮，靠 dirty 换文案与档位。 */
  readonly label: string;
  readonly disabled: boolean;
  /** dirty 时左侧显示「● 未应用」，并让按钮处于强调实心档。 */
  readonly dirty: boolean;
}

/**
 * 面板唯一的主动作条（`applyCount === 1`）。
 *
 * 形态理由：`[data-variant="primary"]` 是**页面级** CTA（反色，`controls-actions.css`），
 * 落到 335px 侧栏里就是"整屏对比度最高的元素配一个可能没什么可应用的草稿"。所以这里：
 * - 右对齐、宽度 auto（约 64–72px），不 `flex: 1 1 auto`；
 * - dirty → accent 实心；clean → 幽灵档 + `disabled` + 文案「已应用」；
 * - 左侧只在 dirty 时给一处 11px 的「● 未应用」，脏标记贴着按钮而不是贴在面板顶上。
 *
 * 注意：**不要**改全局 `.designer-button[data-variant="primary"]`——那是页面级 CTA 的档位。
 */
export function renderDataPanelActions(
  ownerDocument: Document,
  view: DataPanelActionView,
): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-dataset-actions';
  actions.dataset.datasetApplyBar = 'true';
  fillDataPanelActions(ownerDocument, actions, view);
  return actions;
}

/**
 * 就地刷新操作条（脏标记 + 文案 + 禁用档）。
 *
 * 编辑固定值只改状态后**不整块重绘**（否则输入框节点、光标、IME 组合态全丢），
 * 所以「未应用 / 已应用」必须像段一样就地更新，而不是等下一次整块重渲染。
 */
export function syncDataPanelActions(root: ParentNode, view: DataPanelActionView): void {
  for (const bar of root.querySelectorAll<HTMLElement>('[data-dataset-apply-bar]')) {
    fillDataPanelActions(bar.ownerDocument, bar, view);
  }
}

function fillDataPanelActions(
  ownerDocument: Document,
  actions: HTMLElement,
  view: DataPanelActionView,
): void {
  actions.replaceChildren();
  if (view.dirty) {
    const marker = ownerDocument.createElement('span');
    marker.className = 'designer-dataset-apply-dirty';
    marker.dataset.datasetApplyDirty = 'true';
    marker.append(dirtyDot(ownerDocument), dirtyText(ownerDocument));
    actions.appendChild(marker);
  }
  actions.appendChild(applyButton(ownerDocument, view));
}

function dirtyDot(ownerDocument: Document): HTMLElement {
  const dot = ownerDocument.createElement('i');
  dot.className = 'designer-dataset-apply-dirty-dot';
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

function dirtyText(ownerDocument: Document): HTMLElement {
  const text = ownerDocument.createElement('span');
  text.textContent = DESIGNER_UI_TEXT.dataPanel.dirty;
  return text;
}

function applyButton(ownerDocument: Document, view: DataPanelActionView): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = 'apply';
  button.dataset.variant = 'apply';
  button.dataset.state = view.dirty ? 'dirty' : 'applied';
  button.textContent = view.label;
  button.disabled = view.disabled;
  return button;
}

/**
 * 三种取值方式共用一个"能不能应用"的判据。
 *
 * `blocked` 表达"有东西可应用但这次不能应用"（例如端口没接、绑定不完整）：
 * 这种情况下按钮仍写「应用」，只是禁用——文案不该因为禁用而变成「已应用」。
 */
export function dataPanelActionView(options: {
  readonly dirty: boolean;
  readonly blocked: boolean;
}): DataPanelActionView {
  const dirty = options.dirty;
  return {
    label: dirty ? DESIGNER_UI_TEXT.dataPanel.apply : DESIGNER_UI_TEXT.dataPanel.applied,
    disabled: !dirty || options.blocked,
    dirty,
  };
}
