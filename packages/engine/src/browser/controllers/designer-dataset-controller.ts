import {
  MAX_DATASET_FIELDS,
  MAX_DATASET_ROWS,
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenDataBinding,
  type ScreenDatasetDescriptor,
  type ScreenDatasetField,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostDatasetCatalogPort,
  type ScreenHostResourcePort,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenTabularDataset,
} from '@base-screen/contracts';
import {
  type ScreenDocumentTransaction,
  type ScreenInteractionState,
  validateScreenHostResourceBinding,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type DesignerDataSourceMode,
  type DesignerDataSourcePanelOptions,
  type DesignerDatasetAuthoringAction,
  type DesignerDatasetAuthoringView,
  type DesignerDatasetDraftView,
  type DesignerDatasetPreviewTab,
  type DesignerDatasetPreviewView,
  type DesignerDatasetRefreshStrategy,
  type DesignerDatasetWorkbenchStep,
  renderDesignerDataSourcePanel,
  renderDesignerDatasetWorkbench,
} from '../dom/designer-dataset-dom.js';
import { renderDesignerDescriptorZone } from '../dom/designer-descriptor-dom.js';
import { DesignerDataFlowScrollSync } from './designer-data-flow-scroll-sync.js';
import {
  createDatasetDataSourceTransaction,
  createDesignerDatasetDraft,
  createEmptyDataSourceTransaction,
  createStaticDataSourceTransaction,
  defaultDatasetParameterValue,
  designerDataSourceModes,
  toggleDesignerDatasetBindingField,
  updateDesignerDatasetParameter,
} from './designer-data-source-authoring.js';
import { DesignerDatasetCatalogController } from './designer-dataset-catalog-controller.js';
import { coerceDesignerStaticCell, parseDesignerTsv } from './designer-static-tabular.js';

export interface DesignerDatasetControllerCallbacks {
  readonly getCatalogPort: () => ScreenHostDatasetCatalogPort | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly refresh: (componentId?: string) => void;
  readonly requestAuthoringAction?: (
    action: DesignerDatasetAuthoringAction,
    detail?: Readonly<Record<string, string | number | boolean>>,
  ) => void;
  readonly copyText?: (value: string) => Promise<boolean>;
  readonly getWorkbenchHost?: () => HTMLElement | undefined;
}

/** Owns the host dataset catalog and the data-source authoring surface. */
export class DesignerDatasetController {
  readonly #catalogController: DesignerDatasetCatalogController;
  #descriptor: ScreenDatasetDescriptor | undefined;
  #draft: DesignerDatasetDraftView | undefined;
  #mode: DesignerDataSourceMode = 'none';
  #staticDraft = 'null';
  #staticValue: import('@base-screen/contracts').ScreenJsonValue = null;
  #staticBinding: ScreenDataBinding | undefined;
  #staticDialogOpen = false;
  #staticTab: 'table' | 'advanced' = 'table';
  #staticPage = 0;
  #staticPasteDraft = '';
  #staticFirstRowIsHeader = true;
  #workbenchOpen = false;
  #catalogOpen = false;
  #feedbackText = '';
  #draftDirty = false;
  #confirmClose = false;
  #preview: DesignerDatasetPreviewView = emptyDatasetPreview();
  #activeStep: DesignerDatasetWorkbenchStep = 'source';
  #authoring: DesignerDatasetAuthoringView = createDatasetAuthoringView();
  #previewController: AbortController | undefined;
  #previewGeneration = 0;
  #focusedComponentId: string | null = null;
  #syncedDataSource: ScreenDocument['components'][number]['dataSource'] | undefined;
  #panel: HTMLElement | undefined;
  #feedback: HTMLElement | undefined;
  readonly #dataFlowScrollSync: DesignerDataFlowScrollSync;

