import { DiagnosticCollector } from '../diagnostics/collector.js';
import { serializeCanonicalJson } from '../json/canonical.js';
import type { ScreenDiagnostic } from '../types/diagnostics.js';
import type { ScreenDocument } from '../types/document.js';
import type { ScreenJsonValue } from '../types/json.js';
import { validateDocument } from './validate.js';

export class ScreenSerializationError extends Error {
  override readonly name: 'ScreenSerializationError' = 'ScreenSerializationError';
  readonly diagnostics: readonly ScreenDiagnostic[];

  constructor(diagnostics: readonly ScreenDiagnostic[]) {
    super('Screen document failed canonical validation.');
    this.diagnostics = diagnostics;
  }
}

export function serializeScreenDocument(document: ScreenDocument): string {
  const collector = new DiagnosticCollector();
  const validated = validateDocument(document, collector);
  if (validated === undefined) {
    throw new ScreenSerializationError(collector.done());
  }
  return serializeCanonicalJson(validated as unknown as ScreenJsonValue);
}
