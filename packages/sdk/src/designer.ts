import type { ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenDesignerElement } from '@base-screen/engine';
import { defineBaseScreenElement } from './definition.js';

export const BASE_SCREEN_DESIGNER_TAG_NAME = 'base-screen-designer' as const;

export { BaseScreenDesignerElement } from '@base-screen/engine';

export function defineBaseScreenDesigner(): ScreenParseResult<CustomElementConstructor> {
  return defineBaseScreenElement(BASE_SCREEN_DESIGNER_TAG_NAME, BaseScreenDesignerElement);
}
