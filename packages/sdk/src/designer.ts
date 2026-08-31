import type { ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenDesignerElement } from '@base-screen/engine';
import { defineBaseScreenElement } from './definition.js';

export const BASE_SCREEN_DESIGNER_TAG_NAME = 'base-screen-designer' as const;

export {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME,
  BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX,
  BASE_SCREEN_DESIGNER_WORKBENCH_MODE_CHANGE_EVENT,
  BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasCommandEventDetail,
  type BaseScreenBlueprintCanvasCommandResult,
  type BaseScreenBlueprintCanvasEdge,
  type BaseScreenBlueprintCanvasEventOption,
  type BaseScreenBlueprintCanvasGraph,
  type BaseScreenBlueprintCanvasInsertNode,
  type BaseScreenBlueprintCanvasNode,
  type BaseScreenBlueprintCanvasNodePosition,
  type BaseScreenBlueprintCanvasNodeSummary,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenBlueprintCanvasStateEventDetail,
  type BaseScreenBlueprintCanvasTrace,
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
  baseScreenDesignerLeftPanelSlotName,
  parseBaseScreenBlueprintCanvasCommand,
  parseBaseScreenDesignerLeftPanelGroups,
  parseBaseScreenHostResourceAuthoringIntent,
  parseBaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryItems,
  parseBaseScreenMaterialLibraryState,
  writeBaseScreenHostResourceDragData,
} from '@base-screen/engine';

export function defineBaseScreenDesigner(): ScreenParseResult<CustomElementConstructor> {
  return defineBaseScreenElement(BASE_SCREEN_DESIGNER_TAG_NAME, BaseScreenDesignerElement);
}
