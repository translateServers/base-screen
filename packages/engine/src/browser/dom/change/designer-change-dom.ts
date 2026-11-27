import { isScreenComponentId, type ScreenIntentScope } from '@base-screen/contracts';
import type { ScreenHistoryNode } from '@base-screen/core';
import type {
  DesignerChangeProposal,
  DesignerChangeProposalOrigin,
  DesignerChangeUnit,
} from '../../../common/operations/change/designer-change-proposal.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { adoptDesignerFormControls } from '../designer-form-controls-dom.js';
import { escapeHtml } from '../designer-html-escape.js';
import { createDesignerIconButton } from '../designer-ui-primitives.js';

export type DesignerChangeFeedback =
  | { readonly kind: 'draft-pending' }
  | { readonly kind: 'adopt-failed'; readonly unitId?: string; readonly reason?: string }
  | { readonly kind: 'remaining-invalid'; readonly remainingCount: number };

/**
 * 草案条：常驻画布顶部，声明「未写入」，并给出采纳/放弃入口。
 *
 * 标题可用的横向空间是零和的——画布容器的 90% 减去状态、影响、按钮三段；
 * 实测 662px 条里只剩 186px（约 14 字）。所以标题单行截断后补原生 `title`，
 * 不用 `data-tip`：那是短标签气泡，几十字的主题会被撑成一条横条。
 */
