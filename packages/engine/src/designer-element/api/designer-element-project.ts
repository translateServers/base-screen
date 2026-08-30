import type {
  ScreenAssetSummary,
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectEnvelope,
  ScreenProjectSnapshot,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export function load(
  element: DesignerElementHost,
  projectId: string,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.session.load(projectId);
}

export function listProjects(
  element: DesignerElementHost,
  query = '',
  published: boolean | undefined = undefined,
): Promise<ScreenParseResult<readonly ScreenProjectSummary[]>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.listProjects(query, published);
}

export function createProject(
  element: DesignerElementHost,
  name: string,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.createProject(name);
}

export function cloneProject(
  element: DesignerElementHost,
  projectId: string,
  name: string,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.cloneProject(projectId, name);
}

export function deleteProject(
  element: DesignerElementHost,
  projectId: string,
  revision: string,
): Promise<ScreenParseResult<void>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.deleteProject(projectId, revision);
}

export function importProject(
  element: DesignerElementHost,
  name: string,
  document: ScreenDocument,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.importProject(name, document);
}

export function exportProject(
  element: DesignerElementHost,
  projectId: string,
  revision: string,
): Promise<ScreenParseResult<ScreenDocument>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.exportProject(projectId, revision);
}

export function previewProject(
  element: DesignerElementHost,
  published: boolean,
): Promise<ScreenParseResult<ScreenDocument>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.previewProject(published);
}

export function listSnapshots(
  element: DesignerElementHost,
): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.listSnapshots();
}

export function createSnapshot(
  element: DesignerElementHost,
  name: string,
): Promise<ScreenParseResult<ScreenProjectSnapshot>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.createSnapshot(name);
}

export function restoreSnapshot(
  element: DesignerElementHost,
  snapshotId: string,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.restoreSnapshot(snapshotId);
}

export function listAssets(
  element: DesignerElementHost,
  query = '',
): Promise<ScreenParseResult<readonly ScreenAssetSummary[]>> {
  const elementState = getDesignerElementState(element);

  return elementState.projectGateway.listAssets(query);
}

export function refreshData(element: DesignerElementHost, componentId?: string): void {
  const elementState = getDesignerElementState(element);

  elementState.canvasRuntimeController.refreshData(componentId);
  elementState.previewController.refreshData(componentId);
}

export function save(
  element: DesignerElementHost,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.session.save().then((result) => {
    if (result.ok) {
      elementState.lastSavedAt = Date.now();
      elementState.runtime.renderTopbarSaveStatus(element);
    }
    return result;
  });
}

export function publish(
  element: DesignerElementHost,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.session.publish();
}

export function retryLastProjectOperation(
  element: DesignerElementHost,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.session.retryLastProjectOperation();
}

export function reloadRemote(
  element: DesignerElementHost,
  discardChanges = false,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const elementState = getDesignerElementState(element);

  return elementState.session.reloadRemote(discardChanges);
}

export function continueEditing(element: DesignerElementHost): ScreenParseResult<void> {
  const elementState = getDesignerElementState(element);

  return elementState.session.continueEditing();
}

export function cancelProjectOperation(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.session.cancelProjectOperation();
}

export function unload(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.runtime.invalidateAuthoringRequests(element);
  elementState.session.unload();
  elementState.lastSavedAt = undefined;
  elementState.runtime.resetSessionSurfaces(element);
  elementState.canvasRuntimeController.clear();
  elementState.renderer?.dispose();
  elementState.renderer = undefined;
  elementState.blueprintWorkbenchController.setInitialMode('canvas');
  elementState.blueprintWorkbenchController.resetSession();
  elementState.runtime.renderInteraction(element);
}
