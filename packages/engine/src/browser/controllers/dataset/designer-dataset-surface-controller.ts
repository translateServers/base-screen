import type { ScreenComponentNode } from '@base-screen/contracts';
import { derivedDataSourceId } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { syncDataPanelNotice } from '../../dom/dataset/designer-data-panel-notice.js';
import {
  stampDataSectionKeys,
  syncDatasetSections,
} from '../../dom/dataset/designer-data-section-diff.js';
import {
  applyDesignerDataState,
  type DesignerDataStateInput,
  deriveDesignerDataState,
} from '../../dom/dataset/designer-data-state.js';
import { renderDatasetCatalogResults } from '../../dom/dataset/designer-dataset-catalog-dom.js';
import { disposeDatasetSections } from '../../dom/dataset/designer-dataset-config-dom.js';
import {
  type DesignerDataSourcePanelOptions,
  type DesignerDatasetWorkbenchStep,
  renderDesignerDataSourcePanel,
  renderDesignerDatasetWorkbench,
} from '../../dom/dataset/designer-dataset-dom.js';
import {
  dataPanelApplyView,
  dataPanelStatusView,
  fitDataPanelActionGutter,
} from '../../dom/dataset/designer-dataset-flow-dom.js';
import {
  syncDataPanelActions,
  syncInlineDataPanelActions,
} from '../../dom/dataset/designer-dataset-primitives.js';
import type {
  DesignerDataSurface,
  DesignerHostLinkView,
} from '../../dom/dataset/designer-dataset-types.js';
import { renderDesignerDescriptorZone } from '../../dom/descriptor/designer-descriptor-dom.js';
import { designerDataSourceModes } from './designer-data-source-authoring.js';
import {
  type DesignerDatasetControllerContext,
  type DesignerDatasetControllerState,
  emptyDatasetPreview,
} from './designer-dataset-controller-context.js';
import {
  type DesignerDataDraftSelection,
  readDesignerEffectiveInstanceView,
  readDesignerEffectiveValueRef,
} from './designer-dataset-effective-value.js';

export function renderDatasetSurface(context: DesignerDatasetControllerContext): void {
  const preserve = context.callbacks.preserveScrollContinuity;
  if (preserve !== undefined) {
    preserve(() => renderSurfaceContent(context));
    return;
  }
  renderSurfaceContent(context);
}

function renderSurfaceContent(context: DesignerDatasetControllerContext): void {
  const panel = context.state.panel;
  if (panel === undefined) return;
  // 整块重渲染会换掉取值入口卡片节点。先记下「哪张卡正聚焦」，渲染完再交回去：
  // 切到「接数据源」会触发目录分组/结果回包这类异步重绘，不还原就等于用一次方向键
  // 把键盘用户丢到 body 上（radiogroup 的方向键从此失效）。
  const focusedEntry = focusedDataEntry(panel);
  const options = createDatasetPanelOptions(context, panel, 'inspector');
  const surface = renderDesignerDataSourcePanel(options);
  context.state.feedback = surface.feedback;
  const manifest = context.currentEntry()?.manifest;
  // 物料自有的数据字段（editorDescriptor.data）属于「这个组件怎么读数据」，与数据源走哪条通道无关，
  // 也不该被藏在某个步骤后面：统一追加在数据源 section 之后。
  const descriptorHost =
    panel.querySelector<HTMLElement>('.designer-datav-data-flow-content') ?? panel;
  // 物料数据表单属于数据源表单的一部分，必须排在 sticky 状态条之前；
  // 先渲染到临时容器，再插到状态条前面，最后重算让位占位块。
  const descriptorZone = panel.ownerDocument.createElement('div');
  renderDesignerDescriptorZone(descriptorZone, manifest?.editorDescriptor?.data, {
    document: context.callbacks.getDocument(),
    interaction: context.callbacks.getInteraction(),
    catalog: context.callbacks.getCatalog(),
    getDatasetFields: () => getFocusedDatasetFields(context),
  });
  const descriptorBar = descriptorHost.querySelector<HTMLElement>('.designer-dataset-actions');
  // 物料数据绑定属于「怎么读这份数据」，排在数据源配置之后、响应之前；
  // 之前放在高级设置后面，用户要先翻过响应和高级设置才能找到它。
  const descriptorAnchor =
    descriptorHost.querySelector<HTMLElement>('[data-ds-section="preview"]') ?? descriptorBar;
  if (descriptorAnchor !== null) {
    while (descriptorZone.firstChild !== null) descriptorAnchor.before(descriptorZone.firstChild);
    fitDataPanelActionGutter(descriptorHost);
  } else {
    while (descriptorZone.firstChild !== null) {
      descriptorHost.appendChild(descriptorZone.firstChild);
    }
  }
  renderDataWorkbench(context, createDatasetPanelOptions(context, panel, 'workbench'));
  // 首次渲染补内容键 + 可聚焦标记：否则第一次 patch 会把整批段判成「内容变化」重建。
  stampDataSectionKeys(panel, options);
  const workbenchHost = context.callbacks.getWorkbenchHost?.();
  if (workbenchHost !== undefined) {
    stampDataSectionKeys(workbenchHost, createDatasetPanelOptions(context, panel, 'workbench'));
  }
  context.dataFlowScrollSync.bind(panel);
  // 七态派生仍然继续算（根节点 `data-state` + 顶部行内提示条读同一份结果），
  // 但不再压成一个常驻徽标：就绪/加载/无数据不占任何常驻元素。
  applyDesignerDataState(panel, options.dataState);
  syncDataPanelNotice(panel, options.dataState);
  if (focusedEntry !== undefined) {
    panel
      .querySelector<HTMLElement>(`[data-data-entry="${focusedEntry}"]`)
      ?.focus({ preventScroll: true });
  }
}