export function draftBarMarkup(
  proposal: DesignerChangeProposal,
  comparing: boolean,
  paneOpen = false,
  streaming = false,
): string {
  const text = DESIGNER_UI_TEXT.change;
  const label = streaming
    ? text.streamingLabel
    : comparing
      ? text.viewingOldLabel
      : text.draftLabel;
  return `<span class="draft-state">
      <span class="draft-dot" aria-hidden="true"></span>
      <span class="draft-label" data-draft-streaming="${String(streaming)}">${label}</span>
    </span>
    <span class="draft-summary">
      <span class="draft-title" title="${escapeHtml(proposal.title)}">${escapeHtml(proposal.title)}</span>
      <span class="draft-sub">${escapeHtml(proposal.scope)} · ${text.affected(proposal.affectedComponentIds.length)}</span>
    </span>
    <span class="draft-actions">
      <button type="button" class="designer-control designer-button" data-size="compact" data-variant="ghost" data-change-action="toggle-panel" aria-expanded="${String(paneOpen)}">${paneOpen ? text.hideChanges : text.viewChanges}</button>
      <button type="button" class="designer-control designer-button" data-size="compact" data-variant="ghost" data-change-action="toggle-compare" aria-pressed="${String(comparing)}">${comparing ? text.exitCompare : text.compare}</button>
      ${
        paneOpen
          ? ''
          : `<button type="button" class="designer-control designer-button" data-size="compact" data-change-action="discard">${streaming ? text.cancelStreaming : text.discard}</button>
      ${streaming ? '' : `<button type="button" class="designer-control designer-button" data-size="compact" data-variant="primary" data-change-action="request-adopt-all">${text.adoptAll}</button>`}`
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
  streaming = false,
): string {
  const text = DESIGNER_UI_TEXT.change;
  const notice =
    feedback?.kind === 'adopt-failed' && feedback.unitId !== undefined
      ? ''
      : feedbackMarkup(feedback);
  // 智能体内容区保留与检查器同规格的分区标题，避免整块只有列表没有抬头。
  const paneHead = `<div class="change-pane-head"><h3 class="change-pane-title">${escapeHtml(text.panelTitle)}</h3></div>`;
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
      <ul class="change-diff-list">${units.map((unit) => unitMarkup(unit, reviewing, feedback, proposal.commands, streaming)).join('')}</ul>
    </section>
    ${historyMarkup(history)}
    <footer class="change-panel-actions">
      <span class="change-panel-hint">${
        streaming
          ? text.streamingHint
          : reviewing
            ? DESIGNER_UI_TEXT.review.progress(review.total - units.length, review.total)
            : text.adoptHint
      }</span>
      <span class="change-panel-action-buttons">${
        // 生成中只能取消：内容还没填完，任何采纳都会采到半张屏（ADR-0112 §2.5）。
        streaming
          ? `<button type="button" class="designer-control designer-button" data-change-action="discard">${text.cancelStreaming}</button>`
          : reviewing
            ? confirmAll
              ? `<button type="button" class="designer-control designer-button" data-change-action="cancel-adopt-all">${text.cancelAdoptAll}</button>
                 <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="adopt">${text.confirmAdoptAll}</button>`
              : `<button type="button" class="designer-control designer-button" data-change-action="exit-review">${DESIGNER_UI_TEXT.review.exit}</button>${
                  units.length === 1 && units[0]?.presentation?.kind === 'whole-screen-replacement'
                    ? `<button type="button" class="designer-control designer-button" data-change-action="discard">${text.discard}</button>
                       <button type="button" class="designer-control designer-button" data-variant="primary" data-change-action="request-adopt-all">${text.adoptAll}</button>`
                    : ''
                }`
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
        : feedback.reason === undefined
          ? DESIGNER_UI_TEXT.change.feedbackAdoptFailed
          : DESIGNER_UI_TEXT.change.feedbackAdoptFailedReason(feedback.reason);
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
    case 'states':
      return text.states;
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
  commands: DesignerChangeProposal['commands'] = [],
  streaming = false,
): string {
  const text = DESIGNER_UI_TEXT.change;
  const label = unit.label === '' ? text.unitDocument : unit.label;
  const wholeScreen = unit.presentation?.kind === 'whole-screen-replacement';
  const heading = wholeScreen
    ? text.wholeScreenReplacement(unit.presentation?.addedCount ?? 0)
    : unit.kind === 'removed'
      ? text.removedUnit
      : label;
  // 整屏替换只能整体采纳或放弃（ADR-0111 §2.1）：单元内只读列出新增 / 移除 / 画布与数据源，
  // 不给逐项按钮，采纳走底部「全部采纳」的二次确认。
  const entries = wholeScreen
    ? wholeScreenEntries(
        unit,
        commands.filter((_, index) => unit.commandIndexes.includes(index)),
      )
    : `${diffEntries(unit)}${noteEntries(unit)}`;
  const actions = streaming
    ? ''
    : wholeScreen
      ? `<p class="change-panel-hint" data-change-whole-screen-hint>${text.wholeScreenHint}</p>`
      : `<div class="change-unit-actions">
        <button type="button" class="designer-control designer-button" data-variant="ghost" data-change-action="reject-unit" data-change-unit="${escapeHtml(unit.id)}">${reviewing ? DESIGNER_UI_TEXT.review.reject : text.rejectUnit}</button>
        <button type="button" class="designer-control designer-button" data-change-action="adopt-unit" data-change-unit="${escapeHtml(unit.id)}">${reviewing ? DESIGNER_UI_TEXT.review.approve : text.adoptUnit}</button>
      </div>`;
  return `<li class="change-diff-row" data-change-unit-row="${escapeHtml(unit.id)}" data-kind="${unit.kind}">
      <div class="change-diff-head">
        <span class="change-diff-name">${escapeHtml(heading)}</span>
        <span class="change-diff-kind">${wholeScreen ? text.wholeScreenKind : text.unitKind[unit.kind]}</span>
      </div>
      <ul class="change-diff-entries">${entries}</ul>
      ${feedback?.kind === 'adopt-failed' && feedback.unitId === unit.id ? feedbackMarkup(feedback) : ''}
      ${actions}
    </li>`;
}

/** 宿主分组提示带来的可读说明（ADR-0115 D5）：文档级变化（联动、变量）靠它让评审人看懂。 */
function noteEntries(unit: DesignerChangeUnit): string {
  return (unit.notes ?? [])
    .map(
      (note) =>
        `<li class="change-diff-entry" data-change-note><span class="change-diff-single">${escapeHtml(note)}</span></li>`,
    )
    .join('');
}

/** 普通单元：新增 / 删除整行，修改按字段展开。 */
function diffEntries(unit: DesignerChangeUnit): string {
  const text = DESIGNER_UI_TEXT.change;
  return unit.diff
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
}

/** 整屏替换单元的只读清单：新增 / 移除 / 画布与数据源三组。 */
function wholeScreenEntries(
  unit: DesignerChangeUnit,
  commands: DesignerChangeProposal['commands'],
): string {
  const text = DESIGNER_UI_TEXT.change;
  const added: string[] = [];
  const removed: string[] = [];
  for (const row of unit.diff) {
    if (row.kind === 'added') added.push(row.componentName);
    if (row.kind === 'removed') removed.push(row.componentName);
  }
  const documentLabels = new Set<string>();
  for (const command of commands) {
    if (command.type === 'update-canvas') {
      documentLabels.add(text.wholeScreenDocumentLabels.canvas);
    }
    if (command.type === 'replace-data-sources') {
      documentLabels.add(text.wholeScreenDocumentLabels.dataSources);
    }
  }
  const documentNames = [...documentLabels];
  const groups = [
    {
      kind: 'added',
      label: text.wholeScreenGroup.added(added.length),
      names: added,
    },
    {
      kind: 'removed',
      label: text.wholeScreenGroup.removed(removed.length),
      names: removed,
    },
    {
      kind: 'document',
      label: text.wholeScreenGroup.document,
      names: documentNames,
    },
  ];
  return groups
    .map(
      ({ kind, label, names }) =>
        `<li class="change-diff-entry" data-change-whole-screen-group="${kind}">
          <span class="change-diff-path">${label}</span>
          <span class="change-diff-after">${escapeHtml(names.length === 0 ? text.wholeScreenEmpty : text.wholeScreenNames(names))}</span>
        </li>`,
    )
    .join('');
}

export function renderDraftBar(
  bar: HTMLElement,
  proposal: DesignerChangeProposal,
  comparing: boolean,
  paneOpen = false,
  streaming = false,
): void {
  bar.innerHTML = draftBarMarkup(proposal, comparing, paneOpen, streaming);
  adoptDesignerFormControls(bar);
}

/** 草案期间的会话标记（ADR-0111 §2.2）：只改显示，不写文档、不进历史、不影响导出与渲染器。 */
export interface DesignerChangeMarks {
  /** 内容层中被修改或被移除的旧组件：隐藏，几何不变、不占命中。 */
  readonly supersededIds: readonly string[];
  /** 被移除的旧组件：在草案层原位画虚线轮廓与「将移除」标记。 */
  readonly removedIds: readonly string[];
  /** 子集草案里只为定位而挂、本身未受影响的祖先：在草案层隐藏。 */
  readonly ghostHiddenIds: readonly string[];
}

/**
 * 把标记写进草案层：一个 style 节点承载两条隐藏规则（按组件 id 选择，渲染器重建元素后依然生效），
 * 一个轮廓层承载移除标记。`marks` 为空时全部撤掉。
 */
export function renderChangeMarks(
  ghost: HTMLElement,
  marks: DesignerChangeMarks | undefined,
): void {
  let style = ghost.querySelector<HTMLStyleElement>('style[data-change-marks-style]');
  let layer = ghost.querySelector<HTMLElement>('[data-canvas-ghost-marks]');
  if (marks === undefined) {
    if (style !== null) style.textContent = '';
    layer?.replaceChildren();
    return;
  }
  const doc = ghost.ownerDocument;
  if (style === null) {
    style = doc.createElement('style');
    style.dataset.changeMarksStyle = '';
    ghost.prepend(style);
  }
  if (layer === null) {
    layer = doc.createElement('div');
    layer.className = 'canvas-ghost-marks';
    layer.dataset.canvasGhostMarks = '';
    ghost.append(layer);
  }
  style.textContent = [
    hiddenComponentsRule('.canvas-content', marks.supersededIds),
    hiddenComponentsRule('.canvas-ghost-root', marks.ghostHiddenIds),
  ].join('');
  const content = ghost.parentElement?.querySelector<HTMLElement>('[data-canvas-content]');
  layer.replaceChildren(
    ...marks.removedIds.flatMap((id) => {
      if (!isScreenComponentId(id)) return [];
      const source = content?.querySelector<HTMLElement>(`[data-base-screen-component-id="${id}"]`);
      return source === null || source === undefined ? [] : [removalMark(doc, source)];
    }),
  );
}

function hiddenComponentsRule(scope: string, ids: readonly string[]): string {
  const selectors = ids
    .filter((id) => isScreenComponentId(id))
    .map((id) => `${scope} [data-base-screen-component-id="${id}"]`);
  return selectors.length === 0 ? '' : `${selectors.join(',')}{visibility:hidden}`;
}

/** 轮廓沿用内容层元素的几何帧（left / top / width / height / transform），与旧组件像素对齐。 */
function removalMark(doc: Document, source: HTMLElement): HTMLElement {
  const mark = doc.createElement('div');
  mark.className = 'change-removal-mark';
  const frame = source.style;
  mark.style.left = frame.left;
  mark.style.top = frame.top;
  mark.style.width = frame.width;
  mark.style.height = frame.height;
  mark.style.transform = frame.transform;
  mark.style.transformOrigin = frame.transformOrigin;
  const label = doc.createElement('span');
  label.className = 'change-removal-mark-label';
  label.textContent = DESIGNER_UI_TEXT.change.removalMark;
  mark.append(label);
  return mark;
}

/** 子集草案不画画布背景：未受影响的组件与旧画布底色要透过草案层可见。 */
export function clearGhostCanvasBackground(ghost: HTMLElement | undefined): void {
  const root = ghost?.querySelector<HTMLElement>('[data-canvas-ghost-root]');
  if (root === null || root === undefined) return;
  root.style.backgroundColor = '';
  root.style.backgroundImage = '';
}

export function renderChangePane(
  pane: HTMLElement,
  proposal: DesignerChangeProposal | undefined,
  confirmAll: boolean,
  review?: DesignerReviewPane,
  history?: readonly ScreenHistoryNode[],
  feedback?: DesignerChangeFeedback,
  intentScope?: ScreenIntentScope,
  streaming = false,
): void {
  pane.innerHTML = changePaneMarkup(
    proposal,
    confirmAll,
    review,
    history,
    feedback,
    intentScope,
    streaming,
  );
  adoptDesignerFormControls(pane);
  renderChangeReviewToggle(pane, proposal, review);
}

/** 评审入口挂在身份行右侧，避免与内容区标题行争高度；没有提案时为空。 */
function renderChangeReviewToggle(
  pane: HTMLElement,
  proposal: DesignerChangeProposal | undefined,
  review?: DesignerReviewPane,
): void {
  const slot = pane
    .closest<HTMLElement>('[data-right-panel]')
    ?.querySelector<HTMLElement>('[data-change-pane-review]');
  if (slot === null || slot === undefined) return;
  if (proposal === undefined) {
    slot.replaceChildren();
    return;
  }
  const button = createDesignerIconButton(pane.ownerDocument, {
    icon: 'eye',
    label: DESIGNER_UI_TEXT.review.title,
    className: 'right-pane-review',
    pressed: review?.reviewing === true,
  });
  button.dataset.reviewToggle = '';
  slot.replaceChildren(button);
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
