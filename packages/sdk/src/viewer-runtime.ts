import type { ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenViewerElement } from '@base-screen/renderer';
import type { BaseScreenViewerRuntime } from './runtime.js';
import { runtimeFailure, runtimeSuccess } from './runtime-diagnostics.js';
import { createBaseScreenRuntimeLifecycle } from './runtime-lifecycle.js';
import {
  type BaseScreenRuntimeRegistrationOptions,
  createBaseScreenRuntimeRegistration,
} from './runtime-registration.js';
import { BASE_SCREEN_VIEWER_TAG_NAME } from './viewer.js';

/** 物料显式传入；只读入口不隐式注册 Designer 或全部官方物料。 */
export interface CreateBaseScreenViewerRuntimeOptions
  extends BaseScreenRuntimeRegistrationOptions {}

export async function createBaseScreenViewerRuntime(
  options: CreateBaseScreenViewerRuntimeOptions = {},
): Promise<ScreenParseResult<BaseScreenViewerRuntime>> {
  const registration = await createBaseScreenRuntimeRegistration(options, [
    { tagName: BASE_SCREEN_VIEWER_TAG_NAME, element: BaseScreenViewerElement },
  ]);
  if (!registration.ok) return registration;
  const lifecycle = createBaseScreenRuntimeLifecycle(registration.value, {
    bindDesigner: () =>
      runtimeFailure('PLUGIN_CORE_LIFECYCLE_INVALID', 'This runtime only supports Viewer mounts.', [
        'designer',
      ]),
    releaseDesigner: () => {},
  });
  return runtimeSuccess(lifecycle.runtime);
}
