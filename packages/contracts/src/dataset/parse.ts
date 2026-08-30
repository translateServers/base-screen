import { parseScreenJsonValue } from '../json/parse.js';
import type {
  ScreenDatasetDescriptor,
  ScreenDatasetPage,
  ScreenDatasetSummary,
  ScreenTabularDataset,
} from '../types/dataset.js';
import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';
import { MAX_DATASET_BYTES, MAX_DATASET_PAGE_ITEMS } from './constants.js';
import {
  diagnostic,
  invalidDataset,
  invalidDescriptor,
  mapDatasetJsonDiagnostics,
  mapDescriptorJsonDiagnostics,
  sortDiagnostics,
} from './diagnostics.js';
import { parseFields, parseParameters, parseRows } from './structure.js';
import {
  checkExact,
  isCursor,
  isFiniteInteger,
  isRecord,
  validateDisplayString,
  validateIdentifier,
  validateNullableDisplayString,
  validateResourceId,
} from './validation.js';

export {
  MAX_DATASET_BYTES,
  MAX_DATASET_FIELD_FORMAT_LENGTH,
  MAX_DATASET_FIELD_UNIT_LENGTH,
  MAX_DATASET_FIELDS,
  MAX_DATASET_PAGE_ITEMS,
  MAX_DATASET_ROWS,
} from './constants.js';

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
