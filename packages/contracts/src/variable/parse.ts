import { isScreenVariableName } from '../document/schema.js';
import { parseScreenJsonValue } from '../json/parse.js';
import type {
  ScreenDatasetParameterDefinition,
  ScreenDatasetParameterValue,
} from '../types/dataset-port.js';
import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenJsonObject } from '../types/json.js';
import type {
  ScreenHostCatalogDescriptor,
  ScreenHostCatalogPage,
  ScreenHostCatalogSummary,
} from '../types/variable.js';

export const MAX_HOST_CATALOG_PAGE_ITEMS = 50;
export const MAX_HOST_CATALOG_BYTES = 256 * 1024;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const MAX_VARIABLE_ID_CODE_UNITS = 256;
const MAX_DESCRIPTION_CODE_POINTS = 4_096;
const MAX_CURSOR_CODE_UNITS = 4_096;
const MAX_PARAMETER_DEFINITIONS = 64;
const MAX_ALLOWED_VALUES = 256;
const VALUE_TYPES = new Set(['string', 'number', 'boolean', 'date']);

export function parseScreenHostCatalogDescriptor(
  input: unknown,
): ScreenParseResult<ScreenHostCatalogDescriptor> {
  const parsed = parseCatalogJson(input);
  if (!parsed.ok) return parsed;
  const diagnostics: ScreenDiagnostic[] = [];
  if (!isRecord(parsed.value)) {
    return invalidCatalog([], 'Host catalog descriptor must be an object.');
  }
  checkExact(
    parsed.value,
    new Set(['sourceId', 'name', 'description', 'parameters', 'readOnly', 'previewable']),
    [],
    diagnostics,
  );
  validateSummaryFields(parsed.value, [], diagnostics);
  if (typeof parsed.value.previewable !== 'boolean') {
    diagnostics.push(diagnostic(['previewable'], 'Host catalog previewable flag must be boolean.'));
  }
  if (parsed.value.readOnly !== undefined && typeof parsed.value.readOnly !== 'boolean') {
    diagnostics.push(diagnostic(['readOnly'], 'Host catalog readOnly flag must be boolean.'));
  }
  const parameters = parseParameters(parsed.value.parameters, diagnostics);
  if (diagnostics.length > 0) return invalidWith(diagnostics);
  const readOnly = parsed.value.readOnly;
  return {
    ok: true,
    value: {
      sourceId: parsed.value.sourceId as string,
      name: parsed.value.name as string,
      description: parsed.value.description as string | null,
      parameters,
      ...(readOnly === true ? { readOnly: true } : {}),
      previewable: parsed.value.previewable as boolean,
    },
    diagnostics: [],
  };
}

export function parseScreenHostCatalogPage(
  input: unknown,
): ScreenParseResult<ScreenHostCatalogPage> {
  const parsed = parseCatalogJson(input);
  if (!parsed.ok) return parsed;
  const diagnostics: ScreenDiagnostic[] = [];
  if (!isRecord(parsed.value)) {
    return invalidCatalog([], 'Host catalog page must be an object.');
  }
  checkExact(parsed.value, new Set(['items', 'nextCursor']), [], diagnostics);
  if (
    !Array.isArray(parsed.value.items) ||
    parsed.value.items.length > MAX_HOST_CATALOG_PAGE_ITEMS
  ) {
    diagnostics.push(diagnostic(['items'], 'Host catalog page items are invalid.'));
  }
  const items: ScreenHostCatalogSummary[] = [];
  const ids = new Set<string>();
  if (Array.isArray(parsed.value.items)) {
    parsed.value.items.forEach((item, index) => {
      const path = ['items', index] as const;
      if (!isRecord(item)) {
        diagnostics.push(diagnostic(path, 'Host catalog summary must be an object.'));
        return;
      }
      checkExact(item, new Set(['sourceId', 'name', 'description']), path, diagnostics);
      const before = diagnostics.length;
      validateSummaryFields(item, path, diagnostics);
      if (typeof item.sourceId === 'string') {
        if (ids.has(item.sourceId)) {
          diagnostics.push(
            diagnostic([...path, 'sourceId'], 'Host catalog page contains a duplicate id.'),
          );
        }
        ids.add(item.sourceId);
      }
      if (diagnostics.length === before) {
        items.push({
          sourceId: item.sourceId as string,
          name: item.name as string,
          description: item.description as string | null,
        });
      }
    });
  }
  if (parsed.value.nextCursor !== undefined && !isCursor(parsed.value.nextCursor)) {
    diagnostics.push(diagnostic(['nextCursor'], 'Host catalog page cursor is invalid.'));
  }
  if (diagnostics.length > 0) return invalidWith(diagnostics);
  return {
    ok: true,
    value: {
      items,
      ...(parsed.value.nextCursor === undefined
        ? {}
        : { nextCursor: parsed.value.nextCursor as string }),
    },
    diagnostics: [],
  };
}

function parseCatalogJson(
  input: unknown,
): ScreenParseResult<ScreenJsonObject | readonly unknown[]> {
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_HOST_CATALOG_BYTES });
  if (parsed.ok) return parsed as ScreenParseResult<ScreenJsonObject | readonly unknown[]>;
  return {
    ok: false,
    diagnostics: parsed.diagnostics.map((item) => ({
      ...item,
      code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' as const,
    })),
  };
}

