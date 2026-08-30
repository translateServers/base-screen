import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import { sortDiagnostics } from '../internal/diagnostics.js';
import { parseCandidateDocument } from '../internal/document.js';
import type { ScreenCommandResult } from './types.js';

export function finalizeScreenCommand(
  original: ScreenDocument,
  candidate: unknown,
  changedComponentIds: readonly string[],
): ScreenCommandResult {
  // candidate 由 original 经引用共享派生：以 original 为 base，未变更部分
  // 跳过克隆与结构校验，仅完整校验新增/变更的值。
  const parsed = parseCandidateDocument(candidate, original);
  if (!parsed.ok) {
    return screenCommandFailure(original, parsed.diagnostics);
  }
  return screenCommandSuccess(parsed.document, changedComponentIds);
}

export function screenCommandSuccess(
  document: ScreenDocument,
  changedComponentIds: readonly string[],
): ScreenCommandResult {
  return { ok: true, document, changedComponentIds, diagnostics: [] };
}

export function screenCommandFailure(
  document: ScreenDocument,
  diagnostics: readonly ScreenDiagnostic[] | ScreenDiagnostic,
): ScreenCommandResult {
  return {
    ok: false,
    document,
    diagnostics: sortDiagnostics(Array.isArray(diagnostics) ? diagnostics : [diagnostics]),
  };
}

export function invalidScreenCommand(
  message: string,
  path: readonly (string | number)[],
): readonly ScreenDiagnostic[] {
  return [screenCommandDiagnostic('CORE_COMMAND_INVALID', path, message)];
}

export function screenCommandDiagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}
