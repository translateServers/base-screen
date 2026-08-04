import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';

export function defineBaseScreenElement(
  tagName: string,
  constructor: CustomElementConstructor,
): ScreenParseResult<CustomElementConstructor> {
  const registry = globalThis.customElements;
  if (registry === undefined) {
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Custom Elements are unavailable in this runtime.',
    );
  }
  const existing = registry.get(tagName);
  if (existing === constructor) {
    return { ok: true, value: constructor, diagnostics: [] };
  }
  if (existing !== undefined) {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      'Product tag is bound to a different constructor.',
    );
  }
  try {
    registry.define(tagName, constructor);
  } catch {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      'Product constructor cannot be registered for this tag.',
    );
  }
  return { ok: true, value: constructor, diagnostics: [] };
}

function failure<T>(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
