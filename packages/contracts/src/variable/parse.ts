import { isScreenVariableName } from '../document/schema.js';
import { parseScreenJsonValue } from '../json/parse.js';
import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenJsonObject } from '../types/json.js';
import type {
  ScreenHostVariableDescriptor,
  ScreenHostVariablePage,
  ScreenHostVariableSummary,
} from '../types/variable.js';

export const MAX_HOST_VARIABLE_PAGE_ITEMS = 50;
export const MAX_HOST_VARIABLE_CATALOG_BYTES = 256 * 1024;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const MAX_VARIABLE_ID_CODE_UNITS = 256;
const MAX_DESCRIPTION_CODE_POINTS = 4_096;
const MAX_CURSOR_CODE_UNITS = 4_096;

export function parseScreenHostVariableDescriptor(
  input: unknown,
): ScreenParseResult<ScreenHostVariableDescriptor> {
  const parsed = parseCatalogJson(input);
  if (!parsed.ok) return parsed;
  const diagnostics: ScreenDiagnostic[] = [];
  if (!isRecord(parsed.value)) {
    return invalidVariableDescriptor([], 'Host variable descriptor must be an object.');
  }
  checkExact(
    parsed.value,
    new Set(['sourceId', 'sourceType', 'name', 'description', 'previewable']),
    [],
    diagnostics,
  );
  validateSummaryFields(parsed.value, [], diagnostics);
  if (typeof parsed.value.previewable !== 'boolean') {
    diagnostics.push(
      diagnostic(['previewable'], 'Host variable previewable flag must be boolean.'),
    );
  }
  if (diagnostics.length > 0) return invalidWith(diagnostics);
  return {
    ok: true,
    value: {
      sourceId: parsed.value.sourceId as string,
      sourceType: parsed.value.sourceType as 'data-source' | 'url-query',
      name: parsed.value.name as string,
      description: parsed.value.description as string | null,
      previewable: parsed.value.previewable as boolean,
    },
    diagnostics: [],
  };
}

export function parseScreenHostVariablePage(
  input: unknown,
): ScreenParseResult<ScreenHostVariablePage> {
  const parsed = parseCatalogJson(input);
  if (!parsed.ok) return parsed;
  const diagnostics: ScreenDiagnostic[] = [];
  if (!isRecord(parsed.value)) {
    return invalidVariableDescriptor([], 'Host variable page must be an object.');
  }
  checkExact(parsed.value, new Set(['items', 'nextCursor']), [], diagnostics);
  if (
    !Array.isArray(parsed.value.items) ||
    parsed.value.items.length > MAX_HOST_VARIABLE_PAGE_ITEMS
  ) {
    diagnostics.push(diagnostic(['items'], 'Host variable page items are invalid.'));
  }
  const items: ScreenHostVariableSummary[] = [];
  const ids = new Set<string>();
  if (Array.isArray(parsed.value.items)) {
    parsed.value.items.forEach((item, index) => {
      const path = ['items', index] as const;
      if (!isRecord(item)) {
        diagnostics.push(diagnostic(path, 'Host variable summary must be an object.'));
        return;
      }
      checkExact(
        item,
        new Set(['sourceId', 'sourceType', 'name', 'description']),
        path,
        diagnostics,
      );
      const before = diagnostics.length;
      validateSummaryFields(item, path, diagnostics);
      if (typeof item.sourceId === 'string') {
        if (ids.has(item.sourceId)) {
          diagnostics.push(
            diagnostic([...path, 'sourceId'], 'Variable source page contains a duplicate id.'),
          );
        }
        ids.add(item.sourceId);
      }
      if (diagnostics.length === before) {
        items.push({
          sourceId: item.sourceId as string,
          sourceType: item.sourceType as 'data-source' | 'url-query',
          name: item.name as string,
          description: item.description as string | null,
        });
      }
    });
  }
  if (parsed.value.nextCursor !== undefined && !isCursor(parsed.value.nextCursor)) {
    diagnostics.push(diagnostic(['nextCursor'], 'Host variable page cursor is invalid.'));
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
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_HOST_VARIABLE_CATALOG_BYTES });
  if (parsed.ok) return parsed as ScreenParseResult<ScreenJsonObject | readonly unknown[]>;
  return {
    ok: false,
    diagnostics: parsed.diagnostics.map((item) => ({
      ...item,
      code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' as const,
    })),
  };
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
    diagnostics.push(diagnostic([...path, 'sourceId'], 'Variable source id is invalid.'));
  }
  if (value.sourceType !== 'data-source' && value.sourceType !== 'url-query') {
    diagnostics.push(diagnostic([...path, 'sourceType'], 'Variable source type is invalid.'));
  }
  if (!isScreenVariableName(value.name)) {
    diagnostics.push(diagnostic([...path, 'name'], 'Host variable name is invalid.'));
  }
  if (
    value.description !== null &&
    (typeof value.description !== 'string' ||
      [...value.description].length > MAX_DESCRIPTION_CODE_POINTS ||
      CONTROL_CHARACTER_PATTERN.test(value.description))
  ) {
    diagnostics.push(diagnostic([...path, 'description'], 'Host variable description is invalid.'));
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
      diagnostics.push(diagnostic([...path, key], 'Unknown host variable catalog field.'));
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

function invalidVariableDescriptor(
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