/**
 * 只刷新主操作条。
 *
 * 固定值/变量的编辑走"只改状态、不整块重绘"的路径（保住输入框节点身份与光标），
 * 所以「未应用」标记与按钮档位要单独就地更新一次。
 */
export function syncDataPanelApplyBar(context: DesignerDatasetControllerContext): void {
  const panel = context.state.panel;
  if (panel === undefined) return;
  const options = createDatasetPanelOptions(context, panel, 'inspector');
  syncDataPanelActions(panel, dataPanelApplyView(options));
  syncInlineDataPanelActions(panel, dataPanelStatusView(options));
}

/** 面板所在可聚焦根里，当前聚焦的取值入口（没有就是 undefined）。 */
function focusedDataEntry(panel: HTMLElement): string | undefined {
  const root = panel.getRootNode() as Document | ShadowRoot | undefined;
  const active = root?.activeElement as HTMLElement | null | undefined;
  if (active == null || active === panel) return undefined;
  return active.closest<HTMLElement>('[data-data-entry]')?.dataset.dataEntry;
}

/**
 * 从控制器上下文收集七态输入。
 *
 * 只收集**可观测**信号：端口在不在、实例解析出来没有、组件是否锁定、请求是否在途、
 * 最近一次失败、结果是否为空。状态判定本身在 `deriveDesignerDataState` 里，保持单一入口。
 */
function dataStateInput(context: DesignerDatasetControllerContext): DesignerDataStateInput {
  const source = context.currentComponent()?.dataSource ?? null;
  const configured = source !== null || context.state.mode !== 'none';
  if (!configured) return { configured: false };
  const unavailable = unavailableReason(context, source);
  const readonly: DesignerDataStateInput['readonly'] =
    context.currentComponent()?.status.locked === true ? 'locked' : undefined;
  const loading =
    context.catalogController.status === 'loading' || context.state.preview.status === 'loading';
  const failure = panelFailure(context);
  const empty = isEmptyPreview(context.state.preview);
  return {
    configured,
    ...(unavailable === undefined ? {} : { unavailable }),
    ...(readonly === undefined ? {} : { readonly }),
    ...(loading ? { loading } : {}),
    ...(failure === undefined ? {} : { failure }),
    ...(empty ? { empty } : {}),
  };
}

