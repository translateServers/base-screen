import type {
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenHostResourcePort,
  ScreenHostVariableCatalogPort,
  ScreenHostVariablePort,
  ScreenProjectCatalogPort,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshotPort,
} from '@base-screen/contracts';
import { validateScreenDesignerHostAdapter } from '@base-screen/contracts';
import type { BaseScreenConditionalStylePort } from '@base-screen/plugin-core';
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
    element.variableCatalogPort = undefined;
    element.variablePort = undefined;
    element.datasetCatalogPort = undefined;
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
      parsed.value.variables !== elementState.variablePort)
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
  if (parsed.value.variableCatalog === undefined) element.variableCatalogPort = undefined;
  element.variablePort = parsed.value.variables;
  if (parsed.value.variableCatalog !== undefined) {
    element.variableCatalogPort = parsed.value.variableCatalog;
  }
  element.datasetCatalogPort = parsed.value.datasetCatalog;
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

export function readVariablePort(element: DesignerElementHost): ScreenHostVariablePort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.variablePort;
}

export function writeVariablePort(
  element: DesignerElementHost,
  value: ScreenHostVariablePort | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.variablePort) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Variable port cannot change after initialization. Call unload first.'),
    ]);
    return;
  }
  if (value === undefined && elementState.variableCatalogPort !== undefined) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Variable port cannot be removed while variable catalog is enabled.'),
    ]);
    return;
  }
  elementState.variablePort = value;
}

export function readVariableCatalogPort(
  element: DesignerElementHost,
): ScreenHostVariableCatalogPort | undefined {
  return getDesignerElementState(element).variableCatalogPort;
}

export function writeVariableCatalogPort(
  element: DesignerElementHost,
  value: ScreenHostVariableCatalogPort | undefined,
) {
  const elementState = getDesignerElementState(element);
  if (value !== undefined && elementState.variablePort === undefined) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Variable catalog requires a variable port.'),
    ]);
    return;
  }
  elementState.variableCatalogPort = value;
  elementState.runtime.renderInteraction(element);
}

export function readConditionalStylePort(
  element: DesignerElementHost,
): BaseScreenConditionalStylePort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.conditionalStylePort;
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
): ScreenHostDatasetCatalogPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.datasetCatalogPort;
}

export function writeDatasetCatalogPort(
  element: DesignerElementHost,
  value: ScreenHostDatasetCatalogPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  elementState.datasetCatalogPort = value;
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
