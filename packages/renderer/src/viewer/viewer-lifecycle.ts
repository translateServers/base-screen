import type { ScreenParseResult } from '@base-screen/contracts';

export function lifecycleFailure(message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message }],
  };
}
