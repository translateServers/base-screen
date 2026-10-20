import type {
  DesignerDataSourceMode,
  DesignerDatasetAuthoringAction,
  DesignerDatasetAuthoringView,
  DesignerDatasetRefreshStrategy,
} from '../../dom/dataset/designer-dataset-dom.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';
import {
  describeDataset,
  restoreDatasetControlFocus,
  setSourceMode,
  toggleDatasetBindingField,
  updateDatasetBindingRole,
  updateDatasetBindingSelect,
  updateDatasetParameterMode,
  updateDatasetParameterValue,
} from './designer-dataset-draft-controller.js';
import { setDatasetPreviewTab } from './designer-dataset-preview-controller.js';
import {
  isDatasetWorkbenchStep,
  patchDatasetSections,
  retryDatasetLink,
} from './designer-dataset-surface-controller.js';
import {
  handleStaticChange,
  handleStaticClick,
  handleStaticInput,
} from './designer-static-data-events.js';

export function handleDatasetInput(
  context: DesignerDatasetControllerContext,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement))
    return false;
  if (handleStaticInput(context, target)) return true;
  if (target.dataset.datasetQuery === undefined) return false;
  context.catalogController.updateQuery(target.value);
  return true;
}

export function handleDatasetClick(
  context: DesignerDatasetControllerContext,
  target: Element,
): boolean {
  if (handleStaticClick(context, target)) return true;
  const sourceMode = target.closest<HTMLButtonElement>('[data-data-source-mode]')?.dataset
    .dataSourceMode as DesignerDataSourceMode | undefined;
  if (sourceMode !== undefined) {
    setSourceMode(context, sourceMode);
    return true;
  }
  if (target.closest('[data-dataset-change]') !== null) {
    context.state.catalogOpen = true;
    context.renderSurface();
    context.catalogController.ensureList();
    return true;
  }
  if (target.closest('[data-dataset-load-more]') !== null) {
    context.catalogController.loadMore();
    return true;
  }
  // 芯片 × 在触发器内部：必须先于触发器分支裁决，否则会被「展开/收起」吞掉。
  const bindingChip = target.closest<HTMLButtonElement>('[data-dataset-binding-chip-field]');
  if (bindingChip !== null) {
    // 芯片 × 与弹层内取消同义：复用字段切换，但保持弹层开合并把焦点交回该选项。
    const fieldId = bindingChip.dataset.datasetBindingChipField;
    const wrapper = bindingChip.closest<HTMLElement>('.designer-bind-field');
    const option = wrapper?.querySelector<HTMLButtonElement>(
      `[data-dataset-binding-field="${fieldId}"]`,
    );
    if (option !== null && option !== undefined) toggleDatasetBindingField(context, option);
    return true;
  }
  const bindingTrigger = target.closest<HTMLButtonElement>('[data-dataset-binding-trigger]');
  if (bindingTrigger !== null) {
    const roleId = bindingTrigger.dataset.datasetBindingTrigger ?? null;
    context.state.bindingOpenRoleId = context.state.bindingOpenRoleId === roleId ? null : roleId;
    // 弹层就在配置段内部：只换这一段，并把焦点交回同一个角色的新触发器。
    patchDatasetSections(context, ['config'], () =>
      restoreDatasetControlFocus(
        context,
        roleId === null
          ? '[data-dataset-binding-trigger]'
          : `[data-dataset-binding-trigger="${roleId}"]`,
      ),
    );
    return true;
  }
  const bindingField = target.closest<HTMLButtonElement>('[data-dataset-binding-field]');
  if (bindingField !== null) {
    toggleDatasetBindingField(context, bindingField);
    return true;
  }
  if (context.state.bindingOpenRoleId !== null) {
    const insideMenu = target.closest('[data-dataset-binding-role]') !== null;
    if (!insideMenu) {
      context.state.bindingOpenRoleId = null;
      patchDatasetSections(context, ['config']);
    }
  }
  const bindingAction = target.closest<HTMLButtonElement>('[data-dataset-binding-role-action]');
  if (bindingAction !== null) {
    updateDatasetBindingRole(context, bindingAction);
    return true;
  }
  const previewTab = target.closest<HTMLButtonElement>('[data-dataset-preview-tab]')?.dataset
    .datasetPreviewTab;
  if (previewTab === 'response' || previewTab === 'consumer' || previewTab === 'request') {
    setDatasetPreviewTab(context, previewTab);
    return true;
  }
  const workbenchStep =
    target.closest<HTMLButtonElement>('[data-workbench-step]')?.dataset.workbenchStep;
  if (isDatasetWorkbenchStep(workbenchStep)) {
    context.focusWorkbenchSection(workbenchStep);
    return true;
  }
  const editorMode = target.closest<HTMLButtonElement>('[data-dataset-editor-mode]')?.dataset
    .datasetEditorMode as DesignerDatasetAuthoringView['editorMode'] | undefined;
  if (editorMode === 'visual' || editorMode === 'code') {
    context.state.authoring = { ...context.state.authoring, editorMode };
    if (editorMode === 'code') context.callbacks.requestAuthoringAction?.('open-code-editor');
    // 编辑器模式只改变高级设置段自身的选择态。
    patchDatasetSections(context, ['authoring']);
    return true;
  }
  const authoringAction = target.closest<HTMLButtonElement>('[data-dataset-authoring-action]')
    ?.dataset.datasetAuthoringAction as DesignerDatasetAuthoringAction | undefined;
  if (authoringAction !== undefined) {
    if (authoringAction === 'copy-data') void context.copyPreviewData();
    else if (authoringAction === 'fullscreen-edit') {
      context.state.workbenchOpen = true;
      context.state.confirmClose = false;
      context.callbacks.requestAuthoringAction?.(authoringAction);
      context.renderSurface();
      context.focusDataWorkbench();
    } else context.callbacks.requestAuthoringAction?.(authoringAction);
    return true;
  }
  return handleDatasetAction(context, target);
}

