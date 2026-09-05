import { parseScreenJsonValue } from '../json/parse.js';
import type { ScreenTabularDataset } from '../types/dataset.js';
import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';
import { MAX_DATASET_BYTES } from './constants.js';
import {
  diagnostic,
  invalidDataset,
  mapDatasetJsonDiagnostics,
  sortDiagnostics,
} from './diagnostics.js';
import { parseFields, parseRows } from './structure.js';
import { checkExact, isFiniteInteger, isRecord } from './validation.js';

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
