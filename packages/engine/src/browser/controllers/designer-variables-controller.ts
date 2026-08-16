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
  #lastDocument: ScreenDocument | undefined;

  constructor(private readonly callbacks: DesignerVariablesCallbacks) {}

  connect(panel: HTMLElement): void {
    this.#panel = panel;
    this.render();
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
        this.render();
        return true;
      case 'cancel':
        this.#creating = false;
        this.#renamingIndex = undefined;
        this.#editingValueIndex = undefined;
        this.render();
        return true;
      case 'rename':
        this.#renamingIndex = index;
        this.#editingValueIndex = undefined;
        this.render();
        return true;
      case 'edit-value':
        this.#editingValueIndex = index;
        this.#renamingIndex = undefined;
        this.render();
        return true;
      case 'delete':
        this.deleteVariable(index);
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
      default:
        return false;
    }
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return false;
    const isEditing =
      target.dataset.variableRename !== undefined ||
      target.dataset.variableValue !== undefined ||
      target.dataset.variableCreateName !== undefined ||
      target.dataset.variableCreateValue !== undefined;
    if (!isEditing) return false;
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      this.#creating = false;
      this.#renamingIndex = undefined;
      this.#editingValueIndex = undefined;
      this.render();
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
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.nameInvalid));
      return;
    }
    if (isVariableNameTaken(document.variables, name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.nameTaken));
      return;
    }
    const value = parseStaticVariableValue(valueSource);
    if (value === undefined) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.valueInvalid));
      return;
    }
    this.commit([...document.variables, { type: 'static', name, value }]);
    this.#creating = false;
    this.render();
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
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.nameInvalid));
      return;
    }
    if (isVariableNameTaken(variables, name, index)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.nameTaken));
      return;
    }
    // 引用保护（ADR-0054 R4）：旧名被文档引用时拒绝重命名。
    if (isVariableReferenced(document, variable.name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.referenced));
      return;
    }
    variables[index] = { ...variable, name };
    this.commit(variables);
    this.#renamingIndex = undefined;
    this.render();
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
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.valueInvalid));
      return;
    }
    variables[index] = { ...variable, value };
    this.commit(variables);
    this.#editingValueIndex = undefined;
    this.render();
  }

  private deleteVariable(index: number): void {
    const document = this.#lastDocument ?? this.callbacks.getDocument();
    if (document === undefined) return;
    const variable = document.variables[index];
    if (variable === undefined || variable.type !== 'static') return;
    // 引用保护（ADR-0054 R4）：被文档引用时拒绝删除。
    if (isVariableReferenced(document, variable.name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.referenced));
      return;
    }
    this.commit(document.variables.filter((_, itemIndex) => itemIndex !== index));
  }

  private commit(variables: readonly ScreenVariable[]): void {
    const result = buildReplaceVariablesCommand(variables);
    if (!result.ok) {
      this.callbacks.report(result);
      return;
    }
    this.callbacks.report(this.callbacks.executeCommand(result.value));
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
