import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';
import type { DesignerDataStateView } from './designer-data-state.js';

/**
 * 数据面板顶部的行内提示区（架构 §5.3 的七态落地方式之一）。
 *
 * 七态**不再**压成一个常驻徽标（"已就绪"配着未应用草稿是必然的谎）；
 * 面板级提示条只承担三件事：只读、失败、不可用。就绪 / 加载中 / 无数据
 * 一律不显示常驻元素——它们要么由组头与触发按钮表达，要么根本不该占位。
 */
export type DataPanelNoticeTone = 'warning' | 'danger' | 'neutral';

export interface DataPanelNoticeView {
  readonly tone: DataPanelNoticeTone;
  readonly text: string;
  readonly icon?: DesignerIconName;
  /** 失败态带「重试」：复用既有 `retry-link` 动作，不新增处理分支。 */
  readonly retry: boolean;
}

/** 七态 → 提示条内容；返回 undefined 表示这一态**不占位**。 */
export function dataPanelNotice(view: DesignerDataStateView): DataPanelNoticeView | undefined {
  if (view.state === 'failed') {
    return {
      tone: 'danger',
      text: DESIGNER_UI_TEXT.dataPanel.notice.failed,
      icon: 'x-circle',
      retry: true,
    };
  }
  if (view.state === 'readonly') {
    return {
      tone: 'neutral',
      text: DESIGNER_UI_TEXT.dataPanel.notice.readonly,
      icon: 'lock-open',
      retry: false,
    };
  }
  if (view.state === 'unavailable') {
    const reasons = DESIGNER_UI_TEXT.dataPanel.notice.unavailable;
    const text =
      view.reason === 'port-missing'
        ? reasons.portMissing
        : view.reason === 'instance-missing'
          ? reasons.instanceMissing
          : reasons.denied;
    return { tone: 'warning', text, retry: false };
  }
  return undefined;
}

/**
 * 提示条挂载位：**始终**存在，空态时没有任何子节点（CSS `:empty` 收起）。
 *
 * 固定挂载位而不是"有就插、没有就删"：段级 diff 只认 `[data-ds-section]`，
 * 这一块在段之外，就地换内容既不会打乱段序，也不会让面板高度在两次渲染之间跳动。
 */
export function renderDataPanelNoticeSlot(
  ownerDocument: Document,
  view: DesignerDataStateView,
): HTMLElement {
  const slot = ownerDocument.createElement('div');
  slot.className = 'designer-data-panel-notice';
  slot.dataset.dataPanelNotice = 'true';
  writeNotice(ownerDocument, slot, view);
  return slot;
}

/** 部分同步（目录回包 / 链接状态）不会整块重渲染：提示条随模型就地刷新。 */
export function syncDataPanelNotice(root: ParentNode, view: DesignerDataStateView): void {
  for (const slot of root.querySelectorAll<HTMLElement>('[data-data-panel-notice]')) {
    writeNotice(slot.ownerDocument, slot, view);
  }
}

function writeNotice(
  ownerDocument: Document,
  slot: HTMLElement,
  view: DesignerDataStateView,
): void {
  slot.replaceChildren();
  const notice = dataPanelNotice(view);
  if (notice === undefined) {
    delete slot.dataset.state;
    return;
  }
  slot.dataset.state = view.state;
  const bar = ownerDocument.createElement('div');
  bar.className = 'designer-data-notice';
  bar.dataset.dataNoticeTone = notice.tone;
  bar.setAttribute('role', 'status');
  if (notice.icon !== undefined) {
    const icon = ownerDocument.createElement('span');
    icon.className = 'designer-data-notice-icon';
    icon.innerHTML = designerIcon(notice.icon);
    bar.appendChild(icon);
  }
  const text = ownerDocument.createElement('span');
  text.className = 'designer-data-notice-text';
  text.textContent = notice.text;
  bar.appendChild(text);
  if (notice.retry) {
    const retry = ownerDocument.createElement('button');
    retry.type = 'button';
    retry.className = 'designer-control designer-button designer-data-notice-retry';
    retry.dataset.datasetAction = 'retry-link';
    retry.textContent = DESIGNER_UI_TEXT.dataPanel.notice.retry;
    bar.appendChild(retry);
  }
  slot.appendChild(bar);
}
