import type { ScreenIntentScope } from '@base-screen/contracts';
import type {
  DesignerIntentHandler,
  DesignerIntentOutcome,
  DesignerIntentRemedy,
} from '../../common/operations/intent/designer-intent.js';
import {
  type DesignerIntentCapabilityComponent,
  describeIntentCapability,
} from '../../common/operations/intent/designer-intent-capability.js';
import {
  type DesignerParameterPatch,
  matchDesignerParameterIntent,
} from '../../common/operations/intent/designer-parameter-intent.js';
import type { DesignerMetricName } from '../../common/observability/designer-metrics.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { adoptDesignerFormControls } from '../dom/designer-form-controls-dom.js';
import { escapeHtml } from '../dom/designer-html-escape.js';

type IntentConfirmKind = 'whole-screen' | 'remove-scope';

/**
 * 意图输入区：右栏底部常驻的「一句话 + 作用域」入口。
 *
 * 引擎只做三件事：把选区收敛成作用域、把文本与作用域结构化后交给宿主、把结果如实回显。
 * 它不调用模型、不猜指代、不流式输出正文；宿主没提供处理器时输入区停用并说明原因。
 * 作用域变更遵循三条规则：删除 chip 先追问、整屏提交二次确认、输入中选区变化只提示
 * 「更新作用域」而不静默改写。
 */
export class DesignerIntentController {
  #handler: DesignerIntentHandler | undefined;
  #input: HTMLTextAreaElement | undefined;
  #submit: HTMLButtonElement | undefined;
  #scope: HTMLElement | undefined;
  #capabilityAllows: HTMLElement | undefined;
  #capabilityBlocks: HTMLElement | undefined;
  #capabilityComponents: readonly DesignerIntentCapabilityComponent[] = [];
  #scopeClear: HTMLButtonElement | undefined;
  #status: HTMLElement | undefined;
  #confirm: HTMLElement | undefined;
  #instanceId = '';
  #scopeValue: ScreenIntentScope = { kind: 'screen' };
  #pendingScope: readonly string[] | undefined;
  #componentName: (id: string) => string | undefined = () => undefined;
  #lastSelectionKey = '';
  #scopeOverride = false;
  #pending = false;
  /** 进行中的生成；点取消或按 Esc 时 abort，宿主据此停手。 */
  #abort: AbortController | undefined;
  #confirmKind: IntentConfirmKind | undefined;
  #parameterHandler: ((patch: DesignerParameterPatch) => boolean) | undefined;
  #metricHandler: ((name: DesignerMetricName) => void) | undefined;
  #confirmText = '';
  /**
   * 「返回检查器」只是折叠书写面，不丢草稿：文字留在输入框里，`data-draft` 收起。
   * 一旦重新输入或点回输入框，就按「还在写」处理，书写面自己再撑开。
   */
  #draftCollapsed = false;

  setHandler(handler: DesignerIntentHandler | undefined): void {
    this.#handler = handler;
    this.render();
  }

  /** 数值类请求走本地通道：命中即改文档，不交给宿主、不调用模型。 */
  setParameterHandler(handler: (patch: DesignerParameterPatch) => boolean): void {
    this.#parameterHandler = handler;
  }

  setMetricHandler(handler: (name: DesignerMetricName) => void): void {
    this.#metricHandler = handler;
  }

  get available(): boolean {
    return this.#handler !== undefined;
  }

  get confirmOpen(): boolean {
    return this.#confirmKind !== undefined;
  }

  connect(
    instanceId: string,
    input: HTMLTextAreaElement,
    submit: HTMLButtonElement,
    scope: HTMLElement,
    /** 能力提示：随作用域说明这一轮能改什么，由 render 统一刷新。 */
    capability: HTMLElement,
    scopeClear: HTMLButtonElement,
    status: HTMLElement,
    confirm: HTMLElement,
  ): void {
    this.#instanceId = instanceId;
    this.#input = input;
    this.#submit = submit;
    this.#scope = scope;
    this.#capabilityAllows =
      capability.querySelector<HTMLElement>('[data-intent-allows]') ?? undefined;
    this.#capabilityBlocks =
      capability.querySelector<HTMLElement>('[data-intent-blocks]') ?? undefined;
    this.#scopeClear = scopeClear;
    this.#status = status;
    this.#confirm = confirm;
    this.#draftCollapsed = false;
    this.syncScope([], () => undefined);
    this.syncDraftState();
  }

