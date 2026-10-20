import {
  type ScreenDocument,
  type ScreenHostVariableCatalogPort,
  type ScreenHostVariablePort,
  type ScreenParseResult,
  type ScreenVariable,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import { collectVariableReferences } from '../../common/operations/designer-variable-operations.js';
import { readDesignerVariableView } from '../../common/operations/designer-variable-view.js';
import {
  type DesignerVariablesDraft,
  renderDesignerVariables,
} from '../dom/designer-variables-dom.js';
import { DesignerVariableCatalogController } from './designer-variable-catalog-controller.js';
import { DesignerVariableEditorController } from './designer-variable-editor-controller.js';

export interface DesignerVariablesCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getCatalogPort?: () => ScreenHostVariableCatalogPort | undefined;
  readonly getVariablePort?: () => ScreenHostVariablePort | undefined;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly addToBlueprint?: (variableId: string) => void;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
}

/** Variable-panel orchestration; editing, catalog and preview requests have bounded controllers. */
export class DesignerVariablesController {
  #panel: HTMLElement | undefined;
  #search = '';
  #typeFilter: 'all' | ScreenVariable['type'] = 'all';
  #expandedVariableId: string | undefined;
  #expandedReferenceId: string | undefined;
  #lastDocument: ScreenDocument | undefined;
  readonly #catalog: DesignerVariableCatalogController;
  readonly #editor: DesignerVariableEditorController;