  constructor(private readonly callbacks: DesignerDatasetControllerCallbacks) {
    this.#dataFlowScrollSync = new DesignerDataFlowScrollSync((step) =>
      this.syncDataFlowProgress(step),
    );
    this.#catalogController = new DesignerDatasetCatalogController({
      getPort: callbacks.getCatalogPort,
      report: callbacks.report,
      setFeedback: (message) => this.setFeedback(message),
      render: () => this.renderSurface(),
    });
  }

  render(panel: HTMLElement | undefined): void {
    this.clearSurface();
    const component = this.currentComponent();
    if (component === undefined) {
      if (panel !== undefined) panel.replaceChildren(DESIGNER_UI_TEXT.dataPanelEmpty);
      return;
    }
    const describeTarget = this.syncDraftToFocusedComponent();
    if (panel === undefined) return;
    this.#panel = panel;
    this.renderSurface();
    if (this.#mode !== 'dataset') return;
    this.#catalogController.ensureList();
    if (describeTarget !== undefined) {
      void this.describe(describeTarget.resourceType, describeTarget.resourceId);
    }
  }

  getFocusedDatasetFields(): readonly { readonly id: string; readonly label: string }[] {
    if (this.#descriptor === undefined) return [];
    return this.#descriptor.fields.map((field) => ({ id: field.id, label: field.label }));
  }

  clear(): void {
    this.#catalogController.clear();
    this.clearSurface();
    this.#descriptor = undefined;
    this.#draft = undefined;
    this.#mode = 'none';
    this.#staticDraft = 'null';
    this.#staticValue = null;
    this.#staticBinding = undefined;
    this.#staticDialogOpen = false;
    this.#staticTab = 'table';
    this.#staticPage = 0;
    this.#staticPasteDraft = '';
    this.#workbenchOpen = false;
    this.#catalogOpen = false;
    this.#feedbackText = '';
    this.#draftDirty = false;
    this.#confirmClose = false;
    this.cancelPreview();
    this.#preview = emptyDatasetPreview();
    this.#activeStep = 'source';
    this.#authoring = createDatasetAuthoringView();
    this.#focusedComponentId = null;
    this.#syncedDataSource = undefined;
  }

  onInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return false;
    }
    if (target.dataset.dataSourceStatic !== undefined) {
      this.#staticDraft = target.value;
      this.syncStaticValueFromJson();
      return true;
    }
    if (target.dataset.staticPaste !== undefined) {
      this.#staticPasteDraft = target.value;
      return true;
    }
    if (target.dataset.staticScalar !== undefined) {
      if (target.dataset.staticScalar === 'number') {
        const value = Number(target.value);
        if (!Number.isFinite(value)) return true;
        this.setStaticValue(value);
      } else if (target.dataset.staticScalar === 'string') {
        this.setStaticValue(target.value);
      }
      return true;
    }
    if (target.dataset.staticFieldIndex !== undefined) {
      this.updateStaticField(
        Number(target.dataset.staticFieldIndex),
        target.dataset.staticFieldProperty,
        target.value,
      );
      return true;
    }
    if (target.dataset.staticCellRow !== undefined) {
      this.updateStaticCell(
        Number(target.dataset.staticCellRow),
        target.dataset.staticCellField ?? '',
        target.value,
      );
      return true;
    }
    if (target.dataset.datasetQuery === undefined) return false;
    this.#catalogController.updateQuery(target.value);
    return true;
  }

  onClick(target: Element): boolean {
    const staticBindingField = target.closest<HTMLButtonElement>('[data-static-binding-field]');
    if (staticBindingField !== null) {
      const role = this.currentEntry()?.manifest.dataBinding?.roles.find(
        (candidate) => candidate.id === staticBindingField.dataset.staticBindingRole,
      );
      const fieldId = staticBindingField.dataset.staticBindingField;
      if (role !== undefined && fieldId !== undefined) {
        const selected = this.#staticBinding?.fields[role.id] ?? [];
        const next = selected.includes(fieldId)
          ? selected.filter((item) => item !== fieldId)
          : selected.length < role.maxFields
            ? [...selected, fieldId]
            : selected;
        this.#staticBinding = {
          fields: { ...this.#staticBinding?.fields, [role.id]: next },
        };
        this.renderSurface();
        this.restoreBindingFieldFocus('static', role.id, fieldId);
      }
      return true;
    }
    const staticAction = target.closest<HTMLButtonElement>('[data-static-action]');
    if (staticAction !== null) {
      this.handleStaticAction(staticAction);
      return true;
    }
    const sourceMode = target.closest<HTMLButtonElement>('[data-data-source-mode]')?.dataset
      .dataSourceMode as DesignerDataSourceMode | undefined;
    if (sourceMode !== undefined) {
      this.setSourceMode(sourceMode);
      return true;
    }
    if (target.closest('[data-dataset-change]') !== null) {
      this.#catalogOpen = true;
      this.renderSurface();
      this.#catalogController.ensureList();
      return true;
    }
    if (target.closest('[data-dataset-load-more]') !== null) {
      this.#catalogController.loadMore();
      return true;
    }
    const bindingField = target.closest<HTMLButtonElement>('[data-dataset-binding-field]');
    if (bindingField !== null) {
      const role = this.currentEntry()?.manifest.dataBinding?.roles.find(
        (item) => item.id === bindingField.dataset.datasetBindingRoleId,
      );
      const fieldId = bindingField.dataset.datasetBindingField;
      if (this.#draft !== undefined && role !== undefined && fieldId !== undefined) {
        this.#draft = toggleDesignerDatasetBindingField(this.#draft, role, fieldId);
        this.markDatasetDraftChanged();
        this.restoreBindingFieldFocus('dataset', role.id, fieldId);
      }
      return true;
    }
    const bindingAction = target.closest<HTMLButtonElement>('[data-dataset-binding-role-action]');
    if (bindingAction !== null) {
      const role = this.currentEntry()?.manifest.dataBinding?.roles.find(
        (item) => item.id === bindingAction.dataset.datasetBindingRoleId,
      );
      if (this.#draft !== undefined && this.#descriptor !== undefined && role !== undefined) {
        const compatible = this.#descriptor.fields
          .filter((field) => role.valueTypes.includes(field.valueType))
          .slice(0, role.maxFields)
          .map((field) => field.id);
        this.#draft = {
          ...this.#draft,
          fields: {
            ...this.#draft.fields,
            [role.id]: bindingAction.dataset.datasetBindingRoleAction === 'clear' ? [] : compatible,
          },
        };
        this.markDatasetDraftChanged();
      }
      return true;
    }
    const previewTab = target.closest<HTMLButtonElement>('[data-dataset-preview-tab]')?.dataset
      .datasetPreviewTab as DesignerDatasetPreviewTab | undefined;
    if (previewTab === 'response' || previewTab === 'consumer' || previewTab === 'request') {
      this.#preview = { ...this.#preview, tab: previewTab };
      this.renderSurface();
      return true;
    }
    const workbenchStep =
      target.closest<HTMLButtonElement>('[data-workbench-step]')?.dataset.workbenchStep;
    if (workbenchStep !== undefined) {
      this.focusWorkbenchSection(workbenchStep as DesignerDatasetWorkbenchStep);
      return true;
    }
    const editorMode = target.closest<HTMLButtonElement>('[data-dataset-editor-mode]')?.dataset
      .datasetEditorMode as DesignerDatasetAuthoringView['editorMode'] | undefined;
    if (editorMode === 'visual' || editorMode === 'code') {
      this.#authoring = { ...this.#authoring, editorMode };
      if (editorMode === 'code') {
        this.callbacks.requestAuthoringAction?.('open-code-editor');
      }
      this.renderSurface();
      return true;
    }
    const authoringAction = target.closest<HTMLButtonElement>('[data-dataset-authoring-action]')
      ?.dataset.datasetAuthoringAction as DesignerDatasetAuthoringAction | undefined;
    if (authoringAction !== undefined) {
      if (authoringAction === 'copy-data') {
        void this.copyPreviewData();
      } else if (authoringAction === 'fullscreen-edit') {
        this.#workbenchOpen = true;
        this.#confirmClose = false;
        this.callbacks.requestAuthoringAction?.(authoringAction);
        this.renderSurface();
        this.focusDataWorkbench();
      } else {
        this.callbacks.requestAuthoringAction?.(authoringAction);
      }
      return true;
    }
    const actionTarget = target.closest<HTMLButtonElement>('[data-dataset-action]');
    const action = actionTarget?.dataset.datasetAction;
    if (action === 'select-step') {
      this.#confirmClose = false;
      const requestedStep = actionTarget?.dataset.datasetWorkbenchTarget;
      const step = isDatasetWorkbenchStep(requestedStep) ? requestedStep : 'source';
      this.focusWorkbenchSection(step);
      if (step === 'source' && this.#mode === 'dataset') {
        this.#catalogController.ensureList();
      }
      return true;
    }
    if (action === 'open-workbench') {
      this.#workbenchOpen = true;
      this.#confirmClose = false;
      const requestedStep = actionTarget?.dataset.datasetWorkbenchTarget;
      this.#activeStep = isDatasetWorkbenchStep(requestedStep) ? requestedStep : 'source';
      if (this.#activeStep === 'preview') {
        this.#preview = { ...this.#preview, open: true };
      }
      this.renderSurface();
      this.focusDataWorkbench();
      return true;
    }
    if (action === 'close-workbench') {
      if (this.#mode === 'dataset' && this.#draftDirty) {
        this.#confirmClose = true;
        this.renderSurface();
        return true;
      }
      this.#workbenchOpen = false;
      this.#staticDialogOpen = false;
      this.#confirmClose = false;
      this.renderSurface();
      this.restoreFullscreenActionFocus();
      return true;
    }
    if (action === 'keep-editing') {
      this.#confirmClose = false;
      this.renderSurface();
      return true;
    }
    if (action === 'discard-workbench') {
      this.restoreDatasetDraft();
      this.#workbenchOpen = false;
      this.#staticDialogOpen = false;
      this.#confirmClose = false;
      this.renderSurface();
      this.restoreFullscreenActionFocus();
      return true;
    }
    if (action === 'toggle-preview') {
      this.#preview = { ...this.#preview, open: !this.#preview.open };
      this.renderSurface();
      return true;
    }
    if (action === 'apply') {
      this.apply();
      return true;
    }
    if (action === 'test') {
      void this.testDatasetDraft();
      return true;
    }
    if (action === 'refresh') {
      this.callbacks.refresh(this.callbacks.getInteraction().focusedComponentId ?? undefined);
      return true;
    }
    const item = target.closest<HTMLElement>('[data-dataset-resource-id]');
    if (item?.dataset.datasetResourceId === undefined) return false;
    void this.describe(
      item.dataset.datasetResourceType ?? 'dataset',
      item.dataset.datasetResourceId,
    );
    return true;
  }

  onChange(target: EventTarget | null): boolean {
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement) &&
      !(target instanceof HTMLTextAreaElement)
    ) {
      return false;
    }
    if (target.dataset.dataSourceModeSelect !== undefined && target instanceof HTMLSelectElement) {
      this.setSourceMode(target.value as DesignerDataSourceMode);
      return true;
    }
    if (target.dataset.staticFirstRowHeader !== undefined && target instanceof HTMLInputElement) {
      this.#staticFirstRowIsHeader = target.checked;
      return true;
    }
    if (target.dataset.staticScalar === 'boolean' && target instanceof HTMLInputElement) {
      this.setStaticValue(target.checked);
      return true;
    }
    if (target.dataset.staticFieldIndex !== undefined) {
      this.updateStaticField(
        Number(target.dataset.staticFieldIndex),
        target.dataset.staticFieldProperty,
        target instanceof HTMLInputElement && target.type === 'checkbox'
          ? target.checked
          : target.value,
      );
      return true;
    }
    if (target.dataset.staticBindingRole !== undefined && target instanceof HTMLSelectElement) {
      const roleId = target.dataset.staticBindingRole;
      const selected = target.multiple
        ? [...target.selectedOptions].map((option) => option.value)
        : target.value === ''
          ? []
          : [target.value];
      this.#staticBinding = {
        fields: { ...this.#staticBinding?.fields, [roleId]: selected },
      };
      this.renderSurface();
      return true;
    }
    if (target.dataset.datasetAuthoringSetting !== undefined) {
      this.updateAuthoringSetting(target.dataset.datasetAuthoringSetting, target);
      return true;
    }
    if (target.dataset.datasetParameterMode !== undefined) {
      const name = target.dataset.datasetParameterMode;
      if (this.#draft === undefined) return true;
      const value =
        target.value === 'variable'
          ? { kind: 'variable' as const, name: '' }
          : {
              kind: 'literal' as const,
              value: defaultDatasetParameterValue(this.#descriptor, name),
            };
      this.#draft = { ...this.#draft, params: { ...this.#draft.params, [name]: value } };
      this.markDatasetDraftChanged();
      return true;
    }
    if (target.dataset.datasetParameter !== undefined) {
      if (this.#draft !== undefined && this.#descriptor !== undefined) {
        this.#draft = updateDesignerDatasetParameter(
          this.#draft,
          this.#descriptor,
          target.dataset.datasetParameter,
          target,
        );
        this.markDatasetDraftChanged();
      }
      return true;
    }
    if (target.dataset.datasetBindingRole !== undefined) {
      if (this.#draft === undefined || !(target instanceof HTMLSelectElement)) return true;
      const roleId = target.dataset.datasetBindingRole;
      const selectedValue = target.value || target.selectedOptions[0]?.value || '';
      const values = selectedValue === '' ? [] : [selectedValue];
      this.#draft = { ...this.#draft, fields: { ...this.#draft.fields, [roleId]: values } };
      this.markDatasetDraftChanged();
      return true;
    }
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.#workbenchOpen) {
      event.preventDefault();
      if (this.#mode === 'dataset' && this.#draftDirty) {
        this.#confirmClose = true;
        this.renderSurface();
      } else {
        this.#workbenchOpen = false;
        this.#confirmClose = false;
        this.renderSurface();
        this.restoreFullscreenActionFocus();
      }
      return true;
    }
    if (event.key !== 'Enter' || event.isComposing) return false;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return false;
    if (
      target.dataset.datasetParameter !== undefined ||
      target.dataset.datasetBindingRole !== undefined
    ) {
      event.preventDefault();
      this.apply();
      return true;
    }
    return false;
  }

  get descriptor(): ScreenDatasetDescriptor | undefined {
    return this.#descriptor;
  }

  get authoring(): DesignerDatasetAuthoringView {
    return this.#authoring;
  }

  private setSourceMode(mode: DesignerDataSourceMode): void {
    if (!this.availableModes().includes(mode)) return;
    this.#mode = mode;
    this.#activeStep = 'source';
    this.#workbenchOpen = false;
    this.#staticDialogOpen = false;
    this.#feedbackText = '';
    this.#confirmClose = false;
    if (mode === 'static' && this.currentComponent()?.dataSource?.type !== 'static') {
      this.restoreStaticExample();
    }
    if (mode !== 'dataset') {
      this.renderSurface();
      return;
    }
    const source = this.currentComponent()?.dataSource;
    if (
      source?.type === 'host-resource' &&
      (this.#descriptor?.resourceType !== source.resourceType ||
        this.#descriptor.resourceId !== source.resourceId)
    ) {
      this.#catalogOpen = false;
      this.renderSurface();
      void this.describe(source.resourceType, source.resourceId);
    } else {
      this.#catalogOpen = this.#descriptor === undefined;
      this.renderSurface();
    }
    this.#catalogController.ensureList();
  }

  private async describe(resourceType: string, resourceId: string): Promise<void> {
    const descriptor = await this.#catalogController.describe(resourceType, resourceId);
    if (descriptor === undefined) return;
    this.#descriptor = descriptor;
    this.#draft = createDesignerDatasetDraft(
      descriptor,
      this.currentComponent()?.dataSource ?? null,
      this.currentEntry()?.manifest.dataBinding?.roles ?? [],
    );
    this.#mode = 'dataset';
    this.#catalogOpen = false;
    this.#draftDirty = this.isDatasetDraftDirty();
    this.#preview = emptyDatasetPreview();
    this.#activeStep = 'source';
    this.#feedbackText = DESIGNER_UI_TEXT.dataset.selected(descriptor.name);
    this.renderSurface();
  }

  private apply(): void {
    const component = this.currentComponent();
    const document = this.callbacks.getDocument();
    if (component === undefined || document === undefined) return;
    let transaction: ScreenParseResult<ScreenDocumentTransaction>;
    if (this.#mode === 'none') transaction = createEmptyDataSourceTransaction(component.id);
    else if (this.#mode === 'static') {
      const entry = this.currentEntry();
      transaction = createStaticDataSourceTransaction(
        component.id,
        this.#staticDraft,
        entry?.manifest.staticData,
        this.#staticBinding,
        entry?.manifest.dataBinding?.roles ?? [],
      );
    } else {
      const descriptor = this.#descriptor;
      const draft = this.#draft;
      const runtime =
        descriptor === undefined
          ? undefined
          : this.callbacks.getRuntimeContributions()?.getResourceType(descriptor.resourceType);
      if (descriptor === undefined || draft === undefined || runtime === undefined) {
        this.setFeedback(DESIGNER_UI_TEXT.dataset.incomplete);
        return;
      }
      transaction = createDatasetDataSourceTransaction({
        document,
        componentId: component.id,
        descriptor,
        draft,
        roles: this.currentEntry()?.manifest.dataBinding?.roles ?? [],
        runtime,
      });
    }
    if (!transaction.ok) {
      this.callbacks.report(transaction.diagnostics);
      this.setFeedback(transaction.diagnostics[0]?.message ?? DESIGNER_UI_TEXT.dataset.incomplete);
      return;
    }
    const result = this.callbacks.executeTransaction(transaction.value);
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      return;
    }
    this.setFeedback(DESIGNER_UI_TEXT.dataSource.applied);
    this.#draftDirty = false;
    this.#confirmClose = false;
    this.#staticDialogOpen = false;
    this.#activeStep = 'source';
    this.renderSurface();
  }

  private syncDraftToFocusedComponent():
    | { readonly resourceType: string; readonly resourceId: string }
    | undefined {
    const component = this.currentComponent();
    const focusedId = component?.id ?? null;
    const source = component?.dataSource;
    if (focusedId === this.#focusedComponentId && sameJsonValue(source, this.#syncedDataSource)) {
      // Session commits replace the document graph even when this component's data source did not
      // change. Keep authoring drafts, preview state, and host settings alive across such commits.
      this.#syncedDataSource = source;
      return;
    }
    const sameFocusedComponent = focusedId === this.#focusedComponentId;
    const activeStep = sameFocusedComponent ? this.#activeStep : 'source';
    const authoring = sameFocusedComponent ? this.#authoring : createDatasetAuthoringView();
    this.#focusedComponentId = focusedId;
    this.#syncedDataSource = source;
    this.#feedbackText = '';
    this.#draftDirty = false;
    this.#confirmClose = false;
    if (!sameFocusedComponent) this.#workbenchOpen = false;
    this.cancelPreview();
    this.#preview = emptyDatasetPreview();
    this.#activeStep = activeStep;
    this.#authoring = authoring;
    if (source?.type === 'static') {
      this.#mode = 'static';
      this.#staticDraft = JSON.stringify(source.value, null, 2);
      this.#staticValue = source.value;
      this.#staticBinding = source.binding;
      this.#staticDialogOpen = false;
      this.#staticPage = 0;
      this.#descriptor = undefined;
      this.#draft = undefined;
      this.#catalogOpen = false;
      return;
    }
    if (source?.type === 'host-resource') {
      this.#mode = 'dataset';
      this.#staticDialogOpen = false;
      this.#catalogOpen = false;
      if (
        this.#descriptor?.resourceType === source.resourceType &&
        this.#descriptor.resourceId === source.resourceId
      ) {
        this.#draft = createDesignerDatasetDraft(
          this.#descriptor,
          source,
          this.currentEntry()?.manifest.dataBinding?.roles ?? [],
        );
        return;
      }
      this.#descriptor = undefined;
      this.#draft = undefined;
      return { resourceType: source.resourceType, resourceId: source.resourceId };
    }
    this.#mode = 'none';
    this.#staticDialogOpen = false;
    this.#descriptor = undefined;
    this.#draft = undefined;
    this.#catalogOpen = false;
    return;
  }

  private handleStaticAction(button: HTMLButtonElement): void {
    const action = button.dataset.staticAction;
    if (action === 'open') {
      this.#staticDialogOpen = true;
      this.renderSurface();
      return;
    }
    if (action === 'cancel') {
      const source = this.currentComponent()?.dataSource;
      if (source?.type === 'static') {
        this.#staticValue = source.value;
        this.#staticBinding = source.binding;
        this.#staticDraft = JSON.stringify(source.value, null, 2);
      } else {
        this.restoreStaticExample(false);
      }
      this.#staticDialogOpen = false;
      this.#feedbackText = '';
      this.renderSurface();
      return;
    }
    if (action === 'apply') {
      this.apply();
      return;
    }
    if (action === 'restore') {
      this.restoreStaticExample();
      return;
    }
    if (action === 'tab-table' || action === 'tab-advanced') {
      this.#staticTab = action === 'tab-table' ? 'table' : 'advanced';
      this.renderSurface();
      return;
    }
    if (action === 'paste') {
      const parsed = parseDesignerTsv(this.#staticPasteDraft, this.#staticFirstRowIsHeader);
      if (!parsed.ok) {
        this.callbacks.report(parsed.diagnostics);
        this.setFeedback(this.formatStaticDiagnostic(parsed.diagnostics[0]));
        return;
      }
      this.#staticBinding = this.defaultStaticBinding(parsed.value);
      this.setStaticDataset(parsed.value);
      return;
    }
    if (action === 'field-add') {
      this.addStaticField();
      return;
    }
    if (action === 'row-add') {
      this.addStaticRow();
      return;
    }
    if (action === 'page-previous' || action === 'page-next') {
      this.#staticPage = Math.max(0, this.#staticPage + (action === 'page-next' ? 1 : -1));
      this.renderSurface();
      return;
    }
    if (action === 'binding-select-all' || action === 'binding-clear') {
      const role = this.currentEntry()?.manifest.dataBinding?.roles.find(
        (candidate) => candidate.id === button.dataset.staticBindingRole,
      );
      const dataset = this.currentStaticDataset();
      if (role !== undefined && dataset !== undefined) {
        const selected =
          action === 'binding-clear'
            ? []
            : dataset.fields
                .filter((field) => role.valueTypes.includes(field.valueType))
                .slice(0, role.maxFields)
                .map((field) => field.id);
        this.#staticBinding = {
          fields: { ...this.#staticBinding?.fields, [role.id]: selected },
        };
        this.renderSurface();
      }
      return;
    }
    const index = Number(button.dataset.staticIndex);
    if (!Number.isInteger(index)) return;
    if (action === 'field-remove') this.removeStaticField(index);
    if (action === 'field-up') this.moveStaticField(index, -1);
    if (action === 'field-down') this.moveStaticField(index, 1);
    if (action === 'row-remove') this.removeStaticRow(index);
  }

  private syncStaticValueFromJson(): void {
    let source: unknown;
    try {
      source = JSON.parse(this.#staticDraft);
    } catch {
      this.setFeedback(DESIGNER_UI_TEXT.dataSource.staticInvalid);
      return;
    }
    const parsed = parseScreenJsonValue(source);
    if (!parsed.ok) {
      this.setFeedback(this.formatStaticDiagnostic(parsed.diagnostics[0]));
      return;
    }
    const descriptor = this.currentEntry()?.manifest.staticData;
    if (descriptor?.kind === 'scalar' && typeof parsed.value !== descriptor.valueType) {
      this.setFeedback(DESIGNER_UI_TEXT.dataSource.staticInvalid);
      return;
    }
    if (descriptor?.kind === 'tabular') {
      const dataset = parseScreenTabularDataset(parsed.value);
      if (!dataset.ok) {
        this.setFeedback(this.formatStaticDiagnostic(dataset.diagnostics[0]));
        return;
      }
      this.#staticValue =
        dataset.value as unknown as import('@base-screen/contracts').ScreenJsonValue;
    } else {
      this.#staticValue = parsed.value;
    }
    this.setFeedback('');
  }

  private setStaticValue(value: import('@base-screen/contracts').ScreenJsonValue): void {
    this.#staticValue = value;
    this.#staticDraft = JSON.stringify(value, null, 2);
    this.setFeedback('');
  }

  private currentStaticDataset(): ScreenTabularDataset | undefined {
    const parsed = parseScreenTabularDataset(this.#staticValue);
    return parsed.ok ? parsed.value : undefined;
  }

  private setStaticDataset(dataset: ScreenTabularDataset): void {
    const parsed = parseScreenTabularDataset(dataset);
    if (!parsed.ok) {
      this.callbacks.report(parsed.diagnostics);
      this.setFeedback(this.formatStaticDiagnostic(parsed.diagnostics[0]));
      return;
    }
    this.#staticValue = parsed.value as unknown as import('@base-screen/contracts').ScreenJsonValue;
    this.#staticDraft = JSON.stringify(parsed.value, null, 2);
    const pages = Math.max(1, Math.ceil(parsed.value.rows.length / 100));
    this.#staticPage = Math.min(this.#staticPage, pages - 1);
    this.setFeedback('');
    this.renderSurface();
  }

  private updateStaticField(index: number, property: string | undefined, value: unknown): void {
    const dataset = this.currentStaticDataset();
    const field = dataset?.fields[index];
    if (dataset === undefined || field === undefined || property === undefined) return;
    let nextField: ScreenDatasetField = field;
    let rows = dataset.rows;
    if (property === 'id' && typeof value === 'string') {
      const nextId = value.trim();
      if (
        nextId === '' ||
        dataset.fields.some(
          (candidate, candidateIndex) => candidateIndex !== index && candidate.id === nextId,
        )
      ) {
        this.setFeedback(DESIGNER_UI_TEXT.dataSource.staticInvalid);
        return;
      }
      nextField = { ...field, id: nextId };
      rows = dataset.rows.map((row) => {
        const next = { ...row, [nextId]: row[field.id] ?? null };
        delete next[field.id];
        return next;
      });
      this.#staticBinding = {
        fields: Object.fromEntries(
          Object.entries(this.#staticBinding?.fields ?? {}).map(([role, selected]) => [
            role,
            selected.map((id) => (id === field.id ? nextId : id)),
          ]),
        ),
      };
    } else if (property === 'label' && typeof value === 'string') {
      nextField = { ...field, label: value };
    } else if (
      property === 'valueType' &&
      typeof value === 'string' &&
      ['string', 'number', 'boolean', 'date'].includes(value)
    ) {
      const valueType = value as ScreenDatasetField['valueType'];
      nextField = { ...field, valueType };
      rows = dataset.rows.map((row) => ({
        ...row,
        [field.id]: this.coerceExistingCell(row[field.id], valueType, field.nullable === true),
      }));
      this.#staticBinding = this.cleanStaticBinding(
        dataset.fields.map((candidate, candidateIndex) =>
          candidateIndex === index ? nextField : candidate,
        ),
      );
    } else if (property === 'nullable' && typeof value === 'boolean') {
      nextField = { ...field, nullable: value };
      if (!value) {
        rows = dataset.rows.map((row) => ({
          ...row,
          [field.id]: row[field.id] ?? this.defaultCell(field.valueType),
        }));
      }
    }
    const fields = dataset.fields.map((candidate, candidateIndex) =>
      candidateIndex === index ? nextField : candidate,
    );
    this.setStaticDataset({ fields, rows });
  }

  private updateStaticCell(rowIndex: number, fieldId: string, source: string): void {
    const dataset = this.currentStaticDataset();
    const field = dataset?.fields.find((candidate) => candidate.id === fieldId);
    const row = dataset?.rows[rowIndex];
    if (dataset === undefined || field === undefined || row === undefined) return;
    const value = coerceDesignerStaticCell(source, field.valueType, field.nullable === true);
    if (value === undefined) {
      this.setFeedback(`rows.${rowIndex}.${fieldId}：${DESIGNER_UI_TEXT.panel.enterValidValue}`);
      return;
    }
    this.setStaticDataset({
      fields: dataset.fields,
      rows: dataset.rows.map((candidate, index) =>
        index === rowIndex ? { ...candidate, [fieldId]: value } : candidate,
      ),
    });
  }

  private addStaticField(): void {
    const dataset = this.currentStaticDataset();
    if (dataset === undefined || dataset.fields.length >= MAX_DATASET_FIELDS) return;
    let suffix = dataset.fields.length + 1;
    while (dataset.fields.some((field) => field.id === `field_${suffix}`)) suffix++;
    const field: ScreenDatasetField = {
      id: `field_${suffix}`,
      label: `Field ${suffix}`,
      valueType: 'string',
      nullable: true,
    };
    this.setStaticDataset({
      fields: [...dataset.fields, field],
      rows: dataset.rows.map((row) => ({ ...row, [field.id]: null })),
    });
  }

  private removeStaticField(index: number): void {
    const dataset = this.currentStaticDataset();
    const field = dataset?.fields[index];
    if (dataset === undefined || field === undefined) return;
    const fields = dataset.fields.filter((_, candidateIndex) => candidateIndex !== index);
    const rows = dataset.rows.map((row) => {
      const next = { ...row };
      delete next[field.id];
      return next;
    });
    this.#staticBinding = this.cleanStaticBinding(fields);
    this.setStaticDataset({ fields, rows });
  }

  private moveStaticField(index: number, offset: -1 | 1): void {
    const dataset = this.currentStaticDataset();
    const target = index + offset;
    if (dataset === undefined || target < 0 || target >= dataset.fields.length) return;
    const fields = [...dataset.fields];
    [fields[index], fields[target]] = [fields[target]!, fields[index]!];
    this.setStaticDataset({ fields, rows: dataset.rows });
  }

  private addStaticRow(): void {
    const dataset = this.currentStaticDataset();
    if (dataset === undefined || dataset.rows.length >= MAX_DATASET_ROWS) return;
    const row = Object.fromEntries(
      dataset.fields.map((field) => [
        field.id,
        field.nullable === true ? null : this.defaultCell(field.valueType),
      ]),
    );
    this.setStaticDataset({ fields: dataset.fields, rows: [...dataset.rows, row] });
    this.#staticPage = Math.floor(dataset.rows.length / 100);
    this.renderSurface();
  }

  private removeStaticRow(index: number): void {
    const dataset = this.currentStaticDataset();
    if (dataset === undefined || dataset.rows[index] === undefined) return;
    this.setStaticDataset({
      fields: dataset.fields,
      rows: dataset.rows.filter((_, candidateIndex) => candidateIndex !== index),
    });
  }

  private restoreStaticExample(render = true): void {
    const manifest = this.currentEntry()?.manifest;
    const value = manifest?.defaultData ?? null;
    this.#staticValue = value;
    this.#staticDraft = JSON.stringify(value, null, 2);
    this.#staticBinding =
      manifest?.staticData?.kind === 'tabular' ? manifest.staticData.defaultBinding : undefined;
    this.#staticPage = 0;
    this.#staticPasteDraft = '';
    this.#feedbackText = '';
    if (render) this.renderSurface();
  }

  private defaultStaticBinding(dataset: ScreenTabularDataset): ScreenDataBinding | undefined {
    const roles = this.currentEntry()?.manifest.dataBinding?.roles ?? [];
    if (roles.length === 0) return undefined;
    const used = new Set<string>();
    const fields: Record<string, readonly string[]> = {};
    for (const role of roles) {
      const compatible = dataset.fields.filter((field) =>
        role.valueTypes.includes(field.valueType),
      );
      const selected =
        role.id === 'columns'
          ? compatible.slice(0, role.maxFields)
          : compatible
              .filter((field) => !used.has(field.id))
              .slice(0, role.maxFields === 1 ? 1 : role.minFields);
      fields[role.id] = selected.map((field) => field.id);
      selected.forEach((field) => used.add(field.id));
    }
    return { fields };
  }

  private cleanStaticBinding(fields: readonly ScreenDatasetField[]): ScreenDataBinding | undefined {
    if (this.#staticBinding === undefined) return undefined;
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const roles = this.currentEntry()?.manifest.dataBinding?.roles ?? [];
    return {
      fields: Object.fromEntries(
        roles.map((role) => [
          role.id,
          (this.#staticBinding?.fields[role.id] ?? []).filter((id) => {
            const field = fieldById.get(id);
            return field !== undefined && role.valueTypes.includes(field.valueType);
          }),
        ]),
      ),
    };
  }

  private coerceExistingCell(
    value: import('@base-screen/contracts').ScreenJsonValue | undefined,
    valueType: ScreenDatasetField['valueType'],
    nullable: boolean,
  ): import('@base-screen/contracts').ScreenJsonValue {
    if (value === null || value === undefined) return nullable ? null : this.defaultCell(valueType);
    return (
      coerceDesignerStaticCell(String(value), valueType, nullable) ?? this.defaultCell(valueType)
    );
  }

  private defaultCell(valueType: ScreenDatasetField['valueType']) {
    if (valueType === 'number') return 0;
    if (valueType === 'boolean') return false;
    if (valueType === 'date') return '1970-01-01';
    return '';
  }

  private formatStaticDiagnostic(diagnostic: ScreenDiagnostic | undefined): string {
    if (diagnostic === undefined) return DESIGNER_UI_TEXT.dataSource.staticInvalid;
    const path = diagnostic.path.join('.');
    return path === '' ? diagnostic.message : `${path}：${diagnostic.message}`;
  }

  private markDatasetDraftChanged(): void {
    this.#draftDirty = this.isDatasetDraftDirty();
    this.#confirmClose = false;
    this.#preview = {
      ...emptyDatasetPreview(this.#preview.open),
      tab: this.#preview.tab,
    };
    this.renderSurface();
  }

  private isDatasetDraftDirty(): boolean {
    const source = this.currentComponent()?.dataSource;
    const draft = this.#draft;
    if (source?.type !== 'host-resource' || draft === undefined) return draft !== undefined;
    if (source.resourceType !== draft.resourceType || source.resourceId !== draft.resourceId) {
      return true;
    }
    const roles = this.currentEntry()?.manifest.dataBinding?.roles ?? [];
    const binding = roles.length === 0 ? null : { fields: draft.fields };
    return (
      JSON.stringify(source.params) !== JSON.stringify(draft.params) ||
      JSON.stringify(source.binding) !== JSON.stringify(binding)
    );
  }

  private restoreDatasetDraft(): void {
    const source = this.currentComponent()?.dataSource;
    const descriptor = this.#descriptor;
    if (source?.type === 'host-resource' && descriptor !== undefined) {
      this.#draft = createDesignerDatasetDraft(
        descriptor,
        source,
        this.currentEntry()?.manifest.dataBinding?.roles ?? [],
      );
    }
    this.#draftDirty = false;
    this.cancelPreview();
    this.#preview = emptyDatasetPreview();
  }

  private updateAuthoringSetting(
    setting: string,
    target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ): void {
    let value: string | number | boolean;
    if (setting === 'loadingDisabled' || setting === 'controlled') {
      if (!(target instanceof HTMLInputElement)) return;
      value = target.checked;
      this.#authoring = { ...this.#authoring, [setting]: target.checked };
    } else if (setting === 'refreshStrategy') {
      if (!(target instanceof HTMLSelectElement)) return;
      const refreshStrategy: DesignerDatasetRefreshStrategy =
        target.value === 'auto' || target.value === 'manual' ? target.value : 'once';
      value = refreshStrategy;
      this.#authoring = { ...this.#authoring, refreshStrategy };
    } else if (setting === 'refreshInterval') {
      const parsed = Number(target.value);
      if (!Number.isFinite(parsed)) return;
      value = Math.min(3600, Math.max(1, Math.round(parsed)));
      this.#authoring = { ...this.#authoring, refreshInterval: value };
    } else {
      return;
    }
    this.callbacks.requestAuthoringAction?.('update-settings', { setting, value });
    this.renderSurface();
  }

  private focusWorkbenchSection(step: DesignerDatasetWorkbenchStep): void {
    this.#activeStep = step;
    if (step === 'preview') {
      this.#preview = { ...this.#preview, open: true };
    }
    this.#dataFlowScrollSync.beginProgrammaticScroll(step);
    this.renderSurface();
    const section =
      this.#panel?.querySelector<HTMLElement>(`[data-workbench-section="${step}"]`) ??
      this.callbacks
        .getWorkbenchHost?.()
        ?.querySelector<HTMLElement>(`[data-workbench-section="${step}"]`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  }

  private async testDatasetDraft(): Promise<void> {
    const descriptor = this.#descriptor;
    const draft = this.#draft;
    const component = this.currentComponent();
    const port = this.callbacks.getResourcePort();
    if (
      descriptor === undefined ||
      draft === undefined ||
      component === undefined ||
      port === undefined
    ) {
      return;
    }
    const params = this.resolvePreviewParameters(draft);
    if (params === undefined) {
      this.#preview = {
        ...emptyDatasetPreview(true),
        status: 'error',
        message: DESIGNER_UI_TEXT.dataSource.testVariableUnavailable,
      };
      this.renderSurface();
      return;
    }
    this.cancelPreview();
    const controller = new AbortController();
    const generation = this.#previewGeneration;
    this.#previewController = controller;
    this.#preview = {
      ...emptyDatasetPreview(true),
      status: 'loading',
      tab: this.#preview.tab === 'request' ? 'response' : this.#preview.tab,
      message: DESIGNER_UI_TEXT.dataSource.previewLoading,
    };
    this.renderSurface();
    try {
      const result = await port.resolve(
        {
          componentId: component.id,
          resourceType: draft.resourceType,
          resourceId: draft.resourceId,
          params,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || generation !== this.#previewGeneration) return;
      this.#previewController = undefined;
      if (!result.ok) {
        this.callbacks.report(result.diagnostics);
        this.setPreviewError();
        return;
      }
      const raw = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
      if (!raw.ok) {
        this.callbacks.report(raw.diagnostics);
        this.setPreviewError();
        return;
      }
      const consumer = this.adaptDatasetPreview(raw.value);
      if (!consumer.ok) {
        this.callbacks.report(consumer.diagnostics);
        this.setPreviewError();
        return;
      }
      this.#preview = {
        status: 'ready',
        tab: this.#preview.tab,
        rawValue: raw.value,
        consumerValue: consumer.value,
        message: DESIGNER_UI_TEXT.dataSource.testReady(datasetRecordCount(raw.value)),
        testedAt: new Date().toLocaleTimeString(),
        open: true,
      };
      this.#feedbackText = this.#preview.message;
      this.renderSurface();
    } catch {
      if (!controller.signal.aborted && generation === this.#previewGeneration) {
        this.#previewController = undefined;
        this.setPreviewError();
      }
    }
  }

  private resolvePreviewParameters(
    draft: DesignerDatasetDraftView,
  ): Readonly<Record<string, ScreenJsonValue>> | undefined {
    const params: Record<string, ScreenJsonValue> = {};
    const document = this.callbacks.getDocument();
    for (const [name, parameter] of Object.entries(draft.params)) {
      if (parameter.kind === 'literal') {
        params[name] = parameter.value;
        continue;
      }
      const variable = document?.variables.find((item) => item.name === parameter.name);
      if (variable?.type !== 'static') return undefined;
      params[name] = variable.value;
    }
    return params;
  }

  private adaptDatasetPreview(value: ScreenJsonValue): ScreenParseResult<ScreenJsonValue> {
    const entry = this.currentEntry();
    const roles = entry?.manifest.dataBinding?.roles ?? [];
    if (roles.length === 0 || entry?.tabularDataAdapter === undefined) {
      return { ok: true, value, diagnostics: [] };
    }
    const dataset = parseScreenTabularDataset(value);
    if (!dataset.ok) return dataset;
    const binding = validateScreenHostResourceBinding(
      { fields: this.#draft?.fields ?? {} },
      dataset.value.fields,
      roles,
    );
    if (!binding.ok) return binding;
    try {
      const adapted = entry.tabularDataAdapter.adapt({
        dataset: dataset.value,
        fields: binding.value.fields,
      });
      if (!adapted.ok) return adapted;
      return parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
    } catch {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'HOST_DATASET_ADAPTER_FAILED',
            path: [],
            message: DESIGNER_UI_TEXT.dataSource.testFailed,
          },
        ],
      };
    }
  }

  private setPreviewError(): void {
    this.#preview = {
      ...emptyDatasetPreview(true),
      status: 'error',
      message: DESIGNER_UI_TEXT.dataSource.testFailed,
    };
    this.#feedbackText = this.#preview.message;
    this.renderSurface();
  }

  private cancelPreview(): void {
    this.#previewGeneration++;
    this.#previewController?.abort();
    this.#previewController = undefined;
  }

  private renderSurface(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    const options = this.panelOptions(panel);
    const surface = renderDesignerDataSourcePanel(options);
    this.#feedback = surface.feedback;
    const manifest = this.currentEntry()?.manifest;
    const descriptorHost =
      options.activeStep === 'mapping'
        ? (panel.querySelector<HTMLElement>('.designer-datav-data-flow-content') ?? panel)
        : undefined;
    if (descriptorHost !== undefined) {
      renderDesignerDescriptorZone(descriptorHost, manifest?.editorDescriptor?.data, {
        document: this.callbacks.getDocument(),
        interaction: this.callbacks.getInteraction(),
        catalog: this.callbacks.getCatalog(),
        getDatasetFields: () => this.getFocusedDatasetFields(),
      });
    }
    this.renderDataWorkbench(options);
    this.#dataFlowScrollSync.bind(panel);
  }

  private syncDataFlowProgress(step: DesignerDatasetWorkbenchStep): void {
    const normalized = step === 'mapping' || step === 'preview' ? step : 'source';
    if (normalized === this.#activeStep) return;
    this.#activeStep = normalized;
    const flow = this.#panel?.querySelector<HTMLElement>('.designer-datav-data-flow');
    if (flow) flow.dataset.activeStep = normalized;
    const progress = this.#panel?.querySelector<HTMLElement>('.designer-datav-data-flow-progress');
    if (!progress) return;
    for (const btn of progress.querySelectorAll<HTMLButtonElement>(
      '[data-dataset-workbench-target]',
    )) {
      const target = btn.dataset.datasetWorkbenchTarget as DesignerDatasetWorkbenchStep | undefined;
      const isActive = target === normalized;
      btn.setAttribute('aria-current', isActive ? 'step' : 'false');
    }
  }

  private panelOptions(panel: HTMLElement): DesignerDataSourcePanelOptions {
    return {
      panel,
      scrollScope: JSON.stringify([
        this.#focusedComponentId,
        this.#mode,
        this.#staticDialogOpen,
        this.#staticTab,
        this.#staticPage,
        this.#catalogOpen,
        this.#descriptor?.resourceType ?? null,
        this.#descriptor?.resourceId ?? null,
      ]),
      mode: this.#mode,
      availableModes: this.availableModes(),
      staticDraft: this.#staticDraft,
      staticDescriptor: this.currentEntry()?.manifest.staticData,
      staticValue: this.#staticValue,
      staticBinding: this.#staticBinding,
      staticDialogOpen: this.#staticDialogOpen,
      staticTab: this.#staticTab,
      staticPage: this.#staticPage,
      staticPasteDraft: this.#staticPasteDraft,
      staticFirstRowIsHeader: this.#staticFirstRowIsHeader,
      query: this.#catalogController.query,
      catalogOpen: this.#catalogOpen,
      items: this.#catalogController.items,
      cursor: this.#catalogController.cursor,
      descriptor: this.#descriptor,
      draft: this.#draft,
      roles: this.currentEntry()?.manifest.dataBinding?.roles ?? [],
      variableNames: (this.callbacks.getDocument()?.variables ?? []).map((item) => item.name),
      catalogAvailable: this.callbacks.getCatalogPort() !== undefined,
      resourceAvailable: this.callbacks.getResourcePort() !== undefined,
      feedback: this.#feedbackText,
      dirty: this.#draftDirty,
      confirmClose: this.#confirmClose,
      preview: this.#preview,
      activeStep: this.#activeStep,
      authoring: this.#authoring,
    };
  }

  private renderDataWorkbench(options: DesignerDataSourcePanelOptions): void {
    const host = this.callbacks.getWorkbenchHost?.();
    if (host === undefined) return;
    const layout = host.closest<HTMLElement>('.designer');
    host.replaceChildren();
    if (!this.#workbenchOpen || options.mode !== 'dataset' || options.descriptor === undefined) {
      host.hidden = true;
      host.removeAttribute('role');
      host.removeAttribute('aria-modal');
      host.removeAttribute('tabindex');
      if (layout !== null) delete layout.dataset.dataWorkbenchOpen;
      return;
    }
    host.hidden = false;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.workbench);
    host.tabIndex = -1;
    host.appendChild(renderDesignerDatasetWorkbench(options));
    if (layout !== null) layout.dataset.dataWorkbenchOpen = 'true';
  }

  private async copyPreviewData(): Promise<void> {
    const rawValue = this.#preview.rawValue;
    this.callbacks.requestAuthoringAction?.('copy-data', {
      value: JSON.stringify(rawValue ?? null),
    });
    if (rawValue === undefined) {
      this.setFeedback(DESIGNER_UI_TEXT.dataSource.copyDataUnavailable);
      return;
    }
    let copied = false;
    try {
      copied = (await this.callbacks.copyText?.(JSON.stringify(rawValue, null, 2))) ?? false;
    } catch {
      copied = false;
    }
    this.setFeedback(
      copied
        ? DESIGNER_UI_TEXT.dataSource.copyDataSuccess
        : DESIGNER_UI_TEXT.dataSource.copyDataFailed,
    );
  }

  private focusDataWorkbench(): void {
    const host = this.callbacks.getWorkbenchHost?.();
    const close = host?.querySelector<HTMLButtonElement>('[data-dataset-action="close-workbench"]');
    (close ?? host)?.focus({ preventScroll: true });
  }

  private restoreFullscreenActionFocus(): void {
    this.#panel
      ?.querySelector<HTMLButtonElement>('[data-dataset-authoring-action="fullscreen-edit"]')
      ?.focus({ preventScroll: true });
  }

  private restoreBindingFieldFocus(
    kind: 'dataset' | 'static',
    roleId: string,
    fieldId: string,
  ): void {
    const selector =
      kind === 'dataset' ? '[data-dataset-binding-field]' : '[data-static-binding-field]';
    const roleAttribute =
      kind === 'dataset' ? 'data-dataset-binding-role-id' : 'data-static-binding-role';
    const fieldAttribute =
      kind === 'dataset' ? 'data-dataset-binding-field' : 'data-static-binding-field';
    const roots = [this.callbacks.getWorkbenchHost?.(), this.#panel];
    for (const root of roots) {
      const button = [...(root?.querySelectorAll<HTMLButtonElement>(selector) ?? [])].find(
        (candidate) =>
          candidate.getAttribute(roleAttribute) === roleId &&
          candidate.getAttribute(fieldAttribute) === fieldId,
      );
      if (button !== undefined) {
        button.focus({ preventScroll: true });
        return;
      }
    }
  }

  private availableModes(): readonly DesignerDataSourceMode[] {
    return designerDataSourceModes(this.currentEntry());
  }

  private currentComponent() {
    const id = this.callbacks.getInteraction().focusedComponentId;
    return this.callbacks.getDocument()?.components.find((item) => item.id === id);
  }

  private currentEntry(): BaseScreenMaterialCatalogEntry | undefined {
    const component = this.currentComponent();
    return component === undefined ? undefined : this.callbacks.getCatalog()?.get(component.type);
  }

  private clearSurface(): void {
    this.#dataFlowScrollSync.clear();
    const host = this.callbacks.getWorkbenchHost?.();
    if (host !== undefined) {
      host.hidden = true;
      host.replaceChildren();
      const layout = host.closest<HTMLElement>('.designer');
      if (layout !== null) delete layout.dataset.dataWorkbenchOpen;
    }
    this.#panel = undefined;
    this.#feedback = undefined;
  }

  private setFeedback(message: string): void {
    this.#feedbackText = message;
    if (this.#feedback !== undefined) this.#feedback.textContent = message;
  }
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isDatasetWorkbenchStep(value: string | undefined): value is DesignerDatasetWorkbenchStep {
  return (
    value === 'source' ||
    value === 'mapping' ||
    value === 'transform' ||
    value === 'preview' ||
    value === 'refresh'
  );
}

function createDatasetAuthoringView(): DesignerDatasetAuthoringView {
  return {
    editorMode: 'visual',
    filterConfigured: false,
    loadingDisabled: false,
    controlled: false,
    refreshStrategy: 'manual',
    refreshInterval: 30,
  };
}

function emptyDatasetPreview(open = false): DesignerDatasetPreviewView {
  return {
    status: 'idle',
    tab: 'response',
    message: '',
    open,
  };
}

function datasetRecordCount(value: ScreenJsonValue): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const rows = (value as Readonly<Record<string, ScreenJsonValue>>).rows;
    if (Array.isArray(rows)) return rows.length;
  }
  return value === null ? 0 : 1;
}
