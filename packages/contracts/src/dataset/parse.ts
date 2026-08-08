import { parseScreenJsonValue } from '../json/parse.js';
import type {
  ScreenDatasetDescriptor,
  ScreenDatasetField,
  ScreenDatasetPage,
  ScreenDatasetParameter,
  ScreenDatasetSummary,
  ScreenTabularDataset,
} from '../types/dataset.js';
import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenJsonObject, ScreenJsonValue } from '../types/json.js';

export const MAX_DATASET_FIELDS = 256;
export const MAX_DATASET_ROWS = 10_000;
export const MAX_DATASET_BYTES = 1024 * 1024;
export const MAX_DATASET_PAGE_ITEMS = 50;

export function parseScreenTabularDataset(input: unknown): ScreenParseResult<ScreenTabularDataset> {
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_DATASET_BYTES });
  if (!parsed.ok) return mapDatasetJsonDiagnostics(parsed.diagnostics);
  const value = parsed.value;
  const diagnostics: ScreenDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidDataset([], 'Dataset must be an object.');
  }
  checkExact(
    value,
    new Set(['fields', 'rows', 'totalRowCount']),
    [],
    diagnostics,
    'HOST_DATASET_INVALID',
  );
  const fields = parseFields(value.fields, ['fields'], diagnostics, 'HOST_DATASET_INVALID');
  const rows = parseRows(value.rows, fields, ['rows'], diagnostics);
  if (
    value.totalRowCount !== undefined &&
    (!isFiniteInteger(value.totalRowCount) || (value.totalRowCount as number) < 0)
  ) {
    diagnostics.push(
      diagnostic('HOST_DATASET_INVALID', ['totalRowCount'], 'Dataset totalRowCount is invalid.'),
    );
  }
  if (diagnostics.length > 0 || fields === undefined || rows === undefined) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }
  return {
    ok: true,
    value: {
      fields,
      rows,
      ...(value.totalRowCount === undefined
        ? {}
        : { totalRowCount: value.totalRowCount as number }),
    },
    diagnostics: [],
  };
}

export function parseScreenDatasetDescriptor(
  input: unknown,
): ScreenParseResult<ScreenDatasetDescriptor> {
  const parsed = parseScreenJsonValue(input, { maxBytes: 256 * 1024 });
  if (!parsed.ok) return mapDescriptorJsonDiagnostics(parsed.diagnostics);
  const value = parsed.value;
  const diagnostics: ScreenDiagnostic[] = [];
  if (!isRecord(value)) return invalidDescriptor([], 'Dataset descriptor must be an object.');
  checkExact(
    value,
    new Set(['resourceType', 'resourceId', 'name', 'description', 'fields', 'parameters']),
    [],
    diagnostics,
    'HOST_DATASET_DESCRIPTOR_INVALID',
  );
  validateIdentifier(value.resourceType, ['resourceType'], diagnostics);
  validateResourceId(value.resourceId, ['resourceId'], diagnostics);
  validateDisplayString(value.name, ['name'], diagnostics, false);
  validateNullableDisplayString(value.description, ['description'], diagnostics);
  const fields = parseFields(
    value.fields,
    ['fields'],
    diagnostics,
    'HOST_DATASET_DESCRIPTOR_INVALID',
  );
  const parameters = parseParameters(value.parameters, ['parameters'], diagnostics);
  if (diagnostics.length > 0 || fields === undefined || parameters === undefined) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }
  return {
    ok: true,
    value: {
      resourceType: value.resourceType as string,
      resourceId: value.resourceId as string,
      name: value.name as string,
      description: value.description as string | null,
      fields,
      parameters,
    },
    diagnostics: [],
  };
}

