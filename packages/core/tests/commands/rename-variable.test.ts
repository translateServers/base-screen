import type { ScreenHostVariable } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { applyScreenDocumentCommand } from '../../src/commands/apply.js';
import { makeComponent, makeDocument, makeVariable } from '../__fixtures__/document.js';

describe('rename-variable command', () => {
  it('atomically renames static variables and every nested reference', () => {
    const original = makeDocument({
      variables: [makeVariable({ name: 'region', value: 'east' }), makeVariable({ name: 'other' })],
      components: [
        makeComponent({
          id: 'chart',
          dataSource: {
            type: 'host-resource',
            resourceType: 'dataset',
            resourceId: 'orders',
            params: {
              region: { kind: 'variable', name: 'region' },
              fixed: { kind: 'literal', value: 'region' },
            },
            binding: null,
          },
        }),
        makeComponent({ id: 'unaffected' }),
      ],
      blueprint: {
        rules: [
          {
            id: 'rule',
            trigger: { type: 'material-event', componentId: 'chart', eventName: 'select' },
            condition: {
              left: {
                kind: 'object',
                properties: {
                  nested: {
                    kind: 'array',
                    items: [{ kind: 'variable', name: 'region' }],
                  },
                },
              },
              operator: 'eq',
              right: { kind: 'variable', name: 'region' },
            },
            actions: [
              {
                type: 'set-variable',
                variableName: 'region',
                value: { kind: 'variable', name: 'region' },
              },
              {
                type: 'emit-host-event',
                eventName: 'changed',
                payload: {
                  kind: 'object',
                  properties: { value: { kind: 'variable', name: 'region' } },
                },
              },
              {
                type: 'host-action',
                actionId: 'save',
                payload: { kind: 'variable', name: 'region' },
              },
            ],
          },
        ],
      },
    });

    const result = applyScreenDocumentCommand(original, {
      type: 'rename-variable',
      variableName: 'region',
      nextName: 'salesRegion',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedComponentIds).toEqual(['chart']);
    expect(result.document.variables.map(({ name }) => name)).toEqual(['salesRegion', 'other']);
    expect(result.document.components[0]?.dataSource).toMatchObject({
      params: {
        region: { kind: 'variable', name: 'salesRegion' },
        fixed: { kind: 'literal', value: 'region' },
      },
    });
    expect(JSON.stringify(result.document.blueprint)).not.toContain('"name":"region"');
    expect(result.document.blueprint.rules[0]?.actions[0]).toMatchObject({
      type: 'set-variable',
      variableName: 'salesRegion',
      value: { kind: 'variable', name: 'salesRegion' },
    });
    expect(original.variables[0]?.name).toBe('region');
    expect(original.components[0]?.dataSource).toMatchObject({
      params: { region: { kind: 'variable', name: 'region' } },
    });
  });

  it('renames host aliases while preserving the immutable variable id and description', () => {
    const host: ScreenHostVariable = {
      type: 'host',
      name: 'tenant',
      description: '当前租户',
      variableId: 'tenant-id',
    };
    const original = makeDocument({ variables: [host] });
    const result = applyScreenDocumentCommand(original, {
      type: 'rename-variable',
      variableName: 'tenant',
      nextName: 'currentTenant',
    });
    expect(result).toMatchObject({
      ok: true,
      document: {
        variables: [
          {
            type: 'host',
            name: 'currentTenant',
            description: '当前租户',
            variableId: 'tenant-id',
          },
        ],
      },
    });
  });

  it('rejects missing, duplicate, invalid, and malformed targets with zero partial mutation', () => {
    const original = makeDocument({
      variables: [makeVariable({ name: 'first' }), makeVariable({ name: 'second' })],
    });
    const commands = [
      { type: 'rename-variable', variableName: 'missing', nextName: 'next' },
      { type: 'rename-variable', variableName: 'first', nextName: 'second' },
      { type: 'rename-variable', variableName: 'first', nextName: 'not-valid-name' },
      { type: 'rename-variable', variableName: 'first', nextName: 'next', extra: true },
    ] as const;
    for (const command of commands) {
      const result = applyScreenDocumentCommand(original, command);
      expect(result.ok).toBe(false);
      expect(result.document).toBe(original);
    }
  });

  it('returns the original document for a valid no-op', () => {
    const original = makeDocument({ variables: [makeVariable({ name: 'count' })] });
    const result = applyScreenDocumentCommand(original, {
      type: 'rename-variable',
      variableName: 'count',
      nextName: 'count',
    });
    expect(result).toMatchObject({ ok: true, changedComponentIds: [] });
    expect(result.document).toBe(original);
  });

  it('rewrites many references through one command without a transaction limit', () => {
    const original = makeDocument({
      variables: [makeVariable({ name: 'value' })],
      components: Array.from({ length: 1_100 }, (_, index) =>
        makeComponent({
          id: `component-${index}`,
          zIndex: index,
          dataSource: {
            type: 'host-resource',
            resourceType: 'dataset',
            resourceId: 'resource',
            params: { value: { kind: 'variable', name: 'value' } },
            binding: null,
          },
        }),
      ),
    });
    const result = applyScreenDocumentCommand(original, {
      type: 'rename-variable',
      variableName: 'value',
      nextName: 'nextValue',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedComponentIds).toHaveLength(1_100);
      expect(result.document.components[1_099]?.dataSource).toMatchObject({
        params: { value: { kind: 'variable', name: 'nextValue' } },
      });
    }
  });
});
