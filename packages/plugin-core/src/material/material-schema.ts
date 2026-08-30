import type { ScreenJsonObject, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenMaterialObjectSchema, BaseScreenMaterialPropSchema } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import { MAX_SCHEMA_DEPTH } from './material-validation-constants.js';
import {
  failure,
  isRecord,
  isScalar,
  parsePluginJson,
  safePatternTest,
  validateKnownObject,
  validateOptionalIntegerRange,
  validateOptionalNumberRange,
} from './material-validation-utils.js';

export function validateBaseScreenMaterialProps(
  input: unknown,
  schema: BaseScreenMaterialObjectSchema,
): ScreenParseResult<ScreenJsonObject> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, 2 * 1024 * 1024);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value) || !matchesSchema(parsed.value, schema)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [],
      'Material props do not satisfy the declared schema.',
    );
  }
  return { ok: true, value: parsed.value, diagnostics: [] };
}

export function validateBaseScreenMaterialStyle(
  input: unknown,
  schema: BaseScreenMaterialObjectSchema,
): ScreenParseResult<ScreenJsonObject> {
  return validateBaseScreenMaterialProps(input, schema);
}

export function validatePropsSchema(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
  depth: number,
): BaseScreenMaterialPropSchema | undefined {
  if (depth > MAX_SCHEMA_DEPTH) {
    collector.add('PLUGIN_CORE_LIMIT_EXCEEDED', path, 'Props schema nesting exceeds 16 levels.');
    return undefined;
  }
  if (!isRecord(value) || typeof value.kind !== 'string') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Props schema node must have a kind.',
    );
    return undefined;
  }
  const kind = value.kind;
  const allowed = allowedSchemaFields(kind);
  if (allowed === undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'kind'],
      'Props schema kind is unsupported.',
    );
    return undefined;
  }
  validateKnownObject(value, allowed, path, collector);
  switch (kind) {
    case 'string':
      validateOptionalIntegerRange(value, 'minLength', 'maxLength', path, collector);
      if (value.pattern !== undefined && typeof value.pattern !== 'string') {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'pattern'],
          'Pattern must be a string.',
        );
      }
      return value as unknown as BaseScreenMaterialPropSchema;
    case 'number':
      validateOptionalNumberRange(value, 'minimum', 'maximum', path, collector);
      return value as unknown as BaseScreenMaterialPropSchema;
    case 'boolean':
      return value as unknown as BaseScreenMaterialPropSchema;
    case 'enum':
      if (
        !Array.isArray(value.values) ||
        value.values.length === 0 ||
        value.values.some((item) => !isScalar(item))
      ) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'values'],
          'Enum values must be non-empty scalars.',
        );
      }
      return value as unknown as BaseScreenMaterialPropSchema;
    case 'object':
      validateObjectSchema(value, path, collector, depth);
      return value as unknown as BaseScreenMaterialObjectSchema;
    case 'array':
      validateOptionalIntegerRange(value, 'minItems', 'maxItems', path, collector);
      validatePropsSchema(value.items, [...path, 'items'], collector, depth + 1);
      return value as unknown as BaseScreenMaterialPropSchema;
  }
}

function validateObjectSchema(
  value: Record<string, ScreenJsonValue>,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
  depth: number,
): void {
  const properties = isRecord(value.properties) ? value.properties : undefined;
  if (properties === undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'properties'],
      'Properties must be an object.',
    );
  } else {
    const keys = Object.keys(properties);
    if (keys.length > 512) {
      collector.add(
        'PLUGIN_CORE_LIMIT_EXCEEDED',
        [...path, 'properties'],
        'Props schema has too many properties.',
      );
    }
    for (const key of keys) {
      validatePropsSchema(properties[key], [...path, 'properties', key], collector, depth + 1);
    }
  }
  if (!Array.isArray(value.required) || value.required.some((key) => typeof key !== 'string')) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'required'],
      'Required keys must be an array.',
    );
  } else if (
    properties === undefined ||
    new Set(value.required).size !== value.required.length ||
    value.required.some((key) => properties[key] === undefined)
  ) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'required'],
      'Required keys must be unique declared properties.',
    );
  }
}

export function matchesSchema(
  value: ScreenJsonValue,
  schema: BaseScreenMaterialPropSchema,
): boolean {
  switch (schema.kind) {
    case 'string':
      return (
        typeof value === 'string' &&
        (schema.minLength === undefined || [...value].length >= schema.minLength) &&
        (schema.maxLength === undefined || [...value].length <= schema.maxLength) &&
        (schema.pattern === undefined || safePatternTest(schema.pattern, value))
      );
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (schema.minimum === undefined || value >= schema.minimum) &&
        (schema.maximum === undefined || value <= schema.maximum)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
      return schema.values.some((candidate) => Object.is(candidate, value));
    case 'array':
      return (
        Array.isArray(value) &&
        (schema.minItems === undefined || value.length >= schema.minItems) &&
        (schema.maxItems === undefined || value.length <= schema.maxItems) &&
        value.every((item) => matchesSchema(item, schema.items))
      );
    case 'object':
      return (
        isRecord(value) &&
        Object.keys(value).every(
          (key) =>
            schema.properties[key] !== undefined &&
            matchesSchema(value[key]!, schema.properties[key]),
        ) &&
        schema.required.every((key) => value[key] !== undefined)
      );
  }
}

function allowedSchemaFields(kind: string): ReadonlySet<string> | undefined {
  switch (kind) {
    case 'string':
      return new Set(['kind', 'minLength', 'maxLength', 'pattern']);
    case 'number':
      return new Set(['kind', 'minimum', 'maximum']);
    case 'boolean':
      return new Set(['kind']);
    case 'enum':
      return new Set(['kind', 'values']);
    case 'object':
      return new Set(['kind', 'properties', 'required']);
    case 'array':
      return new Set(['kind', 'items', 'minItems', 'maxItems']);
    default:
      return undefined;
  }
}
