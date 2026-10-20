import type { ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDataSourceMode } from '../../dom/dataset/designer-dataset-dom.js';
import type { DesignerDataSectionKey } from '../../dom/dataset/designer-dataset-sections.js';
import {
  createDatasetDataSourceTransaction,
  createDesignerDatasetDraft,
  createEmptyDataSourceTransaction,
  createStaticDataSourceTransaction,
  createVariableDataSourceTransaction,
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
import { patchDatasetSections } from './designer-dataset-surface-controller.js';

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
    context.catalogController.clear();
    context.renderSurface();
    return;
  }
  const source = context.currentComponent()?.dataSource;
  if (source?.type === 'dataset' && context.state.descriptor?.datasetId !== source.datasetId) {
    context.state.catalogOpen = false;
    context.renderSurface();
    void describeDataset(context, source.datasetId);
  } else {
    context.state.catalogOpen = context.state.descriptor === undefined;
    context.renderSurface();
  }
  context.catalogController.ensureList();
}

export async function describeDataset(
  context: DesignerDatasetControllerContext,
  datasetId: string,
): Promise<void> {
  if (!availableModes(context).includes('dataset')) return;
  const focusedId = context.currentComponent()?.id;
  const descriptor = await context.catalogController.describe(datasetId);
  if (
    descriptor === undefined ||
    context.currentComponent()?.id !== focusedId ||
    !availableModes(context).includes('dataset')
  )
    return;
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
  // Opaque resource identity is authored only through the public host-resource intent methods.
  if (context.state.mode === 'host-resource') return;
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
  } else if (context.state.mode === 'variable') {
    transaction = createVariableDataSourceTransaction(
      document,
      component.id,
      context.state.variableSourceId,
    );
  } else {
    const descriptor = context.state.descriptor;
    const draft = context.state.draft;
    if (descriptor === undefined || draft === undefined) {
      context.setFeedback(DESIGNER_UI_TEXT.dataset.incomplete);
      return;
    }
    transaction = createDatasetDataSourceTransaction({
      document,
      componentId: component.id,
      descriptor,
      draft,
      roles: context.currentEntry()?.manifest.dataBinding?.roles ?? [],
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
): { readonly datasetId: string } | undefined {
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
    context.state.mode = 'host-resource';
    context.state.descriptor = undefined;
    context.state.draft = undefined;
    context.state.catalogOpen = false;
    return;
  }
  if (source?.type === 'dataset') {
    // 即使宿主当前没接目录端口，也不能把 dataset 数据源谎报成 host-resource：
    // 面板要如实显示「这条数据源指向某数据集，但本实例拿不到目录/查询通道」。
    context.state.mode = 'dataset';
    context.state.catalogOpen = false;
    if (!availableModes(context).includes('dataset')) {
      context.state.descriptor = undefined;
      context.state.draft = undefined;
      return;
    }
    if (context.state.descriptor?.datasetId === source.datasetId) {
      context.state.draft = createDesignerDatasetDraft(
        context.state.descriptor,
        source,
        context.currentEntry()?.manifest.dataBinding?.roles ?? [],
      );
      return;
    }
    context.state.descriptor = undefined;
    context.state.draft = undefined;
    return { datasetId: source.datasetId };
  }
  if (source?.type === 'variable') {
    context.state.mode = 'variable';
    context.state.variableSourceId = source.variableId;
    context.state.descriptor = undefined;
    context.state.draft = undefined;
    context.state.catalogOpen = false;
    return;
  }
  context.state.mode = 'none';
  context.state.variableSourceId = '';
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
  markDatasetDraftChanged(context, ['config', 'preview'], () =>
    context.restoreBindingFieldFocus('dataset', role.id, fieldId),
  );
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
      ? { kind: 'variable' as const, variableId: '' }
      : {
          kind: 'literal' as const,
          value: defaultDatasetParameterValue(context.state.descriptor, name),
        };
  context.state.draft = {
    ...context.state.draft,
    params: { ...context.state.draft.params, [name]: value },
  };
  // 切模式会把这个参数的控件整个换掉（输入框 ↔ 变量下拉），焦点要落到新控件上。
  markDatasetDraftChanged(context, ['config', 'preview'], () =>
    restoreDatasetControlFocus(context, `[data-dataset-parameter="${name}"]`),
  );
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
  markDatasetDraftChanged(context, ['config', 'preview'], () =>
    restoreDatasetControlFocus(context, `[data-dataset-parameter="${name}"]`, 'caret-end'),
  );
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
  markDatasetDraftChanged(context, ['config', 'preview'], () =>
    restoreDatasetControlFocus(context, `[data-dataset-binding-role="${roleId}"]`),
  );
}

export function markDatasetDraftChanged(
  context: DesignerDatasetControllerContext,
  sections: readonly DesignerDataSectionKey[] = ['config', 'preview'],
  restoreFocus?: () => void,
): void {
  context.state.draftDirty = isDatasetDraftDirty(context);
  context.state.confirmClose = false;
  // 草稿一改，上一次测试结果就作废，因此预览段必须一起换。
  context.state.preview = {
    ...emptyDatasetPreview(context.state.preview.open),
    tab: context.state.preview.tab,
  };
  patchDatasetSections(context, sections, restoreFocus);
}

/**
 * 段换完之后把焦点还给同一个控件。工作台打开时以工作台那份为准，避免把焦点打进模态框背后。
 * 数字输入框不支持 setSelectionRange（会抛 InvalidStateError），只有文本类才挪光标。
 */
export function restoreDatasetControlFocus(
  context: DesignerDatasetControllerContext,
  selector: string,
  caret: 'keep' | 'caret-end' = 'keep',
): void {
  const root = context.state.workbenchOpen
    ? context.callbacks.getWorkbenchHost?.()
    : context.state.panel;
  const control = root?.querySelector<HTMLElement>(selector);
  if (control === null || control === undefined) return;
  // 自绘下拉把原生 select 收成 1px 且 tabIndex=-1：焦点要交给可见的触发器，
  // 否则焦点落在不可见元素上，键盘用户看不到任何落点提示。
  const trigger = control
    .closest('.designer-select-control')
    ?.querySelector<HTMLElement>('.designer-select-trigger');
  (trigger ?? control).focus({ preventScroll: true });
  if (caret !== 'caret-end' || !(control instanceof HTMLInputElement)) return;
  if (control.type === 'number') return;
  const end = control.value.length;
  control.setSelectionRange(end, end);
}

function isDatasetDraftDirty(context: DesignerDatasetControllerContext): boolean {
  const source = context.currentComponent()?.dataSource;
  const draft = context.state.draft;
  if (source?.type !== 'dataset' || draft === undefined) return draft !== undefined;
  if (source.datasetId !== draft.datasetId) {
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
  if (source?.type === 'dataset' && descriptor !== undefined) {
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
  // dataset 是唯一需要宿主通道的 mode：没有目录端口时它不是「换一套面板」，而是这个选项不可用。
  return designerDataSourceModes(context.currentEntry()).filter(
    (mode) => mode !== 'dataset' || context.callbacks.getCatalogPort() !== undefined,
  );
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
