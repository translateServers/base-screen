import type { ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDataSourceMode } from '../../dom/dataset/designer-dataset-dom.js';
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
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';
import {
  createDatasetAuthoringView,
  emptyDatasetPreview,
} from './designer-dataset-controller-context.js';

export function setSourceMode(
  context: DesignerDatasetControllerContext,
  mode: DesignerDataSourceMode,
): void {
  if (!availableModes(context).includes(mode)) return;
  context.state.mode = mode;
  context.state.activeStep = 'source';
  context.state.workbenchOpen = false;
  context.state.feedbackText = '';
  context.state.confirmClose = false;
  if (mode === 'static' && context.currentComponent()?.dataSource?.type !== 'static') {
    context.restoreStaticExample();
  }
  if (mode !== 'dataset') {
    context.renderSurface();
    return;
  }
  const source = context.currentComponent()?.dataSource;
  if (
    source?.type === 'host-resource' &&
    (context.state.descriptor?.resourceType !== source.resourceType ||
      context.state.descriptor.resourceId !== source.resourceId)
  ) {
    context.state.catalogOpen = false;
    context.renderSurface();
    void describeDataset(context, source.resourceType, source.resourceId);
  } else {
    context.state.catalogOpen = context.state.descriptor === undefined;
    context.renderSurface();
  }
  context.catalogController.ensureList();
}

export async function describeDataset(
  context: DesignerDatasetControllerContext,
  resourceType: string,
  resourceId: string,
): Promise<void> {
  const descriptor = await context.catalogController.describe(resourceType, resourceId);
  if (descriptor === undefined) return;
  context.state.descriptor = descriptor;
  context.state.draft = createDesignerDatasetDraft(
    descriptor,
    context.currentComponent()?.dataSource ?? null,
    context.currentEntry()?.manifest.dataBinding?.roles ?? [],
  );
  context.state.mode = 'dataset';
  context.state.catalogOpen = false;
  context.state.draftDirty = isDatasetDraftDirty(context);
  context.state.preview = emptyDatasetPreview();
  context.state.activeStep = 'source';
  context.state.feedbackText = DESIGNER_UI_TEXT.dataset.selected(descriptor.name);
  context.renderSurface();
}

export function applyDatasetDraft(context: DesignerDatasetControllerContext): void {
  const component = context.currentComponent();
  const document = context.callbacks.getDocument();
  if (component === undefined || document === undefined) return;
  let transaction: ScreenParseResult<ScreenDocumentTransaction>;
  if (context.state.mode === 'none') transaction = createEmptyDataSourceTransaction(component.id);
  else if (context.state.mode === 'static') {
    const entry = context.currentEntry();
    transaction = createStaticDataSourceTransaction(
      component.id,
      context.state.staticDraft,
      entry?.manifest.staticData,
      context.state.staticBinding,
      entry?.manifest.dataBinding?.roles ?? [],
    );
  } else {
    const descriptor = context.state.descriptor;
    const draft = context.state.draft;
    const runtime =
      descriptor === undefined
        ? undefined
        : context.callbacks.getRuntimeContributions()?.getResourceType(descriptor.resourceType);
    if (descriptor === undefined || draft === undefined || runtime === undefined) {
      context.setFeedback(DESIGNER_UI_TEXT.dataset.incomplete);
      return;
    }
    transaction = createDatasetDataSourceTransaction({
      document,
      componentId: component.id,
      descriptor,
      draft,
      roles: context.currentEntry()?.manifest.dataBinding?.roles ?? [],
      runtime,
    });
  }
  if (!transaction.ok) {
    context.callbacks.report(transaction.diagnostics);
    context.setFeedback(transaction.diagnostics[0]?.message ?? DESIGNER_UI_TEXT.dataset.incomplete);
    return;
  }
  const result = context.callbacks.executeTransaction(transaction.value);
  if (!result.ok) {
    context.callbacks.report(result.diagnostics);
    return;
  }
  context.setFeedback(DESIGNER_UI_TEXT.dataSource.applied);
  context.state.draftDirty = false;
  context.state.confirmClose = false;
  context.state.activeStep = 'source';
  context.renderSurface();
}

export function syncDraftToFocusedComponent(
  context: DesignerDatasetControllerContext,
): { readonly resourceType: string; readonly resourceId: string } | undefined {
  const component = context.currentComponent();
  const focusedId = component?.id ?? null;
  const source = component?.dataSource;
  if (
    focusedId === context.state.focusedComponentId &&
    sameJsonValue(source, context.state.syncedDataSource)
  ) {
    // Session commits replace the document graph even when this component's data source did not
    // change. Keep authoring drafts, preview state, and host settings alive across such commits.
    context.state.syncedDataSource = source;
    return;
  }
  const sameFocusedComponent = focusedId === context.state.focusedComponentId;
  const activeStep = sameFocusedComponent ? context.state.activeStep : 'source';
  const authoring = sameFocusedComponent ? context.state.authoring : createDatasetAuthoringView();
  context.state.focusedComponentId = focusedId;
  context.state.syncedDataSource = source;
  context.state.feedbackText = '';
  context.state.draftDirty = false;
  context.state.confirmClose = false;
  if (!sameFocusedComponent) context.state.workbenchOpen = false;
  context.cancelPreview();
  context.state.preview = emptyDatasetPreview();
  context.state.activeStep = activeStep;
  context.state.authoring = authoring;
  if (source?.type === 'static') {
    context.state.mode = 'static';
    context.state.staticDraft = JSON.stringify(source.value, null, 2);
    context.state.staticValue = source.value;
    context.state.staticBinding = source.binding;
    context.state.staticPage = 0;
    context.state.descriptor = undefined;
    context.state.draft = undefined;
    context.state.catalogOpen = false;
    return;
  }
  if (source?.type === 'host-resource') {
    context.state.mode = 'dataset';
    context.state.catalogOpen = false;
    if (
      context.state.descriptor?.resourceType === source.resourceType &&
      context.state.descriptor.resourceId === source.resourceId
    ) {
      context.state.draft = createDesignerDatasetDraft(
        context.state.descriptor,
        source,
        context.currentEntry()?.manifest.dataBinding?.roles ?? [],
      );
      return;
    }
    context.state.descriptor = undefined;
    context.state.draft = undefined;
    return { resourceType: source.resourceType, resourceId: source.resourceId };
  }
  context.state.mode = 'none';
  context.state.descriptor = undefined;
  context.state.draft = undefined;
  context.state.catalogOpen = false;
  return;
}

