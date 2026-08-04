import { DiagnosticCollector } from '../diagnostics/collector.js';
import type { ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenJsonValue } from '../types/json.js';
import { cloneJsonValue } from './clone.js';
import { MAX_JSON_VALUE_BYTES } from './limits.js';
import { preflightJsonValue } from './preflight.js';

export interface ScreenJsonParseOptions {
  readonly maxBytes?: number;
}

export function parseScreenJsonValue(
  input: unknown,
  options: ScreenJsonParseOptions = {},
): ScreenParseResult<ScreenJsonValue> {
  const maxBytes = options.maxBytes ?? MAX_JSON_VALUE_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_JSON_VALUE_BYTES) {
    throw new RangeError(`maxBytes must be an integer from 1 through ${MAX_JSON_VALUE_BYTES}.`);
  }
  const collector = new DiagnosticCollector();
  if (
    !preflightJsonValue(input, { maxBytes, limitCode: 'JSON_LIMIT_EXCEEDED' }, collector, 'root')
  ) {
    return { ok: false, diagnostics: collector.done() };
  }
  return { ok: true, value: cloneJsonValue(input as ScreenJsonValue), diagnostics: [] };
}
