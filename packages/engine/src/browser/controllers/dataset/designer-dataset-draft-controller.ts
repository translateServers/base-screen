import {
  readScreenComponentValueRef,
  type ScreenHostResourceParameter,
  type ScreenParseResult,
  type ScreenValueRef,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDataSourceMode } from '../../dom/dataset/designer-dataset-dom.js';
import type { DesignerDataSectionKey } from '../../dom/dataset/designer-dataset-sections.js';
import { countUnfilledRequiredParameters as countUnfilledRequired } from '../../dom/dataset/designer-dataset-types.js';
import {
  autoMatchDatasetFields,
  createDatasetBindingTransaction,
  createDesignerDatasetDraft,
  createDesignerDatasetDraftFromInstance,
  createEmptyDataSourceTransaction,
  createStaticDataSourceTransaction,
  createVariableDataSourceTransaction,
  defaultDatasetParameterValue,
  designerDataSourceModes,
  hostResourceParameterToValueRef,
  readAuthoringDatasetSource,
  readDesignerDatasetParameter,
  setDesignerDatasetParameter,
  toggleDesignerDatasetBindingField,
  valueRefToHostResourceParameter,
} from './designer-data-source-authoring.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';
import {
  createDatasetAuthoringView,
  emptyDatasetPreview,
} from './designer-dataset-controller-context.js';
import { syncDatasetSurface } from './designer-dataset-surface-controller.js';

const AUTO_APPLY_DELAY_MS = 300;

export function countUnfilledRequiredParameters(context: DesignerDatasetControllerContext): number {
  return countUnfilledRequired(context.state.descriptor, context.state.draft);
}

/**
 * 字段映射/参数改动后的自动应用。
 *
 * 300ms 防抖：连续拨动芯片或多选字段只落一次事务；有必填参数未填时不提交，
 * 让错误留在草稿里由参数行和状态条表达。
 */
export function scheduleDatasetAutoApply(context: DesignerDatasetControllerContext): void {
  if (context.state.mode !== 'dataset') return;
  context.state.clearAutoApply();
  context.state.autoApplyTimer = setTimeout(() => {
    context.state.autoApplyTimer = undefined;
    if (context.state.mode !== 'dataset' || !context.state.draftDirty) return;
    if (countUnfilledRequiredParameters(context) > 0) return;
    applyDatasetDraft(context, { auto: true });
  }, AUTO_APPLY_DELAY_MS);
}

export function setSourceMode(
  context: DesignerDatasetControllerContext,
  mode: DesignerDataSourceMode,
): void {
  if (!availableModes(context).includes(mode)) return;
  context.state.clearAutoApply();
  context.state.mode = mode;
  // 切取值方式属于**结构重绘**：折叠组回到默认规则（手动展开不该跨结构存活）。
  context.state.groupOpenOverrides.clear();
  context.state.parameterInlineMemory.clear();
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
    void describeDataset(context, source.datasetId, { autoApply: true });
  } else {
    context.state.catalogOpen = context.state.descriptor === undefined;
    context.renderSurface();
  }
  context.catalogController.ensureList();
}

export async function describeDataset(
  context: DesignerDatasetControllerContext,
  datasetId: string,
  options: { readonly autoApply?: boolean } = {},
): Promise<void> {
  if (!availableModes(context).includes('dataset')) return;
  const focusedId = context.currentComponent()?.id;
  const component = context.currentComponent();
  const authoring = readAuthoringDatasetSource(context.callbacks.getDocument(), component);
  const descriptor = await context.catalogController.describe(datasetId);
  if (
    descriptor === undefined ||
    context.currentComponent()?.id !== focusedId ||
    !availableModes(context).includes('dataset')
  )
    return;
  const roles = context.currentEntry()?.manifest.dataBinding?.roles ?? [];
  const sameDataset = authoring?.source.datasetId === datasetId;
  const instance = sameDataset ? authoring?.instance : undefined;
  context.state.descriptor = descriptor;
  context.state.datasetInstanceId = sameDataset ? (authoring?.instanceId ?? null) : null;
  context.state.draft =
    instance !== undefined && instance.source.kind === 'dataset'
      ? createDesignerDatasetDraftFromInstance(descriptor, instance, component?.dataBinding, roles)
      : createDesignerDatasetDraft(
          descriptor,
          sameDataset ? (authoring?.source ?? null) : null,
          roles,
        );
  context.state.parameterInlineMemory.clear();
  context.state.mode = 'dataset';
  context.state.catalogOpen = false;
  context.state.draftDirty = isDatasetDraftDirty(context);
  context.state.preview = emptyDatasetPreview();
  context.state.activeStep = 'source';
  context.state.feedbackText = '';
  context.renderSurface();
  // 用户主动选数据集时才自动落库；首屏描述当前数据源不能偷偷改文档。
  if (options.autoApply === true && context.state.draftDirty) scheduleDatasetAutoApply(context);
}

