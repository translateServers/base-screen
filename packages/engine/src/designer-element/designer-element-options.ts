import type {
  ScreenAssetCatalogPort,
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshotPort,
} from '@base-screen/contracts';
import { validateScreenDesignerHostAdapter } from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { renderMaterialLibraryState } from '../browser/dom/designer-workspace.js';
import { type DesignerToolMaterialTypes } from '../common/tools/designer-tools.js';
import {
  type BaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryGrouping,
  validateBaseScreenMaterialLibraryGroupingForCatalog,
} from '../material-library-grouping.js';
import {
  type BaseScreenMaterialLibraryItem,
  parseBaseScreenMaterialLibraryItems,
  resolveBaseScreenMaterialLibraryItems,
} from '../material-library-items.js';
import {
  type BaseScreenMaterialLibraryState,
  parseBaseScreenMaterialLibraryState,
} from '../material-library-state.js';
import { lifecycleDiagnostic } from './designer-element-guards.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

export function selectLeftPanelGroup(element: DesignerElementHost, groupId: string): boolean {
  const elementState = getDesignerElementState(element);

  return elementState.workbenchController.selectLeftPanelGroup(groupId);
}

export function readMaterialLibraryState(
  element: DesignerElementHost,
): BaseScreenMaterialLibraryState | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.materialLibraryState;
}

export function writeMaterialLibraryState(
  element: DesignerElementHost,
  value: BaseScreenMaterialLibraryState | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (value === undefined) {
    elementState.materialLibraryState = undefined;
    elementState.runtime.renderDesignerElementMaterialLibraryState(element);
    return;
  }
  const parsed = parseBaseScreenMaterialLibraryState(value);
  if (!parsed.ok) {
    elementState.runtime.emitDiagnostics(element, parsed.diagnostics);
    return;
  }
  elementState.materialLibraryState = parsed.value;
  elementState.runtime.renderDesignerElementMaterialLibraryState(element);
}

export function readMaterialLibraryGrouping(
  element: DesignerElementHost,
): BaseScreenMaterialLibraryGrouping | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.materialLibraryGrouping;
}

export function writeMaterialLibraryGrouping(
  element: DesignerElementHost,
  value: BaseScreenMaterialLibraryGrouping | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (value === undefined) {
    elementState.materialLibraryGrouping = undefined;
    elementState.runtime.renderMaterialLibraryGrouping(element);
    return;
  }
  const parsed = parseBaseScreenMaterialLibraryGrouping(value);
  if (!parsed.ok) {
    elementState.runtime.emitDiagnostics(element, parsed.diagnostics);
    return;
  }
  if (elementState.catalog === undefined) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Material library grouping requires a configured catalog.'),
    ]);
    return;
  }
  const validated = validateBaseScreenMaterialLibraryGroupingForCatalog(
    parsed.value,
    elementState.catalog,
  );
  if (!validated.ok) {
    elementState.runtime.emitDiagnostics(element, validated.diagnostics);
    return;
  }
  elementState.materialLibraryGrouping = validated.value;
  elementState.runtime.renderMaterialLibraryGrouping(element);
}

export function readMaterialLibraryItems(
  element: DesignerElementHost,
): readonly BaseScreenMaterialLibraryItem[] | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.materialLibraryItems;
}

export function writeMaterialLibraryItems(
  element: DesignerElementHost,
  value: readonly BaseScreenMaterialLibraryItem[] | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (value === undefined) {
    elementState.materialLibraryItems = undefined;
    if (elementState.catalog === undefined) {
      elementState.resolvedMaterialLibraryItems = [];
    } else {
      const resolved = resolveBaseScreenMaterialLibraryItems(elementState.catalog);
      if (resolved.ok) elementState.resolvedMaterialLibraryItems = resolved.value;
    }
    elementState.runtime.renderMaterialLibraryItems(element);
    return;
  }
  if (elementState.catalog === undefined) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Material library items require a configured catalog.'),
    ]);
    return;
  }
  const parsed = parseBaseScreenMaterialLibraryItems(value);
  if (!parsed.ok) {
    elementState.runtime.emitDiagnostics(element, parsed.diagnostics);
    return;
  }
  const resolved = resolveBaseScreenMaterialLibraryItems(elementState.catalog, parsed.value);
  if (!resolved.ok) {
    elementState.runtime.emitDiagnostics(element, resolved.diagnostics);
    return;
  }
  elementState.materialLibraryItems = parsed.value;
  elementState.resolvedMaterialLibraryItems = resolved.value;
  elementState.runtime.renderMaterialLibraryItems(element);
}