function unavailableReason(
  context: DesignerDatasetControllerContext,
  source: ScreenComponentNode['dataSource'],
): DesignerDataStateInput['unavailable'] {
  const mode = context.state.mode;
  // 用布尔量先归一，避免 `a || b` 里的类型收窄互相干扰。
  const configuredAsDataset = source?.type === 'dataset' || mode === 'dataset';
  const configuredAsVariable = source?.type === 'variable' || mode === 'variable';
  const configuredAsHostResource = source?.type === 'host-resource' || mode === 'host-resource';
  if (configuredAsDataset) {
    if (context.callbacks.getCatalogPort() === undefined) return 'port-missing';
    // 选了数据集但描述拿不回来：实例不存在（被删/未发布），不是端口问题。
    return context.state.draft !== undefined && context.state.descriptor === undefined
      ? 'instance-missing'
      : undefined;
  }
  if (configuredAsVariable) {
    return context.callbacks.getHostCatalogPort?.() === undefined ? 'port-missing' : undefined;
  }
  if (configuredAsHostResource) {
    return context.callbacks.getResourcePort() === undefined ? 'port-missing' : undefined;
  }
  return undefined;
}

function panelFailure(context: DesignerDatasetControllerContext): string | undefined {
  if (context.state.preview.status === 'error') return context.state.preview.message;
  if (context.catalogController.status === 'error') return 'catalog';
  return undefined;
}

function isEmptyPreview(preview: DesignerDatasetControllerState['preview']): boolean {
  if (preview.status !== 'ready' || preview.rawValue === undefined) return false;
  const value = preview.rawValue;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const rows = (value as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) && rows.length === 0;
}

/**
 * 按段集合 diff 同步面板（取代原先的「按 key 立即替换」）。
 *
 * 调用点不再决定「换哪几段」：它们把最新模型交出来，由 `sectionContentKey` 判断哪些段
 * 真的变了。内容键没变的段**完全不碰**，因此输入框节点身份、光标、IME 组合态都保住。
 */
export function syncDatasetSurface(
  context: DesignerDatasetControllerContext,
  restoreFocus?: () => void,
): void {
  const panel = context.state.panel;
  if (panel === undefined) return;
  const workbenchHost = context.callbacks.getWorkbenchHost?.();
  // 两个挂载点**各拿一份 options**：`authoring` 段的内容与内容键都按 surface 分叉，
  // 共用一份会让「切到工作台」被判成「内容没变」而拒绝重建（症状：工作台里仍是只读摘要）。
  for (const root of [panel, workbenchHost]) {
    if (root === undefined) continue;
    const options = createDatasetPanelOptions(context, panel, surfaceOf(root, panel));
    syncDatasetSections(root, options);
    // 提示条与主操作条都不属于任何段：段级 diff 不会碰它们，随模型就地刷新。
    syncDataPanelNotice(root, options.dataState);
    syncDataPanelActions(root, dataPanelApplyView(options));
    syncInlineDataPanelActions(root, dataPanelStatusView(options));
  }
  applyDesignerDataState(panel, createDatasetPanelOptions(context, panel, 'inspector').dataState);
  restoreFocus?.();
}

/**
 * 宿主目录回包只重画结果区。
 *
 * 面板/工作台里的搜索框、分组下拉和已展开的绑定弹层都是用户正在操作的对象，
 * 为一次结果回包整块重渲染会把焦点、光标位置和输入法组合态一起丢掉。
 * 内联面板与全屏工作台是同一份数据的两个投影，两处都按节点就地替换。
 */
export function updateDatasetCatalogResults(context: DesignerDatasetControllerContext): void {
  const panel = context.state.panel;
  if (panel === undefined) return;
  const options = createDatasetPanelOptions(context, panel, 'inspector');
  for (const root of [panel, context.callbacks.getWorkbenchHost?.()]) {
    for (const results of root?.querySelectorAll<HTMLElement>('[data-dataset-results]') ?? []) {
      results.replaceWith(renderDatasetCatalogResults(options));
    }
  }
  // 目录请求同时决定宿主连接段的状态灯：交回模型让 diff 决定（通常只有 host-link 变）。
  syncDatasetSurface(context);
  // 结果区不在屏上（目录收起、看的是参数或预览）时无处可画：
  // 控制器已持有最新条目，下一次结构性渲染自会读到，不做整块重绘。
}

