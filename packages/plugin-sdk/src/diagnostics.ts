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

export function areEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => areEqual(item, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && areEqual(leftRecord[key], rightRecord[key]),
    )
  );
}