  constructor(private readonly callbacks: DesignerVariablesCallbacks) {
    this.#catalog = new DesignerVariableCatalogController({
      getCatalogPort: () => callbacks.getCatalogPort?.(),
      getVariablePort: () => callbacks.getVariablePort?.(),
      report: (diagnostics) => callbacks.report({ ok: false, diagnostics }),
      render: () => this.render(),
    });
    this.#editor = new DesignerVariableEditorController({
      getDocument: () => this.#lastDocument ?? callbacks.getDocument(),
      getPanel: () => this.#panel,
      getCatalog: () => this.#catalog,
      executeCommand: callbacks.executeCommand,
      onVariableRenamed: () => {},
      report: callbacks.report,
      renderAndFocus: (selector) => this.renderAndFocus(selector),
    });
  }

  connect(panel: HTMLElement): void {
    this.#panel = panel;
    this.render();
  }

  release(): void {
    this.#panel = undefined;
    this.#lastDocument = undefined;
    this.#expandedVariableId = undefined;
    this.#expandedReferenceId = undefined;
    this.#catalog.clear();
    this.#editor.reset();
  }

  render(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    const document = this.callbacks.getDocument();
    this.#lastDocument = document;
    renderDesignerVariables(panel, document, this.currentDraft());
  }

  currentDraft(): DesignerVariablesDraft {
    const document = this.#lastDocument ?? this.callbacks.getDocument();
    const catalog = this.#catalog.view;
    const editor = this.#editor.view;
    const references = document === undefined ? [] : collectVariableReferences(document);
    const referenceCounts = new Map<string, number>();
    for (const reference of references) {
      referenceCounts.set(
        reference.variableId,
        (referenceCounts.get(reference.variableId) ?? 0) + 1,
      );
    }
    const expandedReferenceName = references.some(
      (reference) => reference.variableId === this.#expandedReferenceId,
    )
      ? this.#expandedReferenceId
      : undefined;
    const expandedVariableName = document?.variables.some(
      (variable) => variable.id === this.#expandedVariableId,
    )
      ? this.#expandedVariableId
      : undefined;
    return {
      creating: editor.creating,
      configuringIndex: editor.configuringIndex,
      create: {
        type: editor.createType,
        name: editor.createName,
        description: editor.createDescription,
        valueSource: editor.createValueSource,
        sourceId: editor.selectedSourceId,
        processorId: editor.createProcessorId,
        controlled: editor.createControlled,
        autoUpdate: editor.createAutoUpdate,
        autoUpdateInterval: editor.createAutoUpdateInterval,
        catalogQuery: catalog.query,
        catalogItems: catalog.items,
        catalogCursor: catalog.nextCursor,
        catalogFeedback: catalog.feedback,
        previewStatus: catalog.previewStatus,
        previewSummary: catalog.previewSummary,
      },
      renamingIndex: editor.renamingIndex,
      editingDescriptionIndex: editor.editingDescriptionIndex,
      editingValueIndex: editor.editingValueIndex,
      deletingIndex: editor.deletingIndex,
      search: this.#search,
      typeFilter: this.#typeFilter,
      referenceCounts,
      references,
      expandedVariableName,
      expandedReferenceName,
      catalog,
    };
  }

  onClick(target: Element): boolean {
    const actionTarget = target.closest<HTMLElement>('[data-variable-action]');
    const action = actionTarget?.dataset.variableAction;
    if (action === undefined) return false;
    const index = Number(
      target.closest<HTMLElement>('[data-variable-index]')?.dataset.variableIndex ?? -1,
    );
    switch (action) {
      case 'add':
        this.#editor.beginCreate('static');
        return true;
      case 'create-type-static':
      case 'create-type-data-source':
      case 'create-type-url-query':
        this.#editor.switchCreateType(
          action === 'create-type-static'
            ? 'static'
            : action === 'create-type-data-source'
              ? 'data-source'
              : 'url-query',
        );
        return true;
      case 'select-host':
        this.#editor.captureCreateInputs();
        void this.#editor.selectHost(actionTarget!.dataset.sourceId ?? '');
        return true;
      case 'catalog-more':
        this.#editor.captureCreateInputs();
        this.#catalog.loadMore();
        return true;
      case 'cancel':
        this.#editor.cancel(index);
        return true;
      case 'rename':
        this.#editor.beginRowEdit(index, 'rename');
        return true;
      case 'edit-config':
        this.#editor.beginConfiguration(index);
        return true;
      case 'edit-description':
        this.#editor.beginRowEdit(index, 'description');
        return true;
      case 'edit-value':
        this.#editor.beginRowEdit(index, 'value');
        return true;
      case 'duplicate':
        this.#editor.duplicateVariable(index);
        return true;
      case 'toggle-variable': {
        const variable =
          this.#lastDocument?.variables[index] ?? this.callbacks.getDocument()?.variables[index];
        if (variable === undefined) return true;
        const expanded = this.#expandedVariableId === variable.id;
        this.#expandedVariableId = expanded ? undefined : variable.id;
        if (expanded && this.#expandedReferenceId === variable.id) {
          this.#expandedReferenceId = undefined;
        }
        this.renderAndFocus(
          `[data-variable-action="toggle-variable"][data-variable-index="${index}"]`,
        );
        return true;
      }
      case 'references': {
        const variable =
          this.#lastDocument?.variables[index] ?? this.callbacks.getDocument()?.variables[index];
        if (variable === undefined) return true;
        this.#expandedReferenceId =
          this.#expandedReferenceId === variable.id ? undefined : variable.id;
        this.renderAndFocus(`[data-variable-action="references"][data-variable-index="${index}"]`);
        return true;
      }
      case 'delete':
        this.#editor.requestDelete(index);
        return true;
      case 'preview': {
        const document = this.#lastDocument ?? this.callbacks.getDocument();
        const entry = document?.variables[index];
        if (document !== undefined && entry !== undefined) {
          void this.#catalog.preview(readDesignerVariableView(document, entry));
        }
        return true;
      }
      case 'add-to-blueprint': {
        const variable =
          this.#lastDocument?.variables[index] ?? this.callbacks.getDocument()?.variables[index];
        if (variable !== undefined) this.callbacks.addToBlueprint?.(variable.id);
        return true;
      }
      case 'confirm-create':
        this.#editor.confirmCreate();
        return true;
      case 'confirm-config':
        this.#editor.confirmCreate();
        return true;
      case 'confirm-rename':
        this.#editor.confirmRename(index);
        return true;
      case 'confirm-description':
        this.#editor.confirmDescription(index);
        return true;
      case 'confirm-value':
        this.#editor.confirmValue(index);
        return true;
      case 'confirm-delete':
        this.#editor.deleteVariable(index);
        return true;
      default:
        return false;
    }
  }

  onInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement)) return false;
    if (target.dataset.variableSearch !== undefined) {
      this.#search = target.value;
      this.renderAndRestoreInput('[data-variable-search]', target.value.length);
      return true;
    }
    if (target.dataset.variableCatalogSearch !== undefined) {
      this.#editor.captureCreateInputs();
      this.#catalog.updateQuery(target.value);
      return true;
    }
    return false;
  }

  onChange(target: EventTarget | null): boolean {
    if (target instanceof HTMLInputElement) {
      if (target.dataset.variableCreateControlled !== undefined) {
        this.#editor.captureCreateInputs();
        return true;
      }
      if (target.dataset.variableCreateAutoUpdate !== undefined) {
        this.#editor.captureCreateInputs();
        this.renderAndFocus('[data-variable-create-auto-update]');
        return true;
      }
      return false;
    }
    if (!(target instanceof HTMLSelectElement)) return false;
    if (target.dataset.variableCreateType !== undefined) {
      if (
        target.value === 'static' ||
        target.value === 'data-source' ||
        target.value === 'url-query'
      ) {
        this.#editor.switchCreateType(target.value);
      }
      return true;
    }
    if (target.dataset.variableTypeFilter === undefined) return false;
    if (
      target.value !== 'all' &&
      target.value !== 'static' &&
      target.value !== 'data-source' &&
      target.value !== 'url-query'
    )
      return false;
    this.#typeFilter = target.value;
    this.renderAndFocus('[data-variable-type-filter]');
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      !event.isComposing &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key === 'Enter' || event.key === ' ') &&
      target.closest('[data-variable-action="references"]') !== null
    ) {
      event.preventDefault();
      if (!event.repeat) this.onClick(target);
      return true;
    }
    if (
      target instanceof HTMLElement &&
      event.key === 'Escape' &&
      !event.isComposing &&
      target.closest('[data-variable-editor]') !== null
    ) {
      event.preventDefault();
      this.#editor.cancel(
        Number(target.closest<HTMLElement>('[data-variable-index]')?.dataset.variableIndex ?? -1),
      );
      return true;
    }
    if (!(target instanceof HTMLInputElement)) return false;
    const index = Number(
      target.dataset.variableRename ??
        target.dataset.variableDescription ??
        target.dataset.variableValue ??
        -1,
    );
    const editing =
      index >= 0 ||
      target.dataset.variableCreateName !== undefined ||
      target.dataset.variableCreateDescription !== undefined ||
      target.dataset.variableCreateValue !== undefined;
    if (!editing) return false;
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      this.#editor.cancel(index);
      return true;
    }
    if (event.key !== 'Enter' || event.isComposing) return false;
    event.preventDefault();
    if (target.dataset.variableRename !== undefined) this.#editor.confirmRename(index);
    else if (target.dataset.variableDescription !== undefined) {
      this.#editor.confirmDescription(index);
    } else if (target.dataset.variableValue !== undefined) this.#editor.confirmValue(index);
    else this.#editor.confirmCreate();
    return true;
  }

  private renderAndFocus(selector: string): void {
    this.render();
    const panel = this.#panel;
    const target = panel?.querySelector<HTMLElement>(selector);
    (target ?? panel?.querySelector<HTMLElement>('[data-variable-action="add"]'))?.focus();
  }

  private renderAndRestoreInput(selector: string, position: number): void {
    this.render();
    const input = this.#panel?.querySelector<HTMLInputElement>(selector);
    input?.focus();
    input?.setSelectionRange(position, position);
  }
}