/**
 * 共享实例选择：把组件改绑到同 dataset 的现有文档级实例。
 *
 * 选中实例会把它的参数原样带进草稿，然后**立即应用**——即使参数没变，也要写一次
 * `dataValue.dataSourceId`，否则组件仍指着旧实例。`null` 表示交回自动策略。
 */
export function selectDatasetInstance(
  context: DesignerDatasetControllerContext,
  instanceId: string | null,
): void {
  const document = context.callbacks.getDocument();
  const descriptor = context.state.descriptor;
  const draft = context.state.draft;
  if (document === undefined || descriptor === undefined || draft === undefined) return;
  if (instanceId === null) {
    context.state.datasetInstanceId = null;
  } else {
    const instance = (document.dataSources ?? []).find(
      (candidate) =>
        candidate.id === instanceId &&
        candidate.source.kind === 'dataset' &&
        candidate.source.datasetId === descriptor.datasetId,
    );
    if (instance === undefined) return;
    context.state.datasetInstanceId = instance.id;
    context.state.draft = { ...draft, params: { ...instance.params } };
  }
  context.state.feedbackText = '';
  context.state.draftDirty = isDatasetDraftDirty(context);
  context.renderSurface();
  applyDatasetDraft(context);
}

export function applyDatasetDraft(
  context: DesignerDatasetControllerContext,
  options: { readonly auto?: boolean } = {},
): void {
  // Opaque resource identity is authored only through the public host-resource intent methods.
  if (context.state.mode === 'host-resource') return;
  context.state.clearAutoApply();
  const component = context.currentComponent();
  const document = context.callbacks.getDocument();
  if (component === undefined || document === undefined) return;
  let transaction: ScreenParseResult<ScreenDocumentTransaction>;
  if (context.state.mode === 'none')
    transaction = createEmptyDataSourceTransaction(document, component.id);
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
    transaction = createDatasetBindingTransaction({
      document,
      componentId: component.id,
      descriptor,
      draft,
      roles: context.currentEntry()?.manifest.dataBinding?.roles ?? [],
      ...(context.state.datasetInstanceId === null
        ? {}
        : { preferredInstanceId: context.state.datasetInstanceId }),
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
  const updatedComponent = result.value.components.find(
    (candidate) => candidate.id === component.id,
  );
  const updatedRef =
    updatedComponent === undefined ? null : readScreenComponentValueRef(updatedComponent);
  context.state.datasetInstanceId =
    updatedRef?.kind === 'data-source-field' ? updatedRef.dataSourceId : null;
  // 成功状态由状态条/工作台头部表达，不再另塞一条「数据源已应用」，避免同义重复。
  if (options.auto !== true) context.setFeedback('');
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
  const document = context.callbacks.getDocument();
  const authoringSource = readAuthoringDatasetSource(document, component);
  const source = authoringSource?.source ?? component?.dataSource;
  const instanceId = authoringSource?.instanceId ?? null;
  if (
    focusedId === context.state.focusedComponentId &&
    sameJsonValue(source, context.state.syncedDataSource) &&
    instanceId === context.state.syncedInstanceId
  ) {
    // Session commits replace the document graph even when this component's data source did not
    // change. Keep authoring drafts, preview state, and host settings alive across such commits.
    context.state.syncedDataSource = source;
    context.state.syncedInstanceId = instanceId;
    context.state.datasetInstanceId = instanceId;
    return;
  }
  const sameFocusedComponent = focusedId === context.state.focusedComponentId;
  const activeStep = sameFocusedComponent ? context.state.activeStep : 'source';
  const authoring = sameFocusedComponent ? context.state.authoring : createDatasetAuthoringView();
  context.state.focusedComponentId = focusedId;
  context.state.clearAutoApply();
  context.state.syncedDataSource = source;
  context.state.syncedInstanceId = instanceId;
  context.state.datasetInstanceId = instanceId;
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
      const roles = context.currentEntry()?.manifest.dataBinding?.roles ?? [];
      context.state.draft =
        authoringSource?.instance !== undefined &&
        authoringSource.instance.source.kind === 'dataset'
          ? createDesignerDatasetDraftFromInstance(
              context.state.descriptor,
              authoringSource.instance,
              component?.dataBinding,
              roles,
            )
          : createDesignerDatasetDraft(context.state.descriptor, source, roles);
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
  markDatasetDraftChanged(context, ['source', 'preview'], () =>
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

/**
 * 组头「自动匹配」：把字段映射恢复成**首次选中数据集时**的默认结果。
 *
 * 只在映射区操作，不动参数：参数有必填项和用户填过的值，重算等于替用户改请求。
 * 结果与 `createDesignerDatasetDraft` 同源（`autoMatchDatasetFields`），所以「点一下
 * 自动匹配」与「重新选一次同一个数据集」得到的映射一致——不一致时用户会以为按钮坏了。
 */
export function autoMatchDatasetBindings(context: DesignerDatasetControllerContext): void {
  const descriptor = context.state.descriptor;
  if (context.state.draft === undefined || descriptor === undefined) return;
  const roles = context.currentEntry()?.manifest.dataBinding?.roles ?? [];
  const fields = autoMatchDatasetFields(descriptor, roles);
  context.state.draft = { ...context.state.draft, fields };
  markDatasetDraftChanged(context);
}

/**
 * 参数位选中了一个取值引用（常量 / 变量）。
 *
 * 取代旧的「先切模式下拉、再按控件类型猜形态」：形态由选择器给出，这里只负责落草稿、
 * 标脏、并把这个参数的触发器焦点交回来。选「常量」时沿用旧的取值回退口径
 * （定义默认值），避免用户从变量切回来看到一个空输入框。
 */
export function setDatasetParameterValueRef(
  context: DesignerDatasetControllerContext,
  name: string,
  ref: ScreenValueRef,
): void {
  if (name === '' || context.state.draft === undefined) return;
  const current = context.state.draft.params[name];
  // 切走前记住最后一个常量，切回来时原样恢复（与设计稿的 lastFixed 一致）。
  if (current?.kind === 'inline') context.state.parameterInlineMemory.set(name, current.value);
  const remembered = context.state.parameterInlineMemory.get(name);
  const next: ScreenValueRef =
    ref.kind === 'inline' && ref.value === null
      ? {
          kind: 'inline',
          value:
            remembered !== undefined
              ? remembered
              : defaultDatasetParameterValue(context.state.descriptor, name),
        }
      : ref;
  if (sameRef(current, next)) return;
  context.state.draft = setDesignerDatasetParameter(context.state.draft, name, next);
  markDatasetDraftChanged(context, ['source', 'preview'], () =>
    // 切回固定值后光标应落在值编辑器里（与设计稿一致）；变量形态则回到变量芯片。
    restoreDatasetControlFocus(
      context,
      next.kind === 'inline'
        ? `[data-value-ref-inline="parameter:${name}"]`
        : `[data-value-ref-trigger="parameter:${name}"]`,
      next.kind === 'inline' ? 'caret-end' : 'keep',
    ),
  );
}

export function updateDatasetParameterValue(
  context: DesignerDatasetControllerContext,
  target: HTMLInputElement | HTMLTextAreaElement,
): void {
  const controlKey = target.dataset.valueRefInline;
  if (
    controlKey === undefined ||
    context.state.draft === undefined ||
    context.state.descriptor === undefined
  )
    return;
  const name = parameterNameOf(controlKey);
  const parameter = context.state.descriptor.parameters.find((item) => item.name === name);
  if (parameter === undefined) return;
  const value = readDesignerDatasetParameter(target, parameter);
  // 读不出合法值（数字框里是空串/非数字）时保持草稿不变：不能把「正在输入的中间态」
  // 当成用户清空了参数，否则每敲一个字符都会写一次非法值。
  if (value === undefined) return;
  context.state.draft = setDesignerDatasetParameter(context.state.draft, name, {
    kind: 'inline',
    value,
  });
  markDatasetDraftChanged(context, ['source', 'preview'], () =>
    restoreDatasetControlFocus(context, `[data-value-ref-inline="${controlKey}"]`, 'caret-end'),
  );
}

/** `parameter:<name>` → `<name>`（控件逻辑地址 → 参数名）。 */
function parameterNameOf(controlKey: string): string {
  const prefix = 'parameter:';
  return controlKey.startsWith(prefix) ? controlKey.slice(prefix.length) : controlKey;
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
  markDatasetDraftChanged(context, ['source', 'preview'], () =>
    restoreDatasetControlFocus(context, `[data-dataset-binding-role="${roleId}"]`),
  );
}

export function markDatasetDraftChanged(
  context: DesignerDatasetControllerContext,
  _sections: readonly DesignerDataSectionKey[] = ['source', 'preview'],
  restoreFocus?: () => void,
): void {
  context.state.draftDirty = isDatasetDraftDirty(context);
  context.state.confirmClose = false;
  // 草稿一改，上一次测试结果就作废，因此预览段必须一起换。
  context.state.preview = {
    ...emptyDatasetPreview(context.state.preview.open),
    tab: context.state.preview.tab,
  };
  syncDatasetSurface(context, restoreFocus);
  if (context.state.mode === 'dataset') scheduleDatasetAutoApply(context);
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
  const component = context.currentComponent();
  const authoring = readAuthoringDatasetSource(context.callbacks.getDocument(), component);
  const source = authoring?.source ?? component?.dataSource;
  const draft = context.state.draft;
  if (source?.type !== 'dataset' || draft === undefined) return draft !== undefined;
  if (source.datasetId !== draft.datasetId) {
    return true;
  }
  const roles = context.currentEntry()?.manifest.dataBinding?.roles ?? [];
  const binding = roles.length === 0 ? null : { fields: draft.fields };
  const paramsEqual =
    authoring?.instance === undefined
      ? documentParamsKey(source.params) === draftParamsKey(draft.params)
      : refParamsKey(authoring.instance.params) === refParamsKey(draft.params);
  return (
    !paramsEqual ||
    JSON.stringify(component?.dataBinding ?? source.binding) !== JSON.stringify(binding)
  );
}

function refParamsKey(params: Readonly<Record<string, ScreenValueRef>>): string {
  return JSON.stringify(
    Object.keys(params)
      .sort()
      .map((name) => [name, params[name]]),
  );
}

/**
 * 两边的参数不能直接 `JSON.stringify` 比较：文档里是旧形态（`literal`），草稿里是取值引用
 * （`inline`）。各自先归一到「旧形态」这一个坐标系再比，否则草稿永远被判脏、应用按钮永远可点。
 *
 * 键按名字排序：对象字面量顺序不同不代表值不同，排序后比较不会误判脏。
 */
function documentParamsKey(params: Readonly<Record<string, ScreenHostResourceParameter>>): string {
  const entries = Object.keys(params)
    .sort()
    .map((name) => [
      name,
      valueRefToHostResourceParameter(hostResourceParameterToValueRef(params[name]!)) ?? null,
    ]);
  return JSON.stringify(entries);
}

function draftParamsKey(params: Readonly<Record<string, ScreenValueRef>>): string {
  const entries = Object.keys(params)
    .sort()
    .map((name) => [name, valueRefToHostResourceParameter(params[name]!) ?? null]);
  return JSON.stringify(entries);
}

/** 同一个引用的判据：形态相同、目标相同、内联值按 JSON 深比较。 */
function sameRef(left: ScreenValueRef | undefined, right: ScreenValueRef): boolean {
  if (left === undefined || left.kind !== right.kind) return false;
  if (left.kind === 'variable' && right.kind === 'variable') {
    return left.variableId === right.variableId;
  }
  if (left.kind === 'inline' && right.kind === 'inline') {
    return JSON.stringify(left.value) === JSON.stringify(right.value);
  }
  return false;
}

export function restoreDatasetDraft(context: DesignerDatasetControllerContext): void {
  context.state.clearAutoApply();
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
  context.state.parameterInlineMemory.clear();
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
