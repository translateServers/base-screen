import { parseScreenJsonValue, type ScreenParseResult } from '@base-screen/contracts';
import { isRecord } from './command-input.js';
import { invalidScreenCommand } from './command-result.js';
import type { ScreenDocumentCommand } from './types.js';

const COMMAND_TYPES = new Set([
  'update-canvas',
  'add-component',
  'update-components',
  'remove-components',
  'reparent-components',
  'replace-blueprint',
  'replace-data-sources',
  'replace-variables',
  'rename-variable',
]);

const COMMAND_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  'update-canvas': new Set(['type', 'patch']),
  'add-component': new Set(['type', 'component']),
  'update-components': new Set(['type', 'componentIds', 'patch']),
  'remove-components': new Set(['type', 'componentIds']),
  'reparent-components': new Set(['type', 'componentIds', 'parentId']),
  'replace-blueprint': new Set(['type', 'blueprint']),
  'replace-data-sources': new Set(['type', 'dataSources']),
  'replace-variables': new Set(['type', 'variables']),
  'rename-variable': new Set(['type', 'variableId', 'nextName']),
};

const MAX_COMMAND_BYTES = 256 * 1024;

export function parseScreenDocumentCommand(
  input: unknown,
): ScreenParseResult<ScreenDocumentCommand> {
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_COMMAND_BYTES });
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value) || typeof parsed.value.type !== 'string') {
    return {
      ok: false,
      diagnostics: invalidScreenCommand('Command must be an object with a known type.', []),
    };
  }
  const type = parsed.value.type;
  if (!COMMAND_TYPES.has(type)) {
    return {
      ok: false,
      diagnostics: invalidScreenCommand('Command type is not supported.', ['type']),
    };
  }
  const allowed = COMMAND_FIELDS[type]!;
  for (const key of Object.keys(parsed.value)) {
    if (!allowed.has(key)) {
      return {
        ok: false,
        diagnostics: invalidScreenCommand('Command contains an unknown field.', [key]),
      };
    }
  }
  for (const field of allowed) {
    if (!Object.hasOwn(parsed.value, field)) {
      return {
        ok: false,
        diagnostics: invalidScreenCommand('Command field is required.', [field]),
      };
    }
  }
  return { ok: true, value: parsed.value as ScreenDocumentCommand, diagnostics: [] };
}
