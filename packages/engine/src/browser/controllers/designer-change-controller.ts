import type { ScreenDocument, ScreenIntentScope } from '@base-screen/contracts';
import type {
  ScreenDocumentCommand,
  ScreenHistoryNode,
  ScreenTransactionProvenance,
} from '@base-screen/core';
import type { DesignerMetricName } from '../../common/observability/designer-metrics.js';
import type { BaseScreenDesignerChangeStateDetail } from '../../common/operations/change/designer-change-events.js';
import {
  type DesignerChangeProposal,
  type DesignerChangeProposalInput,
  prepareDesignerChangeProposal,
} from '../../common/operations/change/designer-change-proposal.js';
import type { DesignerReviewMeta } from '../../common/operations/change/designer-review.js';
import {
  type DesignerChangeFeedback,
  renderChangeCount,
  renderChangePane,
  renderDraftBar,
} from '../dom/change/designer-change-dom.js';

export interface DesignerChangeGhostHandlers {
  readonly render: (document: ScreenDocument) => boolean;
  readonly clear: () => void;
}

export interface DesignerChangeAdoptResult {
  readonly ok: boolean;
}

type RightPaneMode = 'inspector' | 'intent';

function parsePaneMode(value: string | undefined): RightPaneMode {
  return value === 'intent' ? 'intent' : 'inspector';
}

/**
 * 幽灵草案 + 逐条采纳 + 右栏智能体页签下的提案区。
 *
 * 候选文档以叠加层呈现，**不写入 canonical 文档、不进历史**；采纳按「单元」提交，
 * 每个单元是一次普通事务（带 provenance），因此撤销、修订号与手动编辑走同一条路径。
 * 采纳或忽略某个单元后，用剩余命令重新编译提案：diff 与草案都基于当前文档重算。
 *
 * 提案到达只增加右栏计数与草案条，不把右栏从检查器切走；只有用户点「查看变更」或
 * 全部采纳进入确认态时才切换页签。
 */
export class DesignerChangeController {
  #bar: HTMLElement | undefined;
  #pane: HTMLElement | undefined;
  #ghost: HTMLElement | undefined;
  #rightPanel: HTMLElement | undefined;
  #input: DesignerChangeProposalInput | undefined;
  #proposal: DesignerChangeProposal | undefined;
  #paneMode: RightPaneMode = 'inspector';
  #review: DesignerReviewMeta | undefined;
  #reviewTotal = 0;
  #comparing = false;
  #confirmAll = false;
  #feedback: DesignerChangeFeedback | undefined;
  #ghostHandlers: DesignerChangeGhostHandlers | undefined;
  #adoptHandler:
    | ((
        commands: readonly ScreenDocumentCommand[],
        provenance: ScreenTransactionProvenance,
      ) => DesignerChangeAdoptResult)
    | undefined;
  #getDocument: (() => ScreenDocument | undefined) | undefined;
  #getIntentScope: (() => ScreenIntentScope) | undefined;
  #startIntent: ((startsFrom?: 'metrics' | 'template' | 'prompt') => void) | undefined;
  #stateHandler: ((detail: BaseScreenDesignerChangeStateDetail) => void) | undefined;
  #paneModeHandler: ((mode: RightPaneMode) => void) | undefined;
  #lastRenderedPaneMode: RightPaneMode | undefined;
  #metricHandler: ((name: DesignerMetricName) => void) | undefined;
  #historyReader: (() => readonly ScreenHistoryNode[]) | undefined;
  #revertHandler: ((index: number) => void) | undefined;

  connect(bar: HTMLElement, pane: HTMLElement, ghost: HTMLElement, rightPanel: HTMLElement): void {
    this.#bar = bar;
    this.#pane = pane;
    this.#ghost = ghost;
    this.#rightPanel = rightPanel;
    this.render();
  }

  release(): void {
    this.#ghostHandlers = undefined;
    this.#adoptHandler = undefined;
    this.#getDocument = undefined;
    this.#getIntentScope = undefined;
    this.#bar = undefined;
    this.#pane = undefined;
    this.#ghost = undefined;
    this.#rightPanel = undefined;
    this.#input = undefined;
    this.#proposal = undefined;
    this.#paneMode = 'inspector';
    this.#lastRenderedPaneMode = undefined;
    this.#comparing = false;
    this.#confirmAll = false;
    this.#feedback = undefined;
  }

  setGhostHandlers(handlers: DesignerChangeGhostHandlers): void {
    this.#ghostHandlers = handlers;
  }

