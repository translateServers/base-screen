import { describe, expect, it } from 'vitest';
import { parseScreenDocumentCommand } from '../../src/commands/parse-command.js';

describe('parseScreenDocumentCommand', () => {
  it('accepts a known command object and rejects unknown types and fields', () => {
    const valid = parseScreenDocumentCommand({
      type: 'update-components',
      componentIds: ['a'],
      patch: { name: 'Renamed' },
    });
    expect(valid.ok).toBe(true);

    const unknownType = parseScreenDocumentCommand({ type: 'invent-mutation', patch: {} });
    expect(unknownType.ok).toBe(false);
    if (!unknownType.ok) {
      expect(unknownType.diagnostics[0]?.code).toBe('CORE_COMMAND_INVALID');
      expect(unknownType.diagnostics[0]?.path).toEqual(['type']);
    }

    const extraField = parseScreenDocumentCommand({
      type: 'remove-components',
      componentIds: ['a'],
      extra: true,
    });
    expect(extraField.ok).toBe(false);
    if (!extraField.ok) {
      expect(extraField.diagnostics[0]?.code).toBe('CORE_COMMAND_INVALID');
    }
  });

  it('rejects missing required fields without applying a default', () => {
    const missing = parseScreenDocumentCommand({ type: 'rename-variable', variableId: 'region' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.diagnostics[0]?.path).toEqual(['nextName']);
    }
  });
});
