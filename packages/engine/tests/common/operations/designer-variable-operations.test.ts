import type { ScreenComponentNode, ScreenDocument, ScreenVariable } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  buildReplaceVariablesCommand,
  isVariableNameTaken,
  isVariableReferenced,
  referencedVariableNames,
} from '../../../src/common/operations/designer-variable-operations.js';

function component(id: string, dataSource: ScreenComponentNode['dataSource']): ScreenComponentNode {
  return {
    id,
    type: 'base.chart',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

function document(
  variables: readonly ScreenVariable[],
  components: readonly ScreenComponentNode[] = [],
  blueprint: ScreenDocument['blueprint'] = { rules: [] },
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables,
    blueprint,
  };
}

describe('designer variable operations', () => {
  it('collects variable references from host-resource parameter bindings', () => {
    const source = document(
      [],
      [
        component('chart', {
          type: 'host-resource',
          resourceType: 'dataset',
          resourceId: 'orders',
          params: {
            region: { kind: 'variable', name: 'region' },
            limit: { kind: 'literal', value: 2 },
          },
          binding: { fields: {} },
        }),
      ],
    );

    expect(referencedVariableNames(source)).toEqual(new Set(['region']));
    expect(isVariableReferenced(source, 'region')).toBe(true);
    expect(isVariableReferenced(source, 'limit')).toBe(false);
  });

  it('collects variable references from blueprint set-variable actions and expressions', () => {
    const source = document([], [], {
      rules: [
        {
          id: 'r1',
          trigger: { type: 'material-event', componentId: 'a', eventName: 'click' },
          condition: {
            left: { kind: 'variable', name: 'count' },
            operator: 'gt',
            right: { kind: 'literal', value: 0 },
          },
          actions: [
            {
              type: 'set-variable',
              variableName: 'count',
              value: { kind: 'event-payload', path: ['value'] },
            },
            {
              type: 'emit-host-event',
              eventName: 'changed',
              payload: {
                kind: 'object',
                properties: { total: { kind: 'variable', name: 'total' } },
              },
            },
          ],
        },
        {
          id: 'r2',
          trigger: { type: 'material-event', componentId: 'b', eventName: 'click' },
          actions: [
            {
              type: 'host-action',
              actionId: 'act',
              payload: { kind: 'array', items: [{ kind: 'variable', name: 'nested' }] },
            },
          ],
        },
      ],
    });

    const referenced = referencedVariableNames(source);
    expect(referenced.has('count')).toBe(true);
    expect(referenced.has('total')).toBe(true);
    expect(referenced.has('nested')).toBe(true);
  });

  it('detects duplicate variable names with an exception index', () => {
    const variables: readonly ScreenVariable[] = [
      { type: 'static', name: 'a', value: 1 },
      { type: 'static', name: 'b', value: 2 },
    ];

    expect(isVariableNameTaken(variables, 'a')).toBe(true);
    expect(isVariableNameTaken(variables, 'c')).toBe(false);
    // 重命名场景：自身不算冲突
    expect(isVariableNameTaken(variables, 'a', 0)).toBe(false);
  });

  it('builds a replace-variables command applied as a single transaction', () => {
    const variables: readonly ScreenVariable[] = [
      { type: 'static', name: 'region', value: 'north' },
    ];
    const source = document([{ type: 'static', name: 'region', value: 'south' }]);

    const result = buildReplaceVariablesCommand(variables);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const applied = applyScreenDocumentTransaction(source, { commands: [result.value] });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.document.variables).toEqual(variables);
  });

  it('rejects more than 1000 variables with a diagnostic', () => {
    const variables = Array.from({ length: 1001 }, (_, index) => ({
      type: 'static' as const,
      name: `v${index}`,
      value: index,
    }));
    const result = buildReplaceVariablesCommand(variables);
    expect(result.ok).toBe(false);
  });
});
