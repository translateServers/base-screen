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
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX,
  BASE_SCREEN_DESIGNER_TAG_NAME,
  BASE_SCREEN_DESIGNER_WORKBENCH_MODE_CHANGE_EVENT,
  BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
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
  type BaseScreenDesignerBackRequestEventDetail,
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
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryActionEventDetail,
  type BaseScreenMaterialLibraryGroup,
  type BaseScreenMaterialLibraryGrouping,
  type BaseScreenMaterialLibraryItem,
  type BaseScreenMaterialLibraryState,
  type BaseScreenMaterialLibraryStatus,
  type BaseScreenSceneChangeDetail,
  baseScreenDesignerLeftPanelSlotName,
  type CreateBaseScreenCorePluginCommandPortOptions,
  type CreateBaseScreenCorePluginDesignReadPortOptions,
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
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
  BASE_SCREEN_VIEWER_TAG_NAME,
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
