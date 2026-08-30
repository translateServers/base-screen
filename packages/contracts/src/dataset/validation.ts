import type { ScreenDiagnostic } from '../types/diagnostics.js';
import type { ScreenJsonObject, ScreenJsonValue } from '../types/json.js';
import { diagnostic } from './diagnostics.js';

export function checkExact(
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

export function validCell(value: ScreenJsonValue, type: string): boolean {
  if (value === null) return true;
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  return type === 'date' && typeof value === 'string' && isIsoDate(value);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2}))?$/.test(value))
    return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

/** 参数默认值必须是普通 JSON 值（parseScreenJsonValue 已整体保证，此处显式兜底）。 */
export function isPlainJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'object';
}

export function isDatasetValueType(value: unknown): boolean {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'date';
}

export function isDatasetEditor(value: unknown): boolean {
  return (
    value === 'text' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'date' ||
    value === 'json'
  );
}

export function validateIdentifier(
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

export function validateFieldId(
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

export function validateResourceId(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256)
    diagnostics.push(
      diagnostic('HOST_DATASET_DESCRIPTOR_INVALID', path, 'Dataset resource id is invalid.'),
    );
}

export function validateDisplayString(
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

export function validateNullableDisplayString(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): void {
  if (value !== null) validateDisplayString(value, path, diagnostics, true);
}

export function validateDisplayHint(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
  code: 'HOST_DATASET_INVALID' | 'HOST_DATASET_DESCRIPTOR_INVALID',
  hint: 'unit' | 'format',
  maxCodeUnits: number,
): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxCodeUnits ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    diagnostics.push(diagnostic(code, path, `Dataset field ${hint} is invalid.`));
  }
}

export function isCursor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isRecord(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}
