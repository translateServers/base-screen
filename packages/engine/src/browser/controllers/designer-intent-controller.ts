import type {
  ScreenIntentReference,
  ScreenIntentReferenceCatalogPort,
  ScreenIntentReferenceOption,
  ScreenIntentScope,
} from '@base-screen/contracts';
import type { DesignerMetricName } from '../../common/observability/designer-metrics.js';
import type {
  DesignerIntentHandler,
  DesignerIntentOutcome,
  DesignerIntentRemedy,
} from '../../common/operations/intent/designer-intent.js';
import {
  type DesignerParameterPatch,
  matchDesignerParameterIntent,
} from '../../common/operations/intent/designer-parameter-intent.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../dom/designer-icons.js';
import { createIntentReferencePicker } from '../dom/intent/designer-intent-reference-picker-dom.js';

/** 一屏里能挂的引用上限：再多也不会被模型用全，只会把输入区撑高。 */
const INTENT_REFERENCE_LIMIT = 8;
/** 选择器每页条数：首屏与「继续滚动」都按这个粒度取。 */
const INTENT_REFERENCE_PAGE = 20;

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
  #writingMode = false;
  #refsHost: HTMLElement | undefined;
  #refAdd: HTMLButtonElement | undefined;
  #catalog: ScreenIntentReferenceCatalogPort | undefined;
  #references: readonly ScreenIntentReferenceOption[] = [];
  #picker: ReturnType<typeof createIntentReferencePicker> | undefined;
  #overlayHost: () => HTMLElement | undefined = () => undefined;

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

  /** 智能体页签接管右栏时，输入框高度由 CSS 布局决定，清除自动增高写入的内联值。 */
  setWritingMode(active: boolean): void {
    this.#writingMode = active;
    if (active) this.syncDraftState();
    // 右栏换页会重渲染输入区，浮层挂在 overlay host 里不会自己消失。
    this.closeReferencePicker(false);
  }

  get available(): boolean {
    return this.#handler !== undefined;
  }

  get confirmOpen(): boolean {
    return this.#confirmKind !== undefined;
  }

  get scope(): ScreenIntentScope {
    return this.#scopeValue;
  }

  connect(
    instanceId: string,
    input: HTMLTextAreaElement,
    submit: HTMLButtonElement,
    scope: HTMLElement,
    scopeClear: HTMLButtonElement,
    status: HTMLElement,
    confirm: HTMLElement,
    refsHost: HTMLElement,
    refAdd: HTMLButtonElement,
  ): void {
    this.#instanceId = instanceId;
    this.#input = input;
    this.#submit = submit;
    this.#scope = scope;
    this.#scopeClear = scopeClear;
    this.#status = status;
    this.#confirm = confirm;
    this.#refsHost = refsHost;
    this.#refAdd = refAdd;
    this.syncScope([], () => undefined);
    this.syncDraftState();
  }

  release(): void {
    this.#input = undefined;
    this.#submit = undefined;
    this.#scope = undefined;
    this.#scopeClear = undefined;
    this.#status = undefined;
    this.#confirm = undefined;
    this.#refsHost = undefined;
    this.#refAdd = undefined;
    this.#picker?.dispose();
    this.#picker = undefined;
    this.#references = [];
    this.#handler = undefined;
    this.#pending = false;
    this.#abort = undefined;
    this.#pendingScope = undefined;
    this.#confirmKind = undefined;
    this.#writingMode = false;
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
  ): void {
    const ids = [...selectedComponentIds];
    this.#componentName = componentName;
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
  onInput(event?: InputEvent): void {
    const input = this.#input;
    if (input === undefined) return;
    if (input.value.trim() === '' && this.#pendingScope !== undefined) {
      this.applyPendingScope();
    }
    if (this.shouldOpenPicker(event)) {
      this.#options = [];
      this.#optionsQuery = '';
      this.openReferencePicker(true);
      void this.loadOptions({ query: '', append: false });
    }
    this.syncDraftState();
    this.renderStatus();
  }

  /**
   * `@` 才开选择器：用 `InputEvent.data` 判别而不是 keydown，输入法合成期不会给出单个 `@`；
   * 再要求「前面是行首或空白」，邮箱与正文里本来就有的 `@` 不会误触。
   */
  private shouldOpenPicker(event: InputEvent | undefined): boolean {
    if (event === undefined || this.#catalog === undefined || this.#pending) return false;
    if (event.isComposing === true) return false;
    if (event.inputType !== 'insertText' || event.data !== '@') return false;
    const input = this.#input;
    const caret = input?.selectionStart ?? 0;
    const before = (input?.value ?? '').slice(0, Math.max(0, caret - 1));
    // 中文写句子不空格（「用@」也要能弹），只把邮箱本地部分的字符排除掉：
    // `a@b.com` 不弹，`用@`、`：@`、行首 `@` 都弹。
    return before === '' || !/[A-Za-z0-9._%+-]$/.test(before);
  }

  /** 引用目录端口：宿主不实现时 `+` 与 `@` 都不出现，输入区退化成今天的纯文本。 */
  setReferenceCatalog(catalog: ScreenIntentReferenceCatalogPort | undefined): void {
    this.#catalog = catalog;
    if (catalog === undefined) this.closeReferencePicker(false);
    this.render();
  }

  setOverlayHost(host: () => HTMLElement | undefined): void {
    this.#overlayHost = host;
  }

  get references(): readonly ScreenIntentReference[] {
    return this.#references.map((item) =>
      item.kind === 'asset'
        ? { kind: 'asset', assetId: item.id, name: item.label }
        : { kind: 'dataset', datasetId: item.id, name: item.label },
    );
  }

  private openReferencePicker(focusSearch: boolean): void {
    if (this.#catalog === undefined) return;
    const picker = this.picker();
    if (picker === undefined) return;
    picker.open(focusSearch);
    this.#refAdd?.setAttribute('aria-expanded', 'true');
  }

  private closeReferencePicker(restoreFocus: boolean): void {
    this.#picker?.close(restoreFocus);
    this.#refAdd?.setAttribute('aria-expanded', 'false');
  }

  private picker(): ReturnType<typeof createIntentReferencePicker> | undefined {
    if (this.#catalog === undefined) return undefined;
    if (this.#picker !== undefined) return this.#picker;
    this.#picker = createIntentReferencePicker({
      ownerDocument: this.#input?.ownerDocument ?? document,
      anchor: () => this.#refAdd,
      overlayHost: this.#overlayHost,
      options: () => this.#options,
      total: () => this.#optionsTotal,
      hasMore: () => this.optionsHasMore,
      onQuery: (query) => {
        void this.loadOptions({ query, append: false });
      },
      onLoadMore: () => {
        if (!this.optionsHasMore) return;
        void this.loadOptions({ query: this.#optionsQuery, append: true });
      },
      onSelect: (option) => this.addReference(option),
      onClose: () => this.#refAdd?.setAttribute('aria-expanded', 'false'),
    });
    return this.#picker;
  }

  #options: readonly ScreenIntentReferenceOption[] = [];
  #optionsQuery = '';
  #optionsTotal: number | undefined;
  #optionsLoading = false;

  /**
   * 拉一页目录。宿主素材上千，所以永远带 `limit` + `offset`：
   * 首屏 20 条，输入关键字重查，滚到底追加下一页。
   */
  private async loadOptions(page: { query: string; append: boolean }): Promise<void> {
    const catalog = this.#catalog;
    if (catalog === undefined || this.#optionsLoading) return;
    this.#optionsLoading = true;
    if (!page.append) this.#optionsQuery = page.query;
    try {
      const abort = new AbortController();
      const result = await catalog.catalog({
        kinds: ['asset', 'dataset'],
        query: page.query,
        limit: INTENT_REFERENCE_PAGE,
        offset: page.append ? this.#options.length : 0,
        signal: abort.signal,
      });
      if (!result.ok) return;
      const items = result.value.items;
      this.#options = page.append ? [...this.#options, ...items] : items;
      this.#optionsTotal = result.value.total;
      this.#picker?.render();
    } finally {
      this.#optionsLoading = false;
    }
  }

  /** 本页是否还有下一页：有 total 用它，没有就按「本页是否取满」判断。 */
  private get optionsHasMore(): boolean {
    if (this.#optionsTotal !== undefined) return this.#options.length < this.#optionsTotal;
    return this.#options.length > 0 && this.#options.length % INTENT_REFERENCE_PAGE === 0;
  }

  /** 加一条引用。除选择器外，宿主也可以在打开输入区前预置引用。 */
  addReference(option: ScreenIntentReferenceOption): void {
    const exists = this.#references.some(
      (item) => item.kind === option.kind && item.id === option.id,
    );
    if (exists) {
      this.setStatus(DESIGNER_UI_TEXT.intent.referenceDuplicate, 'info');
      return;
    }
    if (this.#references.length >= INTENT_REFERENCE_LIMIT) {
      this.setStatus(DESIGNER_UI_TEXT.intent.referenceLimit(INTENT_REFERENCE_LIMIT), 'info');
      return;
    }
    this.#references = [...this.#references, option];
    this.renderReferences();
    // 触发用的 @ 只起打开作用，落成 chip 之后把它从正文里去掉，别留一个孤零零的符号。
    const input = this.#input;
    if (input !== undefined) {
      const caret = input.selectionStart ?? input.value.length;
      if (caret > 0 && input.value[caret - 1] === '@') {
        input.value = `${input.value.slice(0, caret - 1)}${input.value.slice(caret)}`;
        input.selectionStart = caret - 1;
        input.selectionEnd = caret - 1;
      }
    }
    this.#input?.focus();
  }

  private removeReference(kind: string, id: string): void {
    this.#references = this.#references.filter((item) => !(item.kind === kind && item.id === id));
    this.renderReferences();
    this.#input?.focus();
  }

  private renderReferences(): void {
    const host = this.#refsHost;
    if (host === undefined) return;
    // 单测环境没有 DOM（仓库不用 jsdom），chip 渲染交给集成/浏览器验证。
    if (host.ownerDocument === undefined) return;
    host.replaceChildren();
    host.hidden = this.#references.length === 0;
    for (const item of this.#references) {
      const chip = host.ownerDocument.createElement('span');
      chip.className = 'intent-ref-chip';
      chip.dataset.intentRef = `${item.kind}:${item.id}`;

      const icon = host.ownerDocument.createElement('span');
      icon.className = 'intent-ref-chip-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = designerIcon(item.kind === 'asset' ? 'image' : 'table');
      chip.append(icon);

      const name = host.ownerDocument.createElement('span');
      name.className = 'intent-ref-chip-name';
      name.textContent = item.label;
      chip.append(name);

      const remove = host.ownerDocument.createElement('button');
      remove.type = 'button';
      remove.className = 'intent-ref-chip-remove';
      remove.dataset.intentRefRemove = `${item.kind}:${item.id}`;
      remove.setAttribute('aria-label', DESIGNER_UI_TEXT.intent.referenceRemove(item.label));
      remove.innerHTML = designerIcon('close');
      chip.append(remove);

      host.append(chip);
    }
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
    if (target.closest('[data-intent-ref-add]') !== null) {
      if (this.#picker?.isOpen() === true) this.closeReferencePicker(false);
      else {
        this.#options = [];
        this.#optionsQuery = '';
        void this.loadOptions({ query: '', append: false }).then(() =>
          this.openReferencePicker(false),
        );
      }
      return true;
    }
    const chipRemove = target.closest<HTMLElement>('[data-intent-ref-remove]');
    if (chipRemove !== null) {
      const [kind, ...rest] = (chipRemove.dataset.intentRefRemove ?? '').split(':');
      if (kind !== undefined) this.removeReference(kind, rest.join(':'));
      return true;
    }
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
      else if (action === 'retry-intent') this.retry();
      else if (action === 'submit-whole-screen') this.submitAsWholeScreen();
      return true;
    }
    if (target.closest('[data-intent-submit]') === null) return false;
    void this.submit();
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    // 浮层开着时键盘归它：否则 Enter 会先被 submit 吃掉、Esc 会先退页签。
    if (this.#picker?.isOpen() === true && this.#picker.handleKeyDown(event)) return true;
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
    if (event.isComposing) return false;
    if (event.key !== 'Enter' || event.shiftKey || event.target !== this.#input) return false;
    event.preventDefault();
    void this.submit();
    return true;
  }

  /** 起点牌把「从什么起」带进来：只影响这一轮意图，提交后清空。 */
  /**
   * 输入框随内容长高，上限交给 CSS 的 max-height 兜住。
   * 固定 `rows=2` 时，长指令只在 36px 里内部滚动：用户读不回顾已写的内容，
   * 也看不出下面还有字。
   *
   * 智能体页签或已有草稿时反过来：把高度交回 CSS，让书写面拉伸占满右栏。
   * 写一句话的同时盯着一屏属性表既挤也没有用——检查器里才回到两行。
   */
  private syncDraftState(): void {
    const input = this.#input;
    if (input === undefined) return;
    const draft = input.value.trim() !== '';
    const composer = input.closest('.designer-intent');
    if (composer !== null) composer.toggleAttribute('data-draft', draft);
    if (draft || this.#writingMode) {
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
      // 空态只剩「从一句话起」一个入口，引擎不再区分起点；`startsFrom` 仍是宿主契约里的
      // 可选字段（宿主自建入口时可自行填），引擎侧不再产生它。
      const references = this.references;
      result = await handler(
        {
          instanceId: this.#instanceId,
          text,
          scope,
          ...(references.length === 0 ? {} : { references }),
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
    if (cancelled) {
      this.setStatus(DESIGNER_UI_TEXT.intent.cancelled, 'info');
    } else if (result.ok) {
      input.value = '';
      // 引用是这一句话的一部分：提交成功才随文本一起清掉，失败时留着让用户重试。
      this.#references = [];
      this.renderReferences();
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
    if (this.#refAdd !== undefined) {
      // 没有目录端口就不出现入口：与其给一个点了没反应的按钮，不如让输入区保持纯文本。
      this.#refAdd.hidden = this.#catalog === undefined || !available;
      this.#refAdd.disabled = this.#pending;
    }
    if (this.#scopeClear !== undefined) {
      this.#scopeClear.hidden = this.#scopeValue.kind === 'screen';
    }
  }
}
