import type { ScreenDesignerHostAdapter, ScreenParseResult } from '@base-screen/contracts';
import { validateScreenDesignerHostAdapter } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
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
import {
  type BaseScreenDesignerLeftPanelGroup,
  parseBaseScreenDesignerLeftPanelGroups,
} from '../../common/operations/workbench/designer-left-panel-groups.js';
import {
  isBaseScreenConditionalStylePort,
  isBaseScreenMaterialCatalog,
  isBaseScreenRuntimeContributionIndex,
  isScreenHostResourcePort,
  isScreenHostVariableCatalogPort,
  isScreenHostVariablePort,
  lifecycleDiagnostic,
} from '../runtime/designer-element-guards.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';
import type { BaseScreenDesignerConfiguration } from './designer-element-configuration-types.js';

export function readCatalog(element: DesignerElementHost): BaseScreenMaterialCatalog | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.catalog;
}

export function configure(
  element: DesignerElementHost,
  configuration: BaseScreenDesignerConfiguration,
): ScreenParseResult<null> {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer 已初始化，请先 unload 再重新配置。')],
    };
  }
  if (!isBaseScreenMaterialCatalog(configuration.catalog)) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer catalog 必须是合法的物料目录。')],
    };
  }
  const initialWorkbenchMode = configuration.initialWorkbenchMode ?? 'canvas';
  if (initialWorkbenchMode !== 'canvas' && initialWorkbenchMode !== 'blueprint') {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer initialWorkbenchMode is invalid.')],
    };
  }
  let leftPanelGroups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined;
  if (configuration.leftPanelGroups !== undefined) {
    const parsed = parseBaseScreenDesignerLeftPanelGroups(configuration.leftPanelGroups);
    if (!parsed.ok) return parsed;
    leftPanelGroups = parsed.value;
  }
  let materialLibraryState: BaseScreenMaterialLibraryState | undefined;
  if (configuration.materialLibraryState !== undefined) {
    const parsed = parseBaseScreenMaterialLibraryState(configuration.materialLibraryState);
    if (!parsed.ok) return parsed;
    materialLibraryState = parsed.value;
  }
  let materialLibraryItems: readonly BaseScreenMaterialLibraryItem[] | undefined;
  if (configuration.materialLibraryItems !== undefined) {
    const parsed = parseBaseScreenMaterialLibraryItems(configuration.materialLibraryItems);
    if (!parsed.ok) return parsed;
    materialLibraryItems = parsed.value;
  }
  const resolvedMaterialLibraryItems = resolveBaseScreenMaterialLibraryItems(
    configuration.catalog,
    materialLibraryItems,
  );
  if (!resolvedMaterialLibraryItems.ok) return resolvedMaterialLibraryItems;
  let materialLibraryGrouping: BaseScreenMaterialLibraryGrouping | undefined;
  if (configuration.materialLibraryGrouping !== undefined) {
    const parsed = parseBaseScreenMaterialLibraryGrouping(configuration.materialLibraryGrouping);
    if (!parsed.ok) return parsed;
    const validated = validateBaseScreenMaterialLibraryGroupingForCatalog(
      parsed.value,
      configuration.catalog,
    );
    if (!validated.ok) return validated;
    materialLibraryGrouping = validated.value;
  }
  if (
    configuration.previewHandler !== undefined &&
    typeof configuration.previewHandler !== 'function'
  ) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer previewHandler 必须是函数。')],
    };
  }
  if (configuration.backButton !== undefined && typeof configuration.backButton !== 'boolean') {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer backButton 必须是布尔值。')],
    };
  }
  if (
    configuration.canvasBackgroundImageButton !== undefined &&
    typeof configuration.canvasBackgroundImageButton !== 'boolean'
  ) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer canvasBackgroundImageButton 必须是布尔值。')],
    };
  }
  if (
    configuration.resourcePort !== undefined &&
    !isScreenHostResourcePort(configuration.resourcePort)
  ) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer resource port 必须是含 resolve 的对象。')],
    };
  }
  if (
    configuration.variablePort !== undefined &&
    !isScreenHostVariablePort(configuration.variablePort)
  ) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer variable port 必须是含 resolve 的对象。')],
    };
  }
  if (
    configuration.variableCatalogPort !== undefined &&
    !isScreenHostVariableCatalogPort(configuration.variableCatalogPort)
  ) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer variable catalog port 必须包含 list/describe。')],
    };
  }
  if (
    configuration.designerHostAdapter === undefined &&
    configuration.variableCatalogPort !== undefined &&
    configuration.variablePort === undefined
  ) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Designer variable catalog requires variablePort.')],
    };
  }
  if (
    configuration.conditionalStylePort !== undefined &&
    !isBaseScreenConditionalStylePort(configuration.conditionalStylePort)
  ) {
    return {
      ok: false,
      diagnostics: [
        lifecycleDiagnostic('Designer conditional style port 必须是含 resolve 的对象。'),
      ],
    };
  }
  if (
    configuration.runtimeContributions !== undefined &&
    !isBaseScreenRuntimeContributionIndex(configuration.runtimeContributions)
  ) {
    return {
      ok: false,
      diagnostics: [
        lifecycleDiagnostic('Designer runtime contributions 必须是含 getResourceType 的对象。'),
      ],
    };
  }
  let adapter: ScreenDesignerHostAdapter | undefined;
  if (configuration.designerHostAdapter !== undefined) {
    const parsed = validateScreenDesignerHostAdapter(configuration.designerHostAdapter);
    if (!parsed.ok) {
      return { ok: false, diagnostics: parsed.diagnostics };
    }
    adapter = parsed.value;
  }
  // 在提交任何字段之前绑定 project adapter：绑定失败时既有字段与 session
  // 保持原样（failed configure leaves prior fields/session untouched）。
  if (configuration.projectAdapter !== undefined) {
    const bound = elementState.session.bindProjectAdapter(configuration.projectAdapter);
    if (!bound.ok) {
      return { ok: false, diagnostics: bound.diagnostics };
    }
  }
  if (adapter !== undefined) {
    elementState.designerHostAdapter = adapter;
    elementState.projectCatalogPort = adapter.projectCatalog;
    elementState.projectPreviewPort = adapter.projectPreview;
    elementState.projectSnapshotPort = adapter.projectSnapshots;
    elementState.resourcePort = adapter.resources;
    elementState.variablePort = adapter.variables;
    elementState.variableCatalogPort = adapter.variableCatalog;
    elementState.datasetPort = adapter.datasets;
  } else {
    elementState.designerHostAdapter = undefined;
    elementState.projectCatalogPort = configuration.projectCatalogPort;
    elementState.projectPreviewPort = configuration.projectPreviewPort;
    elementState.projectSnapshotPort = configuration.projectSnapshotPort;
    elementState.resourcePort = configuration.resourcePort;
    elementState.variablePort = configuration.variablePort;
    elementState.variableCatalogPort = configuration.variableCatalogPort;
    elementState.datasetPort = configuration.datasetPort;
  }
  elementState.conditionalStylePort = configuration.conditionalStylePort;
  elementState.catalog = configuration.catalog;
  elementState.leftPanelGroups = leftPanelGroups;
  elementState.materialLibraryState = materialLibraryState;
  elementState.materialLibraryGrouping = materialLibraryGrouping;
  elementState.materialLibraryItems = materialLibraryItems;
  elementState.resolvedMaterialLibraryItems = resolvedMaterialLibraryItems.value;
  elementState.runtimeContributions = configuration.runtimeContributions;
  elementState.toolMaterialTypes = configuration.toolMaterialTypes;
  elementState.groupMaterialType = configuration.groupMaterialType;
  elementState.previewHandler = configuration.previewHandler;
  elementState.backButton = configuration.backButton ?? false;
  elementState.canvasBackgroundImageButton = configuration.canvasBackgroundImageButton ?? false;
  elementState.blueprintWorkbenchController.setInitialMode(initialWorkbenchMode);
  elementState.runtime.initialize(element);
  return { ok: true, value: null, diagnostics: [] };
}

