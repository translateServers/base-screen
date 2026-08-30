import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import type { RenderCandidate } from './renderer-types.js';

export function prefixDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: readonly (string | number)[],
): readonly ScreenDiagnostic[] {
  return diagnostics.map((item) => ({ ...item, path: [...prefix, ...item.path] }));
}

export function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

export function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(code, path, message)] };
}

export function renderFailure(candidate: RenderCandidate, message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'PLUGIN_CORE_RENDER_FAILED',
    path: ['components', candidate.component.id],
    message,
  };
}

export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const leftPath = left.path.join('/');
    const rightPath = right.path.join('/');
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : left.code < right.code ? -1 : 1;
  });
}
