import type { ScreenDiagnostic, ScreenDiagnosticPath } from '@base-screen/contracts';

/**
 * Sort diagnostics by path, code, then message. Matches Contracts' stable
 * ordering rules so consumers can rely solely on code and path.
 */
export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort(compareDiagnostics);
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

function compareDiagnostics(a: ScreenDiagnostic, b: ScreenDiagnostic): number {
  const byPath = comparePaths(a.path, b.path);
  if (byPath !== 0) {
    return byPath;
  }
  if (a.code < b.code) {
    return -1;
  }
  if (a.code > b.code) {
    return 1;
  }
  if (a.message < b.message) {
    return -1;
  }
  if (a.message > b.message) {
    return 1;
  }
  return 0;
}

function comparePaths(a: ScreenDiagnosticPath, b: ScreenDiagnosticPath): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const bySegment = compareSegments(a[i]!, b[i]!);
    if (bySegment !== 0) {
      return bySegment;
    }
  }
  return a.length - b.length;
}

function compareSegments(a: string | number, b: string | number): number {
  const aIsNumber = typeof a === 'number';
  const bIsNumber = typeof b === 'number';
  if (aIsNumber !== bIsNumber) {
    return aIsNumber ? -1 : 1;
  }
  if (aIsNumber) {
    return (a as number) - (b as number);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
