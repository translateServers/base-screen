import {
  type ScreenDocument,
  type ScreenHostCatalogPort,
  type ScreenParseResult,
  type ScreenVariable,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import { collectVariableReferences } from '../../../common/operations/designer-variable-operations.js';
import { readDesignerVariableView } from '../../../common/operations/designer-variable-view.js';
import {
  type DesignerVariableInspectorSurface,
  ensureDesignerVariableInspector,
  renderDesignerVariableInspector,
  renderDesignerVariableRowMenu,
} from '../../dom/designer-variable-inspector-dom.js';
import {
  type DesignerVariablesDraft,
  renderDesignerVariables,
} from '../../dom/designer-variables-dom.js';
import { DesignerVariableCatalogController } from './designer-variable-catalog-controller.js';
import { DesignerVariableEditorController } from './designer-variable-editor-controller.js';

export interface DesignerVariablesCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getHostCatalogPort?: () => ScreenHostCatalogPort | undefined;
  readonly getOverlayHost?: () => HTMLElement | undefined;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly addToBlueprint?: (variableId: string) => void;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
}

/** Variable-panel orchestration; editing, catalog and preview requests have bounded controllers. */
export class DesignerVariablesController {
  #panel: HTMLElement | undefined;
  #scope: HTMLElement | undefined;
  #inspector: DesignerVariableInspectorSurface | undefined;
  #search = '';
  #typeFilter: 'all' | ScreenVariable['type'] = 'all';
  #expandedVariableId: string | undefined;
  #expandedReferenceId: string | undefined;
  #menuIndex: number | undefined;
  #lastDocument: ScreenDocument | undefined;
  readonly #touchedFields = new Set<'name' | 'description' | 'value' | 'interval'>();
  readonly #validationTimers: Partial<
    Record<'name' | 'description' | 'value' | 'interval', ReturnType<typeof setTimeout>>
  > = {};
  readonly #catalog: DesignerVariableCatalogController;
  readonly #editor: DesignerVariableEditorController;