/** 目录项参数：与数据集参数定义同形（`ScreenDatasetParameterDefinition`）。 */
function parseParameters(
  input: unknown,
  diagnostics: ScreenDiagnostic[],
): readonly ScreenDatasetParameterDefinition[] {
  if (!Array.isArray(input) || input.length > MAX_PARAMETER_DEFINITIONS) {
    diagnostics.push(diagnostic(['parameters'], 'Host catalog parameters are invalid.'));
    return [];
  }
  const parameters: ScreenDatasetParameterDefinition[] = [];
  input.forEach((entry, index) => {
    const path = ['parameters', index] as const;
    if (!isRecord(entry)) {
      diagnostics.push(diagnostic(path, 'Host catalog parameter must be an object.'));
      return;
    }
    checkExact(
      entry,
      new Set([
        'name',
        'label',
        'valueType',
        'required',
        'defaultValue',
        'minimum',
        'maximum',
        'maxLength',
        'allowedValues',
      ]),
      path,
      diagnostics,
    );
    const before = diagnostics.length;
    if (!isScreenVariableName(entry.name)) {
      diagnostics.push(diagnostic([...path, 'name'], 'Host catalog parameter name is invalid.'));
    }
    if (
      typeof entry.label !== 'string' ||
      entry.label.length === 0 ||
      [...entry.label].length > MAX_DESCRIPTION_CODE_POINTS
    ) {
      diagnostics.push(diagnostic([...path, 'label'], 'Host catalog parameter label is invalid.'));
    }
    if (typeof entry.valueType !== 'string' || !VALUE_TYPES.has(entry.valueType)) {
      diagnostics.push(
        diagnostic([...path, 'valueType'], 'Host catalog parameter valueType is invalid.'),
      );
    }
    if (typeof entry.required !== 'boolean') {
      diagnostics.push(
        diagnostic([...path, 'required'], 'Host catalog parameter required flag is invalid.'),
      );
    }
    if (entry.defaultValue !== undefined && !isParameterValue(entry.defaultValue)) {
      diagnostics.push(
        diagnostic([...path, 'defaultValue'], 'Host catalog parameter default is invalid.'),
      );
    }
    for (const key of ['minimum', 'maximum'] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== 'number') {
        diagnostics.push(diagnostic([...path, key], 'Host catalog parameter bound is invalid.'));
      }
    }
    if (entry.maxLength !== undefined) {
      const maxLength = entry.maxLength;
      if (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength < 0) {
        diagnostics.push(
          diagnostic([...path, 'maxLength'], 'Host catalog parameter maxLength is invalid.'),
        );
      }
    }
    if (entry.allowedValues !== undefined) {
      const allowedValues = entry.allowedValues;
      if (
        !Array.isArray(allowedValues) ||
        allowedValues.length > MAX_ALLOWED_VALUES ||
        !allowedValues.every((value) => isParameterValue(value))
      ) {
        diagnostics.push(
          diagnostic(
            [...path, 'allowedValues'],
            'Host catalog parameter allowedValues is invalid.',
          ),
        );
      }
    }
    if (diagnostics.length !== before) return;
    parameters.push({
      name: entry.name as string,
      label: entry.label as string,
      valueType: entry.valueType as ScreenDatasetParameterDefinition['valueType'],
      required: entry.required as boolean,
      ...(entry.defaultValue === undefined
        ? {}
        : { defaultValue: entry.defaultValue as ScreenDatasetParameterValue }),
      ...(entry.minimum === undefined ? {} : { minimum: entry.minimum as number }),
      ...(entry.maximum === undefined ? {} : { maximum: entry.maximum as number }),
      ...(entry.maxLength === undefined ? {} : { maxLength: entry.maxLength as number }),
      ...(entry.allowedValues === undefined
        ? {}
        : { allowedValues: entry.allowedValues as readonly ScreenDatasetParameterValue[] }),
    });
  });
  return parameters;
}

function isParameterValue(value: unknown): value is ScreenDatasetParameterValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function validateSummaryFields(
  value: ScreenJsonObject,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): void {
  if (
    typeof value.sourceId !== 'string' ||
    value.sourceId.length === 0 ||
    value.sourceId.length > MAX_VARIABLE_ID_CODE_UNITS ||
    CONTROL_CHARACTER_PATTERN.test(value.sourceId)
  ) {
    diagnostics.push(diagnostic([...path, 'sourceId'], 'Host catalog source id is invalid.'));
  }
  if (!isScreenVariableName(value.name)) {
    diagnostics.push(diagnostic([...path, 'name'], 'Host catalog name is invalid.'));
  }
  if (
    value.description !== null &&
    (typeof value.description !== 'string' ||
      [...value.description].length > MAX_DESCRIPTION_CODE_POINTS ||
      CONTROL_CHARACTER_PATTERN.test(value.description))
  ) {
    diagnostics.push(diagnostic([...path, 'description'], 'Host catalog description is invalid.'));
  }
}

function checkExact(
  value: ScreenJsonObject,
  allowed: ReadonlySet<string>,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.push(diagnostic([...path, key], 'Unknown host catalog field.'));
    }
  }
}

function isCursor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CURSOR_CODE_UNITS &&
    !CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isRecord(value: unknown): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function diagnostic(path: readonly (string | number)[], message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'HOST_VARIABLE_DESCRIPTOR_INVALID',
    path,
    message,
  };
}

function invalidCatalog(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [diagnostic(path, message)] };
}

function invalidWith(diagnostics: readonly ScreenDiagnostic[]): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [...diagnostics].sort((left, right) =>
      left.path.join('/') < right.path.join('/') ? -1 : 1,
    ),
  };
}
