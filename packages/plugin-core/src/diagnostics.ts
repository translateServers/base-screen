import {
  type ScreenDiagnostic,
  type ScreenDiagnosticCode,
  type ScreenDiagnosticPath,
  type ScreenParseResult,
  sortScreenDiagnostics,
} from '@base-screen/contracts';

const MAX_DIAGNOSTICS = 100;

export class PluginDiagnosticCollector {
  #items: ScreenDiagnostic[] = [];

  add(code: ScreenDiagnosticCode, path: ScreenDiagnosticPath, message: string): void {
    if (this.#items.length < MAX_DIAGNOSTICS) {
      this.#items.push({ severity: 'error', code, path, message });
    }
  }

  get hasErrors(): boolean {
    return this.#items.length > 0;
  }

  result<T>(value: T): ScreenParseResult<T> {
    const diagnostics = sortDiagnostics(this.#items);
    return diagnostics.length === 0
      ? { ok: true, value, diagnostics: [] }
      : { ok: false, diagnostics };
  }

  failure<T>(): ScreenParseResult<T> {
    return { ok: false, diagnostics: sortDiagnostics(this.#items) };
  }
}

export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  const sorted = sortScreenDiagnostics(diagnostics);
  if (sorted.length < MAX_DIAGNOSTICS) {
    return sorted;
  }
  return [
    ...sorted.slice(0, MAX_DIAGNOSTICS - 1),
    {
      severity: 'error',
      code: 'DIAGNOSTIC_LIMIT_REACHED',
      path: [],
      message: 'Too many validation errors; further diagnostics were suppressed.',
    },
  ];
}