  constructor(private readonly callbacks: DesignerVariablesCallbacks) {
    this.#catalog = new DesignerVariableCatalogController({
      getHostCatalogPort: () => callbacks.getHostCatalogPort?.(),
      report: (diagnostics) => callbacks.report({ ok: false, diagnostics }),
      render: () => this.render(),
    });
    this.#editor = new DesignerVariableEditorController({
      getDocument: () => this.#lastDocument ?? callbacks.getDocument(),
      getPanel: () => this.#scope ?? this.#panel,
      getCatalog: () => this.#catalog,
      executeCommand: callbacks.executeCommand,
      onVariableRenamed: () => {},
      report: callbacks.report,
      renderAndFocus: (selector) => this.renderAndFocus(selector),
    });
  }

  connect(panel: HTMLElement): void {
    this.#inspector?.layer.remove?.();
    this.#panel = panel;
    this.#scope =
      this.callbacks.getOverlayHost?.() ??
      (typeof panel.closest === 'function' ? panel.closest<HTMLElement>('.designer') : null) ??
      panel;
    this.#inspector = undefined;
    this.render();
  }

  release(): void {
    this.#inspector?.layer.remove?.();
    this.#inspector = undefined;
    this.#panel = undefined;
    this.#scope = undefined;
    this.#lastDocument = undefined;
    this.#expandedVariableId = undefined;
    this.#expandedReferenceId = undefined;
    this.#menuIndex = undefined;
    this.clearLiveValidation();
    this.#catalog.clear();
    this.#editor.reset();
  }

  render(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    if (!this.hasActiveEditor()) this.clearLiveValidation();
    const document = this.callbacks.getDocument();
    this.#lastDocument = document;
    const draft = this.currentDraft();
    renderDesignerVariables(panel, document, draft);
    const scope = this.#scope ?? panel;
    const inspector = ensureDesignerVariableInspector(scope);
    this.#inspector = inspector;
    renderDesignerVariableInspector(inspector, panel, document, draft);
    renderDesignerVariableRowMenu(inspector, panel, document, draft);
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
      menuIndex: this.#menuIndex,
      canAddToBlueprint: this.callbacks.addToBlueprint !== undefined,
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
    if (action === undefined) {
      if (this.#menuIndex !== undefined) {
        this.#menuIndex = undefined;
        this.render();
      }
      return false;
    }
    if (this.#menuIndex !== undefined && action !== 'more') this.#menuIndex = undefined;
    const index = Number(
      target.closest<HTMLElement>('[data-variable-index]')?.dataset.variableIndex ?? -1,
    );
    switch (action) {
      case 'clear-search':
        this.#search = '';
        this.renderAndFocus('[data-variable-search]');
        return true;
      case 'add':
        this.clearLiveValidation();
        this.#editor.beginCreate('static');
        return true;
      case 'create-data-source':
        this.clearLiveValidation();
        this.#editor.beginCreate('data-source');
        return true;
      case 'create-url-query':
        this.clearLiveValidation();
        this.#editor.beginCreate('url-query');
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
      case 'close-inspector':
        this.#menuIndex = undefined;
        if (this.hasActiveEditor()) {
          this.#editor.cancel(index);
        } else if (this.#expandedVariableId !== undefined) {
          this.#expandedVariableId = undefined;
          this.#expandedReferenceId = undefined;
          this.renderAndFocus(
            `[data-variable-action="toggle-variable"][data-variable-index="${index}"]`,
          );
        }
        return true;
      case 'more': {
        const opening = this.#menuIndex !== index;
        this.#menuIndex = opening ? index : undefined;
        this.render();
        if (opening) {
          this.#scope
            ?.querySelector<HTMLElement>('[data-variable-row-menu] [role="menuitem"]')
            ?.focus();
        } else {
          this.#panel
            ?.querySelector<HTMLElement>(
              `[data-variable-action="more"][data-variable-index="${index}"]`,
            )
            ?.focus();
        }
        return true;
      }
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
        this.#menuIndex = undefined;
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
        const open =
          this.#expandedVariableId === variable.id && this.#expandedReferenceId === variable.id;
        this.#expandedVariableId = variable.id;
        this.#expandedReferenceId = open ? undefined : variable.id;
        this.#menuIndex = undefined;
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
          this.#expandedVariableId = entry.id;
          this.#expandedReferenceId = undefined;
          this.#menuIndex = undefined;
          void this.#catalog.preview(readDesignerVariableView(document, entry));
          this.render();
        }
        return true;
      }
      case 'add-to-blueprint': {
        const variable =
          this.#lastDocument?.variables[index] ?? this.callbacks.getDocument()?.variables[index];
        this.#menuIndex = undefined;
        if (variable !== undefined) this.callbacks.addToBlueprint?.(variable.id);
        this.render();
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
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return false;
    }
    if (target.dataset.variableSearch !== undefined) {
      this.#search = target.value;
      this.#menuIndex = undefined;
      this.renderAndRestoreInput('[data-variable-search]', target.value.length);
      return true;
    }
    if (target.dataset.variableCatalogSearch !== undefined) {
      this.#editor.captureCreateInputs();
      this.#catalog.updateQuery(target.value);
      return true;
    }
    const field = liveFieldForInput(target);
    if (field !== undefined) {
      this.#editor.captureCreateInputs();
      if (this.#validationTimers[field] !== undefined) {
        clearTimeout(this.#validationTimers[field]);
      }
      if (field === 'description') {
        this.#editor.validateLive(field);
      } else if (field === 'value') {
        this.#validationTimers[field] = setTimeout(() => {
          this.#editor.validateLive('value');
        }, 400);
      } else if (field === 'name' && this.#touchedFields.has('name')) {
        this.#validationTimers[field] = setTimeout(() => {
          this.#editor.validateLive('name');
        }, 300);
      }
      return true;
    }
    return false;
  }

  onFocusOut(event: FocusEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return false;
    }
    const field = liveFieldForInput(target);
    if (field === undefined) return false;
    const next = event.relatedTarget;
    if (next instanceof HTMLElement && next.closest('[data-variable-action]') !== null) {
      return true;
    }
    this.#editor.captureCreateInputs();
    this.#touchedFields.add(field);
    if (this.#validationTimers[field] !== undefined) {
      clearTimeout(this.#validationTimers[field]);
      delete this.#validationTimers[field];
    }
    this.#editor.validateLive(field);
    return true;
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
    if (target instanceof HTMLElement && this.#menuIndex !== undefined && !event.isComposing) {
      const index = this.#menuIndex;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.#menuIndex = undefined;
        this.renderAndFocus(`[data-variable-action="more"][data-variable-index="${index}"]`);
        return true;
      }
      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        (target.closest('[data-variable-row-menu]') !== null ||
          target.closest('[data-variable-action="more"]') !== null)
      ) {
        event.preventDefault();
        const items = [
          ...(this.#scope?.querySelectorAll<HTMLElement>(
            '[data-variable-row-menu] [role="menuitem"]',
          ) ?? []),
        ];
        if (items.length > 0) {
          const current = items.indexOf(document.activeElement as HTMLElement);
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          items[(current + delta + items.length) % items.length]?.focus();
        }
        return true;
      }
    }
    if (
      target instanceof HTMLElement &&
      event.key === 'Escape' &&
      !event.isComposing &&
      (target.closest('[data-variable-editor]') !== null ||
        target.closest('[data-variable-inspector]') !== null)
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

  private clearLiveValidation(): void {
    for (const field of ['name', 'description', 'value', 'interval'] as const) {
      if (this.#validationTimers[field] !== undefined) {
        clearTimeout(this.#validationTimers[field]);
        delete this.#validationTimers[field];
      }
    }
    this.#touchedFields.clear();
  }

  private hasActiveEditor(): boolean {
    const view = this.#editor.view;
    return (
      view.creating ||
      view.renamingIndex !== undefined ||
      view.editingDescriptionIndex !== undefined ||
      view.editingValueIndex !== undefined ||
      view.deletingIndex !== undefined
    );
  }

  private renderAndFocus(selector: string): void {
    this.render();
    const target =
      this.#scope?.querySelector<HTMLElement>(selector) ??
      this.#panel?.querySelector<HTMLElement>(selector);
    const fallback =
      this.#scope?.querySelector<HTMLElement>('[data-variable-action="add"]') ??
      this.#panel?.querySelector<HTMLElement>('[data-variable-action="add"]');
    (target ?? fallback)?.focus();
  }

  private renderAndRestoreInput(selector: string, position: number): void {
    this.render();
    const input =
      this.#scope?.querySelector<HTMLInputElement>(selector) ??
      this.#panel?.querySelector<HTMLInputElement>(selector);
    input?.focus();
    input?.setSelectionRange(position, position);
  }
}

function liveFieldForInput(
  target: HTMLInputElement | HTMLTextAreaElement,
): 'name' | 'description' | 'value' | 'interval' | undefined {
  if (target.dataset.variableCreateName !== undefined) return 'name';
  if (target.dataset.variableCreateDescription !== undefined) return 'description';
  if (target.dataset.variableCreateValue !== undefined) return 'value';
  if (target.dataset.variableCreateAutoUpdateInterval !== undefined) return 'interval';
  return undefined;
}
