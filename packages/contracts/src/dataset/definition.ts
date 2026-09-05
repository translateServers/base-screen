import { z } from 'zod';
import { parseScreenJsonValue } from '../json/parse.js';
import type {
  ScreenDatasetDefinition,
  ScreenDatasetEntries,
  ScreenDatasetGroup,
  ScreenDatasetParameterDefinition,
} from '../types/dataset-port.js';
import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenJsonObject, ScreenJsonValue } from '../types/json.js';
import { parseFields } from './structure.js';

const text = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\u0000-\u001f\u007f-\u009f]+$/u);
const parameterName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/);
const scalar = z.union([z.string().max(4096), z.number().finite(), z.boolean()]);
const entry = z.strictObject({
  datasetId: text,
  name: text,
  description: text.nullable(),
  groupId: text.optional(),
});
const parameter = z.strictObject({
  name: parameterName,
  label: text,
  valueType: z.enum(['string', 'number', 'boolean', 'date']),
  required: z.boolean(),
  defaultValue: scalar.optional(),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
  maxLength: z.number().int().min(1).max(4096).optional(),
  allowedValues: z.array(scalar).min(1).max(128).optional(),
});
const definition = entry.extend({
  fields: z.array(z.unknown()).max(256),
  parameters: z.array(parameter).max(64),
});

export function parseScreenDatasetDefinition(
  input: unknown,
): ScreenParseResult<ScreenDatasetDefinition> {
  const json = parseScreenJsonValue(input, { maxBytes: 256 * 1024 });
  if (!json.ok) return invalid();
  const parsed = definition.safeParse(json.value);
  if (!parsed.success) return invalid();
  const diagnostics: ScreenDiagnostic[] = [];
  const fields = parseFields(
    parsed.data.fields as ScreenJsonValue,
    ['fields'],
    diagnostics,
    'HOST_DATASET_DESCRIPTOR_INVALID',
  );
  if (fields === undefined || diagnostics.length > 0 || !validDefinitions(parsed.data.parameters)) {
    return invalid();
  }
  return {
    ok: true,
    value: { ...parsed.data, fields } as ScreenDatasetDefinition,
    diagnostics: [],
  };
}

export function parseScreenDatasetEntries(input: unknown): ScreenParseResult<ScreenDatasetEntries> {
  const json = parseScreenJsonValue(input, { maxBytes: 256 * 1024 });
  if (!json.ok) return invalid();
  const result = z
    .strictObject({
      items: z.array(entry).max(50),
      nextCursor: text.optional(),
    })
    .safeParse(json.value);
  if (
    !result.success ||
    new Set(result.data.items.map((item) => item.datasetId)).size !== result.data.items.length
  ) {
    return invalid();
  }
  return { ok: true, value: result.data as ScreenDatasetEntries, diagnostics: [] };
}

export function parseScreenDatasetGroups(
  input: unknown,
): ScreenParseResult<readonly ScreenDatasetGroup[]> {
  const json = parseScreenJsonValue(input, { maxBytes: 64 * 1024 });
  if (!json.ok) return invalid();
  const result = z
    .array(z.strictObject({ id: text, name: text }))
    .max(50)
    .safeParse(json.value);
  if (!result.success || new Set(result.data.map((item) => item.id)).size !== result.data.length)
    return invalid();
  return { ok: true, value: result.data, diagnostics: [] };
}

/** Validate defaults and constraints as well as supplied values; never coerce input. */
export function evaluateScreenDatasetParameters(
  definitions: readonly ScreenDatasetParameterDefinition[],
  input: unknown,
): ScreenParseResult<ScreenJsonObject> {
  const parsed = z.array(parameter).max(64).safeParse(definitions);
  const json = parseScreenJsonValue(input, { maxBytes: 256 * 1024 });
  if (
    !parsed.success ||
    !validDefinitions(parsed.data) ||
    !json.ok ||
    json.value === null ||
    typeof json.value !== 'object' ||
    Array.isArray(json.value)
  )
    return invalidParameters();
  const supplied = json.value as ScreenJsonObject;
  const names = new Set(parsed.data.map((item) => item.name));
  if (Object.keys(supplied).some((name) => !names.has(name))) return invalidParameters();
  const result: Record<string, ScreenJsonValue> = Object.create(null);
  for (const item of parsed.data) {
    const value = Object.hasOwn(supplied, item.name) ? supplied[item.name] : item.defaultValue;
    if (value === undefined) {
      if (item.required) return invalidParameters();
      continue;
    }
    if (!validValue(item, value)) return invalidParameters();
    result[item.name] = value;
  }
  return { ok: true, value: result, diagnostics: [] };
}

function validDefinitions(parameters: readonly z.infer<typeof parameter>[]): boolean {
  if (new Set(parameters.map((item) => item.name)).size !== parameters.length) return false;
  return parameters.every((item) => {
    if ((item.minimum !== undefined || item.maximum !== undefined) && item.valueType !== 'number')
      return false;
    if (item.minimum !== undefined && item.maximum !== undefined && item.minimum > item.maximum)
      return false;
    if (item.maxLength !== undefined && item.valueType !== 'string') return false;
    if (
      item.allowedValues !== undefined &&
      (new Set(item.allowedValues).size !== item.allowedValues.length ||
        item.allowedValues.some((value) => !validValue(item, value, false)))
    )
      return false;
    return item.defaultValue === undefined || validValue(item, item.defaultValue);
  });
}

function validValue(item: z.infer<typeof parameter>, value: unknown, checkAllowed = true): boolean {
  let valid = false;
  if (item.valueType === 'string')
    valid = typeof value === 'string' && value.length <= (item.maxLength ?? 4096);
  if (item.valueType === 'boolean') valid = typeof value === 'boolean';
  if (item.valueType === 'number')
    valid =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (item.minimum === undefined || value >= item.minimum) &&
      (item.maximum === undefined || value <= item.maximum);
  if (item.valueType === 'date') valid = typeof value === 'string' && validDate(value);
  return (
    valid &&
    (!checkAllowed ||
      item.allowedValues === undefined ||
      item.allowedValues.some((allowed) => allowed === value))
  );
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))
    return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const maxDay = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  return maxDay !== undefined && day >= 1 && day <= maxDay && Number.isFinite(Date.parse(value));
}

function invalid<T>(): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_DESCRIPTOR_INVALID',
        path: [],
        message: 'Dataset definition is invalid.',
      },
    ],
  };
}

function invalidParameters<T>(): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_PARAMETER_INVALID',
        path: [],
        message: 'Dataset parameters are invalid.',
      },
    ],
  };
}
