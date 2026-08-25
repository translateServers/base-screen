import type {
  ScreenDocument,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenVariable,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import {
  buildReplaceVariablesCommand,
  isVariableNameTaken,
  isVariableReferenced,
} from '../../common/operations/designer-variable-operations.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type DesignerVariablesDraft,
  renderDesignerVariables,
} from '../dom/designer-variables-dom.js';

// 与 ScreenDocument 契约（contracts/src/document/schema.ts VARIABLE_NAME_PATTERN）一致。
const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

export interface DesignerVariablesCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
}

/**
 * 左侧「变量」面板控制器（ADR-0054）：静态变量新建/重命名/编辑值/删除，
 * host 变量只读展示；变更走 `replace-variables` 命令（恰一条历史）。
 */
export class DesignerVariablesController {
  #panel: HTMLElement | undefined;
  #creating = false;
  #renamingIndex: number | undefined;
  #editingValueIndex: number | undefined;
  #deletingIndex: number | undefined;
  #lastDocument: ScreenDocument | undefined;

  constructor(private readonly callbacks: DesignerVariablesCallbacks) {}

  connect(panel: HTMLElement): void {
    this.#panel = panel;
    this.render();
  }

  /**
   * 释放面板/文档引用与草稿态（元素 disconnect 时由宿主调用；重连时 connect 重新注入）。
   * 草稿态随引用一并丢弃：脱离文档的半程重命名不应在重连后复活。
   */
  release(): void {
    this.#panel = undefined;
    this.#lastDocument = undefined;
    this.#creating = false;
    this.#renamingIndex = undefined;
    this.#editingValueIndex = undefined;
    this.#deletingIndex = undefined;
  }

  render(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    const document = this.callbacks.getDocument();
    this.#lastDocument = document;
    renderDesignerVariables(panel, document, this.currentDraft());
  }

  currentDraft(): DesignerVariablesDraft {
    return {
      creating: this.#creating,
      renamingIndex: this.#renamingIndex,
      editingValueIndex: this.#editingValueIndex,
      deletingIndex: this.#deletingIndex,
    };
  }