export function writeCatalog(
  element: DesignerElementHost,
  value: BaseScreenMaterialCatalog | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (elementState.renderer !== undefined && value !== elementState.catalog) {
    elementState.runtime.emitDiagnostics(element, [
      lifecycleDiagnostic('Catalog cannot change after initialization. Call unload first.'),
    ]);
    return;
  }
  if (value === undefined) {
    elementState.catalog = undefined;
    elementState.resolvedMaterialLibraryItems = [];
    return;
  }
  if (value !== undefined && elementState.materialLibraryGrouping !== undefined) {
    const validated = validateBaseScreenMaterialLibraryGroupingForCatalog(
      elementState.materialLibraryGrouping,
      value,
    );
    if (!validated.ok) {
      elementState.runtime.emitDiagnostics(element, validated.diagnostics);
      return;
    }
  }
  const resolved = resolveBaseScreenMaterialLibraryItems(value, elementState.materialLibraryItems);
  if (!resolved.ok) {
    elementState.runtime.emitDiagnostics(element, resolved.diagnostics);
    return;
  }
  elementState.catalog = value;
  elementState.resolvedMaterialLibraryItems = resolved.value;
}

export function readLeftPanelGroups(
  element: DesignerElementHost,
): readonly BaseScreenDesignerLeftPanelGroup[] | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.leftPanelGroups;
}

export function writeLeftPanelGroups(
  element: DesignerElementHost,
  value: readonly BaseScreenDesignerLeftPanelGroup[] | undefined,
) {
  const elementState = getDesignerElementState(element);

  if (value === undefined) {
    elementState.leftPanelGroups = undefined;
    elementState.runtime.renderLeftPanelGroups(element);
    return;
  }
  const parsed = parseBaseScreenDesignerLeftPanelGroups(value);
  if (!parsed.ok) {
    elementState.runtime.emitDiagnostics(element, parsed.diagnostics);
    return;
  }
  elementState.leftPanelGroups = parsed.value;
  elementState.runtime.renderLeftPanelGroups(element);
}
