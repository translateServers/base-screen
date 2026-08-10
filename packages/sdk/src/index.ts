import type { ScreenParseResult } from '@base-screen/contracts';
import { defineBaseScreenDesigner } from './designer.js';
import { defineBaseScreenViewer } from './viewer.js';

export type {
  ScreenAuthoringEditorContext,
  ScreenAuthoringEditorLimits,
  ScreenAuthoringRequest,
  ScreenAuthoringRequestEventDetail,
  ScreenBlueprintCommitRequest,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
} from '@base-screen/contracts';
export { SCREEN_AUTHORING_REQUEST_EVENT } from '@base-screen/contracts';
export {
  BASE_SCREEN_DESIGNER_TAG_NAME,
  BaseScreenDesignerElement,
  defineBaseScreenDesigner,
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
