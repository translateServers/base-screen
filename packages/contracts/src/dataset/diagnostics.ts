import { sortScreenDiagnostics } from '../diagnostics/collector.js';
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

/** 诊断规范序由 collector 独占定义，本模块不再自定义排序。 */
export function sortDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return sortScreenDiagnostics(diagnostics);
}
