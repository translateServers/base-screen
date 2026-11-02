import type { ScreenIntentScope } from '@base-screen/contracts';
import type { ScreenHistoryNode } from '@base-screen/core';
import type {
  DesignerChangeProposal,
  DesignerChangeProposalOrigin,
  DesignerChangeUnit,
} from '../../../common/operations/change/designer-change-proposal.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { adoptDesignerFormControls } from '../designer-form-controls-dom.js';
import { escapeHtml } from '../designer-html-escape.js';

export type DesignerChangeFeedback =
  | { readonly kind: 'draft-pending' }
  | { readonly kind: 'adopt-failed'; readonly unitId?: string }
  | { readonly kind: 'remaining-invalid'; readonly remainingCount: number };

/** 草案条：常驻画布顶部，声明「未写入」，并给出采纳/放弃入口。 */
export function draftBarMarkup(
  proposal: DesignerChangeProposal,
  comparing: boolean,
  paneOpen = false,
): string {
  const text = DESIGNER_UI_TEXT.change;
  return `<span class="draft-state">
      <span class="draft-dot" aria-hidden="true"></span>
      <span class="draft-label">${text.draftLabel}</span>
    </span>
    <span class="draft-summary">
      <span class="draft-title">${escapeHtml(proposal.title)}</span>
      <span class="draft-sub">${escapeHtml(proposal.scope)}</span>
    </span>
    <span class="draft-meta">${text.affected(proposal.affectedComponentIds.length)}</span>
    <span class="draft-actions">
      <button type="button" class="designer-control designer-button" data-variant="ghost" data-change-action="toggle-panel" aria-expanded="${String(paneOpen)}">${paneOpen ? text.hideChanges : text.viewChanges}</button>
      <button type="button" class="designer-control designer-button" data-variant="ghost" data-change-action="toggle-compare" aria-pressed="${String(comparing)}">${comparing ? text.exitCompare : text.compare}</button>
      ${
        paneOpen
          ? ''
          : `<button type="button" class="designer-control designer-button" data-change-action="discard">${text.discard}</button>
      <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="request-adopt-all">${text.adoptAll}</button>`
      }
    </span>`;
}

/**
 * 提案区（智能体页签）：按「可独立采纳的单元」分组，每条能单独采纳或忽略；全部采纳需要二次确认。
 * 没有提案时给三张起点牌（从指标树 / 模板 / 一句话起），而不是空白。
 */
