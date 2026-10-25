import type {
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenProjectCatalogPort,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshotPort,
} from '@base-screen/contracts';
import { validateScreenDesignerHostAdapter } from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenHostConditionalStyleAuthoringPort,
} from '@base-screen/plugin-core';
import { lifecycleDiagnostic } from '../runtime/designer-element-guards.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export function readResourcePort(element: DesignerElementHost): ScreenHostResourcePort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.resourcePort;
}

export function readDesignerHostAdapter(
  element: DesignerElementHost,
): ScreenDesignerHostAdapter | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.designerHostAdapter;
}

export function writeDesignerHostAdapter(
  element: DesignerElementHost,
  value: ScreenDesignerHostAdapter | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (value === undefined) {
    elementState.designerHostAdapter = undefined;
    element.projectCatalogPort = undefined;
    element.projectPreviewPort = undefined;
    element.projectSnapshotPort = undefined;
    element.resourcePort = undefined;
    element.hostCatalogPort = undefined;
    element.datasetPort = undefined;
    return;
  }
  const parsed = validateScreenDesignerHostAdapter(value);
  if (!parsed.ok) {
    elementState.runtime.emitDiagnostics(element, parsed.diagnostics);
    return;
  }
  if (
    elementState.renderer !== undefined &&
    (parsed.value.resources !== elementState.resourcePort ||
      parsed.value.hostCatalog !== elementState.hostCatalogPort)
  ) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Resource port cannot change after initialization. Call unload first.'),
    ]);
    return;
  }
  elementState.designerHostAdapter = parsed.value;
  element.projectCatalogPort = parsed.value.projectCatalog;
  element.projectPreviewPort = parsed.value.projectPreview;
  element.projectSnapshotPort = parsed.value.projectSnapshots;
  element.resourcePort = parsed.value.resources;
  element.hostCatalogPort = parsed.value.hostCatalog;
  element.datasetPort = parsed.value.datasets;
}

export function writeResourcePort(
  element: DesignerElementHost,
  value: ScreenHostResourcePort | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.resourcePort) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Resource port cannot change after initialization. Call unload first.'),
    ]);
    return;
  }
  elementState.resourcePort = value;
}

export function readHostCatalogPort(
  element: DesignerElementHost,
): ScreenHostCatalogPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.hostCatalogPort;
}

export function writeHostCatalogPort(
  element: DesignerElementHost,
  value: ScreenHostCatalogPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.hostCatalogPort) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic(
        'Host catalog port cannot change after initialization. Call unload first.',
      ),
    ]);
    return;
  }
  elementState.hostCatalogPort = value;
  elementState.runtime.renderInteraction(element);
}

export function readConditionalStylePort(
  element: DesignerElementHost,
): BaseScreenConditionalStylePort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.conditionalStylePort;
}

export function readHostConditionalStyleAuthoring(
  element: DesignerElementHost,
): BaseScreenHostConditionalStyleAuthoringPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.hostConditionalStyleAuthoring;
}

export function writeHostConditionalStyleAuthoring(
  element: DesignerElementHost,
  value: BaseScreenHostConditionalStyleAuthoringPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.hostConditionalStyleAuthoring) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic(
        'Host conditional style authoring cannot change after initialization. Call unload first.',
      ),
    ]);
    return;
  }
  elementState.hostConditionalStyleAuthoring = value;
}

export function writeConditionalStylePort(
  element: DesignerElementHost,
  value: BaseScreenConditionalStylePort | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.conditionalStylePort) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic(
        'Conditional style port cannot change after initialization. Call unload first.',
      ),
    ]);
    return;
  }
  elementState.conditionalStylePort = value;
}

export function readDatasetCatalogPort(
  element: DesignerElementHost,
): ScreenHostDatasetPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.datasetPort;
}

export function writeDatasetCatalogPort(
  element: DesignerElementHost,
  value: ScreenHostDatasetPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  elementState.datasetPort = value;
  elementState.runtime.renderInteraction(element);
}

export function readProjectCatalogPort(
  element: DesignerElementHost,
): ScreenProjectCatalogPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.projectCatalogPort;
}

export function writeProjectCatalogPort(
  element: DesignerElementHost,
  value: ScreenProjectCatalogPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  elementState.projectCatalogPort = value;
}

export function readProjectPreviewPort(
  element: DesignerElementHost,
): ScreenProjectPreviewPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.projectPreviewPort;
}

export function writeProjectPreviewPort(
  element: DesignerElementHost,
  value: ScreenProjectPreviewPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  elementState.projectPreviewPort = value;
}

export function readProjectSnapshotPort(
  element: DesignerElementHost,
): ScreenProjectSnapshotPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.projectSnapshotPort;
}

export function writeProjectSnapshotPort(
  element: DesignerElementHost,
  value: ScreenProjectSnapshotPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  elementState.projectSnapshotPort = value;
}

export function readDocument(element: DesignerElementHost): ScreenDocument | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.session.document;
}

export function writeDocument(element: DesignerElementHost, value: ScreenDocument | undefined) {
  const elementState = getDesignerElementState(element);

  if (value === undefined) {
    element.unload();
    return;
  }
  elementState.runtime.report(element, element.replaceDocument(value));
}
