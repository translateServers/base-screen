import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { downloadDesignerDocument } from '../../browser/dom/workspace/designer-workspace.js';
import { designerIcon } from '../../browser/dom/designer-icons.js';
import { selectedComponents } from '../../common/operations/selection/designer-selection.js';
import type { ScreenProjectPhase } from '../../common/project/project-controller.js';
import { DESIGNER_TOOLS } from '../../common/tools/designer-tools.js';
import {
  DESIGNER_UI_TEXT,
  designerDiagnosticSummary,
} from '../../common/ui-text/designer-ui-text.js';
import {
  formatSavedTime,
  groupEditingPath,
  projectPhaseLabel,
  saveStatusSpinnerGlyph,
} from './designer-element-guards.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

export function renderProjectStatus(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const root = element.shadowRoot;
  if (root === null) return;
  const phase = elementState.session.projectPhase;
  const project = elementState.session.project;
  const status = root.querySelector<HTMLElement>('[data-project-status]');
  if (status !== null) {
    const dirty = elementState.session.dirty;
    // 未保存改由状态圆点表达，撤掉文本尾部的 `*`：一个状态不打两处标记。
    const text = project === undefined ? DESIGNER_UI_TEXT.directDocument : projectPhaseLabel(phase);
    const label = status.querySelector<HTMLElement>('[data-project-status-label]');
    if (label === null) status.textContent = text;
    else label.textContent = text;
    status.dataset.state = projectStatusState(phase, project !== undefined, dirty);
  }
  const revision = root.querySelector<HTMLElement>('[data-project-revision]');
  if (revision !== null) revision.textContent = project?.revision ?? '';
  const projectName = root.querySelector<HTMLElement>('.designer-project-name');
  if (projectName !== null) {
    projectName.textContent =
      project === undefined || project.name.trim() === ''
        ? DESIGNER_UI_TEXT.unnamedProject
        : project.name;
  }
  elementState.runtime.renderTopbarSaveStatus(element);
  elementState.runtime.renderStatusBar(element);
}

function projectStatusState(
  phase: ScreenProjectPhase,
  hasProject: boolean,
  dirty: boolean,
): string {
  if (!hasProject) return 'direct';
  if (dirty) return 'dirty';
  if (phase === 'saving' || phase === 'publishing') return 'busy';
  if (phase === 'conflict' || phase === 'error') return 'error';
  if (phase === 'ready') return 'ready';
  return 'idle';
}

export function renderStatusBar(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const root = element.shadowRoot;
  if (root === null) return;
  const document = elementState.session.document;
  const componentIds = elementState.session.interaction.selectedComponentIds;
  const count = componentIds.length;
  const [onlySelected] =
    count === 1 && document !== undefined ? selectedComponents(document, componentIds) : [];
  const baseSelectionText =
    count === 0
      ? DESIGNER_UI_TEXT.nothingSelected
      : count === 1
        ? onlySelected === undefined
          ? DESIGNER_UI_TEXT.selectedSingle
          : DESIGNER_UI_TEXT.selectedComponent(onlySelected.name, onlySelected.type)
        : DESIGNER_UI_TEXT.selectedCount(count);
  const groupPath =
    document === undefined
      ? null
      : groupEditingPath(document, elementState.gestureController.groupEditingParentId);
  const selectionText =
    groupPath === null
      ? baseSelectionText
      : `${DESIGNER_UI_TEXT.groupEditingPath(groupPath)} · ${baseSelectionText}`;
  const selection = root.querySelector<HTMLElement>('[data-status-selection]');
  if (selection !== null) selection.textContent = selectionText;
  const canvas = root.querySelector<HTMLElement>('[data-status-canvas]');
  if (canvas !== null && document !== undefined) {
    canvas.textContent = `${document.canvas.width} × ${document.canvas.height}`;
  }
  const components = root.querySelector<HTMLElement>('[data-status-components]');
  if (components !== null && document !== undefined) {
    components.textContent = DESIGNER_UI_TEXT.componentCount(document.components.length);
  }
}

export function renderTopbarSaveStatus(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const root = element.shadowRoot;
  if (root === null) return;
  const badge = root.querySelector<HTMLElement>('[data-topbar-save-status]');
  if (badge === null) return;
  if (elementState.session.project === undefined) {
    badge.dataset.state = 'direct';
    badge.textContent = DESIGNER_UI_TEXT.directDocument;
    return;
  }
  if (elementState.session.projectPhase === 'saving') {
    badge.dataset.state = 'saving';
    badge.innerHTML = `${saveStatusSpinnerGlyph()}<span>${DESIGNER_UI_TEXT.saveStatus.saving}</span>`;
    return;
  }
  if (elementState.session.dirty) {
    badge.dataset.state = 'dirty';
    badge.innerHTML = `<span class="topbar-save-status-dot" aria-hidden="true"></span><span>${DESIGNER_UI_TEXT.saveStatus.unsaved}</span>`;
    return;
  }
  if (elementState.lastSavedAt !== undefined) {
    badge.dataset.state = 'saved';
    badge.innerHTML = `${designerIcon('check')}<span>${DESIGNER_UI_TEXT.saveStatus.saved(
      formatSavedTime(elementState.lastSavedAt),
    )}</span>`;
    return;
  }
  badge.dataset.state = 'clean';
  badge.textContent = '';
}