export function readRuntimeContributions(
  element: DesignerElementHost,
): BaseScreenRuntimeContributionIndex | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.runtimeContributions;
}

export function readPreviewHandler(
  element: DesignerElementHost,
): ((document: ScreenDocument) => boolean) | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.previewHandler;
}

export function readCanvasBackgroundImageButton(element: DesignerElementHost): boolean {
  const elementState = getDesignerElementState(element);

  return elementState.canvasBackgroundImageButton;
}

export function writeRuntimeContributions(
  element: DesignerElementHost,
  value: BaseScreenRuntimeContributionIndex | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.runtimeContributions) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic(
        'Runtime contributions cannot change after initialization. Call unload first.',
      ),
    ]);
    return;
  }
  elementState.runtimeContributions = value;
}

export function readProjectAdapter(element: DesignerElementHost): ScreenProjectAdapter | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.session.adapter;
}

export function writeProjectAdapter(
  element: DesignerElementHost,
  value: ScreenProjectAdapter | undefined,
) {
  const elementState = getDesignerElementState(element);

  const bound = elementState.session.bindProjectAdapter(value);
  if (!bound.ok) {
    elementState.runtime.emitDiagnostics(element, bound.diagnostics);
  }
}

export function readToolMaterialTypes(
  element: DesignerElementHost,
): DesignerToolMaterialTypes | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.toolMaterialTypes;
}

export function writeToolMaterialTypes(
  element: DesignerElementHost,
  value: DesignerToolMaterialTypes | undefined,
) {
  const elementState = getDesignerElementState(element);

  elementState.toolMaterialTypes = value;
  elementState.runtime.renderControls(element);
}

export function readGroupMaterialType(element: DesignerElementHost): string | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.groupMaterialType;
}

export function writeGroupMaterialType(element: DesignerElementHost, value: string | undefined) {
  const elementState = getDesignerElementState(element);

  elementState.groupMaterialType = value;
  elementState.runtime.renderControls(element);
}

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
    element.assetCatalogPort = undefined;
    element.projectCatalogPort = undefined;
    element.projectPreviewPort = undefined;
    element.projectSnapshotPort = undefined;
    element.resourcePort = undefined;
    element.variablePort = undefined;
    element.datasetCatalogPort = undefined;
    return;
  }
  const parsed = validateScreenDesignerHostAdapter(value);
  if (!parsed.ok) {
    elementState.runtime.emitDiagnostics(element, parsed.diagnostics);
    return;
  }
  if (elementState.renderer !== undefined && parsed.value.resources !== elementState.resourcePort) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Resource port cannot change after initialization. Call unload first.'),
    ]);
    return;
  }
  elementState.designerHostAdapter = parsed.value;
  element.assetCatalogPort = parsed.value.assets;
  element.projectCatalogPort = parsed.value.projectCatalog;
  element.projectPreviewPort = parsed.value.projectPreview;
  element.projectSnapshotPort = parsed.value.projectSnapshots;
  element.resourcePort = parsed.value.resources;
  element.variablePort = parsed.value.variables;
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
  elementState.variablePort = value;
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

export function readAssetCatalogPort(
  element: DesignerElementHost,
): ScreenAssetCatalogPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.assetCatalogPort;
}

export function writeAssetCatalogPort(
  element: DesignerElementHost,
  value: ScreenAssetCatalogPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  elementState.assetCatalogPort = value;
  elementState.runtime.renderProperties(element);
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