export function parseScreenDatasetPage(input: unknown): ScreenParseResult<ScreenDatasetPage> {
  const parsed = parseScreenJsonValue(input, { maxBytes: 256 * 1024 });
  if (!parsed.ok) return mapDescriptorJsonDiagnostics(parsed.diagnostics);
  const value = parsed.value;
  const diagnostics: ScreenDiagnostic[] = [];
  if (!isRecord(value)) return invalidDescriptor([], 'Dataset page must be an object.');
  checkExact(
    value,
    new Set(['items', 'nextCursor']),
    [],
    diagnostics,
    'HOST_DATASET_DESCRIPTOR_INVALID',
  );
  if (!Array.isArray(value.items) || value.items.length > MAX_DATASET_PAGE_ITEMS) {
    diagnostics.push(
      diagnostic('HOST_DATASET_DESCRIPTOR_INVALID', ['items'], 'Dataset page items are invalid.'),
    );
  }
  const items: ScreenDatasetSummary[] = [];
  if (Array.isArray(value.items)) {
    value.items.forEach((item, index) => {
      if (!isRecord(item)) {
        diagnostics.push(
          diagnostic(
            'HOST_DATASET_DESCRIPTOR_INVALID',
            ['items', index],
            'Dataset summary is invalid.',
          ),
        );
        return;
      }
      checkExact(
        item,
        new Set(['resourceType', 'resourceId', 'name', 'description']),
        ['items', index],
        diagnostics,
        'HOST_DATASET_DESCRIPTOR_INVALID',
      );
      validateIdentifier(item.resourceType, ['items', index, 'resourceType'], diagnostics);
      validateResourceId(item.resourceId, ['items', index, 'resourceId'], diagnostics);
      validateDisplayString(item.name, ['items', index, 'name'], diagnostics, false);
      validateNullableDisplayString(item.description, ['items', index, 'description'], diagnostics);
      items.push(item as unknown as ScreenDatasetSummary);
    });
  }
  if (value.nextCursor !== undefined && !isCursor(value.nextCursor)) {
    diagnostics.push(
      diagnostic(
        'HOST_DATASET_DESCRIPTOR_INVALID',
        ['nextCursor'],
        'Dataset page cursor is invalid.',
      ),
    );
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics: sortDiagnostics(diagnostics) }
    : {
        ok: true,
        value: {
          items,
          ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor as string }),
        },
        diagnostics: [],
      };
}

function parseFields(
  input: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
  code: 'HOST_DATASET_INVALID' | 'HOST_DATASET_DESCRIPTOR_INVALID',
): readonly ScreenDatasetField[] | undefined {
  if (!Array.isArray(input) || input.length > MAX_DATASET_FIELDS) {
    diagnostics.push(diagnostic(code, path, 'Dataset fields are invalid.'));
    return undefined;
  }
  const ids = new Set<string>();
  const fields: ScreenDatasetField[] = [];
  input.forEach((item, index) => {
    const itemPath = [...path, index];
    if (!isRecord(item)) {
      diagnostics.push(diagnostic(code, itemPath, 'Dataset field is invalid.'));
      return;
    }
    checkExact(item, new Set(['id', 'label', 'valueType']), itemPath, diagnostics, code);
    validateFieldId(item.id, [...itemPath, 'id'], diagnostics, code);
    validateDisplayString(item.label, [...itemPath, 'label'], diagnostics, false, code);
    if (!isDatasetValueType(item.valueType)) {
      diagnostics.push(
        diagnostic(code, [...itemPath, 'valueType'], 'Dataset field valueType is invalid.'),
      );
    }
    if (typeof item.id === 'string') {
      if (ids.has(item.id))
        diagnostics.push(
          diagnostic(code, [...itemPath, 'id'], 'Dataset field ids must be unique.'),
        );
      ids.add(item.id);
    }
    fields.push(item as unknown as ScreenDatasetField);
  });
  return fields;
}

function parseRows(
  input: ScreenJsonValue | undefined,
  fields: readonly ScreenDatasetField[] | undefined,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): readonly ScreenJsonObject[] | undefined {
  if (!Array.isArray(input) || input.length > MAX_DATASET_ROWS) {
    diagnostics.push(diagnostic('HOST_DATASET_INVALID', path, 'Dataset rows are invalid.'));
    return undefined;
  }
  const fieldById = new Map((fields ?? []).map((field) => [field.id, field]));
  const rows: ScreenJsonObject[] = [];
  input.forEach((item, rowIndex) => {
    const rowPath = [...path, rowIndex];
    if (!isRecord(item)) {
      diagnostics.push(diagnostic('HOST_DATASET_INVALID', rowPath, 'Dataset row is invalid.'));
      return;
    }
    const row: Record<string, ScreenJsonValue> = {};
    for (const [key, cell] of Object.entries(item)) {
      const field = fieldById.get(key);
      if (field === undefined) {
        diagnostics.push(
          diagnostic(
            'HOST_DATASET_INVALID',
            [...rowPath, key],
            'Dataset row contains an undeclared field.',
          ),
        );
        continue;
      }
      if (!validCell(cell, field.valueType)) {
        diagnostics.push(
          diagnostic('HOST_DATASET_INVALID', [...rowPath, key], 'Dataset cell type is invalid.'),
        );
        continue;
      }
      row[key] = cell;
    }
    rows.push(row);
  });
  return rows;
}

