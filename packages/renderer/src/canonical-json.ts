import type { ScreenJsonValue } from '@base-screen/contracts';

/**
 * Deterministic canonical JSON serialization for parsed Screen JSON values.
 *
 * Object keys are emitted in ascending lexicographic order regardless of the
 * insertion order the caller used, so two semantically equal parameter objects
 * always produce identical strings. String escaping follows ECMAScript
 * `JSON.stringify` semantics (quote, backslash, control escapes, `\uXXXX`
 * below 0x20); lone surrogates cannot reach this helper because every value
 * that participates in a resource key has already passed through
 * `parseScreenJsonValue`, which rejects unpaired UTF-16 surrogates, non-finite
 * numbers, and non-plain objects.
 */
export function canonicalJsonString(value: ScreenJsonValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonString(item)).join(',')}]`;
  }
  const record = value as Readonly<Record<string, ScreenJsonValue>>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonString(record[key]!)}`)
    .join(',')}}`;
}
