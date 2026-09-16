import {
  type ScreenDiagnostic,
  type ScreenDiagnosticPath,
  sortScreenDiagnostics,
} from '@base-screen/contracts';

/** 诊断规范序由 Contracts 独占定义（compareScreenDiagnostics），本包不再自行排序。 */
export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return sortScreenDiagnostics(diagnostics);
}

/**
 * Prepend path segments to a diagnostic, preserving severity, code, and message.
 * Used by transaction to prefix command diagnostics with `['commands', index]`.
 */
export function prefixDiagnostic(
  diagnostic: ScreenDiagnostic,
  prefix: ScreenDiagnosticPath,
): ScreenDiagnostic {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    path: [...prefix, ...diagnostic.path],
    message: diagnostic.message,
  };
}
