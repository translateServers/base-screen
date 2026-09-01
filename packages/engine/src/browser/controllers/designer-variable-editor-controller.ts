import {
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenVariable,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import {
  isDesignerVariableName,
  nextDesignerVariableCopyName,
  nextDesignerVariableName,
  normalizeDesignerVariableDescription,
  parseDesignerStaticVariableValue,
} from '../../common/operations/designer-variable-editing.js';
import {
  buildReplaceVariablesCommand,
  isVariableNameTaken,
  isVariableReferenced,
} from '../../common/operations/designer-variable-operations.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import type { DesignerVariableCatalogController } from './designer-variable-catalog-controller.js';

export interface DesignerVariableEditorView {
  readonly creating: boolean;
  readonly createType: ScreenVariable['type'];
  readonly createName: string;
  readonly createDescription: string;
  readonly createValueSource: string;
  readonly selectedHostId: string | undefined;
  readonly renamingIndex: number | undefined;
  readonly editingDescriptionIndex: number | undefined;
  readonly editingValueIndex: number | undefined;
  readonly deletingIndex: number | undefined;
}

interface DesignerVariableEditorCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getPanel: () => HTMLElement | undefined;
  readonly getCatalog: () => DesignerVariableCatalogController;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly renderAndFocus: (selector: string) => void;
}

export class DesignerVariableEditorController {
  #creating = false;
  #createType: ScreenVariable['type'] = 'static';
  #createName = '';
  #createDescription = '';
  #createValueSource = 'null';
  #selectedHostId: string | undefined;
  #renamingIndex: number | undefined;
  #editingDescriptionIndex: number | undefined;
  #editingValueIndex: number | undefined;
  #deletingIndex: number | undefined;

  constructor(private readonly callbacks: DesignerVariableEditorCallbacks) {}

  get view(): DesignerVariableEditorView {
    return {
      creating: this.#creating,
      createType: this.#createType,
      createName: this.#createName,
      createDescription: this.#createDescription,
      createValueSource: this.#createValueSource,
      selectedHostId: this.#selectedHostId,
      renamingIndex: this.#renamingIndex,
      editingDescriptionIndex: this.#editingDescriptionIndex,
      editingValueIndex: this.#editingValueIndex,
      deletingIndex: this.#deletingIndex,
    };
  }

  beginCreate(type: ScreenVariable['type']): void {
    this.reset();
    this.#creating = true;
    this.#createType = type;
    this.callbacks.getCatalog().clear();
    this.callbacks.renderAndFocus('[data-variable-create-name]');
  }

  switchCreateType(type: ScreenVariable['type']): void {
    this.captureCreateInputs();
    this.#createType = type;
    if (type === 'host') this.callbacks.getCatalog().ensureList();
    this.callbacks.renderAndFocus(
      type === 'static' ? '[data-variable-create-name]' : '[data-variable-catalog-search]',
    );
  }

  beginRowEdit(index: number, kind: 'rename' | 'description' | 'value'): void {
    this.#creating = false;
    this.#renamingIndex = kind === 'rename' ? index : undefined;
    this.#editingDescriptionIndex = kind === 'description' ? index : undefined;
    this.#editingValueIndex = kind === 'value' ? index : undefined;
    this.#deletingIndex = undefined;
    const selector =
      kind === 'rename'
        ? `[data-variable-rename="${index}"]`
        : kind === 'description'
          ? `[data-variable-description="${index}"]`
          : `[data-variable-value="${index}"]`;
    this.callbacks.renderAndFocus(selector);
  }

  duplicateVariable(index: number): void {
    const document = this.callbacks.getDocument();
    const variable = document?.variables[index];
    if (document === undefined || variable === undefined) return;
    this.reset();
    this.#creating = true;
    this.#createType = variable.type;
    this.#createName = nextDesignerVariableCopyName(document.variables, variable.name);
    this.#createDescription = variable.description ?? '';
    this.#createValueSource = variable.type === 'static' ? JSON.stringify(variable.value) : 'null';
    this.#selectedHostId = variable.type === 'host' ? variable.variableId : undefined;
    this.callbacks.renderAndFocus('[data-variable-create-name]');
  }

