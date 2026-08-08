import {
  type ScreenDatasetDescriptor,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostDatasetCatalogPort,
  type ScreenHostResourcePort,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type DesignerDataSourceMode,
  type DesignerDatasetDraftView,
  renderDesignerDataSourcePanel,
} from '../dom/designer-dataset-dom.js';
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
}

/** Owns the host dataset catalog and the data-source authoring surface. */
export class DesignerDatasetController {
  readonly #catalogController: DesignerDatasetCatalogController;
  #descriptor: ScreenDatasetDescriptor | undefined;
  #draft: DesignerDatasetDraftView | undefined;
  #mode: DesignerDataSourceMode = 'none';
  #staticDraft = 'null';
  #catalogOpen = false;
  #feedbackText = '';
  #focusedComponentId: string | null = null;
  #syncedDataSource: ScreenDocument['components'][number]['dataSource'] | undefined;
  #panel: HTMLElement | undefined;
  #feedback: HTMLElement | undefined;

  constructor(private readonly callbacks: DesignerDatasetControllerCallbacks) {
    this.#catalogController = new DesignerDatasetCatalogController({
      getPort: callbacks.getCatalogPort,
      report: callbacks.report,
      setFeedback: (message) => this.setFeedback(message),
      render: () => this.renderSurface(),
    });
  }

  render(panel: HTMLElement | undefined): void {
    this.clearSurface();
    if (panel === undefined) return;
    this.#panel = panel;
    const component = this.currentComponent();
    if (component === undefined) {
      panel.replaceChildren(DESIGNER_UI_TEXT.dataPanelEmpty);
      return;
    }
    const describeTarget = this.syncDraftToFocusedComponent();
    this.renderSurface();
    if (this.#mode !== 'dataset') return;
    this.#catalogController.ensureList();
    if (describeTarget !== undefined) {
      void this.describe(describeTarget.resourceType, describeTarget.resourceId);
    }
  }

  clear(): void {
    this.#catalogController.clear();
    this.clearSurface();
    this.#descriptor = undefined;
    this.#draft = undefined;
    this.#mode = 'none';
    this.#staticDraft = 'null';
    this.#catalogOpen = false;
    this.#feedbackText = '';
    this.#focusedComponentId = null;
    this.#syncedDataSource = undefined;
  }

  onInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return false;
    }
    if (target.dataset.dataSourceStatic !== undefined) {
      this.#staticDraft = target.value;
      return true;
    }
    if (target.dataset.datasetQuery === undefined) return false;
    this.#catalogController.updateQuery(target.value);
    return true;
  }

  onClick(target: Element): boolean {
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
        this.renderSurface();
      }
      return true;
    }
    const action =
      target.closest<HTMLButtonElement>('[data-dataset-action]')?.dataset.datasetAction;
    if (action === 'apply') {
      this.apply();
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
      this.renderSurface();
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
      }
      return true;
    }
    if (target.dataset.datasetBindingRole !== undefined) {
      if (this.#draft === undefined || !(target instanceof HTMLSelectElement)) return true;
      const roleId = target.dataset.datasetBindingRole;
      const values = [...target.selectedOptions].map((option) => option.value);
      this.#draft = { ...this.#draft, fields: { ...this.#draft.fields, [roleId]: values } };
      return true;
    }
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
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

  private setSourceMode(mode: DesignerDataSourceMode): void {
    if (!this.availableModes().includes(mode)) return;
    this.#mode = mode;
    this.#feedbackText = '';
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
    );
    this.#mode = 'dataset';
    this.#catalogOpen = false;
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
      transaction = createStaticDataSourceTransaction(component.id, this.#staticDraft);
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
  }

  private syncDraftToFocusedComponent():
    | { readonly resourceType: string; readonly resourceId: string }
    | undefined {
    const component = this.currentComponent();
    const focusedId = component?.id ?? null;
    const source = component?.dataSource;
    if (focusedId === this.#focusedComponentId && source === this.#syncedDataSource) return;
    this.#focusedComponentId = focusedId;
    this.#syncedDataSource = source;
    this.#feedbackText = '';
    if (source?.type === 'static') {
      this.#mode = 'static';
      this.#staticDraft = JSON.stringify(source.value, null, 2);
      this.#descriptor = undefined;
      this.#draft = undefined;
      this.#catalogOpen = false;
      return;
    }
    if (source?.type === 'host-resource') {
      this.#mode = 'dataset';
      this.#catalogOpen = false;
      if (
        this.#descriptor?.resourceType === source.resourceType &&
        this.#descriptor.resourceId === source.resourceId
      ) {
        this.#draft = createDesignerDatasetDraft(this.#descriptor, source);
        return;
      }
      this.#descriptor = undefined;
      this.#draft = undefined;
      return { resourceType: source.resourceType, resourceId: source.resourceId };
    }
    this.#mode = 'none';
    this.#descriptor = undefined;
    this.#draft = undefined;
    this.#catalogOpen = false;
    return;
  }

  private renderSurface(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    const surface = renderDesignerDataSourcePanel({
      panel,
      mode: this.#mode,
      availableModes: this.availableModes(),
      staticDraft: this.#staticDraft,
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
    });
    this.#feedback = surface.feedback;
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
    this.#panel = undefined;
    this.#feedback = undefined;
  }

  private setFeedback(message: string): void {
    this.#feedbackText = message;
    if (this.#feedback !== undefined) this.#feedback.textContent = message;
  }
}
