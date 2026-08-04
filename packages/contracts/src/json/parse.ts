import { DiagnosticCollector } from '../diagnostics/collector.js';
import type { ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenJsonValue } from '../types/json.js';
import { cloneJsonValue } from './clone.js';
import {
  MAX_ARRAY_ITEMS,
  MAX_JSON_DEPTH,
  MAX_JSON_VALUE_BYTES,
  MAX_OBJECT_KEYS,
  MAX_STRING_BYTES,
} from './limits.js';
import { preflightJsonValue } from './preflight.js';

export interface ScreenJsonParseOptions {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxStringBytes?: number;
  readonly maxObjectKeys?: number;
  readonly maxArrayItems?: number;
}

export function parseScreenJsonValue(
  input: unknown,
  options: ScreenJsonParseOptions = {},
): ScreenParseResult<ScreenJsonValue> {
  const maxBytes = options.maxBytes ?? MAX_JSON_VALUE_BYTES;
  assertLimit('maxBytes', maxBytes, MAX_JSON_VALUE_BYTES);
  const maxDepth = options.maxDepth ?? MAX_JSON_DEPTH;
  assertLimit('maxDepth', maxDepth, MAX_JSON_DEPTH);
  const maxStringBytes = options.maxStringBytes ?? MAX_STRING_BYTES;
  assertLimit('maxStringBytes', maxStringBytes, MAX_STRING_BYTES);
  const maxObjectKeys = options.maxObjectKeys ?? MAX_OBJECT_KEYS;
  assertLimit('maxObjectKeys', maxObjectKeys, MAX_OBJECT_KEYS);
  const maxArrayItems = options.maxArrayItems ?? MAX_ARRAY_ITEMS;
  assertLimit('maxArrayItems', maxArrayItems, MAX_ARRAY_ITEMS);
  const collector = new DiagnosticCollector();
  if (
    !preflightJsonValue(
      input,
      {
        maxBytes,
        maxDepth,
        maxStringBytes,
        maxObjectKeys,
        maxArrayItems,
        limitCode: 'JSON_LIMIT_EXCEEDED',
      },
      collector,
      'root',
    )
  ) {
    return { ok: false, diagnostics: collector.done() };
  }
  return { ok: true, value: cloneJsonValue(input as ScreenJsonValue), diagnostics: [] };
}

function assertLimit(name: string, value: number, maximum: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 1 through ${maximum}.`);
  }
}
