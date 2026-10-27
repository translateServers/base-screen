import type { ScreenValueRef } from '@base-screen/contracts';
import { createDesignerBadge } from '../panel/designer-chrome-primitives.js';
import {
  type DesignerValueRefPickerInput,
  type DesignerValueRefText,
  summarizeValueRef,
} from './designer-value-ref-types.js';

/**
 * 取值引用的摘要行：`类型徽标 + 名称`。
 *
 * 触发器与 T03b 的取值段共用这一个渲染器，保证「同一个引用在哪里看起来都一样」。
 */
export function renderValueRefSummary(
  ownerDocument: Document,
  ref: ScreenValueRef | null,
  input: DesignerValueRefPickerInput,
  text: DesignerValueRefText,
): HTMLElement {
  const summary = summarizeValueRef(ref, input, text);
  const row = ownerDocument.createElement('span');
  row.className = 'designer-value-ref-summary';
  if (summary.badge.length > 0) {
    createDesignerBadge(row, {
      text: summary.badge,
      tone: 'neutral',
      className: 'designer-value-ref-badge',
      dataset: { valueRefBadge: ref?.kind ?? 'none' },
    });
  }
  const label = ownerDocument.createElement('span');
  label.className = 'designer-value-ref-label';
  label.textContent = summary.label;
  row.appendChild(label);
  return row;
}

/** 只有摘要文本（供 aria-label 拼接，避免把徽标读成两个词）。 */
export function valueRefSummaryText(
  ref: ScreenValueRef | null,
  input: DesignerValueRefPickerInput,
  text: DesignerValueRefText,
): string {
  const summary = summarizeValueRef(ref, input, text);
  return summary.badge.length === 0 ? summary.label : `${summary.badge} ${summary.label}`;
}
