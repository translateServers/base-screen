import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type {
  DesignerDataSourceMode,
  DesignerDatasetAuthoringAction,
  DesignerDatasetAuthoringView,
  DesignerDatasetRefreshStrategy,
  DesignerSourcePickerTab,
} from '../../dom/dataset/designer-dataset-dom.js';
import { validateFixedDraft } from '../../dom/dataset/designer-source-sheet-dom.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';
import {
  applyDatasetDraft,
  autoMatchDatasetBindings,
  describeDataset,
  restoreDatasetControlFocus,
  selectDatasetInstance,
  setSourceMode,
  toggleDatasetBindingField,
  updateDatasetBindingRole,
  updateDatasetBindingSelect,
  updateDatasetParameterValue,
} from './designer-dataset-draft-controller.js';
import { setDatasetPreviewTab } from './designer-dataset-preview-controller.js';
import {
  dismissDatasetBindingMenu,
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
  // 浮层里的两处输入：变量搜索就地过滤（不重建浮层，否则每按一键都丢焦点与 IME 组合态）；
  // 固定值文本域只写草稿（同样不重绘）。
  if (target.dataset.datasetVariableQuery !== undefined) {
    context.state.variableQuery = target.value;
    filterSourceSheetVariables(context);
    return true;
  }
  if (target.dataset.sourceSheetFixed !== undefined) {
    context.state.staticDraft = target.value;
    syncSourceSheetFixed(context, target.value);
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
  if (target.closest('[data-dataset-auto-match]') !== null) {
    autoMatchDatasetBindings(context);
    return true;
  }
  // ---- 来源浮层（v7 .source-sheet）：页签 / 关闭 / 选变量 / 固定值 ----
  const sheetTab = target.closest<HTMLButtonElement>('[data-source-sheet-tab]');
  if (sheetTab !== null) {
    const tab = sheetTab.dataset.sourceSheetTab as DesignerSourcePickerTab | undefined;
    if (tab !== undefined && tab !== context.state.sourcePickerTab) {
      context.state.sourcePickerTab = tab;
      context.state.catalogOpen = true;
      context.renderSurface();
      focusSourceSheetTab(context, tab);
    }
    return true;
  }
  if (
    target.closest('[data-source-sheet-close]') !== null ||
    // 点遮罩本身才关（点浮层内部不关）。不用 `instanceof Element`：单测把点击目标
    // 传成鸭子类型的替身，Node 环境里没有 `Element` 全局。
    target.classList?.contains('designer-source-sheet-layer') === true
  ) {
    closeSourceSheet(context);
    return true;
  }
  const sheetVariable = target.closest<HTMLElement>('[data-source-sheet-variable]');
  if (sheetVariable?.dataset.sourceSheetVariable !== undefined) {
    pickSourceSheetVariable(context, sheetVariable.dataset.sourceSheetVariable);
    return true;
  }
  if (target.closest('[data-source-sheet-apply-fixed]') !== null) {
    applySourceSheetFixed(context);
    return true;
  }
  if (target.closest('[data-source-sheet-format]') !== null) {
    formatSourceSheetFixed(context);
    return true;
  }
  if (target.closest('[data-dataset-change]') !== null) {
    openSourceSheet(context);
    return true;
  }
  // 固定值 / 变量配置态的「更换绑定方式」：同一层浮层，初始页签落在当前形态上。
  // 与来源卡的「更换来源」是两个入口、同一件事的两个半程，动作不各写一套。
  if (target.closest('[data-source-kind-change]') !== null) {
    openSourceSheet(context);
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
    // 只有点回当前展开角色的那一行才算「在弹层里」；其它角色的行（如维度的单选触发器）
    // 都是弹层外，必须收起——但只能就地收，不能重绘段（维度自己的弹层已在目标阶段打开）。
    const openRole = target.closest<HTMLElement>('[data-dataset-binding-role]');
    if (openRole?.dataset.datasetBindingRole !== context.state.bindingOpenRoleId) {
      dismissDatasetBindingMenu(context);
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
  if (action === 'select-host-resource') {
    const component = context.currentComponent();
    if (component !== undefined) {
      context.callbacks.requestHostResourceSelection?.(component.id, component.type);
    }
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

/** 浮层在 `.properties` 里（不是 pane 子节点），焦点找回要走同一棵 shadow root。 */
function sourceSheetOf(context: DesignerDatasetControllerContext): HTMLElement | null {
  const root = context.state.panel?.getRootNode?.();
  // `ShadowRoot` 在 Node 单测环境里不存在：先判全局，再判类型。
  if (typeof ShadowRoot === 'undefined' || !(root instanceof ShadowRoot)) return null;
  return root.querySelector<HTMLElement>('[data-source-sheet]');
}

function focusSourceSheetTab(
  context: DesignerDatasetControllerContext,
  tab: DesignerSourcePickerTab,
): void {
  sourceSheetOf(context)
    ?.querySelector<HTMLElement>(`[data-source-sheet-tab="${tab}"]`)
    ?.focus({ preventScroll: true });
}

/** 打开浮层后把焦点交给当前页签：Esc / Tab 从这里开始走，不落回面板。 */
export function focusSourceSheet(context: DesignerDatasetControllerContext): void {
  focusSourceSheetTab(context, context.state.sourcePickerTab);
}

/**
 * Tab 焦点循环：只有「在最后一项按 Tab」与「在第一项按 Shift+Tab」才需要改写，
 * 其余交给浏览器原生顺序——自己重排一遍顺序等于和浏览器抢活。
 */
function trapSourceSheetFocus(
  context: DesignerDatasetControllerContext,
  event: KeyboardEvent,
): boolean {
  const sheet = sourceSheetOf(context)?.querySelector<HTMLElement>('[data-source-sheet]');
  if (sheet === null || sheet === undefined) return false;
  const focusable = [
    ...sheet.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((node) => node.getClientRects().length > 0);
  if (focusable.length === 0) return false;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const root = sheet.getRootNode() as Document | ShadowRoot;
  const active = root.activeElement as HTMLElement | null;
  const inside = active !== null && sheet.contains(active);
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function closeSourceSheet(context: DesignerDatasetControllerContext): void {
  if (!context.state.catalogOpen) return;
  context.state.catalogOpen = false;
  context.renderSurface();
  // 浮层已随重绘消失：焦点交回打开它的那颗按钮，不落回 body。
  // 两个入口在不同模式下互斥出现（配置态固定值/变量只有「更换绑定方式」，
  // 数据集只有来源卡上的「更换来源」），所以按当前形态取对应那颗即可。
  const opener =
    context.state.mode === 'static' || context.state.mode === 'variable'
      ? '[data-source-kind-change]'
      : '[data-dataset-change]';
  context.state.panel?.querySelector<HTMLElement>(opener)?.focus({ preventScroll: true });
}

/**
 * 打开来源浮层（数据集 / 变量 / 固定值三页签）。
 *
 * 初始页签跟着**当前形态**走：已经在用固定值的人不该先看到数据集列表。
 * 两个入口（来源卡的「更换来源」、固定值/变量的「更换绑定方式」）都从这里进来，
 * 所以「落在哪个页签」只有这一处判定。
 */
function openSourceSheet(context: DesignerDatasetControllerContext): void {
  context.state.catalogOpen = true;
  context.state.sourcePickerTab =
    context.state.mode === 'variable'
      ? 'variable'
      : context.state.mode === 'static'
        ? 'fixed'
        : 'dataset';
  context.renderSurface();
  context.catalogController.ensureList();
  focusSourceSheet(context);
}

/**
 * 变量页签选中一枚变量：**选完立即落库**（设计稿「选择后立即应用」）。
 *
 * 落库仍走同一条 `applyDatasetDraft`：这里只把模式与选中项摆好，事务构造与校验不在这里复制。
 */
function pickSourceSheetVariable(context: DesignerDatasetControllerContext, id: string): void {
  if (context.state.mode !== 'variable') setSourceMode(context, 'variable');
  context.state.variableSourceId = id;
  context.state.draftDirty = true;
  context.state.catalogOpen = false;
  applyDatasetDraft(context);
}

function sheetFixedArea(context: DesignerDatasetControllerContext): HTMLTextAreaElement | null {
  const area = sourceSheetOf(context)?.querySelector<HTMLTextAreaElement>(
    '[data-source-sheet-fixed]',
  );
  return area ?? null;
}

/** 固定值脚注 + 主按钮：一处写、两处读（初始渲染与每次输入都走同一个判据）。 */
function syncSourceSheetFixed(context: DesignerDatasetControllerContext, text: string): void {
  const sheet = sourceSheetOf(context);
  if (sheet === null) return;
  const checked = validateFixedDraft(text, context.currentEntry()?.manifest.staticData);
  const note = sheet.querySelector<HTMLElement>('[data-source-sheet-note]');
  if (note !== null) {
    note.textContent = checked.note;
    note.dataset.tone = checked.ok ? 'ok' : 'error';
  }
  const apply = sheet.querySelector<HTMLButtonElement>('[data-source-sheet-apply-fixed]');
  if (apply !== null) apply.disabled = !checked.ok;
}

/**
 * 固定值页签的「应用固定值」：切到固定值模式 + 用文本域里的 JSON 落库。
 *
 * 失败时**不关浮层**：把诊断写在浮层里，输入还留在文本域（关掉浮层等于把用户刚粘的
 * 一大段 JSON 扔了）。成功才关，面板换成固定值编辑器。
 */
function applySourceSheetFixed(context: DesignerDatasetControllerContext): void {
  const area = sheetFixedArea(context);
  if (area === null) return;
  if (!validateFixedDraft(area.value, context.currentEntry()?.manifest.staticData).ok) {
    syncSourceSheetFixed(context, area.value);
    return;
  }
  const previousMode = context.state.mode;
  const staticDescriptor = context.currentEntry()?.manifest.staticData;
  context.state.staticDraft = area.value;
  // 固定值落库要带**字段绑定**（表格型）：从浮层进来时没有手工绑定面板，先用物料的默认绑定。
  // 没有默认绑定时留空——事务会报「绑定不完整」，用户在固定值编辑器里补，而不是静默猜一个。
  if (
    context.state.staticBinding === undefined &&
    staticDescriptor?.kind === 'tabular' &&
    staticDescriptor.defaultBinding !== undefined
  ) {
    context.state.staticBinding = staticDescriptor.defaultBinding;
  }
  context.state.mode = 'static';
  applyDatasetDraft(context);
  const applied = context.currentComponent()?.dataSource?.type === 'static';
  if (applied) {
    context.state.catalogOpen = false;
    context.renderSurface();
    return;
  }
  context.state.mode = previousMode;
  const note = sourceSheetOf(context)?.querySelector<HTMLElement>('[data-source-sheet-note]');
  if (note !== null && note !== undefined) {
    note.textContent = context.state.feedbackText || DESIGNER_UI_TEXT.dataSource.staticInvalid;
    note.dataset.tone = 'error';
  }
  context.renderSurface();
}

function formatSourceSheetFixed(context: DesignerDatasetControllerContext): void {
  const area = sheetFixedArea(context);
  if (area === null) return;
  try {
    area.value = JSON.stringify(JSON.parse(area.value), null, 2);
    context.state.staticDraft = area.value;
    syncSourceSheetFixed(context, area.value);
  } catch {
    syncSourceSheetFixed(context, area.value);
  }
}

/**
 * 变量页签的搜索：**就地隐藏不匹配的行**，不重建列表。
 *
 * 重建的代价是焦点与输入法组合态（同目录搜索的老问题），而变量列表最多几十行，
 * 逐行改 `hidden` 的成本可以忽略。空结果靠「全部隐藏后翻出空态」表达。
 */
function filterSourceSheetVariables(context: DesignerDatasetControllerContext): void {
  const sheet = sourceSheetOf(context);
  if (sheet === null) return;
  const query = context.state.variableQuery.trim().toLowerCase();
  let visible = 0;
  for (const item of sheet.querySelectorAll<HTMLElement>('[data-source-sheet-variable]')) {
    const name = item.querySelector('strong')?.textContent ?? '';
    const matched = query === '' || name.toLowerCase().includes(query);
    item.hidden = !matched;
    if (matched) visible += 1;
  }
  const empty = sheet.querySelector<HTMLElement>('[data-source-sheet-variable-empty]');
  if (empty !== null) empty.hidden = visible > 0;
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
  if (target.dataset.datasetInstanceSelect !== undefined && target instanceof HTMLSelectElement) {
    selectDatasetInstance(context, target.value === '' ? null : target.value);
    return true;
  }
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
  // 浮层优先吃掉 Esc：它是模态，底下的绑定弹层/工作台都不该先响应。
  if (event.key === 'Escape' && context.state.catalogOpen) {
    event.preventDefault();
    closeSourceSheet(context);
    return true;
  }
  // `aria-modal="true"` 就必须有焦点陷阱：Tab 在浮层内循环，不落到背后的面板上。
  if (event.key === 'Tab' && context.state.catalogOpen && trapSourceSheetFocus(context, event)) {
    return true;
  }
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
