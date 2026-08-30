import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';

export function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

export function invalidDataset(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [diagnostic('HOST_DATASET_INVALID', path, message)] };
}

export function invalidDescriptor(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [diagnostic('HOST_DATASET_DESCRIPTOR_INVALID', path, message)] };
}

export function mapDatasetJsonDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: diagnostics.map((item) => ({
      ...item,
      code: item.code === 'JSON_LIMIT_EXCEEDED' ? 'HOST_DATASET_INVALID' : 'HOST_DATASET_INVALID',
    })),
  };
}

export function mapDescriptorJsonDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: diagnostics.map((item) => ({
      ...item,
      code: 'HOST_DATASET_DESCRIPTOR_INVALID' as const,
    })),
  };
}

export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const a = left.path.join('/');
    const b = right.path.join('/');
    return a < b ? -1 : a > b ? 1 : left.code < right.code ? -1 : 1;
  });
}
