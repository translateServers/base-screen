import type { ScreenDatasetField, ScreenDatasetParameter } from '../types/dataset.js';
import type { ScreenDiagnostic } from '../types/diagnostics.js';
import type { ScreenJsonObject, ScreenJsonValue } from '../types/json.js';
import {
  MAX_DATASET_FIELD_FORMAT_LENGTH,
  MAX_DATASET_FIELD_UNIT_LENGTH,
  MAX_DATASET_FIELDS,
  MAX_DATASET_ROWS,
} from './constants.js';
import { diagnostic } from './diagnostics.js';
import {
  checkExact,
  isDatasetEditor,
  isDatasetValueType,
  isPlainJsonValue,
  isRecord,
  validateDisplayHint,
  validateDisplayString,
  validateFieldId,
  validateIdentifier,
  validCell,
} from './validation.js';

export function parseFields(
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
    checkExact(
      item,
      new Set(['id', 'label', 'valueType', 'nullable', 'unit', 'format']),
      itemPath,
      diagnostics,
      code,
    );
    validateFieldId(item.id, [...itemPath, 'id'], diagnostics, code);
    validateDisplayString(item.label, [...itemPath, 'label'], diagnostics, false, code);
    if (!isDatasetValueType(item.valueType)) {
      diagnostics.push(
        diagnostic(code, [...itemPath, 'valueType'], 'Dataset field valueType is invalid.'),
      );
    }
    if (item.nullable !== undefined && typeof item.nullable !== 'boolean') {
      diagnostics.push(
        diagnostic(code, [...itemPath, 'nullable'], 'Dataset field nullable is invalid.'),
      );
    }
    if (item.unit !== undefined) {
      validateDisplayHint(
        item.unit,
        [...itemPath, 'unit'],
        diagnostics,
        code,
        'unit',
        MAX_DATASET_FIELD_UNIT_LENGTH,
      );
    }
    if (item.format !== undefined) {
      validateDisplayHint(
        item.format,
        [...itemPath, 'format'],
        diagnostics,
        code,
        'format',
        MAX_DATASET_FIELD_FORMAT_LENGTH,
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

export function parseRows(
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
      if (field.nullable === false && cell === null) {
        diagnostics.push(
          diagnostic('HOST_DATASET_INVALID', [...rowPath, key], 'Dataset cell is not nullable.'),
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
    for (const field of fields ?? []) {
      if (field.nullable === false && !Object.prototype.hasOwnProperty.call(item, field.id)) {
        diagnostics.push(
          diagnostic(
            'HOST_DATASET_INVALID',
            [...rowPath, field.id],
            'Dataset cell is missing for a non-nullable field.',
          ),
        );
      }
    }
    rows.push(row);
  });
  return rows;
}

export function parseParameters(
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
      new Set(['name', 'label', 'editor', 'defaultValue']),
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
    if (item.editor !== undefined && !isDatasetEditor(item.editor)) {
      diagnostics.push(
        diagnostic(
          'HOST_DATASET_DESCRIPTOR_INVALID',
          [...itemPath, 'editor'],
          'Dataset parameter editor is invalid.',
        ),
      );
    }
    if (item.defaultValue !== undefined && !isPlainJsonValue(item.defaultValue)) {
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
