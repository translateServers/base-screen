import type { ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenViewerElement } from '@base-screen/renderer';
import { defineBaseScreenElement } from './definition.js';

export const BASE_SCREEN_VIEWER_TAG_NAME = 'base-screen-viewer' as const;

export { BaseScreenViewerElement } from '@base-screen/renderer';

export function defineBaseScreenViewer(): ScreenParseResult<CustomElementConstructor> {
  return defineBaseScreenElement(BASE_SCREEN_VIEWER_TAG_NAME, BaseScreenViewerElement);
}
