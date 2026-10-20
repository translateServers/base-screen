import type { ScreenComponentNode } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  stampDataSectionKeys,
  syncDatasetSections,
} from '../../dom/dataset/designer-data-section-diff.js';
import {
  applyDesignerDataState,
  type DesignerDataStateInput,
  deriveDesignerDataState,
} from '../../dom/dataset/designer-data-state.js';
import { syncDataStateBadge } from '../../dom/dataset/designer-data-state-badge.js';
import { renderDatasetCatalogResults } from '../../dom/dataset/designer-dataset-catalog-dom.js';
import {
  type DesignerDataSourcePanelOptions,
  type DesignerDatasetWorkbenchStep,
  renderDesignerDataSourcePanel,
  renderDesignerDatasetWorkbench,
} from '../../dom/dataset/designer-dataset-dom.js';
import type { DesignerHostLinkView } from '../../dom/dataset/designer-dataset-types.js';
import { renderDesignerDescriptorZone } from '../../dom/descriptor/designer-descriptor-dom.js';
import { designerDataSourceModes } from './designer-data-source-authoring.js';
import {
  type DesignerDatasetControllerContext,
  type DesignerDatasetControllerState,
  emptyDatasetPreview,
} from './designer-dataset-controller-context.js';

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
  const options = createDatasetPanelOptions(context, panel);
  const surface = renderDesignerDataSourcePanel(options);
  context.state.feedback = surface.feedback;
  const manifest = context.currentEntry()?.manifest;
  // 物料自有的数据字段（editorDescriptor.data）属于「这个组件怎么读数据」，与数据源走哪条通道无关，
  // 也不该被藏在某个步骤后面：统一追加在数据源 section 之后。
  const descriptorHost =
    panel.querySelector<HTMLElement>('.designer-datav-data-flow-content') ?? panel;
  renderDesignerDescriptorZone(descriptorHost, manifest?.editorDescriptor?.data, {
    document: context.callbacks.getDocument(),
    interaction: context.callbacks.getInteraction(),
    catalog: context.callbacks.getCatalog(),
    getDatasetFields: () => getFocusedDatasetFields(context),
  });
  renderDataWorkbench(context, options);
  // 首次渲染补内容键 + 可聚焦标记：否则第一次 patch 会把整批段判成「内容变化」重建。
  stampDataSectionKeys(panel, options);
  const workbenchHost = context.callbacks.getWorkbenchHost?.();
  if (workbenchHost !== undefined) stampDataSectionKeys(workbenchHost, options);
  context.dataFlowScrollSync.bind(panel);
  // 七态派生：面板任何时刻只有一个主状态；徽标文本/色调与根节点 `data-state` 同一份真值。
  applyDesignerDataState(panel, options.dataState);
  syncDataStateBadge(panel, options.dataState);
  if (focusedEntry !== undefined) {
    panel
      .querySelector<HTMLElement>(`[data-data-entry="${focusedEntry}"]`)
      ?.focus({ preventScroll: true });
  }
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
  const options = createDatasetPanelOptions(context, panel);
  const workbenchHost = context.callbacks.getWorkbenchHost?.();
  for (const root of [panel, workbenchHost]) {
    if (root === undefined) continue;
    syncDatasetSections(root, options);
    // 徽标不属于任何段：段级 diff 不会碰它，随模型就地刷新（文本 + 色调 + data-state）。
    syncDataStateBadge(root, options.dataState);
  }
  applyDesignerDataState(panel, options.dataState);
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
  const options = createDatasetPanelOptions(context, panel);
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

function createDatasetPanelOptions(
  context: DesignerDatasetControllerContext,
  panel: HTMLElement,
): DesignerDataSourcePanelOptions {
  const source = context.currentComponent()?.dataSource;
  return {
    panel,
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
    dirty: context.state.draftDirty,
    confirmClose: context.state.confirmClose,
    preview: context.state.preview,
    activeStep: context.state.activeStep,
    authoring: context.state.authoring,
  };
}

function renderDataWorkbench(
  context: DesignerDatasetControllerContext,
  options: DesignerDataSourcePanelOptions,
): void {
  const host = context.callbacks.getWorkbenchHost?.();
  if (host === undefined) return;
  const layout = host.closest<HTMLElement>('.designer');
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