function handleDatasetAction(context: DesignerDatasetControllerContext, target: Element): boolean {
  const actionTarget = target.closest<HTMLButtonElement>('[data-dataset-action]');
  const action = actionTarget?.dataset.datasetAction;
  if (action === 'select-step') {
    context.state.confirmClose = false;
    const requested = actionTarget?.dataset.datasetWorkbenchTarget;
    const step = isDatasetWorkbenchStep(requested) ? requested : 'source';
    context.focusWorkbenchSection(step);
    if (step === 'source' && context.state.mode === 'dataset')
      context.catalogController.ensureList();
    return true;
  }
  if (action === 'open-workbench') {
    context.state.workbenchOpen = true;
    context.state.confirmClose = false;
    const requested = actionTarget?.dataset.datasetWorkbenchTarget;
    context.state.activeStep = isDatasetWorkbenchStep(requested) ? requested : 'source';
    if (context.state.activeStep === 'preview')
      context.state.preview = { ...context.state.preview, open: true };
    context.renderSurface();
    context.focusDataWorkbench();
    return true;
  }
  if (action === 'close-workbench') return closeWorkbench(context);
  if (action === 'keep-editing') {
    context.state.confirmClose = false;
    context.renderSurface();
    return true;
  }
  if (action === 'discard-workbench') {
    context.restoreDatasetDraft();
    context.state.workbenchOpen = false;
    context.state.confirmClose = false;
    context.renderSurface();
    context.restoreFullscreenActionFocus();
    return true;
  }
  if (action === 'toggle-preview') {
    context.state.preview = { ...context.state.preview, open: !context.state.preview.open };
    context.renderSurface();
    return true;
  }
  if (action === 'apply') {
    context.apply();
    return true;
  }
  if (action === 'test') {
    void context.testDatasetDraft();
    return true;
  }
  if (action === 'retry-link') {
    retryDatasetLink(context);
    return true;
  }
  if (action === 'refresh') {
    context.callbacks.refresh(context.callbacks.getInteraction().focusedComponentId ?? undefined);
    return true;
  }
  const item = target.closest<HTMLElement>('[data-dataset-resource-id]');
  if (item?.dataset.datasetResourceId === undefined) return false;
  void describeDataset(context, item.dataset.datasetResourceId);
  return true;
}

function closeWorkbench(context: DesignerDatasetControllerContext): true {
  if (context.state.mode === 'dataset' && context.state.draftDirty) {
    context.state.confirmClose = true;
    context.renderSurface();
    return true;
  }
  context.state.workbenchOpen = false;
  context.state.confirmClose = false;
  context.renderSurface();
  context.restoreFullscreenActionFocus();
  return true;
}

