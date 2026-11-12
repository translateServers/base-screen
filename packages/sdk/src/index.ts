import type { ScreenParseResult } from '@base-screen/contracts';
import { defineBaseScreenDesigner } from './designer.js';
import { defineBaseScreenViewer } from './viewer.js';

export type {
  ScreenAuthoringEditorContext,
  ScreenAuthoringEditorLimits,
  ScreenAuthoringRequest,
  ScreenAuthoringRequestEventDetail,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
} from '@base-screen/contracts';
export { SCREEN_AUTHORING_REQUEST_EVENT } from '@base-screen/contracts';
export {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME,
  BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT,
  BASE_SCREEN_CHANGE_STATE_EVENT,
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX,
  BASE_SCREEN_DESIGNER_TAG_NAME,
  BASE_SCREEN_DESIGNER_WORKBENCH_MODE_CHANGE_EVENT,
  BASE_SCREEN_GUARD_CHANGE_EVENT,
  BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
  BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  BASE_SCREEN_METRIC_EVENT,
  BASE_SCREEN_SCENE_CHANGE_EVENT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasCommandEventDetail,
  type BaseScreenBlueprintCanvasCommandResult,
  type BaseScreenBlueprintCanvasEdge,
  type BaseScreenBlueprintCanvasEventOption,
  type BaseScreenBlueprintCanvasGraph,
  type BaseScreenBlueprintCanvasInsertNode,
  type BaseScreenBlueprintCanvasNode,
  type BaseScreenBlueprintCanvasNodePosition,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenBlueprintCanvasStateEventDetail,
  type BaseScreenBlueprintCanvasTrace,
  type BaseScreenCanvasPresentationChangeEventDetail,
  type BaseScreenCanvasScaleMode,
  type BaseScreenDesignerBackRequestEventDetail,
  type BaseScreenDesignerChangeProposalSummary,
  type BaseScreenDesignerChangeStateDetail,
  type BaseScreenDesignerChangeUnitSummary,
  type BaseScreenDesignerConfiguration,
  BaseScreenDesignerElement,
  type BaseScreenDesignerLeftPanelGroup,
  type BaseScreenDesignerLeftPanelGroupChangeEventDetail,
  type BaseScreenDesignerLeftPanelGroupIcon,
  type BaseScreenDesignerSetWorkbenchModeOptions,
  type BaseScreenDesignerWorkbenchFocus,
  type BaseScreenDesignerWorkbenchMode,
  type BaseScreenDesignerWorkbenchModeChangeEventDetail,
  type BaseScreenDesignerWorkbenchModeChangeReason,
  type BaseScreenHostResourceAuthoringIntent,
  type BaseScreenHostResourceDragDataTransfer,
  type BaseScreenHostResourceSelection,
  type BaseScreenHostResourceSelectionCommit,
  type BaseScreenHostResourceSelectionCurrent,
  type BaseScreenHostResourceSelectionRequest,
  type BaseScreenHostResourceSelectionRequestEventDetail,
  type BaseScreenHostResourceSelectionTarget,
  type BaseScreenMaterialCatalogRefreshResult,
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryActionEventDetail,
  type BaseScreenMaterialLibraryGroup,
  type BaseScreenMaterialLibraryGrouping,
  type BaseScreenMaterialLibraryItem,
  type BaseScreenMaterialLibraryState,
  type BaseScreenMaterialLibraryStatus,
  type BaseScreenMetricEventDetail,
  type BaseScreenSceneChangeDetail,
  baseScreenDesignerLeftPanelSlotName,
  type CreateBaseScreenCorePluginCommandPortOptions,
  type CreateBaseScreenCorePluginDesignReadPortOptions,
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
  type DesignerGuardSnapshot,
  type DesignerSceneDescriptor,
  type DesignerSceneHandler,
  type DesignerScenePlan,
  type DesignerScenePrepareResult,
  type DesignerScenePreview,
  type DesignerSceneRequest,
  defineBaseScreenDesigner,
  parseBaseScreenBlueprintCanvasCommand,
  parseBaseScreenDesignerLeftPanelGroups,
  parseBaseScreenHostResourceAuthoringIntent,
  parseBaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryItems,
  parseBaseScreenMaterialLibraryState,
  prepareDesignerScenePreview,
  writeBaseScreenHostResourceDragData,
} from './designer.js';
export {
  type BaseScreenMountController,
  type BaseScreenMountControllerReady,
  type CreateBaseScreenDesignerMountControllerOptions,
  type CreateBaseScreenViewerMountControllerOptions,
  createBaseScreenDesignerMountController,
  createBaseScreenViewerMountController,
} from './mount-controller.js';
export {
  type BaseScreenMountElement,
  type BaseScreenMountHandle,
  type CreateBaseScreenMountHandleOptions,
  createBaseScreenMountHandle,
} from './mount-handle.js';
export {
  type BaseScreenBlueprintCapabilityPlugin,
  type CreateBaseScreenBlueprintCapabilityPluginOptions,
  createBaseScreenBlueprintCapabilityPlugin,
} from './plugins.js';
export {
  BASE_SCREEN_OFFICIAL_GROUP_MATERIAL_TYPE,
  BASE_SCREEN_OFFICIAL_TOOL_MATERIAL_TYPES,
  type BaseScreenDesignerMountOptions,
  type BaseScreenRuntime,
  type BaseScreenRuntimeCatalog,
  type BaseScreenRuntimePluginCommandPort,
  type BaseScreenSetCatalogOptions,
  type BaseScreenViewerMountOptions,
  type CreateBaseScreenRuntimeOptions,
  createBaseScreenRuntime,
} from './runtime.js';
export {
  adoptBaseScreenRuntime,
  type BaseScreenRuntimeHost,
} from './runtime-adapter.js';
export {
  BASE_SCREEN_VIEWER_TAG_NAME,
  type BaseScreenViewerConfiguration,
  BaseScreenViewerElement,
  defineBaseScreenViewer,
} from './viewer.js';

export function defineBaseScreenElements(): ScreenParseResult<null> {
  const viewer = defineBaseScreenViewer();
  if (!viewer.ok) {
    return viewer;
  }
  const designer = defineBaseScreenDesigner();
  if (!designer.ok) {
    return designer;
  }
  return { ok: true, value: null, diagnostics: [] };
}
