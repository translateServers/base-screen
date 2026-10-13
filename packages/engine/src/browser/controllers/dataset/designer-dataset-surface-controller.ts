import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  type DesignerDataSourcePanelOptions,
  type DesignerDatasetWorkbenchStep,
  renderDesignerDataSourcePanel,
  renderDesignerDatasetWorkbench,
} from '../../dom/dataset/designer-dataset-dom.js';
import { renderDesignerDescriptorZone } from '../../dom/descriptor/designer-descriptor-dom.js';
import { designerDataSourceModes } from './designer-data-source-authoring.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';

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
  const options = createDatasetPanelOptions(context, panel);
  const surface = renderDesignerDataSourcePanel(options);
  context.state.feedback = surface.feedback;
  const manifest = context.currentEntry()?.manifest;
  const descriptorHost =
    options.activeStep === 'mapping'
      ? (panel.querySelector<HTMLElement>('.designer-datav-data-flow-content') ?? panel)
      : undefined;
  if (descriptorHost !== undefined) {
    renderDesignerDescriptorZone(descriptorHost, manifest?.editorDescriptor?.data, {
      document: context.callbacks.getDocument(),
      interaction: context.callbacks.getInteraction(),
      catalog: context.callbacks.getCatalog(),
      getDatasetFields: () => getFocusedDatasetFields(context),
    });
  }
  renderDataWorkbench(context, options);
  context.dataFlowScrollSync.bind(panel);
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