export function toggleDatasetBindingField(
  context: DesignerDatasetControllerContext,
  button: HTMLButtonElement,
): void {
  const role = context
    .currentEntry()
    ?.manifest.dataBinding?.roles.find(
      (candidate) => candidate.id === button.dataset.datasetBindingRoleId,
    );
  const fieldId = button.dataset.datasetBindingField;
  if (context.state.draft === undefined || role === undefined || fieldId === undefined) return;
  context.state.draft = toggleDesignerDatasetBindingField(context.state.draft, role, fieldId);
  markDatasetDraftChanged(context);
  context.restoreBindingFieldFocus('dataset', role.id, fieldId);
}

export function updateDatasetBindingRole(
  context: DesignerDatasetControllerContext,
  button: HTMLButtonElement,
): void {
  const role = context
    .currentEntry()
    ?.manifest.dataBinding?.roles.find(
      (candidate) => candidate.id === button.dataset.datasetBindingRoleId,
    );
  if (
    context.state.draft === undefined ||
    context.state.descriptor === undefined ||
    role === undefined
  )
    return;
  const compatible = context.state.descriptor.fields
    .filter((field) => role.valueTypes.includes(field.valueType))
    .slice(0, role.maxFields)
    .map((field) => field.id);
  context.state.draft = {
    ...context.state.draft,
    fields: {
      ...context.state.draft.fields,
      [role.id]: button.dataset.datasetBindingRoleAction === 'clear' ? [] : compatible,
    },
  };
  markDatasetDraftChanged(context);
}

export function updateDatasetParameterMode(
  context: DesignerDatasetControllerContext,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): void {
  const name = target.dataset.datasetParameterMode;
  if (name === undefined || context.state.draft === undefined) return;
  const value =
    target.value === 'variable'
      ? { kind: 'variable' as const, name: '' }
      : {
          kind: 'literal' as const,
          value: defaultDatasetParameterValue(context.state.descriptor, name),
        };
  context.state.draft = {
    ...context.state.draft,
    params: { ...context.state.draft.params, [name]: value },
  };
  markDatasetDraftChanged(context);
}

export function updateDatasetParameterValue(
  context: DesignerDatasetControllerContext,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): void {
  const name = target.dataset.datasetParameter;
  if (
    name === undefined ||
    context.state.draft === undefined ||
    context.state.descriptor === undefined
  )
    return;
  context.state.draft = updateDesignerDatasetParameter(
    context.state.draft,
    context.state.descriptor,
    name,
    target,
  );
  markDatasetDraftChanged(context);
}

export function updateDatasetBindingSelect(
  context: DesignerDatasetControllerContext,
  target: HTMLSelectElement,
): void {
  const roleId = target.dataset.datasetBindingRole;
  if (roleId === undefined || context.state.draft === undefined) return;
  const selectedValue = target.value || target.selectedOptions[0]?.value || '';
  context.state.draft = {
    ...context.state.draft,
    fields: {
      ...context.state.draft.fields,
      [roleId]: selectedValue === '' ? [] : [selectedValue],
    },
  };
  markDatasetDraftChanged(context);
}

export function markDatasetDraftChanged(context: DesignerDatasetControllerContext): void {
  context.state.draftDirty = isDatasetDraftDirty(context);
  context.state.confirmClose = false;
  context.state.preview = {
    ...emptyDatasetPreview(context.state.preview.open),
    tab: context.state.preview.tab,
  };
  context.renderSurface();
}

function isDatasetDraftDirty(context: DesignerDatasetControllerContext): boolean {
  const source = context.currentComponent()?.dataSource;
  const draft = context.state.draft;
  if (source?.type !== 'host-resource' || draft === undefined) return draft !== undefined;
  if (source.resourceType !== draft.resourceType || source.resourceId !== draft.resourceId) {
    return true;
  }
  const roles = context.currentEntry()?.manifest.dataBinding?.roles ?? [];
  const binding = roles.length === 0 ? null : { fields: draft.fields };
  return (
    JSON.stringify(source.params) !== JSON.stringify(draft.params) ||
    JSON.stringify(source.binding) !== JSON.stringify(binding)
  );
}

export function restoreDatasetDraft(context: DesignerDatasetControllerContext): void {
  const source = context.currentComponent()?.dataSource;
  const descriptor = context.state.descriptor;
  if (source?.type === 'host-resource' && descriptor !== undefined) {
    context.state.draft = createDesignerDatasetDraft(
      descriptor,
      source,
      context.currentEntry()?.manifest.dataBinding?.roles ?? [],
    );
  }
  context.state.draftDirty = false;
  context.cancelPreview();
  context.state.preview = emptyDatasetPreview();
}

export function availableModes(
  context: DesignerDatasetControllerContext,
): readonly DesignerDataSourceMode[] {
  return designerDataSourceModes(context.currentEntry());
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