/** 宿主通道失败后重试：清掉上一次测试的失败态，再按当前查询重取目录。 */
export function retryDatasetLink(context: DesignerDatasetControllerContext): void {
  context.cancelPreview();
  context.state.preview = emptyDatasetPreview(context.state.preview.open);
  syncDatasetSurface(context);
  context.catalogController.retry();
}

export function syncDataFlowProgress(
  context: DesignerDatasetControllerContext,
  step: DesignerDatasetWorkbenchStep,
): void {
  const normalized = step === 'mapping' || step === 'preview' ? step : 'source';
  if (normalized === context.state.activeStep) return;
  context.state.activeStep = normalized;
  const flow = context.state.panel?.querySelector<HTMLElement>('.designer-datav-data-flow');
  if (flow) flow.dataset.activeStep = normalized;
  const progress = context.state.panel?.querySelector<HTMLElement>(
    '.designer-datav-data-flow-progress',
  );
  if (!progress) return;
  for (const btn of progress.querySelectorAll<HTMLButtonElement>(
    '[data-dataset-workbench-target]',
  )) {
    const target = btn.dataset.datasetWorkbenchTarget as DesignerDatasetWorkbenchStep | undefined;
    const isActive = target === normalized;
    btn.setAttribute('aria-current', isActive ? 'step' : 'false');
  }
}

/**
 * 未应用的草稿取值：**输入只有一个来源**（取值方式 + 草稿内容），段集合与跳转都读它。
 *
 * 草稿实例的 id 必须走契约的 `derivedDataSourceId`：自行拼 `data-source-<组件 id>` 会与派生视图
 * 漂移，而漂移不会让类型检查报错——它表现成「引用已失效」（全屏）或请求键变化。
 */
function draftSelectionOf(context: DesignerDatasetControllerContext): DesignerDataDraftSelection {
  const state = context.state;
  if (state.mode === 'static') {
    return { valueRef: { kind: 'inline', value: state.staticValue } };
  }
  if (state.mode === 'variable') {
    return { valueRef: { kind: 'variable', variableId: state.variableSourceId } };
  }
  if (state.mode !== 'dataset') return { valueRef: null };
  const component = context.currentComponent();
  if (component === undefined) return { valueRef: null };
  const id = derivedDataSourceId(component.id);
  return {
    valueRef: { kind: 'data-source-field', dataSourceId: id, path: [] },
    // 只选到数据集、还没应用：实例尚未落库，但 id 已经确定 ⇒ 渲染 `pending` 而不是 `missing`。
    instance:
      state.descriptor === undefined
        ? undefined
        : { id, name: state.descriptor.name, sourceKind: 'dataset' },
  };
}

/** 挂载点 → 表面。`root === panel` 只对检查器成立，其余都是工作台宿主。 */
function surfaceOf(root: HTMLElement, panel: HTMLElement): DesignerDataSurface {
  return root === panel ? 'inspector' : 'workbench';
}