  setAdoptHandler(
    handler: (
      commands: readonly ScreenDocumentCommand[],
      provenance: ScreenTransactionProvenance,
    ) => DesignerChangeAdoptResult,
  ): void {
    this.#adoptHandler = handler;
  }

  setDocumentReader(reader: () => ScreenDocument | undefined): void {
    this.#getDocument = reader;
  }

  setIntentScopeReader(reader: () => ScreenIntentScope): void {
    this.#getIntentScope = reader;
  }

  setStateHandler(handler: (detail: BaseScreenDesignerChangeStateDetail) => void): void {
    this.#stateHandler = handler;
  }

  setPaneModeHandler(handler: (mode: RightPaneMode) => void): void {
    this.#paneModeHandler = handler;
  }

  setMetricHandler(handler: (name: DesignerMetricName) => void): void {
    this.#metricHandler = handler;
  }

  /** 历史段读 core 的节点列表；回退只移动指针，由 session 执行。 */
  setHistoryControls(
    reader: () => readonly ScreenHistoryNode[],
    revert: (index: number) => void,
  ): void {
    this.#historyReader = reader;
    this.#revertHandler = revert;
  }

  setStartIntentHandler(handler: (startsFrom?: 'metrics' | 'template' | 'prompt') => void): void {
    this.#startIntent = handler;
  }

  get pending(): DesignerChangeProposal | undefined {
    return this.#proposal;
  }

  get paneMode(): RightPaneMode {
    return this.#paneMode;
  }

  get reviewing(): boolean {
    return this.#review !== undefined;
  }

  /** 进入评审态：只读画布、强制切到智能体页签，逐条批准/驳回。 */
  enterReview(meta: DesignerReviewMeta = {}): void {
    this.#review = meta;
    this.#reviewTotal = this.#proposal?.units.length ?? 0;
    this.#paneMode = 'intent';
    this.render();
  }

