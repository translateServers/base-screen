import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';

const MAX_DIAGNOSTICS = 100;

export class DiagnosticCollector {
  #items: ScreenDiagnostic[] = [];

  add(code: ScreenDiagnostic['code'], path: readonly (string | number)[], message: string): void {
    if (this.#items.length < MAX_DIAGNOSTICS) {
      this.#items.push({ severity: 'error', code, path, message });
    }
  }

  get hasErrors(): boolean {
    return this.#items.length > 0;
  }

  get items(): readonly ScreenDiagnostic[] {
    return this.#items;
  }

  failure<T>(): ScreenParseResult<T> {
    return { ok: false, diagnostics: sortDiagnostics(this.#items) };
  }
}

export function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: sortDiagnostics([{ severity: 'error', code, path, message }]) };
}

export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  const sorted = [...diagnostics].sort((left, right) => {
    const byPath = comparePaths(left.path, right.path);
    if (byPath !== 0) return byPath;
    if (left.code !== right.code) return left.code < right.code ? -1 : 1;
    return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
  });
  return sorted.length < MAX_DIAGNOSTICS
    ? sorted
    : [
        ...sorted.slice(0, MAX_DIAGNOSTICS - 1),
        {
          severity: 'error',
          code: 'DIAGNOSTIC_LIMIT_REACHED',
          path: [],
          message: 'Too many validation errors; further diagnostics were suppressed.',
        },
      ];
}

function comparePaths(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const leftSegment = left[index]!;
    const rightSegment = right[index]!;
    if (typeof leftSegment !== typeof rightSegment) return typeof leftSegment === 'number' ? -1 : 1;
    if (leftSegment !== rightSegment) return leftSegment < rightSegment ? -1 : 1;
  }
  return left.length - right.length;
}
