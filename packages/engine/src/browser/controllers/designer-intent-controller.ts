import type { ScreenIntentScope, ScreenParseResult } from '@base-screen/contracts';
import type { DesignerIntentHandler } from '../../common/operations/intent/designer-intent.js';
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
  #confirmKind: IntentConfirmKind | undefined;
  #confirmText = '';

  setHandler(handler: DesignerIntentHandler | undefined): void {
    this.#handler = handler;
    this.render();
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
    scopeClear: HTMLButtonElement,
    status: HTMLElement,
    confirm: HTMLElement,
  ): void {
    this.#instanceId = instanceId;
    this.#input = input;
    this.#submit = submit;
    this.#scope = scope;
    this.#scopeClear = scopeClear;
    this.#status = status;
    this.#confirm = confirm;
    this.syncScope([], () => undefined);
  }

  release(): void {
    this.#input = undefined;
    this.#submit = undefined;
    this.#scope = undefined;
    this.#scopeClear = undefined;
    this.#status = undefined;
    this.#confirm = undefined;
    this.#handler = undefined;
    this.#pending = false;
    this.#pendingScope = undefined;
    this.#confirmKind = undefined;
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
  onInput(): void {
    const input = this.#input;
    if (input === undefined) return;
    if (input.value.trim() === '' && this.#pendingScope !== undefined) {
      this.applyPendingScope();
    }
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
    if (this.#scopeValue.kind === 'screen') {
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
      if (statusAction.dataset.intentAction === 'update-scope') this.applyPendingScope();
      return true;
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
    if (event.key !== 'Enter' || event.shiftKey || event.target !== this.#input) return false;
    event.preventDefault();
    void this.submit();
    return true;
  }

  focus(): void {
    this.#input?.focus();
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
    this.setStatus(DESIGNER_UI_TEXT.intent.generating, 'info');
    this.render();
    let result: ScreenParseResult<null>;
    try {
      result = await handler({ instanceId: this.#instanceId, text, scope });
    } catch {
      result = { ok: false, diagnostics: [] };
    }
    this.#pending = false;
    if (result.ok) {
      input.value = '';
      this.setStatus(DESIGNER_UI_TEXT.intent.pending, 'info');
      // 生成期间选区变化过：输入已清空，把挂起的选区并入作用域，保持 chip 与画布一致。
      if (this.#pendingScope !== undefined) this.applyPendingScope();
    } else {
      this.setStatus(DESIGNER_UI_TEXT.intent.failed, 'error');
    }
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

  private setStatus(text: string, tone: 'info' | 'error', action?: string): void {
    const status = this.#status;
    if (status === undefined) return;
    status.dataset.tone = tone;
    if (text === '') {
      status.replaceChildren();
      return;
    }
    status.innerHTML = `<span>${escapeHtml(text)}</span>${
      action === undefined
        ? ''
        : `<button type="button" class="intent-status-action designer-control designer-button" data-variant="ghost" data-intent-action="update-scope">${escapeHtml(action)}</button>`
    }`;
    adoptDesignerFormControls(status);
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
    if (this.#scopeClear !== undefined) {
      this.#scopeClear.hidden = this.#scopeValue.kind === 'screen';
    }
  }
}
