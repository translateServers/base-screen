import type { ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenDesignerElement } from '@base-screen/engine';
import { defineBaseScreenElement } from './definition.js';

export const BASE_SCREEN_DESIGNER_TAG_NAME = 'base-screen-designer' as const;

export {
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX,
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
  parseBaseScreenDesignerLeftPanelGroups,
  parseBaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryItems,
  parseBaseScreenMaterialLibraryState,
} from '@base-screen/engine';

export function defineBaseScreenDesigner(): ScreenParseResult<CustomElementConstructor> {
  return defineBaseScreenElement(BASE_SCREEN_DESIGNER_TAG_NAME, BaseScreenDesignerElement);
}
