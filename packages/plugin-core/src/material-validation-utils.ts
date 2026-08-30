import {
  isScreenMaterialType,
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { PluginDiagnosticCollector } from './diagnostics.js';
import { RESERVED_TAG_NAMES } from './material-validation-constants.js';

export function validateStringList(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  maxItems: number,
  maxLength: number,
  collector: PluginDiagnosticCollector,
  identifier = false,
): void {
  if (!Array.isArray(value)) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Expected an array of strings.');
    return;
  }
  if (value.length > maxItems) {
    collector.add('PLUGIN_CORE_LIMIT_EXCEEDED', path, 'Array exceeds its maximum item count.');
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    const valid = identifier ? isIdentifier(item) : isDisplayString(item, maxLength);
    if (!valid) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, index],
        'Array item is invalid.',
      );
    } else if (seen.has(item)) {
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
        [...path, index],
        'Array item is duplicated.',
      );
    } else {
      seen.add(item);
    }
  }
}

export function validateOptionalIntegerRange(
  value: Record<string, ScreenJsonValue>,
  minimumField: string,
  maximumField: string,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  const minimum = value[minimumField];
  const maximum = value[maximumField];
  if (minimum !== undefined && !isNonNegativeInteger(minimum)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, minimumField],
      'Minimum must be a non-negative integer.',
    );
  }
  if (maximum !== undefined && !isNonNegativeInteger(maximum)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, maximumField],
      'Maximum must be a non-negative integer.',
    );
  }
  if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Minimum cannot exceed maximum.');
  }
}

export function validateOptionalNumberRange(
  value: Record<string, ScreenJsonValue>,
  minimumField: string,
  maximumField: string,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  const minimum = value[minimumField];
  const maximum = value[maximumField];
  if (minimum !== undefined && !isFiniteNumber(minimum)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, minimumField],
      'Minimum must be finite.',
    );
  }
  if (maximum !== undefined && !isFiniteNumber(maximum)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, maximumField],
      'Maximum must be finite.',
    );
  }
  if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Minimum cannot exceed maximum.');
  }
}

export function validateExactObject(
  value: Record<string, ScreenJsonValue>,
  fields: ReadonlySet<string>,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD',
        [...path, key],
        'Manifest contains an unknown field.',
      );
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, field],
        'Manifest field is required.',
      );
    }
  }
}

export function validateKnownObject(
  value: Record<string, ScreenJsonValue>,
  fields: ReadonlySet<string>,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD',
        [...path, key],
        'Manifest contains an unknown field.',
      );
    }
  }
}

export function parsePluginJson<T>(input: unknown, maxBytes: number): ScreenParseResult<T> {
  const parsed = parseScreenJsonValue(input, { maxBytes });
  if (parsed.ok) {
    return parsed as ScreenParseResult<T>;
  }
  return {
    ok: false,
    diagnostics: parsed.diagnostics.map((diagnostic) =>
      diagnostic.code === 'JSON_LIMIT_EXCEEDED'
        ? { ...diagnostic, code: 'PLUGIN_CORE_LIMIT_EXCEEDED' as const }
        : diagnostic,
    ),
  };
}

export function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

export function isRecord(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isValidTagName(tagName: unknown, type: unknown): boolean {
  if (!isScreenMaterialType(type)) {
    return false;
  }
  if (
    typeof tagName !== 'string' ||
    tagName.length < 2 ||
    tagName.length > 63 ||
    !/^[a-z][a-z0-9._-]*-[a-z0-9._-]+$/.test(tagName) ||
    tagName.startsWith('xml') ||
    RESERVED_TAG_NAMES.has(tagName)
  ) {
    return false;
  }
  return true;
}

export function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

export function isDisplayString(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    [...value].length > 0 &&
    [...value].length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isScalar(value: ScreenJsonValue): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function safePatternTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}
