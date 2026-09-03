import type { ScreenDataSourceVariable } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { applyScreenDocumentCommand } from '../../src/commands/apply.js';
import { makeDocument, makeVariable } from '../__fixtures__/document.js';

describe('rename-variable command', () => {
  it('renames the label while stable-id references remain untouched', () => {
    const original = makeDocument({
      variables: [makeVariable({ id: 'region-id', name: 'region', initialValue: 'east' })],
      blueprint: {
        rules: [
          {
            id: 'rule',
            trigger: {
              type: 'variable-event',
              variableId: 'region-id',
              eventName: 'data-updated',
            },
            actions: [
              {
                type: 'set-variable',
                variableId: 'region-id',
                value: { kind: 'variable', variableId: 'region-id' },
              },
            ],
          },
        ],
      },
    });

    const result = applyScreenDocumentCommand(original, {
      type: 'rename-variable',
      variableId: 'region-id',
      nextName: 'salesRegion',
    });

    expect(result).toMatchObject({
      ok: true,
      changedComponentIds: [],
      document: { variables: [{ id: 'region-id', name: 'salesRegion' }] },
    });
    expect(result.document.blueprint).toBe(original.blueprint);
    expect(original.variables[0]?.name).toBe('region');
  });

  it('renames dynamic variables without changing their host source configuration', () => {
    const dynamic: ScreenDataSourceVariable = {
      type: 'data-source',
      id: 'tenant-id',
      name: 'tenant',
      description: '当前租户',
      initialValue: null,
      sourceId: 'tenant-source',
      controlled: true,
    };
    const result = applyScreenDocumentCommand(makeDocument({ variables: [dynamic] }), {
      type: 'rename-variable',
      variableId: 'tenant-id',
      nextName: 'currentTenant',
    });
    expect(result).toMatchObject({
      ok: true,
      document: {
        variables: [
          {
            type: 'data-source',
            id: 'tenant-id',
            name: 'currentTenant',
            sourceId: 'tenant-source',
            controlled: true,
          },
        ],
      },
    });
  });

  it('rejects missing, duplicate, invalid, and malformed targets without mutation', () => {
    const original = makeDocument({
      variables: [
        makeVariable({ id: 'first-id', name: 'first' }),
        makeVariable({ id: 'second-id', name: 'second' }),
      ],
    });
    const commands = [
      { type: 'rename-variable', variableId: 'missing', nextName: 'next' },
      { type: 'rename-variable', variableId: 'first-id', nextName: 'second' },
      { type: 'rename-variable', variableId: 'first-id', nextName: 'not-valid-name' },
      { type: 'rename-variable', variableId: 'first-id', nextName: 'next', extra: true },
    ] as const;
    for (const command of commands) {
      const result = applyScreenDocumentCommand(original, command);
      expect(result.ok).toBe(false);
      expect(result.document).toBe(original);
    }
  });

  it('returns the original document for a valid no-op', () => {
    const original = makeDocument({
      variables: [makeVariable({ id: 'count-id', name: 'count' })],
    });
    const result = applyScreenDocumentCommand(original, {
      type: 'rename-variable',
      variableId: 'count-id',
      nextName: 'count',
    });
    expect(result).toMatchObject({ ok: true, changedComponentIds: [] });
    expect(result.document).toBe(original);
  });
});