export function handleDatasetChange(
  context: DesignerDatasetControllerContext,
  target: EventTarget | null,
): boolean {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLSelectElement) &&
    !(target instanceof HTMLTextAreaElement)
  )
    return false;
  if (target.dataset.dataSourceModeSelect !== undefined && target instanceof HTMLSelectElement) {
    setSourceMode(context, target.value as DesignerDataSourceMode);
    return true;
  }
  if (target.dataset.datasetGroup !== undefined && target instanceof HTMLSelectElement) {
    context.catalogController.updateGroup(target.value || undefined);
    return true;
  }
  if (target.dataset.dataVariableSource !== undefined && target instanceof HTMLSelectElement) {
    context.state.variableSourceId = target.value;
    context.state.draftDirty = true;
    context.renderSurface();
    return true;
  }
  if (handleStaticChange(context, target)) return true;
  if (target.dataset.datasetAuthoringSetting !== undefined) {
    updateAuthoringSetting(context, target.dataset.datasetAuthoringSetting, target);
    return true;
  }
  if (target.dataset.datasetParameterMode !== undefined) {
    updateDatasetParameterMode(context, target);
    return true;
  }
  if (target.dataset.datasetParameter !== undefined) {
    updateDatasetParameterValue(context, target);
    return true;
  }
  if (target.dataset.datasetBindingRole !== undefined && target instanceof HTMLSelectElement) {
    updateDatasetBindingSelect(context, target);
    return true;
  }
  return false;
}

function updateAuthoringSetting(
  context: DesignerDatasetControllerContext,
  setting: string,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): void {
  let value: string | number | boolean;
  if (setting === 'loadingDisabled' || setting === 'controlled') {
    if (!(target instanceof HTMLInputElement)) return;
    value = target.checked;
    context.state.authoring = { ...context.state.authoring, [setting]: target.checked };
  } else if (setting === 'refreshStrategy') {
    if (!(target instanceof HTMLSelectElement)) return;
    const refreshStrategy: DesignerDatasetRefreshStrategy =
      target.value === 'auto' || target.value === 'manual' ? target.value : 'once';
    value = refreshStrategy;
    context.state.authoring = { ...context.state.authoring, refreshStrategy };
  } else if (setting === 'refreshInterval') {
    const parsed = Number(target.value);
    if (!Number.isFinite(parsed)) return;
    value = Math.min(3600, Math.max(1, Math.round(parsed)));
    context.state.authoring = { ...context.state.authoring, refreshInterval: value };
  } else return;
  context.callbacks.requestAuthoringAction?.('update-settings', { setting, value });
  context.renderSurface();
}

export function handleDatasetKeyDown(
  context: DesignerDatasetControllerContext,
  event: KeyboardEvent,
): boolean {
  if (event.key === 'Escape' && context.state.bindingOpenRoleId !== null) {
    event.preventDefault();
    context.state.bindingOpenRoleId = null;
    patchDatasetSections(context, ['config']);
    return true;
  }
  if (event.key === 'Backspace') {
    const target = event.target;
    const trigger =
      target instanceof Element ? target.closest('[data-dataset-binding-trigger]') : null;
    if (trigger !== null) {
      // 原型同款：触发器上按 Backspace 移除最后一个已绑芯片。
      const chips = trigger.querySelectorAll<HTMLButtonElement>(
        '[data-dataset-binding-chip-field]',
      );
      const last = chips[chips.length - 1];
      if (last !== undefined) {
        event.preventDefault();
        const wrapper = last.closest<HTMLElement>('.designer-bind-field');
        const fieldId = last.dataset.datasetBindingChipField;
        const option = wrapper?.querySelector<HTMLButtonElement>(
          `[data-dataset-binding-field="${fieldId}"]`,
        );
        if (option !== null && option !== undefined) toggleDatasetBindingField(context, option);
      }
      return true;
    }
  }
  if (event.key === 'Escape' && context.state.workbenchOpen) {
    event.preventDefault();
    if (context.state.mode === 'dataset' && context.state.draftDirty) {
      context.state.confirmClose = true;
      context.renderSurface();
    } else closeWorkbench(context);
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
    context.apply();
    return true;
  }
  return false;
}
