import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerContrastIssue } from '../../../common/validation/designer-guard.js';
import { designerIcon } from '../../dom/designer-icons.js';
import { adoptDesignerFormControls } from '../designer-form-controls-dom.js';
import { escapeHtml } from '../designer-html-escape.js';

export interface DesignerGuardView {
  readonly checked: number;
  readonly truncated: boolean;
  readonly issues: readonly DesignerContrastIssue[];
  /** 正在预览修复的组件；`null` = 没有预览态。 */
  readonly previewComponentId: string | null;
}

/** 底栏守卫条目：常驻显示，失败时带红色计数。 */
export function guardStripMarkup(view: DesignerGuardView): string {
  const failed = view.issues.length;
  const text = DESIGNER_UI_TEXT.guard;
  if (view.checked === 0) {
    return `<span class="status-guard-dot" data-state="idle" aria-hidden="true"></span><span class="status-guard-label">${text.label}</span><span class="status-guard-value">${text.unmeasured}</span>`;
  }
  const state = failed === 0 ? 'pass' : 'fail';
  const summary = failed === 0 ? text.summaryPass(view.checked) : text.summaryFail(failed);
  return `<span class="status-guard-dot" data-state="${state}" aria-hidden="true"></span><span class="status-guard-label">${text.label}</span><span class="status-guard-value">${summary}</span>`;
}

/** 写入守卫详情并就地增强其中的控件（设计系统要求动态控件渲染后必须 adopt）。 */
export function renderGuardPopover(popover: HTMLElement, view: DesignerGuardView): void {
  popover.innerHTML = guardPopoverMarkup(view);
  adoptDesignerFormControls(popover);
}

/** 守卫详情：每条违规给比值、色块、修复入口；预览与失败由同一状态派生。 */
export function guardPopoverMarkup(view: DesignerGuardView): string {
  const text = DESIGNER_UI_TEXT.guard;
  const previewing = view.previewComponentId !== null;
  const header = `<header class="guard-popover-heading">
      <strong>${text.dialogTitle}</strong>
      <span class="guard-popover-summary">${view.issues.length === 0 ? text.summaryClean(view.checked) : text.summaryIssue(view.checked, view.issues.length)}</span>
      <button type="button" class="designer-control designer-button designer-icon-button" data-guard-action="close" aria-label="${text.close}" data-tip="${text.close}">${designerIcon('close')}</button>
    </header>`;
  const notice = `<p class="guard-popover-notice" data-guard-notice="${previewing ? 'preview' : 'idle'}">${previewing ? text.previewNotice : text.deterministicNotice}</p>`;
  const body =
    view.issues.length === 0
      ? `<p class="guard-popover-empty">${text.empty}</p>`
      : `<ul class="guard-issue-list">${view.issues.map((issue) => guardIssueMarkup(issue, view.previewComponentId === issue.componentId)).join('')}</ul>`;
  const truncated = view.truncated
    ? `<p class="guard-popover-truncated">${text.truncated}</p>`
    : '';
  return `${header}${notice}${truncated}${body}`;
}

function guardIssueMarkup(issue: DesignerContrastIssue, previewing: boolean): string {
  const text = DESIGNER_UI_TEXT.guard;
  const suggested = issue.suggestedColor;
  const swatches = `<span class="guard-issue-swatches">
      <span class="guard-swatch" style="--guard-swatch: ${escapeHtml(issue.textColor)}" aria-hidden="true"></span>
      <span class="guard-issue-colors">${escapeHtml(issue.textColor)} → ${escapeHtml(issue.backgroundColor)}</span>
      ${suggested === null ? '' : `<span class="guard-swatch" style="--guard-swatch: ${escapeHtml(suggested)}" aria-hidden="true"></span><span class="guard-issue-suggested">${escapeHtml(suggested)}</span>`}
    </span>`;
  const actions =
    suggested === null
      ? `<span class="guard-issue-hint">${text.unrepairable}</span>`
      : previewing
        ? `<button type="button" class="designer-control designer-button" data-guard-action="cancel" data-guard-issue="${escapeHtml(issue.componentId)}">${text.cancelPreview}</button>
           <button type="button" class="designer-control designer-button" data-variant="primary" data-guard-action="apply" data-guard-issue="${escapeHtml(issue.componentId)}" data-guard-color="${escapeHtml(suggested)}">${text.applyFix}</button>`
        : `<button type="button" class="designer-control designer-button" data-guard-action="preview" data-guard-issue="${escapeHtml(issue.componentId)}">${text.previewFix}</button>`;
  const ratioText =
    previewing && issue.suggestedRatio !== null
      ? text.ratioTransition(issue.ratio, issue.suggestedRatio)
      : text.ratio(issue.ratio);
  return `<li class="guard-issue" data-guard-issue-item="${escapeHtml(issue.componentId)}" data-state="${previewing ? 'preview' : 'fail'}">
      <div class="guard-issue-head">
        <span class="guard-issue-name">${escapeHtml(issue.componentName)}</span>
        <span class="guard-issue-ratio">${ratioText} ${text.required(issue.requiredRatio)}</span>
      </div>
      ${swatches}
      <div class="guard-issue-actions">${actions}</div>
    </li>`;
}