  async selectHost(variableId: string): Promise<void> {
    if (variableId === '') return;
    const descriptor = await this.callbacks.getCatalog().select(variableId);
    if (descriptor === undefined || !this.#creating || this.#createType !== 'host') return;
    const document = this.callbacks.getDocument();
    this.#selectedHostId = descriptor.variableId;
    if (document !== undefined) {
      this.#createName = nextDesignerVariableName(document.variables, descriptor.name);
    }
    this.#createDescription = descriptor.description ?? '';
    this.callbacks.renderAndFocus('[data-variable-create-name]');
  }

  confirmCreate(): void {
    const document = this.callbacks.getDocument();
    if (document === undefined || this.callbacks.getPanel() === undefined) return;
    this.captureCreateInputs();
    if (
      !this.validateName(document.variables, this.#createName, -1, '[data-variable-create-name]')
    ) {
      return;
    }
    const description = normalizeDesignerVariableDescription(this.#createDescription);
    if (description === false) {
      this.reportFieldFailure(
        '[data-variable-create-description]',
        DESIGNER_UI_TEXT.variables.descriptionInvalid,
      );
      return;
    }
    const variable = this.createVariable(description);
    if (variable === undefined || !this.commit([...document.variables, variable])) return;
    this.reset();
    this.callbacks.getCatalog().clear();
    this.callbacks.renderAndFocus('[data-variable-action="add"]');
  }

  confirmRename(index: number): void {
    const document = this.callbacks.getDocument();
    const panel = this.callbacks.getPanel();
    const variable = document?.variables[index];
    if (document === undefined || panel === undefined || variable === undefined) return;
    const name =
      panel.querySelector<HTMLInputElement>(`[data-variable-rename="${index}"]`)?.value.trim() ??
      '';
    if (!this.validateName(document.variables, name, index, `[data-variable-rename="${index}"]`)) {
      return;
    }
    const execution = this.callbacks.executeCommand({
      type: 'rename-variable',
      variableName: variable.name,
      nextName: name,
    });
    this.callbacks.report(execution);
    if (!execution.ok) return;
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="rename"][data-variable-index="${index}"]`,
    );
  }

  confirmDescription(index: number): void {
    const document = this.callbacks.getDocument();
    const panel = this.callbacks.getPanel();
    const variable = document?.variables[index];
    if (document === undefined || panel === undefined || variable === undefined) return;
    const source =
      panel.querySelector<HTMLInputElement>(`[data-variable-description="${index}"]`)?.value ?? '';
    const description = normalizeDesignerVariableDescription(source);
    if (description === false) {
      this.reportFieldFailure(
        `[data-variable-description="${index}"]`,
        DESIGNER_UI_TEXT.variables.descriptionInvalid,
      );
      return;
    }
    const variables = [...document.variables];
    const next = { ...variable } as Record<string, unknown>;
    if (description === undefined) delete next.description;
    else next.description = description;
    variables[index] = next as unknown as ScreenVariable;
    if (!this.commit(variables)) return;
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="edit-description"][data-variable-index="${index}"]`,
    );
  }

  confirmValue(index: number): void {
    const document = this.callbacks.getDocument();
    const panel = this.callbacks.getPanel();
    const variables = [...(document?.variables ?? [])];
    const variable = variables[index];
    if (document === undefined || panel === undefined || variable?.type !== 'static') return;
    const source =
      panel.querySelector<HTMLInputElement>(`[data-variable-value="${index}"]`)?.value ?? '';
    const value = parseDesignerStaticVariableValue(source);
    if (value === undefined) {
      this.reportFieldFailure(
        `[data-variable-value="${index}"]`,
        DESIGNER_UI_TEXT.variables.valueInvalid,
      );
      return;
    }
    variables[index] = { ...variable, value };
    if (!this.commit(variables)) return;
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="edit-value"][data-variable-index="${index}"]`,
    );
  }

  requestDelete(index: number): void {
    const document = this.callbacks.getDocument();
    const variable = document?.variables[index];
    if (document === undefined || variable === undefined) return;
    if (isVariableReferenced(document, variable.name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.referenced));
      return;
    }
    this.#creating = false;
    this.#renamingIndex = undefined;
    this.#editingDescriptionIndex = undefined;
    this.#editingValueIndex = undefined;
    this.#deletingIndex = index;
    this.callbacks.renderAndFocus(
      `[data-variable-action="confirm-delete"][data-variable-index="${index}"]`,
    );
  }

  deleteVariable(index: number): void {
    const document = this.callbacks.getDocument();
    const variable = document?.variables[index];
    if (document === undefined || variable === undefined) return;
    if (isVariableReferenced(document, variable.name)) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.referenced));
      return;
    }
    if (!this.commit(document.variables.filter((_, itemIndex) => itemIndex !== index))) return;
    this.reset();
    this.callbacks.renderAndFocus('[data-variable-action="add"]');
  }

  captureCreateInputs(): void {
    const panel = this.callbacks.getPanel();
    if (!this.#creating || panel === undefined) return;
    this.#createName =
      panel.querySelector<HTMLInputElement>('[data-variable-create-name]')?.value.trim() ??
      this.#createName;
    this.#createDescription =
      panel.querySelector<HTMLInputElement>('[data-variable-create-description]')?.value ??
      this.#createDescription;
    this.#createValueSource =
      panel.querySelector<HTMLInputElement>('[data-variable-create-value]')?.value ??
      this.#createValueSource;
  }

  cancel(index: number): void {
    const action = this.#creating
      ? 'add'
      : this.#renamingIndex !== undefined
        ? 'rename'
        : this.#editingDescriptionIndex !== undefined
          ? 'edit-description'
          : this.#editingValueIndex !== undefined
            ? 'edit-value'
            : 'delete';
    this.reset();
    this.callbacks.renderAndFocus(
      action === 'add'
        ? '[data-variable-action="add"]'
        : `[data-variable-action="${action}"][data-variable-index="${index}"]`,
    );
  }

  reset(): void {
    this.#creating = false;
    this.#createType = 'static';
    this.#createName = '';
    this.#createDescription = '';
    this.#createValueSource = 'null';
    this.#selectedHostId = undefined;
    this.#renamingIndex = undefined;
    this.#editingDescriptionIndex = undefined;
    this.#editingValueIndex = undefined;
    this.#deletingIndex = undefined;
  }

  private createVariable(description: string | undefined): ScreenVariable | undefined {
    if (this.#createType === 'static') {
      const value = parseDesignerStaticVariableValue(this.#createValueSource);
      if (value === undefined) {
        this.reportFieldFailure(
          '[data-variable-create-value]',
          DESIGNER_UI_TEXT.variables.valueInvalid,
        );
        return undefined;
      }
      return {
        type: 'static',
        name: this.#createName,
        ...(description === undefined ? {} : { description }),
        value,
      };
    }
    if (this.#selectedHostId === undefined) {
      this.callbacks.report(failure(DESIGNER_UI_TEXT.variables.hostRequired));
      return undefined;
    }
    return {
      type: 'host',
      name: this.#createName,
      ...(description === undefined ? {} : { description }),
      variableId: this.#selectedHostId,
    };
  }

  private validateName(
    variables: readonly ScreenVariable[],
    name: string,
    exceptIndex: number,
    selector: string,
  ): boolean {
    if (!isDesignerVariableName(name)) {
      this.reportFieldFailure(selector, DESIGNER_UI_TEXT.variables.nameInvalid);
      return false;
    }
    if (isVariableNameTaken(variables, name, exceptIndex)) {
      this.reportFieldFailure(selector, DESIGNER_UI_TEXT.variables.nameTaken);
      return false;
    }
    return true;
  }

  private reportFieldFailure(selector: string, message: string): void {
    this.callbacks.report(failure(message));
    const panel = this.callbacks.getPanel();
    const input = panel?.querySelector<HTMLInputElement>(selector);
    input?.setAttribute('aria-invalid', 'true');
    const error = panel?.querySelector<HTMLElement>('[data-variable-error]');
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

function failure(message: string): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [
      { severity: 'error', code: 'CORE_COMMAND_INVALID', path: ['variables'], message },
    ],
  };
}
