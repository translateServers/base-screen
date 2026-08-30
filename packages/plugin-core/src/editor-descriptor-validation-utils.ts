import type { ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';
import { PluginDiagnosticCollector } from './diagnostics.js';

export function isPath(
  value: unknown,
  maximumDepth: number,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): value is readonly (string | number)[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumDepth) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'path'],
      'Editor path must be a non-empty array of safe path segments.',
    );
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const segment = value[index];
    const isString = isPathSegment(segment);
    const isIndex =
      typeof segment === 'number' &&
      Number.isInteger(segment) &&
      segment >= 0 &&
      segment <= 255 &&
      index === value.length - 1;
    if (!isString && !isIndex) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'path', index],
        'Editor path segment is invalid; numeric segments are only allowed as the final binding index.',
      );
      return false;
    }
  }
  return true;
}

export function isPathSegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value) &&
    value !== '__proto__' &&
    value !== 'prototype' &&
    value !== 'constructor'
  );
}

export function validateKnown(
  value: ScreenJsonObject,
  fields: ReadonlySet<string>,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD',
        [...path, key],
        'Editor descriptor contains an unknown field.',
      );
    }
  }
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

export function isRecord(value: unknown): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