function createDatasetPanelOptions(
  context: DesignerDatasetControllerContext,
  panel: HTMLElement,
  surface: DesignerDataSurface,
): DesignerDataSourcePanelOptions {
  const source = context.currentComponent()?.dataSource;
  const component = context.currentComponent();
  const draftSelection = draftSelectionOf(context);
  const dataValue = readDesignerEffectiveValueRef(component, draftSelection);
  return {
    panel,
    surface,
    dataValue,
    instance: readDesignerEffectiveInstanceView(
      context.callbacks.getDocument(),
      dataValue,
      draftSelection,
    ),
    groupOpenOverrides: context.state.groupOpenOverrides,
    onToggleGroup: (section, group, open) => {
      context.state.groupOpenOverrides.set(`${section}:${group}`, open);
    },
    scrollScope: JSON.stringify([
      context.state.focusedComponentId,
      context.state.mode,
      context.state.staticTab,
      context.state.staticPage,
      context.state.staticPageSize,
      context.state.catalogOpen,
      context.state.descriptor?.datasetId ?? null,
    ]),
    mode: context.state.mode,
    availableModes: availableModes(context),
    dataState: deriveDesignerDataState(dataStateInput(context)),
    ...(source?.type === 'host-resource'
      ? { hostResource: { resourceType: source.resourceType, resourceId: source.resourceId } }
      : {}),
    variableSourceId:
      source?.type === 'variable' ? source.variableId : context.state.variableSourceId,
    staticDraft: context.state.staticDraft,
    staticDescriptor: context.currentEntry()?.manifest.staticData,
    staticValue: context.state.staticValue,
    staticBinding: context.state.staticBinding,
    staticTab: context.state.staticTab,
    staticPage: context.state.staticPage,
    staticPageSize: context.state.staticPageSize,
    query: context.catalogController.query,
    groups: context.catalogController.groups,
    ...(context.catalogController.groupId === undefined
      ? {}
      : { groupId: context.catalogController.groupId }),
    catalogOpen: context.state.catalogOpen,
    items: context.catalogController.items,
    cursor: context.catalogController.cursor,
    descriptor: context.state.descriptor,
    draft: context.state.draft,
    roles: context.currentEntry()?.manifest.dataBinding?.roles ?? [],
    variables: (context.callbacks.getDocument()?.variables ?? []).map(({ id, name }) => ({
      id,
      name,
    })),
    catalogAvailable: context.callbacks.getCatalogPort() !== undefined,
    resourceAvailable: context.callbacks.getCatalogPort() !== undefined,
    link: hostLinkView(context),
    bindingOpenRoleId: context.state.bindingOpenRoleId,
    feedback: context.state.feedbackText,
    dirty: panelDirty(context, source ?? null),
    canUndo: context.callbacks.canUndo?.() ?? false,
    confirmClose: context.state.confirmClose,
    preview: context.state.preview,
    activeStep: context.state.activeStep,
    authoring: context.state.authoring,
    ...overlayOptions(context),
  };
}

/**
 * 取值浮层所需的两个外部输入。
 *
 * `overlayHost` 缺省时 picker 自己退化到触发器所在的 `.designer` 子树（不抛错），
 * 所以这里保持可选；`onSelectParameter` 是参数位唯一的写入入口，交回控制器。
 */
function overlayOptions(
  context: DesignerDatasetControllerContext,
): Pick<DesignerDataSourcePanelOptions, 'overlayHost' | 'onSelectParameter'> {
  const overlayHost = context.callbacks.getOverlayHost?.();
  return {
    ...(overlayHost === undefined ? {} : { overlayHost }),
    onSelectParameter: (name, ref) => context.setParameterValueRef(name, ref),
  };
}

/**
 * "有没有可应用的草稿"——三种取值方式共用一条判据。
 *
 * 数据源模式本来就有 draft（`state.draftDirty` 是它的既有语义，工作台关闭确认也在用，不能改）；
 * 固定值 / 变量模式以前没有脏标记，只能靠"应用按钮永远可点"掩盖过去。这里只读地比一次
 * 当前编辑值与应用后的文档值，不动 `state.draftDirty`：
 * - 比不出差异（false）时按钮变「已应用」禁用；
 * - 比出差异（true）时按钮是强调实心。
 * 宁可多判脏（例如 JSON 文本格式不同但值相同），也不要少判：少判会让用户改完点不动应用。
 */
function panelDirty(
  context: DesignerDatasetControllerContext,
  source: ScreenComponentNode['dataSource'],
): boolean {
  const mode = context.state.mode;
  if (mode === 'dataset') return context.state.draftDirty;
  if (mode === 'static') {
    if (source?.type !== 'static') return true;
    return (
      JSON.stringify(source.value) !== JSON.stringify(context.state.staticValue) ||
      JSON.stringify(source.binding ?? null) !==
        JSON.stringify(context.state.staticBinding ?? null) ||
      context.state.staticDraft !== JSON.stringify(context.state.staticValue, null, 2)
    );
  }
  if (mode === 'variable') {
    return source?.type !== 'variable' || source.variableId !== context.state.variableSourceId;
  }
  return false;
}

