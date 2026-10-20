import {
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenVariable,
  type ScreenVariableEntry,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import {
  nextDesignerVariableCopyName,
  nextDesignerVariableName,
  normalizeDesignerVariableDescription,
} from '../../common/operations/designer-variable-editing.js';
import { buildReplaceVariablesCommand } from '../../common/operations/designer-variable-operations.js';
import { readDesignerVariableView } from '../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import type { DesignerVariableCatalogController } from './designer-variable-catalog-controller.js';
import {
  buildDesignerVariable,
  canDeleteDesignerVariable,
  confirmDesignerVariableDescription,
  confirmDesignerVariableRename,
  confirmDesignerVariableValue,
  type DesignerVariableEditorMutationContext,
  deleteDesignerVariable,
  designerVariableEditorFailure,
  validateDesignerVariableEditorName,
} from './designer-variable-editor-mutations.js';

export interface DesignerVariableEditorView {
  readonly creating: boolean;
  readonly configuringIndex: number | undefined;
  readonly createType: ScreenVariable['type'];
  readonly createName: string;
  readonly createDescription: string;
  readonly createValueSource: string;
  readonly selectedSourceId: string | undefined;
  readonly createProcessorId: string;
  readonly createControlled: boolean;
  readonly createAutoUpdate: boolean;
  readonly createAutoUpdateInterval: string;
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
  readonly onVariableRenamed: (variableId: string, nextName: string) => void;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly renderAndFocus: (selector: string) => void;
}

export class DesignerVariableEditorController {
  #creating = false;
  #createType: ScreenVariable['type'] = 'static';
  #createName = '';
  #createDescription = '';
  #createValueSource = '';
  #selectedSourceId: string | undefined;
  #createProcessorId = '';
  #createControlled = false;
  #createAutoUpdate = false;
  #createAutoUpdateInterval = '30';
  #configuringIndex: number | undefined;
  #renamingIndex: number | undefined;
  #editingDescriptionIndex: number | undefined;
  #editingValueIndex: number | undefined;
  #deletingIndex: number | undefined;
  readonly #mutations: DesignerVariableEditorMutationContext;

  constructor(private readonly callbacks: DesignerVariableEditorCallbacks) {
    this.#mutations = {
      getDocument: callbacks.getDocument,
      getPanel: callbacks.getPanel,
      executeCommand: callbacks.executeCommand,
      report: callbacks.report,
      reportFieldFailure: (selector, message) => this.reportFieldFailure(selector, message),
      commit: (variables) => this.commit(variables),
    };
  }

  get view(): DesignerVariableEditorView {
    return {
      creating: this.#creating,
      configuringIndex: this.#configuringIndex,
      createType: this.#createType,
      createName: this.#createName,
      createDescription: this.#createDescription,
      createValueSource: this.#createValueSource,
      selectedSourceId: this.#selectedSourceId,
      createProcessorId: this.#createProcessorId,
      createControlled: this.#createControlled,
      createAutoUpdate: this.#createAutoUpdate,
      createAutoUpdateInterval: this.#createAutoUpdateInterval,
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
    if (type !== 'static') this.callbacks.getCatalog().ensureList(type);
    this.callbacks.renderAndFocus('[data-variable-create-name]');
  }

  switchCreateType(type: ScreenVariable['type']): void {
    this.captureCreateInputs();
    if (type !== this.#createType) this.#selectedSourceId = undefined;
    this.#createType = type;
    if (type !== 'static') this.callbacks.getCatalog().ensureList(type);
    this.callbacks.renderAndFocus(
      type === 'static' ? '[data-variable-create-name]' : '[data-variable-catalog-search]',
    );
  }

  beginConfiguration(index: number): void {
    const document = this.callbacks.getDocument();
    const entry = document?.variables[index];
    if (document === undefined || entry === undefined) return;
    const variable = readDesignerVariableView(document, entry);
    this.reset();
    this.#creating = true;
    this.#configuringIndex = index;
    this.#createType = variable.type;
    this.#createName = variable.name;
    this.#createDescription = variable.description ?? '';
    this.#createValueSource = JSON.stringify(variable.initialValue);
    if (variable.type !== 'static') {
      this.#selectedSourceId = variable.sourceId;
      this.#createProcessorId = variable.processorId ?? '';
      this.#createControlled = variable.controlled;
      if (variable.type === 'data-source' && variable.autoUpdate !== undefined) {
        this.#createAutoUpdate = true;
        this.#createAutoUpdateInterval = String(variable.autoUpdate.intervalSeconds);
      }
      this.callbacks.getCatalog().ensureList(variable.type);
    }
    this.callbacks.renderAndFocus('[data-variable-create-name]');
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
    const entry = document?.variables[index];
    if (document === undefined || entry === undefined) return;
    const variable = readDesignerVariableView(document, entry);
    this.reset();
    this.#creating = true;
    this.#createType = variable.type;
    this.#createName = nextDesignerVariableCopyName(document.variables, variable.name);
    this.#createDescription = variable.description ?? '';
    this.#createValueSource = JSON.stringify(variable.initialValue);
    this.#selectedSourceId = variable.type === 'static' ? undefined : variable.sourceId;
    this.#createProcessorId = variable.type === 'static' ? '' : (variable.processorId ?? '');
    this.#createControlled = variable.type === 'static' ? false : variable.controlled;
    this.#createAutoUpdate = variable.type === 'data-source' && variable.autoUpdate !== undefined;
    this.#createAutoUpdateInterval =
      variable.type === 'data-source' && variable.autoUpdate !== undefined
        ? String(variable.autoUpdate.intervalSeconds)
        : '30';
    this.callbacks.renderAndFocus('[data-variable-create-name]');
  }

  async selectHost(sourceId: string): Promise<void> {
    if (sourceId === '') return;
    const descriptor = await this.callbacks.getCatalog().select(sourceId);
    if (
      descriptor === undefined ||
      !this.#creating ||
      this.#createType === 'static' ||
      descriptor.sourceType !== this.#createType
    ) {
      return;
    }
    const document = this.callbacks.getDocument();
    this.#selectedSourceId = descriptor.sourceId;
    if (document !== undefined && this.#configuringIndex === undefined) {
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
      !validateDesignerVariableEditorName(
        document.variables,
        this.#createName,
        this.#configuringIndex ?? -1,
        '[data-variable-create-name]',
        (selector, message) => this.reportFieldFailure(selector, message),
      )
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
    if (variable === undefined) return;
    const variables = [...document.variables];
    const configuringIndex = this.#configuringIndex;
    if (configuringIndex === undefined) variables.push(variable);
    else variables[configuringIndex] = variable;
    if (!this.commit(variables)) return;
    this.reset();
    this.callbacks.getCatalog().clear();
    this.callbacks.renderAndFocus(
      configuringIndex === undefined
        ? '[data-variable-action="add"]'
        : `[data-variable-action="edit-config"][data-variable-index="${configuringIndex}"]`,
    );
  }

  confirmRename(index: number): void {
    const renamed = confirmDesignerVariableRename(index, this.#mutations);
    if (renamed === undefined) return;
    this.callbacks.onVariableRenamed(renamed.variableId, renamed.nextName);
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="rename"][data-variable-index="${index}"]`,
    );
  }

  confirmDescription(index: number): void {
    if (!confirmDesignerVariableDescription(index, this.#mutations)) return;
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="edit-description"][data-variable-index="${index}"]`,
    );
  }

  confirmValue(index: number): void {
    if (!confirmDesignerVariableValue(index, this.#mutations)) return;
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="edit-value"][data-variable-index="${index}"]`,
    );
  }

  requestDelete(index: number): void {
    if (!canDeleteDesignerVariable(index, this.#mutations)) return;
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
    if (!deleteDesignerVariable(index, this.#mutations)) return;
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
    this.#createProcessorId =
      panel.querySelector<HTMLInputElement>('[data-variable-create-processor]')?.value.trim() ??
      this.#createProcessorId;
    this.#createControlled =
      panel.querySelector<HTMLInputElement>('[data-variable-create-controlled]')?.checked ??
      this.#createControlled;
    this.#createAutoUpdate =
      panel.querySelector<HTMLInputElement>('[data-variable-create-auto-update]')?.checked ??
      this.#createAutoUpdate;
    this.#createAutoUpdateInterval =
      panel.querySelector<HTMLInputElement>('[data-variable-create-auto-update-interval]')?.value ??
      this.#createAutoUpdateInterval;
  }

  cancel(index: number): void {
    const configuringIndex = this.#configuringIndex;
    const action = this.#creating
      ? configuringIndex === undefined
        ? 'add'
        : 'edit-config'
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
        : `[data-variable-action="${action}"][data-variable-index="${configuringIndex ?? index}"]`,
    );
  }

  reset(): void {
    this.#creating = false;
    this.#createType = 'static';
    this.#createName = '';
    this.#createDescription = '';
    this.#createValueSource = '';
    this.#selectedSourceId = undefined;
    this.#createProcessorId = '';
    this.#createControlled = false;
    this.#createAutoUpdate = false;
    this.#createAutoUpdateInterval = '30';
    this.#configuringIndex = undefined;
    this.#renamingIndex = undefined;
    this.#editingDescriptionIndex = undefined;
    this.#editingValueIndex = undefined;
    this.#deletingIndex = undefined;
  }

  private createVariable(description: string | undefined): ScreenVariable | undefined {
    const variables: readonly ScreenVariableEntry[] = this.callbacks.getDocument()?.variables ?? [];
    const current =
      this.#configuringIndex === undefined ? undefined : variables[this.#configuringIndex];
    const result = buildDesignerVariable({
      variables,
      current,
      type: this.#createType,
      name: this.#createName,
      description,
      valueSource: this.#createValueSource,
      sourceId: this.#selectedSourceId,
      processorId: this.#createProcessorId,
      controlled: this.#createControlled,
      autoUpdate: this.#createAutoUpdate,
      autoUpdateInterval: this.#createAutoUpdateInterval,
    });
    if (result.ok) return result.value;
    if (result.selector === undefined) {
      this.callbacks.report(designerVariableEditorFailure(result.message));
    } else this.reportFieldFailure(result.selector, result.message);
    return undefined;
  }

  private reportFieldFailure(selector: string, message: string): void {
    this.callbacks.report(designerVariableEditorFailure(message));
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

  private commit(variables: readonly ScreenVariableEntry[]): boolean {
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
