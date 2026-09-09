import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createBaseScreenCorePluginCommandPort } from '../../../../src/common/operations/plugin/designer-plugin-command-port.js';

describe('createBaseScreenCorePluginCommandPort', () => {
  it('executes a parsed document command and rejects unknown mutation types', async () => {
    const executed: string[] = [];
    const port = createBaseScreenCorePluginCommandPort({
      executeCommand: (command) => {
        executed.push(command.type);
        return { ok: true, value: {} as ScreenDocument, diagnostics: [] };
      },
    });

    const allowed = await port.execute({
      commandId: 'update-components',
      args: { componentIds: ['box'], patch: { name: 'Renamed' } },
    });
    expect(allowed.ok).toBe(true);
    expect(executed).toEqual(['update-components']);

    const rejected = await port.execute({
      commandId: 'invent-mutation',
      args: { patch: {} },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.diagnostics[0]?.code).toBe('CORE_COMMAND_INVALID');
    }
    expect(executed).toEqual(['update-components']);
  });
});
