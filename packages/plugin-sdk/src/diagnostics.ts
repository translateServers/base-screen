import {
  type ScreenDiagnostic,
  type ScreenParseResult,
  sortScreenDiagnostics,
} from '@base-screen/contracts';

export function prefixFailure<T>(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: readonly (string | number)[],
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: sortScreenDiagnostics(
      diagnostics.map((item) => ({ ...item, path: [...prefix, ...item.path] })),
    ),
  };
}

export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return sortScreenDiagnostics(diagnostics);
}

export function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
