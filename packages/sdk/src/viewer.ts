import type { ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenViewerElement } from '@base-screen/renderer';
import { defineBaseScreenElement } from './definition.js';

export const BASE_SCREEN_VIEWER_TAG_NAME = 'base-screen-viewer' as const;

export { type BaseScreenViewerConfiguration, BaseScreenViewerElement } from '@base-screen/renderer';
export type {
  BaseScreenRuntimeCatalog,
  BaseScreenSetCatalogOptions,
  BaseScreenViewerMountOptions,
  BaseScreenViewerRuntime,
} from './runtime.js';
export {
  type CreateBaseScreenViewerRuntimeOptions,
  createBaseScreenViewerRuntime,
} from './viewer-runtime.js';

export function defineBaseScreenViewer(): ScreenParseResult<CustomElementConstructor> {
  return defineBaseScreenElement(BASE_SCREEN_VIEWER_TAG_NAME, BaseScreenViewerElement);
}
