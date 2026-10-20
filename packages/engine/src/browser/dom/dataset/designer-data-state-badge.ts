import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDataState, DesignerDataStateView } from './designer-data-state.js';

/**
 * 七态徽标的视觉面（架构 §5.3）。
 *
 * 状态判定唯一入口是 `deriveDesignerDataState`；这里只做两件事：
 * 1. 把 `state` 映射到**四档色调**（成功 / 警告 / 危险 / 中性），颜色全部走令牌；
 * 2. 把七态文案取到 DOM 上：`data-state` 与面板根节点同值，便于样式与断言共用一处真值。
 */
export type DesignerDataStateTone = 'neutral' | 'success' | 'warning' | 'danger';

const STATE_TONES: Readonly<Record<DesignerDataState, DesignerDataStateTone>> = {
  unconfigured: 'neutral',
  unavailable: 'warning',
  readonly: 'neutral',
  loading: 'neutral',
  failed: 'danger',
  empty: 'warning',
  ready: 'success',
};

/** 徽标文案：七态各一键，缺键即编译期报错（而不是运行时画出空徽标）。 */
export function designerDataStateLabel(state: DesignerDataState): string {
  return DESIGNER_UI_TEXT.dataState[state];
}

/** 徽标色调：只允许四档，新增状态必须显式选择色调。 */
export function designerDataStateTone(state: DesignerDataState): DesignerDataStateTone {
  return STATE_TONES[state];
}

/**
 * 构建状态徽标。
 *
 * `data-state` 与面板根节点写同一个值：样式按 `data-state` 上色，断言按 `data-state` 定位，
 * 不需要在“读根节点”和“读徽标”之间做映射。
 */
export function renderDataStateBadge(
  ownerDocument: Document,
  view: DesignerDataStateView,
): HTMLElement {
  const badge = ownerDocument.createElement('span');
  badge.className = 'designer-data-state-badge';
  badge.dataset.dataStateBadge = 'true';
  writeDataStateBadge(badge, view);
  return badge;
}

/**
 * 就地刷新已存在的徽标。
 *
 * 段级 diff 只重画变化的段，徽标不属于任何段，因此不重建也不影响输入框节点身份：
 * 直接改属性与文本即可（见 `syncDatasetSurface`）。
 */
export function syncDataStateBadge(root: ParentNode, view: DesignerDataStateView): void {
  for (const badge of root.querySelectorAll<HTMLElement>('[data-data-state-badge]')) {
    writeDataStateBadge(badge, view);
  }
}

function writeDataStateBadge(badge: HTMLElement, view: DesignerDataStateView): void {
  const label = designerDataStateLabel(view.state);
  badge.dataset.state = view.state;
  badge.dataset.dataStateTone = designerDataStateTone(view.state);
  badge.setAttribute('aria-label', DESIGNER_UI_TEXT.dataState.aria(label));
  badge.textContent = label;
  // 成因只跟着根节点（`data-state-reason`）走：徽标本身只表达七态之一，
  // 具体原因由面板内的禁用说明与宿主连接段承担，不在徽标上堆诊断码。
}
