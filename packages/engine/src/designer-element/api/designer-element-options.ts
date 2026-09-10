import type { ScreenDocument, ScreenProjectAdapter } from '@base-screen/contracts';
import type {
  BaseScreenPluginCatalog,
  BaseScreenPluginPanelCatalog,
  BaseScreenRuntimeContributionIndex,
  PluginCommandPort,
} from '@base-screen/plugin-core';
import {
  type BaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryGrouping,
  validateBaseScreenMaterialLibraryGroupingForCatalog,
} from '../../common/operations/material-library/material-library-grouping.js';
import {
  type BaseScreenMaterialLibraryItem,
  parseBaseScreenMaterialLibraryItems,
  resolveBaseScreenMaterialLibraryItems,
} from '../../common/operations/material-library/material-library-items.js';
import {
  type BaseScreenMaterialLibraryState,
  parseBaseScreenMaterialLibraryState,
} from '../../common/operations/material-library/material-library-state.js';
import { type DesignerToolMaterialTypes } from '../../common/tools/designer-tools.js';
import {
  isBaseScreenPluginCatalog,
  isBaseScreenPluginPanelCatalog,
  isPluginCommandPort,
  lifecycleDiagnostic,
} from '../runtime/designer-element-guards.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export function selectLeftPanelGroup(element: DesignerElementHost, groupId: string): boolean {
  const elementState = getDesignerElementState(element);

  return elementState.blueprintWorkbenchController.mode === 'blueprint'
    ? elementState.blueprintWorkbenchController.selectLeftPanelGroup(groupId)
    : elementState.workbenchController.selectLeftPanelGroup(groupId);
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

export function readBackButton(element: DesignerElementHost): boolean {
  const elementState = getDesignerElementState(element);

  return elementState.backButton;
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

export function readPluginCatalog(
  element: DesignerElementHost,
): BaseScreenPluginCatalog | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.pluginCatalog;
}

export function writePluginCatalog(
  element: DesignerElementHost,
  value: BaseScreenPluginCatalog | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.pluginCatalog) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Plugin catalog cannot change after initialization. Call unload first.'),
    ]);
    return;
  }
  if (value !== undefined && !isBaseScreenPluginCatalog(value)) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Designer plugin catalog 必须是合法的插件目录。'),
    ]);
    return;
  }
  elementState.pluginCatalog = value;
}

export function readPluginPanels(
  element: DesignerElementHost,
): BaseScreenPluginPanelCatalog | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.pluginPanels;
}

export function writePluginPanels(
  element: DesignerElementHost,
  value: BaseScreenPluginPanelCatalog | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.pluginPanels) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Plugin panels cannot change after initialization. Call unload first.'),
    ]);
    return;
  }
  if (value !== undefined && !isBaseScreenPluginPanelCatalog(value)) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Designer plugin panels 必须是携带 panel 贡献的面板目录。'),
    ]);
    return;
  }
  elementState.pluginPanels = value;
}

export function readPluginCommandPort(element: DesignerElementHost): PluginCommandPort | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.pluginCommandPort;
}

export function writePluginCommandPort(
  element: DesignerElementHost,
  value: PluginCommandPort | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.pluginCommandPort) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic(
        'Plugin command port cannot change after initialization. Call unload first.',
      ),
    ]);
    return;
  }
  if (value !== undefined && !isPluginCommandPort(value)) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Designer plugin command port 必须是含 execute 的对象。'),
    ]);
    return;
  }
  elementState.pluginCommandPort = value;
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
