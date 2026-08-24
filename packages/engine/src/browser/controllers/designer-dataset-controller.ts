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
  type ScreenParseResult,
  type ScreenTabularDataset,
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
import { renderDesignerDescriptorZone } from '../dom/designer-descriptor-dom.js';
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
        this.renderSurface();
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
      const selectedValue = target.value || target.selectedOptions[0]?.value || '';
      const values = selectedValue === '' ? [] : [selectedValue];
      this.#draft = { ...this.#draft, fields: { ...this.#draft.fields, [roleId]: values } };
      this.renderSurface();
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
    if (this.#mode === 'static') {
      this.#staticDialogOpen = false;
      this.renderSurface();
    }
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

  private renderSurface(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    const surface = renderDesignerDataSourcePanel({
      panel,
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
    });
    this.#feedback = surface.feedback;
    const manifest = this.currentEntry()?.manifest;
    renderDesignerDescriptorZone(panel, manifest?.editorDescriptor?.data, {
      document: this.callbacks.getDocument(),
      interaction: this.callbacks.getInteraction(),
      catalog: this.callbacks.getCatalog(),
      getDatasetFields: () => this.getFocusedDatasetFields(),
    });
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
