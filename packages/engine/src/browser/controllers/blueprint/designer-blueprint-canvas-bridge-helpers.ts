import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import type { DesignerBlueprintConnectionFailureReason } from '../../../common/operations/blueprint/designer-blueprint-connection.js';
import type { BaseScreenBlueprintCanvasCommandResult } from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { cloneAndFreeze } from '../../../common/tools/designer-json-snapshot.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export { cloneAndFreeze };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function diagnostic(code: ScreenDiagnostic['code'], message: string): ScreenDiagnostic {
  return { severity: 'error', code, path: [], message };
}

export function failure<T>(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(code, message)] };
}

export function rejectedBlueprintCanvasCommand(
  input: unknown,
  diagnostics: readonly ScreenDiagnostic[],
): BaseScreenBlueprintCanvasCommandResult {
  const commandId =
    isRecord(input) && typeof input.commandId === 'string'
      ? input.commandId.slice(0, 128)
      : 'invalid-command';
  return cloneAndFreeze({ commandId, status: 'rejected', diagnostics });
}

export function blueprintCapabilityReader(
  readIndex: () => BaseScreenRuntimeContributionIndex | undefined,
): { readonly hasBlueprintCapability: (id: string) => boolean } {
  return {
    hasBlueprintCapability: (id) => {
      try {
        return readIndex()?.hasBlueprintCapability(id) === true;
      } catch {
        return false;
      }
    },
  };
}

export function designerBlueprintConnectionFailureMessage(
  reason: DesignerBlueprintConnectionFailureReason,
): string {
  if (reason === 'duplicate') return DESIGNER_UI_TEXT.blueprint.duplicateConnection;
  if (reason === 'source-unconnected') return DESIGNER_UI_TEXT.blueprint.sourceNodeUnconnected;
  if (reason === 'unconfigured') return DESIGNER_UI_TEXT.blueprint.nodeNeedsConfiguration;
  return DESIGNER_UI_TEXT.blueprint.invalidConnection;
}
