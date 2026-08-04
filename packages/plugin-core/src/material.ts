import {
  isScreenMaterialType,
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  BASE_SCREEN_MATERIAL_API_VERSION,
  type BaseScreenMaterialEventDetail,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenMaterialPropSchema,
} from './contracts.js';
import { PluginDiagnosticCollector } from './diagnostics.js';

const MAX_MATERIAL_MANIFEST_BYTES = 256 * 1024;
const MAX_SCHEMA_DEPTH = 16;
const MAX_KEYWORDS = 64;
const MAX_EVENTS = 64;
const MAX_PROPERTY_PANEL_FIELDS = 512;
const RESERVED_TAG_NAMES = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

const MANIFEST_FIELDS = new Set([
  'apiVersion',
  'type',
  'implementationVersion',
  'tagName',
  'name',
  'category',
  'keywords',
  'defaultSize',
  'defaultProps',
  'defaultStyle',
  'propsSchema',
  'propertyPanel',
  'events',
  'dataCapabilities',
  'designCapabilities',
]);

export function validateBaseScreenMaterialIdentity(
  type: unknown,
  tagName: unknown,
): ScreenParseResult<null> {
  const collector = new PluginDiagnosticCollector();
  if (!isScreenMaterialType(type)) {
    collector.add(
      'PLUGIN_CORE_IDENTITY_INVALID',
      ['type'],
      'Material type is not a canonical identity.',
    );
  }
  if (!isValidTagName(tagName, type)) {
    collector.add(
      'PLUGIN_CORE_TAG_NAME_INVALID',
      ['tagName'],
      'Tag name is not valid for the material type.',
    );
  }
  return collector.result(null);
}

export function parseBaseScreenMaterialManifest(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialManifest> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, MAX_MATERIAL_MANIFEST_BYTES);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value)) {
    return failure('PLUGIN_CORE_MANIFEST_NOT_OBJECT', [], 'Material manifest must be an object.');
  }

  const manifest = parsed.value;
  const collector = new PluginDiagnosticCollector();
  validateExactObject(manifest, MANIFEST_FIELDS, [], collector);
  validateMaterialFields(manifest, collector);
  const parsedPropsSchema = validatePropsSchema(
    manifest.propsSchema,
    ['propsSchema'],
    collector,
    1,
  );
  const propsSchema = parsedPropsSchema?.kind === 'object' ? parsedPropsSchema : undefined;
  if (parsedPropsSchema !== undefined && propsSchema === undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['propsSchema'],
      'Material props schema must be an object schema.',
    );
  }
  validateDefaultValues(manifest, propsSchema, collector);
  validatePropertyPanel(manifest.propertyPanel, propsSchema, collector);
  if (collector.hasErrors) {
    return collector.failure();
  }
  return collector.result(manifest as unknown as BaseScreenMaterialManifest);
}

export function parseBaseScreenMaterialEventDetail(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialEventDetail> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, 64 * 1024);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value)) {
    return failure('PLUGIN_CORE_EVENT_INVALID', [], 'Material event detail must be an object.');
  }
  const detail = parsed.value;
  const collector = new PluginDiagnosticCollector();
  validateExactObject(detail, new Set(['name', 'payload']), [], collector);
  if (!isIdentifier(detail.name)) {
    collector.add(
      'PLUGIN_CORE_EVENT_INVALID',
      ['name'],
      'Material event name must be an ASCII identifier.',
    );
  }
  if (!Object.hasOwn(detail, 'payload')) {
    collector.add(
      'PLUGIN_CORE_EVENT_PAYLOAD_INVALID',
      ['payload'],
      'Material event payload is required.',
    );
  }
  if (collector.hasErrors) {
    return collector.failure();
  }
  return collector.result(detail as unknown as BaseScreenMaterialEventDetail);
}

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