  exitReview(): void {
    if (this.#review === undefined) return;
    this.#review = undefined;
    this.render();
  }

  /** 切到某一级页签；检查器与变更共享右栏，不销毁对方的状态。 */
  setPaneMode(mode: RightPaneMode): void {
    if (this.#paneMode === mode) return;
    this.#paneMode = mode;
    this.render();
  }

  /** 提交一份提案；已有待决草案时拒绝替换，并打开原草案供用户处理。 */
  submit(proposal: DesignerChangeProposal, input: DesignerChangeProposalInput): boolean {
    if (this.#proposal !== undefined) {
      this.#feedback = { kind: 'draft-pending' };
      this.#paneMode = 'intent';
      this.render();
      return false;
    }
    if (this.#ghostHandlers === undefined) return false;
    if (!this.mountGhost(proposal)) return false;
    this.#input = input;
    this.#proposal = proposal;
    this.#feedback = undefined;
    this.#metricHandler?.('draft_created');
    this.#comparing = false;
    this.#confirmAll = false;
    this.render();
    return true;
  }

  /** 采纳单个单元：提交该单元的命令，然后按剩余命令重建提案。 */
  adoptUnit(unitId: string): boolean {
    const proposal = this.#proposal;
    const handler = this.#adoptHandler;
    if (proposal === undefined || handler === undefined) return false;
    const unit = proposal.units.find((item) => item.id === unitId);
    if (unit === undefined) return false;
    const commands = proposal.commands.filter((_, index) => unit.commandIndexes.includes(index));
    if (!handler(commands, proposal.provenance).ok) {
      this.#feedback = { kind: 'adopt-failed', unitId };
      this.#paneMode = 'intent';
      this.render();
      return false;
    }
    this.#metricHandler?.('change_adopt');
    this.rebuild(proposal, unit.commandIndexes);
    return true;
  }

  /** 忽略单个单元：不写文档，只把它从待决集合里去掉。 */
  rejectUnit(unitId: string): boolean {
    const proposal = this.#proposal;
    if (proposal === undefined) return false;
    const unit = proposal.units.find((item) => item.id === unitId);
    if (unit === undefined) return false;
    this.#metricHandler?.('change_reject');
    this.rebuild(proposal, unit.commandIndexes);
    return true;
  }

  /** 全部采纳的第一步：切到智能体页签并进入确认态，不写文档。 */
  requestAdoptAll(): void {
    if (this.#proposal === undefined) return;
    this.#confirmAll = true;
    this.#paneMode = 'intent';
    this.render('request-adopt-all');
    this.#pane?.querySelector<HTMLButtonElement>('[data-change-action="adopt"]')?.focus();
  }

  cancelAdoptAll(): void {
    if (!this.#confirmAll) return;
    this.#confirmAll = false;
    this.render('adopt-all');
  }

  /** 全部采纳的第二步：整批命令作为一次事务提交。 */
  adoptAll(): boolean {
    if (!this.#confirmAll) return false;
    return this.adoptAllDirect();
  }

  /**
   * 程序化全部采纳：宿主显式调用即视为已确认，整批命令一次事务提交。
   * UI 仍走「请求 → 二次确认 → 采纳」，不经过这里。
   */
  adoptAllDirect(): boolean {
    const proposal = this.#proposal;
    const handler = this.#adoptHandler;
    if (proposal === undefined || handler === undefined) return false;
    if (!handler(proposal.commands, proposal.provenance).ok) {
      this.#feedback = { kind: 'adopt-failed' };
      this.#paneMode = 'intent';
      this.render();
      return false;
    }
    this.#metricHandler?.('change_adopt');
    this.clearDraft();
    return true;
  }

  discard(): void {
    if (this.#proposal === undefined) return;
    this.#metricHandler?.('draft_discarded');
    this.clearDraft();
  }

  onClick(target: Element): boolean {
    if (target.closest('[data-review-toggle]') !== null) {
      if (this.#review === undefined) this.enterReview();
      else this.exitReview();
      return true;
    }
    const paneTab = target.closest<HTMLElement>('[data-right-pane-tab]');
    if (paneTab !== null) {
      this.setPaneMode(parsePaneMode(paneTab.dataset.rightPaneTab));
      return true;
    }
    const action = target.closest<HTMLElement>('[data-change-action]');
    if (action === null) return false;
    const unitId = action.dataset.changeUnit;
    switch (action.dataset.changeAction) {
      case 'toggle-panel':
        this.setPaneMode(this.#paneMode === 'intent' ? 'inspector' : 'intent');
        return true;
      case 'toggle-compare':
        this.#comparing = !this.#comparing;
        this.render('toggle-compare');
        return true;
      case 'adopt-unit':
        if (unitId !== undefined) this.adoptUnit(unitId);
        return true;
      case 'reject-unit':
        if (unitId !== undefined) this.rejectUnit(unitId);
        return true;
      case 'request-adopt-all':
        this.requestAdoptAll();
        return true;
      case 'cancel-adopt-all':
        this.cancelAdoptAll();
        return true;
      case 'adopt':
        this.adoptAll();
        return true;
      case 'discard':
        this.discard();
        return true;
      case 'revert-history': {
        const index = Number(action.dataset.historyIndex);
        const node = this.#historyReader?.().find((item) => item.index === index);
        if (Number.isInteger(index) && node?.position === 'past' && this.#revertHandler) {
          this.#metricHandler?.('revert');
          this.#revertHandler?.(index);
        }
        return true;
      }
      case 'start-intent':
        this.#startIntent?.(
          action.dataset.changeStart === 'metrics' ||
            action.dataset.changeStart === 'template' ||
            action.dataset.changeStart === 'prompt'
            ? action.dataset.changeStart
            : undefined,
        );
        return true;
      case 'exit-review':
        this.exitReview();
        return true;
      default:
        return false;
    }
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (this.#confirmAll) {
      event.preventDefault();
      this.cancelAdoptAll();
      return true;
    }
    if (this.#paneMode === 'intent') {
      // 评审态固定停在智能体页签：切回检查器会让评审人失去批准/驳回入口。
      if (this.#review !== undefined) return false;
      event.preventDefault();
      this.setPaneMode('inspector');
      return true;
    }
    if (this.#proposal === undefined) return false;
    event.preventDefault();
    this.discard();
    return true;
  }

  private mountGhost(proposal: DesignerChangeProposal): boolean {
    if (this.#ghostHandlers === undefined) return false;
    // 子集更快更干净，但引用完整性（蓝图关系）可能让渲染失败：失败就退回整份候选。
    return (
      this.#ghostHandlers.render(ghostSubset(proposal)) ||
      this.#ghostHandlers.render(proposal.candidate)
    );
  }

  /** 用剩余命令重新编译；失效时移除幽灵层，但保留明确的就地反馈。 */
  private rebuild(proposal: DesignerChangeProposal, removedIndexes: readonly number[]): void {
    const remaining = proposal.commands.filter((_, index) => !removedIndexes.includes(index));
    const remainingCount = proposal.units.filter(
      (unit) => !unit.commandIndexes.some((index) => removedIndexes.includes(index)),
    ).length;
    const document = this.#getDocument?.();
    const input = this.#input;
    if (remaining.length === 0) {
      this.clearDraft();
      return;
    }
    if (document === undefined || input === undefined) {
      this.clearDraft({ kind: 'remaining-invalid', remainingCount });
      return;
    }
    const prepared = prepareDesignerChangeProposal(
      document,
      { ...input, commands: remaining },
      proposal.id,
    );
    if (!prepared.ok || !this.mountGhost(prepared.value)) {
      this.clearDraft({ kind: 'remaining-invalid', remainingCount });
      return;
    }
    this.#proposal = prepared.value;
    this.#feedback = undefined;
    this.#confirmAll = false;
    this.render();
  }

  private clearDraft(feedback?: DesignerChangeFeedback): void {
    this.#ghostHandlers?.clear();
    this.#feedback = feedback;
    if (feedback !== undefined) this.#paneMode = 'intent';
    this.#proposal = undefined;
    this.#input = undefined;
    this.#comparing = false;
    this.#confirmAll = false;
    this.render();
  }

  /**
   * 重渲染草案条会替换其子节点，正在聚焦的按钮随之消失、焦点掉回 body——键盘用户
   * 就此失去 Escape 通道。因此每次重渲染后把焦点还给同一个动作按钮。
   */
  private render(focusAction?: string): void {
    const proposal = this.#proposal;
    this.#stateHandler?.({
      pending: proposal !== undefined,
      unitCount: proposal?.units.length ?? 0,
      ...(proposal === undefined
        ? {}
        : {
            title: proposal.title,
            scope: proposal.scope,
            ...(proposal.origin === undefined ? {} : { origin: proposal.origin }),
          }),
    });
    const bar = this.#bar;
    const pane = this.#pane;
    const ghost = this.#ghost;
    const rightPanel = this.#rightPanel;
    if (rightPanel !== undefined) {
      rightPanel.dataset.rightPane = this.#paneMode;
      if (this.#lastRenderedPaneMode !== this.#paneMode) {
        this.#lastRenderedPaneMode = this.#paneMode;
        this.#paneModeHandler?.(this.#paneMode);
      }
      rightPanel
        .querySelector('[data-right-pane-tab="inspector"]')
        ?.setAttribute('aria-selected', String(this.#paneMode === 'inspector'));
      rightPanel
        .querySelector('[data-right-pane-tab="intent"]')
        ?.setAttribute('aria-selected', String(this.#paneMode === 'intent'));
      const count = rightPanel.querySelector<HTMLElement>('[data-change-count]');
      if (count !== null) renderChangeCount(count, proposal?.units.length ?? 0);
      const root = rightPanel.closest<HTMLElement>('.designer');
      if (root !== null) {
        if (this.#review === undefined) root.removeAttribute('data-review-mode');
        else root.dataset.reviewMode = 'true';
      }
    }
    if (bar !== undefined) {
      bar.hidden = proposal === undefined;
      if (proposal !== undefined)
        renderDraftBar(bar, proposal, this.#comparing, this.#paneMode === 'intent');
      if (focusAction !== undefined) {
        bar.querySelector<HTMLButtonElement>(`[data-change-action="${focusAction}"]`)?.focus();
      }
    }
    if (ghost !== undefined) ghost.hidden = proposal === undefined || this.#comparing;
    if (pane === undefined) return;
    const showPane = this.#paneMode === 'intent';
    pane.hidden = !showPane;
    if (showPane) {
      renderChangePane(
        pane,
        proposal,
        this.#confirmAll,
        {
          reviewing: this.#review !== undefined,
          meta: this.#review ?? {},
          total: this.#reviewTotal,
        },
        this.#historyReader?.(),
        this.#feedback,
        this.#getIntentScope?.(),
      );
    }
  }
}

/**
 * 草案层只挂受影响组件及其祖先。
 *
 * 两个原因：未变更组件在草案里没有信息量；而全量重渲染会把数据绑定组件的取数结果
 * 再走一遍，既产生重复请求，也让草案里出现与画布不一致的占位文案。
 */
function ghostSubset(proposal: DesignerChangeProposal): ScreenDocument {
  const byId = new Map(proposal.candidate.components.map((component) => [component.id, component]));
  const keep = new Set<string>();
  for (const componentId of proposal.affectedComponentIds) {
    let current = byId.get(componentId);
    while (current !== undefined && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  }
  return {
    ...proposal.candidate,
    components: proposal.candidate.components.filter((component) => keep.has(component.id)),
    blueprint: {
      ...proposal.candidate.blueprint,
      relations: proposal.candidate.blueprint.relations.filter((relation) => {
        if (relation.source.kind === 'component' && !keep.has(relation.source.componentId)) {
          return false;
        }
        if (relation.target.kind === 'component' && !keep.has(relation.target.componentId)) {
          return false;
        }
        return true;
      }),
    },
  };
}
