import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenDesignerSetWorkbenchModeOptions } from './designer-blueprint-protocol.js';

export function parseDesignerWorkbenchModeRequest(
  mode: unknown,
  options: unknown,
): ScreenParseResult<BaseScreenDesignerSetWorkbenchModeOptions> {
  if (mode !== 'canvas' && mode !== 'blueprint') return failure('Workbench mode is invalid.');
  if (!isRecord(options) || Object.keys(options).some((key) => key !== 'focus')) {
    return failure('Workbench mode options are invalid.');
  }
  if (options.focus === undefined) return { ok: true, value: {}, diagnostics: [] };
  if (
    !isRecord(options.focus) ||
    Object.keys(options.focus).some((key) => key !== 'kind' && key !== 'id') ||
    (options.focus.kind !== 'component' &&
      options.focus.kind !== 'rule' &&
      options.focus.kind !== 'action') ||
    typeof options.focus.id !== 'string' ||
    options.focus.id.length === 0 ||
    options.focus.id.length > 256
  ) {
    return failure('Workbench focus is invalid.');
  }
  return {
    ok: true,
    value: { focus: { kind: options.focus.kind, id: options.focus.id } },
    diagnostics: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure<T>(message: string): ScreenParseResult<T> {
  const diagnostic: ScreenDiagnostic = {
    severity: 'error',
    code: 'AUTHORING_REQUEST_INVALID',
    path: [],
    message,
  };
  return { ok: false, diagnostics: [diagnostic] };
}