function renderDataWorkbench(
  context: DesignerDatasetControllerContext,
  options: DesignerDataSourcePanelOptions,
): void {
  const host = context.callbacks.getWorkbenchHost?.();
  if (host === undefined) return;
  const layout = host.closest<HTMLElement>('.designer');
  // 工作台与内联面板是同一份数据的两个投影：挂在工作台里的取值选择器同样要显式销毁。
  disposeDatasetSections(host);
  host.replaceChildren();
  if (
    !context.state.workbenchOpen ||
    options.mode !== 'dataset' ||
    options.descriptor === undefined
  ) {
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

export function focusWorkbenchSection(
  context: DesignerDatasetControllerContext,
  step: DesignerDatasetWorkbenchStep,
): void {
  context.state.activeStep = step;
  if (step === 'preview') {
    context.state.preview = { ...context.state.preview, open: true };
  }
  context.dataFlowScrollSync.beginProgrammaticScroll(step);
  context.renderSurface();
  const section =
    context.state.panel?.querySelector<HTMLElement>(`[data-workbench-section="${step}"]`) ??
    context.callbacks
      .getWorkbenchHost?.()
      ?.querySelector<HTMLElement>(`[data-workbench-section="${step}"]`);
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  section?.focus({ preventScroll: true });
}

export function focusDataWorkbench(context: DesignerDatasetControllerContext): void {
  const host = context.callbacks.getWorkbenchHost?.();
  const close = host?.querySelector<HTMLButtonElement>('[data-dataset-action="close-workbench"]');
  (close ?? host)?.focus({ preventScroll: true });
}

export function restoreFullscreenActionFocus(context: DesignerDatasetControllerContext): void {
  context.state.panel
    ?.querySelector<HTMLButtonElement>('[data-dataset-authoring-action="fullscreen-edit"]')
    ?.focus({ preventScroll: true });
}

export function restoreBindingFieldFocus(
  context: DesignerDatasetControllerContext,
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
  const roots = [context.callbacks.getWorkbenchHost?.(), context.state.panel];
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

/**
 * 三条宿主通道分开报告。目录状态来自目录控制器的真实请求结果；
 * 查询状态取自最近一次测试数据；变量通道只看宿主有没有接 variable 端口。
 */
function hostLinkView(context: DesignerDatasetControllerContext): DesignerHostLinkView {
  const datasetPort = context.callbacks.getCatalogPort();
  const preview = context.state.preview;
  const catalogError = context.catalogController.error;
  return {
    catalog:
      datasetPort === undefined
        ? { status: 'unavailable' }
        : {
            status: context.catalogController.status,
            ...(catalogError === undefined ? {} : { detail: catalogError }),
          },
    query:
      datasetPort === undefined
        ? { status: 'unavailable' }
        : preview.status === 'loading'
          ? { status: 'loading' }
          : preview.status === 'error'
            ? { status: 'error', detail: preview.message }
            : { status: 'ready' },
    variables:
      context.callbacks.getHostCatalogPort?.() === undefined
        ? { status: 'unavailable' }
        : { status: 'ready' },
  };
}

function availableModes(context: DesignerDatasetControllerContext) {
  return designerDataSourceModes(context.currentEntry());
}

function getFocusedDatasetFields(context: DesignerDatasetControllerContext) {
  return (
    context.state.descriptor?.fields.map((field) => ({ id: field.id, label: field.label })) ?? []
  );
}

export function clearDatasetSurface(context: DesignerDatasetControllerContext): void {
  context.dataFlowScrollSync.clear();
  const host = context.callbacks.getWorkbenchHost?.();
  if (host !== undefined) {
    host.hidden = true;
    disposeDatasetSections(host);
    host.replaceChildren();
    const layout = host.closest<HTMLElement>('.designer');
    if (layout !== null) delete layout.dataset.dataWorkbenchOpen;
  }
  context.state.panel = undefined;
  context.state.feedback = undefined;
}

export function setDatasetFeedback(
  context: DesignerDatasetControllerContext,
  message: string,
): void {
  context.state.feedbackText = message;
  if (context.state.feedback !== undefined) context.state.feedback.textContent = message;
}

export function isDatasetWorkbenchStep(
  value: string | undefined,
): value is DesignerDatasetWorkbenchStep {
  return (
    value === 'source' ||
    value === 'mapping' ||
    value === 'transform' ||
    value === 'preview' ||
    value === 'refresh'
  );
}
