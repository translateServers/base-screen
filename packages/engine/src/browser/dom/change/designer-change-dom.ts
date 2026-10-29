import type {
  DesignerChangeProposal,
  DesignerChangeProposalOrigin,
  DesignerChangeUnit,
} from '../../../common/operations/change/designer-change-proposal.js';
import type { ScreenHistoryNode } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { adoptDesignerFormControls } from '../designer-form-controls-dom.js';
import { escapeHtml } from '../designer-html-escape.js';

/** 草案条：常驻画布顶部，声明「未写入」，并给出采纳/放弃入口。 */
export function draftBarMarkup(
  proposal: DesignerChangeProposal,
  comparing: boolean,
  paneOpen = false,
): string {
  const text = DESIGNER_UI_TEXT.change;
  return `<span class="draft-dot" aria-hidden="true"></span>
    <span class="draft-label">${text.draftLabel}</span>
    <span class="draft-title">${escapeHtml(proposal.title)}</span>
    <span class="draft-meta">${text.affected(proposal.affectedComponentIds.length)}</span>
    <span class="draft-actions">
      <button type="button" class="designer-control designer-button" data-variant="ghost" data-change-action="toggle-panel" aria-expanded="${String(paneOpen)}">${text.viewChanges}</button>
      <button type="button" class="designer-control designer-button" data-variant="ghost" data-change-action="toggle-compare" aria-pressed="${String(comparing)}">${comparing ? text.exitCompare : text.compare}</button>
      <button type="button" class="designer-control designer-button" data-change-action="discard">${text.discard}</button>
      <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="request-adopt-all">${text.adoptAll}</button>
    </span>`;
}

/**
 * 变更页签：按「可独立采纳的单元」分组，每条能单独采纳或忽略；全部采纳需要二次确认。
 * 没有提案时给三张起点牌（从指标树 / 模板 / 一句话起），而不是空白。
 */
export function changePaneMarkup(
  proposal: DesignerChangeProposal | undefined,
  confirmAll: boolean,
  review?: DesignerReviewPane,
  history?: readonly ScreenHistoryNode[],
): string {
  const text = DESIGNER_UI_TEXT.change;
  if (proposal === undefined && review?.reviewing === true) {
    // 评审态没有提案分两种：进来时就没有待审条目，和逐条处理完之后的收尾。
    // 两者都显示「评审完成」会让空评审读起来像「审完了」，把没审过说成审过。
    const empty = review.total === 0;
    return `<div class="change-empty">
      <p class="change-empty-title">${
        empty ? DESIGNER_UI_TEXT.review.empty : DESIGNER_UI_TEXT.review.done
      }</p>
      <button type="button" class="designer-control designer-button" data-change-action="exit-review">${DESIGNER_UI_TEXT.review.exit}</button>
    </div>`;
  }
  if (proposal === undefined) {
    return `<div class="change-empty">
      <p class="change-empty-title">${text.empty}</p>
      <ul class="change-start-list">
        <li class="change-start-card"><button type="button" class="designer-control designer-button" data-change-action="start-intent" data-change-start="metrics">${text.startFromMetrics}</button><span class="change-start-hint">${text.startFromMetricsHint}</span></li>
        <li class="change-start-card"><button type="button" class="designer-control designer-button" data-change-action="start-intent" data-change-start="template">${text.startFromTemplate}</button><span class="change-start-hint">${text.startFromTemplateHint}</span></li>
        <li class="change-start-card"><button type="button" class="designer-control designer-button" data-change-action="start-intent" data-change-start="prompt">${text.startFromPrompt}</button><span class="change-start-hint">${text.startFromPromptHint}</span></li>
      </ul>
    </div>`;
  }
  const units = proposal.units;
  const reviewing = review?.reviewing === true;
  const origin = originMarkup(proposal.origin);
  const people =
    reviewing && (review.meta.reviewer !== undefined || review.meta.approver !== undefined)
      ? `<p class="change-pane-people">${DESIGNER_UI_TEXT.review.people(
          review.meta.reviewer ?? '',
          review.meta.approver ?? '',
        )}</p>`
      : '';
  return `<div class="change-pane-heading">
      <span class="change-pane-scope">${escapeHtml(proposal.scope)}</span>
      <span class="change-pane-summary">${
        reviewing
          ? DESIGNER_UI_TEXT.review.progress(review.total - units.length, review.total)
          : text.remainingUnits(units.length)
      }</span>
    </div>
    ${origin}
    ${people}
    <p class="change-panel-summary">${escapeHtml(proposal.title)}</p>
    <section class="change-panel-section">
      <h3 class="change-panel-heading-text">${text.rationaleLabel}</h3>
      <p class="change-panel-rationale">${escapeHtml(proposal.rationale)}</p>
    </section>
    <section class="change-panel-section">
      <h3 class="change-panel-heading-text">${text.diffLabel}</h3>
      <ul class="change-diff-list">${units.map((unit) => unitMarkup(unit, reviewing)).join('')}</ul>
    </section>
    ${historyMarkup(history)}
    <footer class="change-panel-actions">
      ${
        reviewing
          ? `<span class="change-panel-hint">${DESIGNER_UI_TEXT.review.progress(
              review.total - units.length,
              review.total,
            )}</span>
             <button type="button" class="designer-control designer-button" data-change-action="exit-review">${DESIGNER_UI_TEXT.review.exit}</button>`
          : confirmAll
            ? `<span class="change-panel-hint">${text.adoptHint}</span>
             <button type="button" class="designer-control designer-button" data-change-action="cancel-adopt-all">${text.cancelAdoptAll}</button>
             <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="adopt">${text.confirmAdoptAll}</button>`
            : `<span class="change-panel-hint">${text.adoptHint}</span>
             <button type="button" class="designer-control designer-button" data-change-action="discard">${text.discard}</button>
             <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="request-adopt-all">${text.adoptAll}</button>`
      }
    </footer>`;
}