export function changePaneMarkup(
  proposal: DesignerChangeProposal | undefined,
  confirmAll: boolean,
  review?: DesignerReviewPane,
  history?: readonly ScreenHistoryNode[],
  feedback?: DesignerChangeFeedback,
  intentScope?: ScreenIntentScope,
): string {
  const text = DESIGNER_UI_TEXT.change;
  const notice =
    feedback?.kind === 'adopt-failed' && feedback.unitId !== undefined
      ? ''
      : feedbackMarkup(feedback);
  // 没有提案时评审入口无事可做：空态里它只会把用户带进一个「零条目」的评审态。
  const reviewToggle =
    proposal === undefined
      ? ''
      : `<div class="change-pane-toolbar"><button type="button" class="designer-control designer-button designer-icon-button right-pane-review" data-review-toggle aria-pressed="${String(review?.reviewing === true)}" data-tip="${DESIGNER_UI_TEXT.review.title}" aria-label="${DESIGNER_UI_TEXT.review.title}">${designerIcon('eye')}</button></div>`;
  // 智能体内容区保留与检查器同规格的分区标题，避免整块只有列表没有抬头。
  const paneHead = `<div class="change-pane-head"><h3 class="change-pane-title">${escapeHtml(text.panelTitle)}</h3>${reviewToggle}</div>`;
  if (proposal === undefined && feedback?.kind === 'remaining-invalid') {
    return `${paneHead}${notice}${historyMarkup(history)}${
      review?.reviewing === true
        ? `<button type="button" class="designer-control designer-button" data-change-action="exit-review">${DESIGNER_UI_TEXT.review.exit}</button>`
        : ''
    }`;
  }
  if (proposal === undefined && review?.reviewing === true) {
    // 评审态没有提案分两种：进来时就没有待审条目，和逐条处理完之后的收尾。
    // 两者都显示「评审完成」会让空评审读起来像「审完了」，把没审过说成审过。
    const empty = review.total === 0;
    return `${paneHead}${notice}<div class="designer-empty-state">
      <p class="change-empty-copy">${
        empty ? DESIGNER_UI_TEXT.review.empty : DESIGNER_UI_TEXT.review.done
      }</p>
      <span class="designer-empty-actions">
        <button type="button" class="designer-control designer-button" data-change-action="exit-review">${DESIGNER_UI_TEXT.review.exit}</button>
      </span>
    </div>${historyMarkup(history)}`;
  }
  if (proposal === undefined) {
    const componentScope = intentScope?.kind === 'components';
    const historyContent = historyMarkup(history, true);
    // 组件作用域需要说清「改的是选中组件」；整屏只在历史也为空时补一条明确空态。
    let emptyCopy = '';
    if (componentScope) emptyCopy = text.componentEmptyHint;
    else if (historyContent === '') emptyCopy = text.emptyPending;
    const emptyState =
      emptyCopy === '' ? '' : `<p class="designer-empty-state">${escapeHtml(emptyCopy)}</p>`;
    return `${paneHead}${notice}${emptyState}${historyContent}`;
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
  return `${paneHead}${notice}<div class="change-pane-heading">
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
    <details class="change-panel-section change-pane-disclosure change-rationale">
      <summary class="change-pane-disclosure-summary">
        <span class="change-pane-disclosure-title">${text.rationaleLabel}</span>
        <span class="change-pane-disclosure-chevron" aria-hidden="true">›</span>
      </summary>
      <p class="change-panel-rationale">${escapeHtml(proposal.rationale)}</p>
    </details>
    <section class="change-panel-section">
      <h3 class="change-panel-heading-text">${text.diffLabel}</h3>
      <ul class="change-diff-list">${units.map((unit) => unitMarkup(unit, reviewing, feedback)).join('')}</ul>
    </section>
    ${historyMarkup(history)}
    <footer class="change-panel-actions">
      <span class="change-panel-hint">${
        reviewing
          ? DESIGNER_UI_TEXT.review.progress(review.total - units.length, review.total)
          : text.adoptHint
      }</span>
      <span class="change-panel-action-buttons">${
        reviewing
          ? `<button type="button" class="designer-control designer-button" data-change-action="exit-review">${DESIGNER_UI_TEXT.review.exit}</button>`
          : confirmAll
            ? `<button type="button" class="designer-control designer-button" data-change-action="cancel-adopt-all">${text.cancelAdoptAll}</button>
             <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="adopt">${text.confirmAdoptAll}</button>`
            : `<button type="button" class="designer-control designer-button" data-change-action="discard">${text.discard}</button>
             <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="request-adopt-all">${text.adoptAll}</button>`
      }</span>
    </footer>`;
}

export interface DesignerReviewPane {
  readonly reviewing: boolean;
  readonly meta: { readonly reviewer?: string; readonly approver?: string };
  readonly total: number;
}

function feedbackMarkup(feedback: DesignerChangeFeedback | undefined): string {
  if (feedback === undefined) return '';
  const text =
    feedback.kind === 'draft-pending'
      ? DESIGNER_UI_TEXT.change.feedbackDraftPending
      : feedback.kind === 'remaining-invalid'
        ? DESIGNER_UI_TEXT.change.feedbackRemainingInvalid(feedback.remainingCount)
        : DESIGNER_UI_TEXT.change.feedbackAdoptFailed;
  return `<p class="change-panel-hint" role="alert" data-change-feedback="${feedback.kind}">${escapeHtml(text)}</p>`;
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readableValue(value: unknown): string {
  const text = DESIGNER_UI_TEXT.change.diffValue;
  if (value === null || value === undefined) return text.unset;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return text.list(value.length);
  if (isJsonRecord(value)) return text.object(Object.keys(value).length);
  return text.unset;
}

function literalValue(value: unknown): string {
  return DESIGNER_UI_TEXT.change.diffValue.literal(readableValue(value));
}

function fieldLocation(value: Readonly<Record<string, unknown>>): string {
  const dataSourceId = typeof value.dataSourceId === 'string' ? value.dataSourceId : '';
  const path = Array.isArray(value.path)
    ? value.path
        .filter(
          (segment): segment is string | number =>
            typeof segment === 'string' || typeof segment === 'number',
        )
        .map(String)
    : [];
  return path.length === 0 ? dataSourceId : `${dataSourceId}/${path.join('.')}`;
}

function diffValueText(raw: string): string {
  const text = DESIGNER_UI_TEXT.change.diffValue;
  if (raw.includes('…')) return text.tooLong;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return text.tooLong;
  }
  if (!isJsonRecord(value)) return readableValue(value);
  if (value.kind === 'inline' && 'value' in value) return literalValue(value.value);
  if (value.kind === 'variable' && typeof value.variableId === 'string') {
    return text.variable(value.variableId);
  }
  if (value.kind === 'data-source-field' && typeof value.dataSourceId === 'string') {
    return text.dataSourceField(fieldLocation(value));
  }
  if (value.type === 'dataset' && typeof value.datasetId === 'string') {
    return text.dataset(value.datasetId);
  }
  if (
    value.type === 'host-resource' &&
    typeof value.resourceType === 'string' &&
    typeof value.resourceId === 'string'
  ) {
    return text.resource(value.resourceType, value.resourceId);
  }
  if (value.type === 'variable' && typeof value.variableId === 'string') {
    return text.variable(value.variableId);
  }
  if (value.type === 'static' && 'value' in value) return literalValue(value.value);
  return text.object(Object.keys(value).length);
}

function diffPathText(path: string): string {
  const text = DESIGNER_UI_TEXT.change.diffPath;
  switch (path) {
    case 'name':
      return text.name;
    case 'position.x':
      return text.positionX;
    case 'position.y':
      return text.positionY;
    case 'size.width':
      return text.sizeWidth;
    case 'size.height':
      return text.sizeHeight;
    case 'rotation':
      return text.rotation;
    case 'zIndex':
      return text.zIndex;
    case 'dataValue':
      return text.dataValue;
    case 'dataSource':
      return text.dataSource;
    case 'styleRules':
      return text.styleRules;
    default:
      if (path.startsWith('props.')) {
        const key = path.slice('props.'.length);
        return text.prop((text.propKeys as Readonly<Record<string, string>>)[key] ?? key);
      }
      if (path.startsWith('style.')) {
        const key = path.slice('style.'.length);
        return text.style((text.styleKeys as Readonly<Record<string, string>>)[key] ?? key);
      }
      return text.other;
  }
}

function unitMarkup(
  unit: DesignerChangeUnit,
  reviewing = false,
  feedback?: DesignerChangeFeedback,
): string {
  const text = DESIGNER_UI_TEXT.change;
  const label = unit.label === '' ? text.unitDocument : unit.label;
  const heading =
    unit.presentation?.kind === 'whole-screen-replacement'
      ? text.wholeScreenReplacement(unit.presentation.addedCount)
      : unit.kind === 'removed'
        ? text.removedUnit
        : label;
  const entries = unit.diff
    .map((row) => {
      if (row.kind !== 'changed') {
        const single = row.kind === 'added' ? text.added : text.removed;
        return `<li class="change-diff-entry"><span class="change-diff-single">${single}</span></li>`;
      }
      return row.entries
        .map(
          (entry) => `<li class="change-diff-entry">
        <code class="change-diff-path">${escapeHtml(diffPathText(entry.path))}</code>
        <span class="change-diff-before">${escapeHtml(diffValueText(entry.before))}</span>
        <span class="change-diff-arrow" aria-hidden="true">→</span>
        <span class="change-diff-after">${escapeHtml(diffValueText(entry.after))}</span>
      </li>`,
        )
        .join('');
    })
    .join('');
  return `<li class="change-diff-row" data-change-unit-row="${escapeHtml(unit.id)}" data-kind="${unit.kind}">
      <div class="change-diff-head">
        <span class="change-diff-name">${escapeHtml(heading)}</span>
        <span class="change-diff-kind">${text.unitKind[unit.kind]}</span>
      </div>
      <ul class="change-diff-entries">${entries}</ul>
      ${feedback?.kind === 'adopt-failed' && feedback.unitId === unit.id ? feedbackMarkup(feedback) : ''}
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
  feedback?: DesignerChangeFeedback,
  intentScope?: ScreenIntentScope,
): void {
  pane.innerHTML = changePaneMarkup(proposal, confirmAll, review, history, feedback, intentScope);
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
 * 前进栈，只能通过重做恢复，不能传给仅支持 past 的回退入口。
 */
function historyMarkup(history: readonly ScreenHistoryNode[] | undefined, open = false): string {
  if (history === undefined || history.length === 0) return '';
  const text = DESIGNER_UI_TEXT.change;
  const rows = history
    .map((node) => {
      const label =
        node.index === 0
          ? text.historyInitial
          : (node.provenance?.label ?? text.historyNode(node.index));
      const source =
        node.provenance?.source === undefined ? '—' : text.historySource[node.provenance.source];
      const current = node.position === 'current';
      return `<li><button type="button" class="designer-control designer-history-node" data-change-action="revert-history" data-history-index="${node.index}" data-position="${node.position}" aria-current="${String(current)}"${node.position === 'past' ? '' : ' disabled'}>
        <span class="history-node-index">${node.index}</span>
        <span class="history-node-label">${escapeHtml(label)}</span>
        <span class="history-node-source">${escapeHtml(source)}</span>
        ${current ? `<span class="history-node-current">${text.historyCurrent}</span>` : ''}
        ${node.position === 'future' ? `<span class="history-node-current">${text.historyFuture}</span>` : ''}
      </button></li>`;
    })
    .join('');
  return `<details class="change-panel-section change-history"${open ? ' open' : ''}>
      <summary class="change-history-summary">
        <span class="change-history-title">${text.historyTitle}</span>
        <span class="change-history-count">${text.historyCount(history.length)}</span>
      </summary>
      <ol class="change-history-list">${rows}</ol>
      <p class="change-panel-hint">${text.historyHint}</p>
    </details>`;
}
