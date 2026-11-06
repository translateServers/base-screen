import type {
  ScreenDiagnostic,
  ScreenDiagnosticCode,
  ScreenDiagnosticPath,
  ScreenParseResult,
} from '@base-screen/contracts';

export function runtimeDiagnostic(
  code: ScreenDiagnosticCode,
  message: string,
  path: ScreenDiagnosticPath = [],
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

export function runtimeFailure<T>(
  code: ScreenDiagnosticCode,
  message: string,
  path: ScreenDiagnosticPath = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [runtimeDiagnostic(code, message, path)] };
}

export function runtimeSuccess<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

export function nullResult(diagnostics: readonly ScreenDiagnostic[]): ScreenParseResult<null> {
  return diagnostics.length === 0
    ? { ok: true, value: null, diagnostics: [] }
    : { ok: false, diagnostics };
}

export function collectDiagnostics(
  results: readonly ScreenParseResult<unknown>[],
): readonly ScreenDiagnostic[] {
  return results.flatMap((result) => result.diagnostics);
}

export function collectFailureDiagnostics(
  results: readonly ScreenParseResult<unknown>[],
): readonly ScreenDiagnostic[] {
  return results.flatMap((result) => (result.ok ? [] : result.diagnostics));
}
