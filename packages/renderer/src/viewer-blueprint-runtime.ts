import type { ScreenDiagnostic, ScreenDocument, ScreenJsonObject } from '@base-screen/contracts';
import type { ScreenBlueprintDispatchResult } from '@base-screen/core';
import { canonicalJsonString } from './canonical-json.js';
import type { BaseScreenRenderer } from './renderer.js';

export function applyBlueprintDispatchToRenderer(
  renderer: BaseScreenRenderer,
  document: ScreenDocument,
  previousVariables: ScreenJsonObject,
  result: ScreenBlueprintDispatchResult,
): readonly ScreenDiagnostic[] {
  const diagnostics: ScreenDiagnostic[] = [];
  const variablesChanged =
    canonicalJsonString(previousVariables) !== canonicalJsonString(result.variables);
  // Visibility-only and host-event-only rules must not reconcile every material.
  // Chart materials can still be in their browser event frame when this runs.
  if (variablesChanged) {
    const variables = renderer.setVariables(result.variables);
    if (variables.ok) {
      const rendered = renderer.render(document, { trigger: 'variable' });
      diagnostics.push(...rendered.diagnostics);
    } else {
      diagnostics.push(...variables.diagnostics);
    }
  }
  const visibility = renderer.applyBlueprintVisibilityEffects(result.visibilityEffects);
  if (!visibility.ok) diagnostics.push(...visibility.diagnostics);
  return diagnostics;
}
