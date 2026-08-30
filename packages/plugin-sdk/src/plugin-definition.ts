import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenPluginRuntime,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { areEqual, failure } from './diagnostics.js';

export function definePlugin(
  runtime: BaseScreenPluginRuntime,
): ScreenParseResult<BaseScreenPluginRuntime> {
  const parsedManifest = parseBaseScreenPluginManifest(runtime.manifest);
  if (!parsedManifest.ok) {
    return parsedManifest;
  }
  if (!areEqual(parsedManifest.value, runtime.manifest)) {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      ['manifest'],
      'Plugin runtime manifest does not match its canonical manifest.',
    );
  }
  return { ok: true, value: runtime, diagnostics: [] };
}
