import { parseScreenDocument, type ScreenDocument } from '@base-screen/contracts';
import { ScreenCoreInvariantError } from '../validation/invariant-error.js';
import { validateScreenDocumentSemantics } from '../validation/validate-semantics.js';

export function assertCoreValidDocument(document: ScreenDocument): void {
  const diagnostics = validateScreenDocumentSemantics(document);
  if (diagnostics.length > 0) {
    throw new ScreenCoreInvariantError(diagnostics);
  }
}

export function parseCandidateDocument(candidate: unknown):
  | { readonly ok: true; readonly document: ScreenDocument }
  | {
      readonly ok: false;
      readonly diagnostics: ReturnType<typeof parseScreenDocument>['diagnostics'];
    } {
  const parsed = parseScreenDocument(candidate);
  if (!parsed.ok) {
    return { ok: false, diagnostics: parsed.diagnostics };
  }
  const semanticDiagnostics = validateScreenDocumentSemantics(parsed.value);
  if (semanticDiagnostics.length > 0) {
    return { ok: false, diagnostics: semanticDiagnostics };
  }
  return { ok: true, document: parsed.value };
}
