import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';

export function prefixFailure<T>(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: readonly (string | number)[],
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: sortDiagnostics(
      diagnostics.map((item) => ({ ...item, path: [...prefix, ...item.path] })),
    ),
  };
}

export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const byPath = comparePaths(left.path, right.path);
    if (byPath !== 0) {
      return byPath;
    }
    if (left.code !== right.code) {
      return left.code < right.code ? -1 : 1;
    }
    return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
  });
}

function comparePaths(left: ScreenDiagnostic['path'], right: ScreenDiagnostic['path']): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const leftSegment = left[index]!;
    const rightSegment = right[index]!;
    if (typeof leftSegment !== typeof rightSegment) {
      return typeof leftSegment === 'number' ? -1 : 1;
    }
    if (leftSegment !== rightSegment) {
      return leftSegment < rightSegment ? -1 : 1;
    }
  }
  return left.length - right.length;
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