function parseParameters(
  input: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): readonly ScreenDatasetParameter[] | undefined {
  if (!Array.isArray(input) || input.length > 256) {
    diagnostics.push(
      diagnostic('HOST_DATASET_DESCRIPTOR_INVALID', path, 'Dataset parameters are invalid.'),
    );
    return undefined;
  }
  const names = new Set<string>();
  const parameters: ScreenDatasetParameter[] = [];
  input.forEach((item, index) => {
    const itemPath = [...path, index];
    if (!isRecord(item)) {
      diagnostics.push(
        diagnostic('HOST_DATASET_DESCRIPTOR_INVALID', itemPath, 'Dataset parameter is invalid.'),
      );
      return;
    }
    checkExact(
      item,
      new Set(['name', 'label', 'valueType', 'editor', 'required', 'defaultValue']),
      itemPath,
      diagnostics,
      'HOST_DATASET_DESCRIPTOR_INVALID',
    );
    validateIdentifier(
      item.name,
      [...itemPath, 'name'],
      diagnostics,
      'HOST_DATASET_DESCRIPTOR_INVALID',
    );
    validateDisplayString(
      item.label,
      [...itemPath, 'label'],
      diagnostics,
      false,
      'HOST_DATASET_DESCRIPTOR_INVALID',
    );
    if (
      !isDatasetValueType(item.valueType) ||
      !isDatasetEditor(item.editor) ||
      typeof item.required !== 'boolean'
    ) {
      diagnostics.push(
        diagnostic(
          'HOST_DATASET_DESCRIPTOR_INVALID',
          itemPath,
          'Dataset parameter metadata is invalid.',
        ),
      );
    }
    if (
      item.defaultValue !== undefined &&
      !validCell(item.defaultValue, item.valueType as string)
    ) {
      diagnostics.push(
        diagnostic(
          'HOST_DATASET_DESCRIPTOR_INVALID',
          [...itemPath, 'defaultValue'],
          'Dataset parameter default is invalid.',
        ),
      );
    }
    if (typeof item.name === 'string') {
      if (names.has(item.name))
        diagnostics.push(
          diagnostic(
            'HOST_DATASET_DESCRIPTOR_INVALID',
            [...itemPath, 'name'],
            'Dataset parameter names must be unique.',
          ),
        );
      names.add(item.name);
    }
    parameters.push(item as unknown as ScreenDatasetParameter);
  });
  return parameters;
}

function checkExact(
  value: ScreenJsonObject,
  fields: ReadonlySet<string>,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
  code: 'HOST_DATASET_INVALID' | 'HOST_DATASET_DESCRIPTOR_INVALID',
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key))
      diagnostics.push(diagnostic(code, [...path, key], 'Unknown dataset field.'));
  }
}

function validCell(value: ScreenJsonValue, type: string): boolean {
  if (value === null) return true;
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  return type === 'date' && typeof value === 'string' && isIsoDate(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2}))?$/.test(value))
    return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function isDatasetValueType(value: unknown): boolean {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'date';
}

function isDatasetEditor(value: unknown): boolean {
  return (
    value === 'text' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'date' ||
    value === 'json'
  );
}

function validateIdentifier(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
  code = 'HOST_DATASET_DESCRIPTOR_INVALID',
): void {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(value))
    diagnostics.push(
      diagnostic(code as ScreenDiagnostic['code'], path, 'Dataset identifier is invalid.'),
    );
}

function validateFieldId(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
  code: 'HOST_DATASET_INVALID' | 'HOST_DATASET_DESCRIPTOR_INVALID',
): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    diagnostics.push(diagnostic(code, path, 'Dataset field id is invalid.'));
  }
}

function validateResourceId(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256)
    diagnostics.push(
      diagnostic('HOST_DATASET_DESCRIPTOR_INVALID', path, 'Dataset resource id is invalid.'),
    );
}

function validateDisplayString(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
  allowEmpty: boolean,
  code = 'HOST_DATASET_DESCRIPTOR_INVALID',
): void {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    diagnostics.push(
      diagnostic(code as ScreenDiagnostic['code'], path, 'Dataset display text is invalid.'),
    );
}

function validateNullableDisplayString(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): void {
  if (value !== null) validateDisplayString(value, path, diagnostics, true);
}

function isCursor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isRecord(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

function invalidDataset(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [diagnostic('HOST_DATASET_INVALID', path, message)] };
}

function invalidDescriptor(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [diagnostic('HOST_DATASET_DESCRIPTOR_INVALID', path, message)] };
}

function mapDatasetJsonDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: diagnostics.map((item) => ({
      ...item,
      code: item.code === 'JSON_LIMIT_EXCEEDED' ? 'HOST_DATASET_INVALID' : 'HOST_DATASET_INVALID',
    })),
  };
}

function mapDescriptorJsonDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: diagnostics.map((item) => ({
      ...item,
      code: 'HOST_DATASET_DESCRIPTOR_INVALID' as const,
    })),
  };
}

function sortDiagnostics(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const a = left.path.join('/');
    const b = right.path.join('/');
    return a < b ? -1 : a > b ? 1 : left.code < right.code ? -1 : 1;
  });
}
