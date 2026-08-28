import type { ScreenParseResult } from '@base-screen/contracts';
import { defineBaseScreenDesigner } from './designer.js';
import { defineBaseScreenViewer } from './viewer.js';

export type {
  ScreenAuthoringEditorContext,
  ScreenAuthoringEditorLimits,
  ScreenAuthoringRequest,
  ScreenAuthoringRequestEventDetail,
  ScreenBlueprintAuthoringContext,
  ScreenBlueprintAuthoringEvent,
  ScreenBlueprintAuthoringLimits,
  ScreenBlueprintAuthoringMaterialEvents,
  ScreenBlueprintCommitRequest,
  ScreenBlueprintEditOptions,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
} from '@base-screen/contracts';
export {
  MAX_AUTHORING_DOCUMENT_SNAPSHOT_BYTES,
  MAX_BLUEPRINT_AUTHORING_CAPABILITIES,
  MAX_BLUEPRINT_AUTHORING_CONTEXT_BYTES,
  MAX_BLUEPRINT_AUTHORING_EVENTS_PER_MATERIAL,
  MAX_BLUEPRINT_AUTHORING_PAYLOAD_SCHEMA_BYTES,
  parseScreenBlueprintAuthoringContext,
  SCREEN_AUTHORING_REQUEST_EVENT,
} from '@base-screen/contracts';
export {
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX,
  BASE_SCREEN_DESIGNER_TAG_NAME,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  BaseScreenDesignerElement,
  type BaseScreenDesignerLeftPanelGroup,
  type BaseScreenDesignerLeftPanelGroupChangeEventDetail,
  type BaseScreenDesignerLeftPanelGroupIcon,
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryActionEventDetail,
  type BaseScreenMaterialLibraryGroup,
  type BaseScreenMaterialLibraryGrouping,
  type BaseScreenMaterialLibraryItem,
  type BaseScreenMaterialLibraryState,
  type BaseScreenMaterialLibraryStatus,
  baseScreenDesignerLeftPanelSlotName,
  defineBaseScreenDesigner,
  parseBaseScreenDesignerLeftPanelGroups,
  parseBaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryItems,
  parseBaseScreenMaterialLibraryState,
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
