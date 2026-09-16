import {
  type ScreenDiagnostic,
  type ScreenParseResult,
  sortScreenDiagnostics,
} from '@base-screen/contracts';

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
  const sorted = sortScreenDiagnostics(diagnostics);
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