export interface DesignerReviewPane {
  readonly reviewing: boolean;
  readonly meta: { readonly reviewer?: string; readonly approver?: string };
  readonly total: number;
}

function unitMarkup(unit: DesignerChangeUnit, reviewing = false): string {
  const text = DESIGNER_UI_TEXT.change;
  const label = unit.label === '' ? text.unitDocument : unit.label;
  const entries = unit.diff
    .map((row) => {
      if (row.kind !== 'changed') {
        const single = row.kind === 'added' ? text.added : text.removed;
        return `<li class="change-diff-entry"><span class="change-diff-single">${single}</span></li>`;
      }
      return row.entries
        .map(
          (entry) => `<li class="change-diff-entry">
        <code class="change-diff-path">${escapeHtml(entry.path)}</code>
        <span class="change-diff-before">${escapeHtml(entry.before)}</span>
        <span class="change-diff-arrow" aria-hidden="true">→</span>
        <span class="change-diff-after">${escapeHtml(entry.after)}</span>
      </li>`,
        )
        .join('');
    })
    .join('');
  return `<li class="change-diff-row" data-change-unit-row="${escapeHtml(unit.id)}" data-kind="${unit.kind}">
      <div class="change-diff-head">
        <span class="change-diff-name">${escapeHtml(label)}</span>
        <span class="change-diff-kind">${text.unitKind[unit.kind]}</span>
      </div>
      <ul class="change-diff-entries">${entries}</ul>
      <div class="change-unit-actions">
        <button type="button" class="designer-control designer-button" data-variant="ghost" data-change-action="reject-unit" data-change-unit="${escapeHtml(unit.id)}">${reviewing ? DESIGNER_UI_TEXT.review.reject : text.rejectUnit}</button>
        <button type="button" class="designer-control designer-button" data-change-action="adopt-unit" data-change-unit="${escapeHtml(unit.id)}">${reviewing ? DESIGNER_UI_TEXT.review.approve : text.adoptUnit}</button>
      </div>
    </li>`;
}

export function renderDraftBar(
  bar: HTMLElement,
  proposal: DesignerChangeProposal,
  comparing: boolean,
  paneOpen = false,
): void {
  bar.innerHTML = draftBarMarkup(proposal, comparing, paneOpen);
  adoptDesignerFormControls(bar);
}

export function renderChangePane(
  pane: HTMLElement,
  proposal: DesignerChangeProposal | undefined,
  confirmAll: boolean,
  review?: DesignerReviewPane,
  history?: readonly ScreenHistoryNode[],
): void {
  pane.innerHTML = changePaneMarkup(proposal, confirmAll, review, history);
  adoptDesignerFormControls(pane);
}

/** 右栏页签的待决计数：只改文本，不重建页签，避免焦点丢失。 */
export function renderChangeCount(count: HTMLElement, units: number): void {
  count.textContent = units === 0 ? '' : String(units);
  count.hidden = units === 0;
  count.setAttribute('aria-label', DESIGNER_UI_TEXT.rightPane.countAria(units));
}

/** 归属：两个不透明字符串，缺谁就少谁，都不做身份推断。 */
function originMarkup(origin: DesignerChangeProposalOrigin | undefined): string {
  if (origin === undefined) return '';
  const author = origin.author ?? '';
  const approver = origin.approver ?? '';
  if (author === '' && approver === '') return '';
  const text =
    author !== '' && approver !== ''
      ? DESIGNER_UI_TEXT.origin.label(author, approver)
      : author !== ''
        ? DESIGNER_UI_TEXT.origin.authorOnly(author)
        : DESIGNER_UI_TEXT.origin.label('—', approver);
  return `<p class="change-pane-origin">${escapeHtml(text)}</p>`;
}

/**
 * 历史段：指针式回退的可视化。
 *
 * 节点顺序即提交顺序，`position` 由 core 给出；`future` 是撤销或回退留下的
 * 前进栈，同样可点——这正是「回退本身可回退」的入口。
 */
function historyMarkup(history: readonly ScreenHistoryNode[] | undefined): string {
  if (history === undefined || history.length === 0) return '';
  const text = DESIGNER_UI_TEXT.change;
  const rows = history
    .map((node) => {
      const label =
        node.index === 0
          ? text.historyInitial
          : (node.provenance?.label ?? text.historyNode(node.index));
      const source = node.provenance?.source ?? '—';
      const current = node.position === 'current';
      return `<li><button type="button" class="designer-control designer-history-node" data-change-action="revert-history" data-history-index="${node.index}" data-position="${node.position}" aria-current="${String(current)}">
        <span class="history-node-index">${node.index}</span>
        <span class="history-node-label">${escapeHtml(label)}</span>
        <span class="history-node-source">${escapeHtml(source)}</span>
        ${current ? `<span class="history-node-current">${text.historyCurrent}</span>` : ''}
      </button></li>`;
    })
    .join('');
  return `<section class="change-panel-section change-history">
      <h3 class="change-panel-heading-text">${text.historyTitle}</h3>
      <ol class="change-history-list">${rows}</ol>
      <p class="change-panel-hint">${text.historyHint}</p>
    </section>`;
}
