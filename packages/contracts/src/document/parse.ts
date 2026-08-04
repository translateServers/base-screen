import { DiagnosticCollector } from '../diagnostics/collector.js';
import type { ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenDocument } from '../types/document.js';
import type { ScreenProjectEnvelope } from '../types/envelope.js';
import { validateEnvelope } from './envelope.js';
import { validateDocument } from './validate.js';

export function parseScreenDocument(input: unknown): ScreenParseResult<ScreenDocument> {
  const collector = new DiagnosticCollector();
  const document = validateDocument(input, collector);
  if (document === undefined) {
    return { ok: false, diagnostics: collector.done() };
  }
  return { ok: true, value: document, diagnostics: [] };
}

export function parseScreenProjectEnvelope(
  input: unknown,
): ScreenParseResult<ScreenProjectEnvelope> {
  const collector = new DiagnosticCollector();
  const envelope = validateEnvelope(input, collector);
  if (envelope === undefined) {
    return { ok: false, diagnostics: collector.done() };
  }
  return { ok: true, value: envelope, diagnostics: [] };
}