  release(): void {
    this.#input = undefined;
    this.#submit = undefined;
    this.#scope = undefined;
    this.#capabilityAllows = undefined;
    this.#capabilityBlocks = undefined;
    this.#capabilityComponents = [];
    this.#scopeClear = undefined;
    this.#status = undefined;
    this.#confirm = undefined;
    this.#handler = undefined;
    this.#pending = false;
    this.#abort = undefined;
    this.#pendingScope = undefined;
    this.#confirmKind = undefined;
    this.#draftCollapsed = false;
  }

  /**
   * 选区变化时同步作用域：单组件给名称，多选给数量，空选为整屏。
   * 用户手动清掉作用域后，只有选区真的变化才会重新附着——避免下一次无关重渲染把
   * 「整屏」悄悄改回原来的选区。输入框里已有文字时，选区变化先挂起并提示更新，
   * 不静默改写正在表达的作用域。
   */
  syncScope(
    selectedComponentIds: readonly string[],
    componentName: (id: string) => string | undefined,
    components: readonly DesignerIntentCapabilityComponent[] = [],
  ): void {
    const ids = [...selectedComponentIds];
    this.#componentName = componentName;
    this.#capabilityComponents = components;
    const key = ids.join(',');
    if (key !== this.#lastSelectionKey) {
      this.#lastSelectionKey = key;
      this.#scopeOverride = false;
      if (this.composing()) {
        this.#pendingScope = ids;
        this.renderStatus();
        this.render();
        return;
      }
      this.#pendingScope = undefined;
    }
    if (this.#scopeOverride || ids.length === 0) {
      this.#scopeValue = { kind: 'screen' };
      if (this.#scope !== undefined) this.#scope.textContent = DESIGNER_UI_TEXT.intent.scopeScreen;
      this.render();
      return;
    }
    this.#scopeValue = { kind: 'components', componentIds: ids };
    this.setScopeLabel(ids);
    this.render();
  }

  /** 输入框内容变化：从「输入中」回到空闲时，把挂起的选区变化并入作用域。 */
  onInput(): void {
    const input = this.#input;
    if (input === undefined) return;
    // 折叠态下继续打字 = 回到书写面，不要求用户先找「展开」。
    this.#draftCollapsed = false;
    if (input.value.trim() === '' && this.#pendingScope !== undefined) {
      this.applyPendingScope();
    }
    this.syncDraftState();
    this.renderStatus();
  }

  async submit(): Promise<void> {
    const handler = this.#handler;
    const input = this.#input;
    if (handler === undefined || input === undefined || this.#pending) return;
    const text = input.value.trim();
    if (text === '') {
      this.setStatus(DESIGNER_UI_TEXT.intent.empty, 'info');
      return;
    }
    if (this.#pendingScope !== undefined) {
      this.setStatus(
        DESIGNER_UI_TEXT.intent.scopePending,
        'info',
        DESIGNER_UI_TEXT.intent.updateScope,
      );
      return;
    }
    const parameter = matchDesignerParameterIntent(text);
    if (parameter !== null) {
      if (this.#parameterHandler?.(parameter) === true) {
        this.#metricHandler?.('parameter_route');
        input.value = '';
        this.setStatus(
          DESIGNER_UI_TEXT.intent.parameterApplied(parameter.label, String(parameter.value)),
          'info',
        );
        this.render();
        return;
      }
      this.setStatus(DESIGNER_UI_TEXT.intent.parameterNoSelection, 'info');
      return;
    }
    if (this.#scopeValue.kind === 'screen') {
      this.#metricHandler?.('clarify_open');
      this.openConfirm('whole-screen', text);
      return;
    }
    await this.dispatch(text, this.#scopeValue);
  }

  onClick(target: Element): boolean {
    if (target.closest('[data-intent-scope-clear]') !== null) {
      if (this.#scopeValue.kind === 'screen') return true;
      this.openConfirm('remove-scope', '');
      return true;
    }
    const confirmAction = target.closest<HTMLElement>('[data-intent-confirm-action]');
    if (confirmAction !== null) {
      this.handleConfirm(confirmAction.dataset.intentConfirmAction);
      return true;
    }
    const statusAction = target.closest<HTMLElement>('[data-intent-action]');
    if (statusAction !== null) {
      const action = statusAction.dataset.intentAction;
      if (action === 'update-scope') this.applyPendingScope();
      else if (action === 'cancel-intent') this.cancelPending();
      else if (action === 'exit-draft') this.exitDraft();
      else if (action === 'retry-intent') this.retry();
      else if (action === 'submit-whole-screen') this.submitAsWholeScreen();
      return true;
    }
    // 折叠态下点回输入框就是「接着写」：把书写面撑开，但不吞事件——焦点仍交给浏览器。
    if (target.closest('[data-intent-input]') !== null) {
      this.resumeDraft();
      return false;
    }
    if (target.closest('[data-intent-submit]') === null) return false;
    void this.submit();
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.#confirmKind !== undefined) {
      event.preventDefault();
      this.closeConfirm();
      return true;
    }
    // 确认层在生成之上：先关弹窗，再取消生成，顺序反了会让用户以为弹窗自己消失了。
    if (event.key === 'Escape' && this.#pending) {
      event.preventDefault();
      this.cancelPending();
      return true;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.target !== this.#input) return false;
    event.preventDefault();
    void this.submit();
    return true;
  }

  /** 起点牌把「从什么起」带进来：只影响这一轮意图，提交后清空。 */
  focus(startsFrom?: 'metrics' | 'template' | 'prompt'): void {
    this.#startsFrom = startsFrom;
    this.#draftCollapsed = false;
    this.syncDraftState();
    this.#input?.focus();
  }

  #startsFrom: 'metrics' | 'template' | 'prompt' | undefined;

  /**
   * 输入框随内容长高，上限交给 CSS 的 max-height 兜住。
   * 固定 `rows=2` 时，长指令只在 36px 里内部滚动：用户读不回顾已写的内容，
   * 也看不出下面还有字。
   *
   * 有草稿时反过来：把高度交回 CSS，让书写面拉伸占满右栏（见 data-draft 的样式）。
   * 写一句话的同时盯着一屏属性表既挤也没有用——空稿才回到两行。
   */
  private syncDraftState(): void {
    const input = this.#input;
    if (input === undefined) return;
    const composing = input.value.trim() !== '';
    // 有字但被「返回检查器」折叠过：仍算空闲态，否则那个出口点了也不会有反应。
    const draft = composing && !this.#draftCollapsed;
    const composer = input.closest('.designer-intent');
    if (composer !== null) composer.toggleAttribute('data-draft', draft);
    if (draft) {
      input.style.height = '';
      return;
    }
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  private composing(): boolean {
    const input = this.#input;
    return input !== undefined && input.value.trim() !== '';
  }

  private async dispatch(text: string, scope: ScreenIntentScope): Promise<void> {
    const handler = this.#handler;
    const input = this.#input;
    if (handler === undefined || input === undefined) return;
    this.#pending = true;
    this.#metricHandler?.('intent_submit');
    const abort = new AbortController();
    this.#abort = abort;
    this.setStatus(
      DESIGNER_UI_TEXT.intent.generating,
      'info',
      DESIGNER_UI_TEXT.intent.cancelPending,
      'cancel-intent',
    );
    this.render();
    // 提交后焦点必须先落回影子根里：输入框在生成中会被禁用，焦点留在它上面会掉到
    // <body>，而 Esc 与快捷键都挂在影子根上——按下去什么也不会发生，取消按钮也点不到。
    this.focusIntentArea();
    let result: DesignerIntentOutcome;
    try {
      result = await handler(
        {
          instanceId: this.#instanceId,
          text,
          scope,
          ...(this.#startsFrom === undefined ? {} : { startsFrom: this.#startsFrom }),
        },
        abort.signal,
      );
    } catch {
      result = { ok: false, diagnostics: [] };
    }
    // 取消以用户动作为准：宿主即使已经返回成功，也不再落成提案。
    const cancelled = abort.signal.aborted;
    if (this.#abort === abort) this.#abort = undefined;
    this.#pending = false;
    this.#startsFrom = undefined;
    if (cancelled) {
      this.setStatus(DESIGNER_UI_TEXT.intent.cancelled, 'info');
    } else if (result.ok) {
      input.value = '';
      this.syncDraftState();
      this.setStatus(DESIGNER_UI_TEXT.intent.pending, 'info');
      // 生成期间选区变化过：输入已清空，把挂起的选区并入作用域，保持 chip 与画布一致。
      if (this.#pendingScope !== undefined) this.applyPendingScope();
    } else {
      // 失败/被拒都留在这一行里：原因（宿主给）+ 继续走的动作，不再只在 4 秒 toast 里说。
      this.setFailure(result.reason, result.remedy);
    }
    this.render();
    this.restoreInputFocus();
  }

  /**
   * 重试上一轮失败/被拒的意图：同一句话、当前作用域，**不再重复整屏二次确认**——
   * 用户刚刚已经就这句话确认过整屏了，再问一次只是把失败当成了重新开始。
   */
  retry(): void {
    const input = this.#input;
    if (input === undefined || this.#pending) return;
    const text = input.value.trim();
    if (text === '') {
      this.setStatus(DESIGNER_UI_TEXT.intent.empty, 'info');
      return;
    }
    void this.dispatch(text, this.#scopeValue);
  }

  /**
   * 组件作用域被拒时的出口：解除作用域并按整屏重发同一句话。
   * 「改用整屏」是用户的决定，所以这里直接发，不再问一遍「确认整屏作用域」。
   */
  submitAsWholeScreen(): void {
    const input = this.#input;
    if (input === undefined || this.#pending) return;
    const text = input.value.trim();
    if (text === '') {
      this.setStatus(DESIGNER_UI_TEXT.intent.empty, 'info');
      return;
    }
    this.#scopeOverride = true;
    this.#pendingScope = undefined;
    this.#scopeValue = { kind: 'screen' };
    if (this.#scope !== undefined) this.#scope.textContent = DESIGNER_UI_TEXT.intent.scopeScreen;
    this.render();
    void this.dispatch(text, { kind: 'screen' });
  }

  /** 取消进行中的生成：只中断等待，输入与选区都保留，不留半成品。 */
  cancelPending(): boolean {
    const abort = this.#abort;
    if (abort === undefined) return false;
    abort.abort();
    return true;
  }

  /**
   * 会话态退场：书写面收回两行，右栏交还检查器——**但草稿留下**。
   *
   * 这里曾经直接 `input.value = ''`：一次误点就把写了一半的句子连换行一起删掉，无确认、
   * 无撤销、也没有提示。清空只在提交成功时发生（那是真的用掉了）；退场只是折叠，
   * 文字还在输入框里，点回输入框或继续打字就重新撑开。
   */
  exitDraft(): void {
    const input = this.#input;
    if (input === undefined) return;
    const draft = input.value.trim() !== '';
    this.#draftCollapsed = draft;
    this.syncDraftState();
    this.setStatus(draft ? DESIGNER_UI_TEXT.intent.draftKept : '', 'info');
    this.render();
  }

  /** 折叠态下接着写：重新撑开书写面（不动文字、不动作用域）。 */
  private resumeDraft(): void {
    if (!this.#draftCollapsed) return;
    this.#draftCollapsed = false;
    this.syncDraftState();
    this.render();
  }

  private handleConfirm(action: string | undefined): void {
    if (action === 'cancel') {
      this.closeConfirm();
      return;
    }
    if (action === 'whole-screen' && this.#confirmKind === 'whole-screen') {
      const text = this.#confirmText;
      this.closeConfirm();
      if (text !== '') void this.dispatch(text, { kind: 'screen' });
      return;
    }
    if (action === 'remove-scope' && this.#confirmKind === 'remove-scope') {
      this.#scopeOverride = true;
      this.#pendingScope = undefined;
      this.#scopeValue = { kind: 'screen' };
      if (this.#scope !== undefined) this.#scope.textContent = DESIGNER_UI_TEXT.intent.scopeScreen;
      this.closeConfirm();
      this.setStatus('', 'info');
      this.render();
      return;
    }
    this.closeConfirm();
  }

  private applyPendingScope(): void {
    const ids = this.#pendingScope;
    if (ids === undefined) return;
    this.#pendingScope = undefined;
    if (ids.length === 0) {
      this.#scopeValue = { kind: 'screen' };
      if (this.#scope !== undefined) this.#scope.textContent = DESIGNER_UI_TEXT.intent.scopeScreen;
    } else {
      this.#scopeValue = { kind: 'components', componentIds: [...ids] };
      this.setScopeLabel(ids);
    }
    this.setStatus('', 'info');
    this.render();
  }

  private setScopeLabel(ids: readonly string[]): void {
    if (this.#scope === undefined) return;
    const names = ids.map((id) => this.#componentName(id) ?? id);
    this.#scope.textContent =
      names.length <= 2 ? names.join('、') : DESIGNER_UI_TEXT.intent.scopeComponents(names.length);
  }

  private openConfirm(kind: IntentConfirmKind, text: string): void {
    this.#confirmKind = kind;
    this.#confirmText = text;
    this.renderConfirm();
  }

  private closeConfirm(): void {
    this.#confirmKind = undefined;
    this.#confirmText = '';
    if (this.#confirm !== undefined) {
      this.#confirm.hidden = true;
      this.#confirm.replaceChildren();
    }
    this.#input?.focus();
  }

  private renderConfirm(): void {
    const confirm = this.#confirm;
    const kind = this.#confirmKind;
    if (confirm === undefined || kind === undefined) return;
    const text = DESIGNER_UI_TEXT.intent;
    const title = kind === 'whole-screen' ? text.wholeScreenTitle : text.scopeClearTitle;
    const body = kind === 'whole-screen' ? text.wholeScreenBody : text.scopeClearBody;
    const action = kind === 'whole-screen' ? 'whole-screen' : 'remove-scope';
    const actionLabel = kind === 'whole-screen' ? text.wholeScreenConfirm : text.scopeClearConfirm;
    const cancelLabel = kind === 'whole-screen' ? text.confirmCancel : text.scopeClearCancel;
    confirm.hidden = false;
    confirm.innerHTML = `<strong class="intent-confirm-title">${escapeHtml(title)}</strong>
      <p class="intent-confirm-copy">${escapeHtml(body)}</p>
      <div class="intent-confirm-actions">
        <button type="button" class="designer-control designer-button" data-variant="ghost" data-intent-confirm-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="designer-control designer-button" data-variant="primary" data-intent-confirm-action="${action}">${escapeHtml(actionLabel)}</button>
      </div>`;
    adoptDesignerFormControls(confirm);
    confirm.querySelector<HTMLButtonElement>(`[data-intent-confirm-action="${action}"]`)?.focus();
  }

  private renderStatus(): void {
    if (this.#pendingScope === undefined) return;
    if (this.#status === undefined) return;
    this.setStatus(
      DESIGNER_UI_TEXT.intent.scopePending,
      'info',
      DESIGNER_UI_TEXT.intent.updateScope,
    );
  }

  private setStatus(
    text: string,
    tone: 'info' | 'error',
    action?: string,
    actionId = 'update-scope',
  ): void {
    const status = this.#status;
    if (status === undefined) return;
    status.dataset.tone = tone;
    status.removeAttribute('data-variant');
    if (text === '') {
      status.replaceChildren();
      return;
    }
    status.innerHTML = `<span>${escapeHtml(text)}</span>${
      action === undefined
        ? ''
        : `<button type="button" class="intent-status-action designer-control designer-button" data-variant="ghost" data-intent-action="${escapeHtml(actionId)}">${escapeHtml(action)}</button>`
    }`;
    adoptDesignerFormControls(status);
  }

  /**
   * 失败/被拒是一条**常驻**结论：一句原因 + 至少一个能继续走的动作。
   *
   * 原因由宿主给（`reason`），引擎只在宿主没给时兜一句「提交失败」，绝不替宿主编原因——
   * 只有宿主知道是模型报错、文档结构不合法，还是它根本不理解这个作用域。宿主给出补救
   * 动作（`remedy`）时，主按钮就是那个动作，不需要用户自己去改作用域重来。
   */
  private setFailure(reason: string | undefined, remedy: DesignerIntentRemedy | undefined): void {
    const status = this.#status;
    if (status === undefined) return;
    const text = DESIGNER_UI_TEXT.intent;
    const remedyButton =
      remedy === 'whole-screen'
        ? `<button type="button" class="intent-status-action designer-control designer-button" data-variant="primary" data-intent-action="submit-whole-screen">${escapeHtml(text.retryWholeScreen)}</button>`
        : '';
    status.dataset.tone = 'error';
    status.dataset.variant = 'failure';
    status.innerHTML = `<span>${escapeHtml(reason ?? text.failed)}</span>
      <span class="intent-status-actions">${remedyButton}<button type="button" class="intent-status-action designer-control designer-button" data-variant="ghost" data-intent-action="retry-intent">${escapeHtml(text.retry)}</button></span>`;
    adoptDesignerFormControls(status);
  }

  private composer(): HTMLElement | null {
    return this.#input?.closest<HTMLElement>('.designer-intent') ?? null;
  }

  /**
   * 生成一开始就把焦点交给意图区：输入框此刻是禁用的，焦点留在它上面会掉到 `<body>`，
   * 而 Esc 与取消按钮都在影子根里监听——焦点出去之后，取消就再也按不到了。
   */
  private focusIntentArea(): void {
    this.composer()?.focus();
  }

  /** 生成结束后把焦点交还输入框；用户已经点到别处就不抢。 */
  private restoreInputFocus(): void {
    const input = this.#input;
    if (input === undefined || input.disabled) return;
    const root = input.getRootNode() as { activeElement?: Element | null };
    const active = root.activeElement ?? null;
    // 焦点为 null 说明刚才那个节点（取消按钮）已被本次重渲染拆掉，不是用户自己移开的。
    if (active !== null && active !== this.composer()) return;
    input.focus();
  }

  private render(): void {
    const available = this.#handler !== undefined;
    if (this.#input !== undefined) {
      this.#input.disabled = !available || this.#pending;
      this.#input.placeholder = available
        ? DESIGNER_UI_TEXT.intent.placeholder
        : DESIGNER_UI_TEXT.intent.unavailable;
    }
    if (this.#submit !== undefined) this.#submit.disabled = !available || this.#pending;
    if (this.#capabilityAllows !== undefined && this.#capabilityBlocks !== undefined) {
      // 作用域已解除时提示回到整屏：用户清掉 chip 之后，选区还在画布上，
      // 但这一轮意图的对象已经变成整屏，提示不能继续按旧选区说。
      const capability =
        this.#scopeValue.kind === 'screen'
          ? {
              allows: DESIGNER_UI_TEXT.intent.capability.screenAllows,
              blocks: DESIGNER_UI_TEXT.intent.capability.screenBlocks,
            }
          : describeIntentCapability(this.#capabilityComponents);
      this.#capabilityAllows.textContent = capability.allows;
      this.#capabilityBlocks.textContent = capability.blocks;
    }
    if (this.#scopeClear !== undefined) {
      this.#scopeClear.hidden = this.#scopeValue.kind === 'screen';
    }
  }
}