export function renderOperationControls(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const root = element.shadowRoot;
  if (root === null) return;
  const phase = elementState.session.projectPhase;
  for (const control of root.querySelectorAll<HTMLButtonElement>(
    '[data-action], [data-menu-action]',
  )) {
    const id = control.dataset.action ?? control.dataset.menuAction;
    if (id === undefined) continue;
    const state = elementState.operations.getState(id, undefined);
    if (state !== undefined) {
      control.hidden = !state.available;
      control.disabled = !state.enabled;
    }
    const isBusy =
      (id === 'project-save' && phase === 'saving') ||
      (id === 'project-publish' && phase === 'publishing');
    control.ariaBusy = String(isBusy);
  }
  elementState.menuController.renderMenuStates();
}

export function renderToolControls(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const root = element.shadowRoot;
  if (root === null) return;
  for (const tool of DESIGNER_TOOLS) {
    const control = root.querySelector<HTMLButtonElement>(`[data-tool="${tool.id}"]`);
    if (control === null) continue;
    const state = elementState.operations.getState(`tool.${tool.id}`, undefined);
    control.hidden = state?.available !== true;
    control.disabled = state?.enabled !== true;
    control.ariaPressed = String(elementState.viewportController.activeTool === tool.id);
  }
}

export function isProjectBusy(element: DesignerElementHost): boolean {
  const elementState = getDesignerElementState(element);

  return (
    elementState.session.projectPhase === 'saving' ||
    elementState.session.projectPhase === 'publishing'
  );
}

export function exportFromOperation(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const exported = element.exportDocument();
  if (exported.ok) {
    downloadDesignerDocument(
      element.ownerDocument,
      elementState.runtime.exportFileName(element),
      exported.value,
    );
    elementState.notificationController.notify(DESIGNER_UI_TEXT.exported, 'success');
    element.dispatchEvent(
      new CustomEvent('base-screen-export', { detail: { document: exported.value } }),
    );
  } else {
    elementState.runtime.emitDiagnostics(element, exported.diagnostics);
  }
}

export function exportFileName(element: DesignerElementHost): string {
  const elementState = getDesignerElementState(element);

  const projectName = elementState.session.project?.name;
  if (projectName === undefined || projectName.trim() === '') {
    return DESIGNER_UI_TEXT.defaultExportFileName;
  }
  return `${projectName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')}.json`;
}

export function openImportPicker(element: DesignerElementHost): void {
  element.shadowRoot?.querySelector<HTMLInputElement>('[data-import-document]')?.click();
}

export function cancelGesture(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.gestureController.cancel();
}

export function resetSessionSurfaces(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.runtime.cancelGesture(element);
  elementState.coordinateEntryController.close(false);
  elementState.sizeEntryController.close(false);
  elementState.workbenchController.clearGuides();
  elementState.layersController.clearSessionState();
  elementState.panelController.clearClipboard();
  elementState.datasetController.clear();
  elementState.integrationController.clear();
  elementState.projectFeedbackController.clear();
  elementState.previewController.clear();
  elementState.projectWorkspaceController.clear();
  elementState.importController.clear();
  elementState.notificationController.clear();
  elementState.blueprintWorkbenchController.resetSession();
  elementState.autoWidthController.clear();
  elementState.autoWidthController.sync(elementState.session.document);
  elementState.runtime.renderInteraction(element);
}

export function report(
  element: DesignerElementHost,
  result: ScreenParseResult<ScreenDocument>,
): void {
  const elementState = getDesignerElementState(element);

  if (!result.ok) {
    elementState.runtime.emitDiagnostics(element, result.diagnostics);
  }
}

export function reportProject(
  element: DesignerElementHost,
  result: ScreenParseResult<unknown>,
): void {
  const elementState = getDesignerElementState(element);

  if (!result.ok) elementState.runtime.emitDiagnostics(element, result.diagnostics);
}

export function reportPreview(element: DesignerElementHost, result: ScreenParseResult<void>): void {
  const elementState = getDesignerElementState(element);

  if (!result.ok) elementState.runtime.emitDiagnostics(element, result.diagnostics);
}

export function emitDiagnostics(
  element: DesignerElementHost,
  diagnostics: readonly ScreenDiagnostic[],
): void {
  const elementState = getDesignerElementState(element);

  const diagnostic = diagnostics[0];
  if (diagnostic !== undefined && elementState.statusFeedback !== undefined) {
    elementState.statusFeedback.textContent = designerDiagnosticSummary(diagnostic.code);
    elementState.notificationController.notify(designerDiagnosticSummary(diagnostic.code), 'error');
  }
  element.dispatchEvent(new CustomEvent('base-screen-diagnostic', { detail: { diagnostics } }));
}

export function emitChange(
  element: DesignerElementHost,
  document: ScreenDocument | undefined,
): void {
  element.dispatchEvent(new CustomEvent('base-screen-change', { detail: { document } }));
}
