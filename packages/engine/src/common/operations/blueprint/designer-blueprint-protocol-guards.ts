import type { ScreenParseResult } from '@base-screen/contracts';

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_COORDINATE = 1_000_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isIdentifier(value: unknown): value is string {
  return isBoundedString(value, MAX_IDENTIFIER_LENGTH);
}

export function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

export function firstUnknownField(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): string | undefined {
  return Object.keys(value).find((key) => !allowed.has(key));
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function success<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

export function failure<T>(
  path: readonly (string | number)[],
  message: string,
  limit = false,
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: limit ? 'AUTHORING_LIMIT_EXCEEDED' : 'AUTHORING_REQUEST_INVALID',
        path,
        message,
      },
    ],
  };
}