  onClick(target: Element): boolean {
    const action = target.closest<HTMLElement>('[data-variable-action]')?.dataset.variableAction;
    if (action === undefined) return false;
    const index = Number(
      target.closest<HTMLElement>('[data-variable-index]')?.dataset.variableIndex ?? -1,
    );
    switch (action) {
      case 'add':
        this.#creating = true;
        this.#renamingIndex = undefined;
        this.#editingValueIndex = undefined;
        this.#deletingIndex = undefined;
        this.renderAndFocus('[data-variable-create-name]');
        return true;
      case 'cancel':
        this.cancelEditing(index);
        return true;
      case 'rename':
        this.#creating = false;
        this.#renamingIndex = index;
        this.#editingValueIndex = undefined;
        this.#deletingIndex = undefined;
        this.renderAndFocus(`[data-variable-rename="${index}"]`);
        return true;
      case 'edit-value':
        this.#creating = false;
        this.#editingValueIndex = index;
        this.#renamingIndex = undefined;
        this.#deletingIndex = undefined;
        this.renderAndFocus(`[data-variable-value="${index}"]`);
        return true;
      case 'delete':
        this.requestDelete(index);
        return true;
      case 'confirm-create':
        this.confirmCreate();
        return true;
      case 'confirm-rename':
        this.confirmRename(index);
        return true;
      case 'confirm-value':
        this.confirmValue(index);
        return true;
      case 'confirm-delete':
        this.deleteVariable(index);
        return true;
      default:
        return false;
    }
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      event.key === 'Escape' &&
      !event.isComposing &&
      target.closest('[data-variable-editor="delete"]') !== null
    ) {
      event.preventDefault();
      const index = Number(
        target.closest<HTMLElement>('[data-variable-index]')?.dataset.variableIndex ?? -1,
      );
      this.cancelEditing(index);
      return true;
    }
    if (!(target instanceof HTMLInputElement)) return false;
    const isEditing =
      target.dataset.variableRename !== undefined ||
      target.dataset.variableValue !== undefined ||
      target.dataset.variableCreateName !== undefined ||
      target.dataset.variableCreateValue !== undefined;
    if (!isEditing) return false;
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      const index = Number(target.dataset.variableRename ?? target.dataset.variableValue ?? -1);
      this.cancelEditing(index);
      return true;
    }
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      if (target.dataset.variableRename !== undefined) {
        this.confirmRename(Number(target.dataset.variableRename));
      } else if (target.dataset.variableValue !== undefined) {
        this.confirmValue(Number(target.dataset.variableValue));
      } else {
        this.confirmCreate();
      }
      return true;
    }
    return false;
  }

  private confirmCreate(): void {
    const document = this.#lastDocument ?? this.callbacks.getDocument();
    if (document === undefined || this.#panel === undefined) return;
    const name =
      this.#panel.querySelector<HTMLInputElement>('[data-variable-create-name]')?.value.trim() ??
      '';
    const valueSource =
      this.#panel.querySelector<HTMLInputElement>('[data-variable-create-value]')?.value ?? '';
    if (!VARIABLE_NAME_PATTERN.test(name)) {
      this.reportFieldFailure(
        '[data-variable-create-name]',
        DESIGNER_UI_TEXT.variables.nameInvalid,
      );
      return;
    }
    if (isVariableNameTaken(document.variables, name)) {
      this.reportFieldFailure('[data-variable-create-name]', DESIGNER_UI_TEXT.variables.nameTaken);
      return;
    }
    const value = parseStaticVariableValue(valueSource);
    if (value === undefined) {
      this.reportFieldFailure(
        '[data-variable-create-value]',
        DESIGNER_UI_TEXT.variables.valueInvalid,
      );
      return;
    }
    if (!this.commit([...document.variables, { type: 'static', name, value }])) return;
    this.resetDraft();
    this.renderAndFocus('[data-variable-action="add"]');
  }

  private confirmRename(index: number): void {
    const document = this.#lastDocument ?? this.callbacks.getDocument();
    if (document === undefined || this.#panel === undefined) return;
    const variables = [...document.variables];
    const variable = variables[index];
    if (variable === undefined || variable.type !== 'static') return;
    const name =
      this.#panel
        .querySelector<HTMLInputElement>(`[data-variable-rename="${index}"]`)
        ?.value.trim() ?? '';
    if (!VARIABLE_NAME_PATTERN.test(name)) {
      this.reportFieldFailure(
        `[data-variable-rename="${index}"]`,
        DESIGNER_UI_TEXT.variables.nameInvalid,
      );
      return;
    }
    if (isVariableNameTaken(variables, name, index)) {
      this.reportFieldFailure(
        `[data-variable-rename="${index}"]`,
        DESIGNER_UI_TEXT.variables.nameTaken,
      );
      return;
    }
    // 引用保护（ADR-0054 R4）：旧名被文档引用时拒绝重命名。
    if (isVariableReferenced(document, variable.name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.referenced));
      return;
    }
    variables[index] = { ...variable, name };
    if (!this.commit(variables)) return;
    this.resetDraft();
    this.renderAndFocus(`[data-variable-action="rename"][data-variable-index="${index}"]`);
  }

  private confirmValue(index: number): void {
    const document = this.#lastDocument ?? this.callbacks.getDocument();
    if (document === undefined || this.#panel === undefined) return;
    const variables = [...document.variables];
    const variable = variables[index];
    if (variable === undefined || variable.type !== 'static') return;
    const valueSource =
      this.#panel.querySelector<HTMLInputElement>(`[data-variable-value="${index}"]`)?.value ?? '';
    const value = parseStaticVariableValue(valueSource);
    if (value === undefined) {
      this.reportFieldFailure(
        `[data-variable-value="${index}"]`,
        DESIGNER_UI_TEXT.variables.valueInvalid,
      );
      return;
    }
    variables[index] = { ...variable, value };
    if (!this.commit(variables)) return;
    this.resetDraft();
    this.renderAndFocus(`[data-variable-action="edit-value"][data-variable-index="${index}"]`);
  }

  private requestDelete(index: number): void {
    const document = this.#lastDocument ?? this.callbacks.getDocument();
    if (document === undefined) return;
    const variable = document.variables[index];
    if (variable === undefined || variable.type !== 'static') return;
    // 引用保护（ADR-0054 R4）：被文档引用时拒绝删除。
    if (isVariableReferenced(document, variable.name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.referenced));
      return;
    }
    this.#creating = false;
    this.#renamingIndex = undefined;
    this.#editingValueIndex = undefined;
    this.#deletingIndex = index;
    this.renderAndFocus(`[data-variable-action="confirm-delete"][data-variable-index="${index}"]`);
  }

  private deleteVariable(index: number): void {
    const document = this.#lastDocument ?? this.callbacks.getDocument();
    if (document === undefined) return;
    const variable = document.variables[index];
    if (variable === undefined || variable.type !== 'static') return;
    if (isVariableReferenced(document, variable.name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.referenced));
      return;
    }
    if (!this.commit(document.variables.filter((_, itemIndex) => itemIndex !== index))) return;
    this.resetDraft();
    this.renderAndFocus('[data-variable-action="add"]');
  }

  private cancelEditing(index: number): void {
    const returnAction = this.#creating
      ? 'add'
      : this.#renamingIndex !== undefined
        ? 'rename'
        : this.#editingValueIndex !== undefined
          ? 'edit-value'
          : 'delete';
    this.resetDraft();
    const selector =
      returnAction === 'add'
        ? '[data-variable-action="add"]'
        : `[data-variable-action="${returnAction}"][data-variable-index="${index}"]`;
    this.renderAndFocus(selector);
  }

  private resetDraft(): void {
    this.#creating = false;
    this.#renamingIndex = undefined;
    this.#editingValueIndex = undefined;
    this.#deletingIndex = undefined;
  }

  private renderAndFocus(selector: string): void {
    this.render();
    this.#panel?.querySelector<HTMLElement>(selector)?.focus();
  }

  private reportFieldFailure(selector: string, message: string): void {
    this.callbacks.report(failure(message));
    const input = this.#panel?.querySelector<HTMLInputElement>(selector);
    input?.setAttribute('aria-invalid', 'true');
    const error = this.#panel?.querySelector<HTMLElement>('[data-variable-error]');
    if (error !== null && error !== undefined) {
      error.textContent = message;
      error.hidden = false;
    }
    input?.focus();
  }

  private commit(variables: readonly ScreenVariable[]): boolean {
    const result = buildReplaceVariablesCommand(variables);
    if (!result.ok) {
      this.callbacks.report(result);
      return false;
    }
    const execution = this.callbacks.executeCommand(result.value);
    this.callbacks.report(execution);
    return execution.ok;
  }
}

function parseStaticVariableValue(source: string): ScreenJsonValue | undefined {
  // 输入是 JSON 文本：先 JSON.parse，再经 parseScreenJsonValue 做 JSON-safe 预检与克隆。
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return undefined;
  }
  const result = parseScreenJsonValue(parsed);
  return result.ok ? result.value : undefined;
}

function failure(message: string): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [
      { severity: 'error', code: 'CORE_COMMAND_INVALID', path: ['variables'], message },
    ],
  };
}
