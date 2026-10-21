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
  updateDatasetParameterValue,
} from './designer-dataset-draft-controller.js';
import { setDatasetPreviewTab } from './designer-dataset-preview-controller.js';
import {
  isDatasetWorkbenchStep,
  retryDatasetLink,
  syncDataPanelApplyBar,
  syncDatasetSurface,
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
  if (handleStaticInput(context, target)) {
    // 固定值编辑不整块重绘：只把「未应用 / 应用」这颗按钮与脏标记就地更新。
    syncDataPanelApplyBar(context);
    return true;
  }
  if (target.dataset.datasetQuery === undefined) return false;
  context.catalogController.updateQuery(target.value);
  return true;
}

export function handleDatasetClick(
  context: DesignerDatasetControllerContext,
  target: Element,
): boolean {
  if (handleStaticClick(context, target)) return true;
  // 打开取值/绑定浮层时取消尚未触发的自动应用：否则 300ms 后的整段重绘会把刚打开的
  // 浮层连同触发器节点一起换掉（表现是弹层闪一下就关）。草稿保留，底部状态条给「同步」。
  if (
    target.closest('[data-value-ref-trigger]') !== null ||
    target.closest('[data-dataset-binding-trigger]') !== null
  ) {
    context.state.clearAutoApply();
  }
  const pickerToggle = target.closest<HTMLButtonElement>('[data-data-source-picker]');
  if (pickerToggle !== null) {
    const section = pickerToggle.closest<HTMLElement>('.designer-data-source-type');
    const picker = section?.querySelector<HTMLElement>('[data-data-source-picker-panel]');
    if (picker !== null && picker !== undefined) {
      const open = picker.hidden;
      picker.hidden = !open;
      pickerToggle.setAttribute('aria-expanded', String(open));
    }
    return true;
  }
  const entryCard = target.closest<HTMLButtonElement>('[data-data-entry]');
  if (entryCard !== null) {
    selectDataEntry(context, entryCard);
    return true;
  }
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
    syncDatasetSurface(context, () =>
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
      syncDatasetSurface(context);
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
    syncDatasetSurface(context);
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

/**
 * 选中一张取值入口卡片。
 *
 * 入口只是模式的可见面：仍然走 `setSourceMode`，不新增取值模型分支。
 * 切换会整块重渲染（模式变了段集合也变了），所以选完必须把焦点交回**同一张卡**，
 * 否则键盘/读屏用户会被丢回文档根节点。已选中的卡不重复提交，避免无意义重绘。
 */
function selectDataEntry(context: DesignerDatasetControllerContext, card: HTMLButtonElement): void {
  const entry = card.dataset.dataEntry;
  const mode = card.dataset.dataEntryMode as DesignerDataSourceMode | undefined;
  if (entry === undefined || mode === undefined) return;
  if (!card.disabled && card.getAttribute('aria-checked') !== 'true') setSourceMode(context, mode);
  focusDataEntryCard(context, entry);
}

function focusDataEntryCard(context: DesignerDatasetControllerContext, entry: string): void {
  context.state.panel
    ?.querySelector<HTMLElement>(`[data-data-entry="${entry}"]`)
    ?.focus({ preventScroll: true });
}

type DataEntryMove = 'next' | 'previous' | 'first' | 'last';

function dataEntryMove(key: string): DataEntryMove | undefined {
  if (key === 'ArrowRight' || key === 'ArrowDown') return 'next';
  if (key === 'ArrowLeft' || key === 'ArrowUp') return 'previous';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return undefined;
}

/**
 * 方向键在三个入口之间移动并即时选中（radiogroup 语义），`Home/End` 到首尾。
 *
 * 只在可选项之间移动：禁用卡不是合法停点，跳过它比停在上面按不动更符合预期。
 */
function moveDataEntry(
  context: DesignerDatasetControllerContext,
  card: HTMLButtonElement,
  move: DataEntryMove,
): void {
  const cards = [
    ...(card
      .closest('[data-data-entry-group]')
      ?.querySelectorAll<HTMLButtonElement>('[data-data-entry]') ?? []),
  ].filter((item) => !item.disabled);
  const current = cards.indexOf(card);
  if (current === -1 || cards.length === 0) return;
  const index =
    move === 'first'
      ? 0
      : move === 'last'
        ? cards.length - 1
        : (current + (move === 'next' ? 1 : -1) + cards.length) % cards.length;
  const next = cards[Math.min(Math.max(index, 0), cards.length - 1)];
  if (next === undefined || next === card) {
    focusDataEntryCard(context, card.dataset.dataEntry ?? '');
    return;
  }
  selectDataEntry(context, next);
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
  if (action === 'apply' || action === 'sync') {
    context.apply();
    return true;
  }
  if (action === 'test') {
    void context.testDatasetDraft();
    return true;
  }
  if (action === 'undo') {
    context.callbacks.undo?.();
    return true;
  }
  if (action === 'retry-link') {
    retryDatasetLink(context);
    return true;
  }
  if (action === 'open-instance') {
    // 检查器里实例级字段只读：唯一编辑入口是工作台。这里只把用户送过去，不做就地修改
    // （那会改变所有引用同一实例的组件）。
    context.state.workbenchOpen = true;
    context.state.confirmClose = false;
    context.renderSurface();
    context.focusDataWorkbench();
    return true;
  }
  if (action === 'refresh') {
    context.callbacks.refresh(context.callbacks.getInteraction().focusedComponentId ?? undefined);
    return true;
  }
  const item = target.closest<HTMLElement>('[data-dataset-resource-id]');
  if (item?.dataset.datasetResourceId === undefined) return false;
  void describeDataset(context, item.dataset.datasetResourceId, { autoApply: true });
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
  if (handleStaticChange(context, target)) {
    syncDataPanelApplyBar(context);
    return true;
  }
  if (target.dataset.datasetAuthoringSetting !== undefined) {
    updateAuthoringSetting(context, target.dataset.datasetAuthoringSetting, target);
    return true;
  }
  // 参数位只有两条写入路径：取值选择器的触发器（点击 → 浮层 → onSelect）与内联值编辑器
  // （`data-value-ref-inline`，change）。旧形态的「模式下拉」已经删除，不再有第二个入口。
  if (target.dataset.valueRefInline !== undefined) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      updateDatasetParameterValue(context, target);
    }
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
    syncDatasetSurface(context);
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
  // 取值入口是 radiogroup：方向键移动并选中，Home/End 到首尾。Enter/Space 由按钮原生行为
  // 触发 click（同一条 `selectDataEntry` 路径），这里不重复处理。
  const move = dataEntryMove(event.key);
  if (move !== undefined) {
    const entryCard =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-data-entry]')
        : null;
    if (entryCard !== null) {
      event.preventDefault();
      moveDataEntry(context, entryCard, move);
      return true;
    }
  }
  if (event.key !== 'Enter' || event.isComposing) return false;
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return false;
  if (
    target.dataset.valueRefInline !== undefined ||
    target.dataset.datasetBindingRole !== undefined
  ) {
    event.preventDefault();
    context.apply();
    return true;
  }
  return false;
}
