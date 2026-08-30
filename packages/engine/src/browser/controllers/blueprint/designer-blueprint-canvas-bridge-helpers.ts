import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import type { DesignerBlueprintConnectionFailureReason } from '../../../common/operations/blueprint/designer-blueprint-connection.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function diagnostic(code: ScreenDiagnostic['code'], message: string): ScreenDiagnostic {
  return { severity: 'error', code, path: [], message };
}

export function failure<T>(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(code, message)] };
}

export function designerBlueprintConnectionFailureMessage(
  reason: DesignerBlueprintConnectionFailureReason,
): string {
  if (reason === 'duplicate') return DESIGNER_UI_TEXT.blueprint.duplicateConnection;
  if (reason === 'source-unconnected') return DESIGNER_UI_TEXT.blueprint.sourceNodeUnconnected;
  if (reason === 'unconfigured') return DESIGNER_UI_TEXT.blueprint.nodeNeedsConfiguration;
  return DESIGNER_UI_TEXT.blueprint.invalidConnection;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