function validateMaterialFields(
  manifest: Record<string, ScreenJsonValue>,
  collector: PluginDiagnosticCollector,
): void {
  if (manifest.apiVersion !== BASE_SCREEN_MATERIAL_API_VERSION) {
    collector.add(
      'PLUGIN_CORE_API_VERSION_UNSUPPORTED',
      ['apiVersion'],
      'Material API version is unsupported.',
    );
  }
  const identity = validateBaseScreenMaterialIdentity(manifest.type, manifest.tagName);
  if (!identity.ok) {
    for (const diagnostic of identity.diagnostics) {
      collector.add(diagnostic.code, diagnostic.path, diagnostic.message);
    }
  }
  if (!isStrictSemver(manifest.implementationVersion)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['implementationVersion'],
      'Implementation version must be SemVer core.',
    );
  }
  for (const field of ['name', 'category'] as const) {
    if (!isDisplayString(manifest[field], 256)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [field],
        `${field} must be a display string.`,
      );
    }
  }
  validateStringList(manifest.keywords, ['keywords'], MAX_KEYWORDS, 64, collector);
  validateDefaultSize(manifest.defaultSize, collector);
  if (!isRecord(manifest.defaultProps)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultProps'],
      'Default props must be an object.',
    );
  }
  if (!isRecord(manifest.defaultStyle)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultStyle'],
      'Default style must be an object.',
    );
  }
  validateStringList(manifest.events, ['events'], MAX_EVENTS, 128, collector, true);
  if (!Array.isArray(manifest.dataCapabilities)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['dataCapabilities'],
      'Data capabilities must be an array.',
    );
  } else if (
    manifest.dataCapabilities.some(
      (capability) => capability !== 'static' && capability !== 'host-resource',
    ) ||
    new Set(manifest.dataCapabilities).size !== manifest.dataCapabilities.length
  ) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['dataCapabilities'],
      'Only unique static data capability declarations are supported.',
    );
  }
  validateDesignCapabilities(manifest.designCapabilities, collector);
}

function validateDefaultSize(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!isRecord(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultSize'],
      'Default size must be an object.',
    );
    return;
  }
  validateExactObject(value, new Set(['width', 'height']), ['defaultSize'], collector);
  for (const field of ['width', 'height'] as const) {
    const number = value[field];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number <= 0 ||
      number > 1_000_000
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['defaultSize', field],
        'Default size dimensions must be finite positive numbers.',
      );
    }
  }
}

function validateDesignCapabilities(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!isRecord(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['designCapabilities'],
      'Design capabilities must be an object.',
    );
    return;
  }
  validateExactObject(
    value,
    new Set(['resize', 'rotate', 'children']),
    ['designCapabilities'],
    collector,
  );
  for (const field of ['resize', 'rotate', 'children']) {
    if (typeof value[field] !== 'boolean') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['designCapabilities', field],
        'Design capability flags must be boolean.',
      );
    }
  }
}

function validateDefaultValues(
  manifest: Record<string, ScreenJsonValue>,
  schema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (schema === undefined || !isRecord(manifest.defaultProps)) {
    return;
  }
  if (!matchesSchema(manifest.defaultProps, schema)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultProps'],
      'Default props do not satisfy the declared props schema.',
    );
  }
}

function validatePropertyPanel(
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!Array.isArray(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['propertyPanel'],
      'Property panel must be an array.',
    );
    return;
  }
  if (value.length > MAX_PROPERTY_PANEL_FIELDS) {
    collector.add(
      'PLUGIN_CORE_LIMIT_EXCEEDED',
      ['propertyPanel'],
      'Property panel has too many fields.',
    );
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const field = value[index];
    if (!isRecord(field)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['propertyPanel', index],
        'Panel field must be an object.',
      );
      continue;
    }
    validateExactObject(
      field,
      new Set(['prop', 'label', 'control']),
      ['propertyPanel', index],
      collector,
    );
    if (typeof field.prop !== 'string' || schema?.properties[field.prop] === undefined) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['propertyPanel', index, 'prop'],
        'Panel field must reference a top-level prop.',
      );
    } else if (seen.has(field.prop)) {
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
        ['propertyPanel', index, 'prop'],
        'Property panel field is duplicated.',
      );
    } else {
      seen.add(field.prop);
    }
    if (!isDisplayString(field.label, 256)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['propertyPanel', index, 'label'],
        'Panel label must be a display string.',
      );
    }
    if (!['text', 'number', 'boolean', 'select', 'json'].includes(field.control as string)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['propertyPanel', index, 'control'],
        'Panel control is unsupported.',
      );
    }
  }
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

function matchesSchema(value: ScreenJsonValue, schema: BaseScreenMaterialPropSchema): boolean {
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

function validateStringList(
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

function validateOptionalIntegerRange(
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

function validateOptionalNumberRange(
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

function validateExactObject(
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

function validateKnownObject(
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

function parsePluginJson<T>(input: unknown, maxBytes: number): ScreenParseResult<T> {
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

function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

function isRecord(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStrictSemver(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(value)
  );
}

function isValidTagName(tagName: unknown, type: unknown): boolean {
  if (!isScreenMaterialType(type)) {
    return false;
  }
  if (
    typeof tagName !== 'string' ||
    tagName.length < 2 ||
    tagName.length > 63 ||
    !/^[a-z][a-z0-9._-]*-v[1-9][0-9]*$/.test(tagName) ||
    tagName.startsWith('xml') ||
    RESERVED_TAG_NAMES.has(tagName)
  ) {
    return false;
  }
  return tagName.endsWith(`-v${type.slice(type.lastIndexOf('/v') + 2)}`);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isDisplayString(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    [...value].length > 0 &&
    [...value].length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isScalar(value: ScreenJsonValue): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safePatternTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}
