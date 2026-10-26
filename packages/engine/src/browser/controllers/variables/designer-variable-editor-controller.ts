import {
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenVariable,
  type ScreenVariableEntry,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import {
  isDesignerVariableName,
  nextDesignerVariableCopyName,
  nextDesignerVariableName,
  normalizeDesignerVariableDescription,
  parseDesignerStaticVariableValue,
} from '../../../common/operations/designer-variable-editing.js';
import {
  buildReplaceVariablesCommand,
  isVariableNameTaken,
} from '../../../common/operations/designer-variable-operations.js';
import { readDesignerVariableView } from '../../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
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
    if (type !== 'static') this.callbacks.getCatalog().ensureList();
    this.callbacks.renderAndFocus('[data-variable-create-name]');
  }

  switchCreateType(type: ScreenVariable['type']): void {
    this.captureCreateInputs();
    if (type !== this.#createType) this.#selectedSourceId = undefined;
    this.#createType = type;
    if (type !== 'static') this.callbacks.getCatalog().ensureList();
    this.callbacks.renderAndFocus(
      type === 'static' ? '[data-variable-create-name]' : '[data-variable-catalog-summary]',
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
      this.callbacks.getCatalog().ensureList();
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
    if (descriptor === undefined || !this.#creating || this.#createType === 'static') return;
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
    if (!this.applyAllCreateErrors()) return;
    const description = normalizeDesignerVariableDescription(this.#createDescription);
    if (description === false) return;
    const variable = this.createVariable(description);
    if (variable === undefined) return;
    const variables = [...document.variables];
    const configuringIndex = this.#configuringIndex;
    const focusIndex = configuringIndex ?? document.variables.length;
    if (configuringIndex === undefined) variables.push(variable);
    else variables[configuringIndex] = variable;
    if (!this.commit(variables)) return;
    this.reset();
    this.callbacks.getCatalog().clear();
    this.callbacks.renderAndFocus(
      `[data-variable-action="edit-config"][data-variable-index="${focusIndex}"]`,
    );
  }

  confirmRename(index: number): void {
    const renamed = confirmDesignerVariableRename(index, this.#mutations);
    if (renamed === undefined) return;
    this.callbacks.onVariableRenamed(renamed.variableId, renamed.nextName);
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="edit-config"][data-variable-index="${index}"]`,
    );
  }

  confirmDescription(index: number): void {
    if (!confirmDesignerVariableDescription(index, this.#mutations)) return;
    this.reset();
    this.callbacks.renderAndFocus(
      `[data-variable-action="edit-config"][data-variable-index="${index}"]`,
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
      `[data-variable-action="cancel"][data-variable-index="${index}"]`,
    );
  }

  deleteVariable(index: number): void {
    const document = this.callbacks.getDocument();
    const hasNext = document !== undefined && document.variables[index + 1] !== undefined;
    const hasPrevious = document !== undefined && index > 0;
    if (!deleteDesignerVariable(index, this.#mutations)) return;
    this.reset();
    if (hasNext) {
      this.callbacks.renderAndFocus(
        `[data-variable-action="toggle-variable"][data-variable-index="${index}"]`,
      );
    } else if (hasPrevious) {
      this.callbacks.renderAndFocus(
        `[data-variable-action="toggle-variable"][data-variable-index="${index - 1}"]`,
      );
    } else {
      this.callbacks.renderAndFocus('[data-variable-action="add"]');
    }
  }

  private applyAllCreateErrors(): boolean {
    const document = this.callbacks.getDocument();
    const panel = this.callbacks.getPanel();
    if (document === undefined || panel === undefined) return false;
    const errors = this.collectCreateErrors(document);
    const fieldKeys = ['name', 'description', 'value', 'interval'] as const;
    for (const field of fieldKeys) {
      const input = panel.querySelector<HTMLInputElement>(createFieldSelector(field));
      input?.setAttribute('aria-invalid', 'false');
      const fieldError = panel.querySelector<HTMLElement>(`[data-variable-field-error="${field}"]`);
      if (fieldError !== null) {
        fieldError.textContent = '';
        fieldError.hidden = true;
      }
    }
    const summary = panel.querySelector<HTMLElement>('[data-variable-error-summary]');
    if (summary !== null) {
      summary.hidden = errors.length < 2;
      summary.textContent =
        errors.length < 2 ? '' : DESIGNER_UI_TEXT.variables.errorSummary(errors.length);
    }
    const bottom = panel.querySelector<HTMLElement>('[data-variable-error]');
    if (bottom !== null) {
      const formLevel = errors.find(
        (error) => error.field === 'source' || error.field === 'filter',
      );
      bottom.textContent = formLevel?.message ?? '';
      bottom.hidden = formLevel === undefined;
    }
    for (const error of errors) {
      if (error.field === 'source' || error.field === 'filter') continue;
      const input = panel.querySelector<HTMLInputElement>(createFieldSelector(error.field));
      input?.setAttribute('aria-invalid', 'true');
      const fieldError = panel.querySelector<HTMLElement>(
        `[data-variable-field-error="${error.field}"]`,
      );
      if (fieldError !== null) {
        fieldError.textContent = error.message;
        fieldError.hidden = false;
      }
    }
    if (errors.length > 0) {
      if (errors[0]!.field === 'interval') {
        panel.querySelector<HTMLElement>('.variable-run-section')?.setAttribute('open', '');
      }
      this.callbacks.report(designerVariableEditorFailure(errors[0]!.message));
      panel.querySelector<HTMLInputElement>(errors[0]!.selector)?.focus();
      return false;
    }
    return true;
  }

  private collectCreateErrors(document: ScreenDocument): Array<{
    readonly field: 'name' | 'description' | 'value' | 'interval' | 'source' | 'filter';
    readonly selector: string;
    readonly message: string;
  }> {
    const errors: Array<{
      field: 'name' | 'description' | 'value' | 'interval' | 'source' | 'filter';
      selector: string;
      message: string;
    }> = [];
    const name = this.#createName.trim();
    if (!isDesignerVariableName(name)) {
      errors.push({
        field: 'name',
        selector: '[data-variable-create-name]',
        message: DESIGNER_UI_TEXT.variables.nameInvalid,
      });
    } else if (isVariableNameTaken(document.variables, name, this.#configuringIndex ?? -1)) {
      errors.push({
        field: 'name',
        selector: '[data-variable-create-name]',
        message: DESIGNER_UI_TEXT.variables.nameTaken,
      });
    }
    if (normalizeDesignerVariableDescription(this.#createDescription) === false) {
      errors.push({
        field: 'description',
        selector: '[data-variable-create-description]',
        message: DESIGNER_UI_TEXT.variables.descriptionInvalid,
      });
    }
    if (parseDesignerStaticVariableValue(this.#createValueSource) === undefined) {
      errors.push({
        field: 'value',
        selector: '[data-variable-create-value]',
        message: DESIGNER_UI_TEXT.variables.valueInvalid,
      });
    }
    if (this.#createType !== 'static' && this.#selectedSourceId === undefined) {
      errors.push({
        field: 'source',
        selector: '[data-variable-catalog-summary]',
        message: DESIGNER_UI_TEXT.variables.hostRequired,
      });
    }
    if (this.#createProcessorId.length > 256) {
      errors.push({
        field: 'filter',
        selector: '[data-variable-create-processor]',
        message: DESIGNER_UI_TEXT.variables.processorInvalid,
      });
    }
    if (this.#createType === 'data-source' && this.#createAutoUpdate) {
      const seconds = Number(this.#createAutoUpdateInterval);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86_400) {
        errors.push({
          field: 'interval',
          selector: '[data-variable-create-auto-update-interval]',
          message: DESIGNER_UI_TEXT.variables.autoUpdateInvalid,
        });
      }
    }
    return errors;
  }

  validateLive(field: 'name' | 'description' | 'value' | 'interval'): void {
    if (!this.#creating) return;
    this.captureCreateInputs();
    const panel = this.callbacks.getPanel();
    const document = this.callbacks.getDocument();
    if (panel === undefined || document === undefined) return;
    let message = '';
    if (field === 'name') {
      const name = this.#createName.trim();
      if (!isDesignerVariableName(name)) {
        message = DESIGNER_UI_TEXT.variables.nameInvalid;
      } else if (isVariableNameTaken(document.variables, name, this.#configuringIndex ?? -1)) {
        message = DESIGNER_UI_TEXT.variables.nameTaken;
      }
    } else if (field === 'description') {
      if (normalizeDesignerVariableDescription(this.#createDescription) === false) {
        message = DESIGNER_UI_TEXT.variables.descriptionInvalid;
      }
    } else if (field === 'value') {
      if (parseDesignerStaticVariableValue(this.#createValueSource) === undefined) {
        message = DESIGNER_UI_TEXT.variables.valueInvalid;
      }
    } else if (
      field === 'interval' &&
      this.#createType === 'data-source' &&
      this.#createAutoUpdate
    ) {
      const seconds = Number(this.#createAutoUpdateInterval);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86_400) {
        message = DESIGNER_UI_TEXT.variables.autoUpdateInvalid;
      }
    }
    this.applyLiveFieldState(panel, field, message);
    this.refreshLiveSummary(panel);
  }

  private refreshLiveSummary(panel: HTMLElement): void {
    if (typeof panel.querySelectorAll !== 'function') return;
    const count = [...panel.querySelectorAll<HTMLElement>('[data-variable-field-error]')].filter(
      (element) => !element.hidden,
    ).length;
    const summary = panel.querySelector<HTMLElement>('[data-variable-error-summary]');
    if (summary === null) return;
    summary.hidden = count < 2;
    summary.textContent = count < 2 ? '' : DESIGNER_UI_TEXT.variables.errorSummary(count);
  }

  private applyLiveFieldState(
    panel: HTMLElement,
    field: 'name' | 'description' | 'value' | 'interval',
    message: string,
  ): void {
    const selector =
      field === 'name'
        ? '[data-variable-create-name]'
        : field === 'description'
          ? '[data-variable-create-description]'
          : field === 'value'
            ? '[data-variable-create-value]'
            : '[data-variable-create-auto-update-interval]';
    const input = panel.querySelector<HTMLInputElement>(selector);
    input?.setAttribute('aria-invalid', message === '' ? 'false' : 'true');
    const fieldError = panel.querySelector<HTMLElement>(`[data-variable-field-error="${field}"]`);
    if (fieldError !== null) {
      fieldError.textContent = message;
      fieldError.hidden = message === '';
    }
    if (field === 'name') {
      const count = panel.querySelector<HTMLElement>('[data-variable-name-count]');
      if (count !== null) count.textContent = `${this.#createName.length}/128`;
      const check = panel.querySelector<HTMLElement>('[data-variable-name-check]');
      if (check !== null) check.hidden = message !== '';
    } else if (field === 'description') {
      const count = panel.querySelector<HTMLElement>('[data-variable-description-count]');
      if (count !== null) {
        count.textContent = `${[...this.#createDescription].length}/4096`;
      }
    } else if (field === 'value') {
      const type = panel.querySelector<HTMLElement>('[data-variable-value-type]');
      if (type !== null) {
        type.textContent =
          parseDesignerStaticVariableValue(this.#createValueSource) === undefined
            ? DESIGNER_UI_TEXT.variables.valueTypeInvalid
            : valueTypeLabel(this.#createValueSource);
      }
    }
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
    const focusAction = action === 'delete' ? 'more' : action;
    this.callbacks.renderAndFocus(
      focusAction === 'add'
        ? '[data-variable-action="add"]'
        : `[data-variable-action="${focusAction}"][data-variable-index="${configuringIndex ?? index}"]`,
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
    const field = selector.includes('create-name')
      ? 'name'
      : selector.includes('create-description')
        ? 'description'
        : selector.includes('create-value')
          ? 'value'
          : selector.includes('create-auto-update-interval')
            ? 'interval'
            : undefined;
    const fieldError =
      field === undefined
        ? null
        : panel?.querySelector<HTMLElement>(`[data-variable-field-error="${field}"]`);
    if (fieldError !== null && fieldError !== undefined) {
      fieldError.textContent = message;
      fieldError.hidden = false;
    }
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

function createFieldSelector(field: 'name' | 'description' | 'value' | 'interval'): string {
  return field === 'name'
    ? '[data-variable-create-name]'
    : field === 'description'
      ? '[data-variable-create-description]'
      : field === 'value'
        ? '[data-variable-create-value]'
        : '[data-variable-create-auto-update-interval]';
}

function valueTypeLabel(raw: string): string {
  const text = raw.trim();
  if (text === '') return DESIGNER_UI_TEXT.variables.valueTypeText;
  if (text === 'true' || text === 'false') return DESIGNER_UI_TEXT.variables.valueTypeBoolean;
  if (text === 'null') return DESIGNER_UI_TEXT.variables.valueTypeNull;
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) return DESIGNER_UI_TEXT.variables.valueTypeNumber;
  if (text.startsWith('[')) return DESIGNER_UI_TEXT.variables.valueTypeArray;
  if (text.startsWith('{')) return DESIGNER_UI_TEXT.variables.valueTypeObject;
  return DESIGNER_UI_TEXT.variables.valueTypeText;
}
