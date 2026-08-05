import type { ScreenBlueprint } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { DesignerBlueprintGraphSession } from '../../../src/browser/controllers/designer-blueprint-graph-session.js';

const blueprint: ScreenBlueprint = {
  rules: [
    {
      id: 'rule-1',
      trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
      condition: { left: { kind: 'literal', value: true }, operator: 'exists' },
      actions: [
        { type: 'set-variable', variableName: 'count', value: { kind: 'literal', value: 1 } },
        {
          type: 'emit-host-event',
          eventName: 'updated',
          payload: { kind: 'literal', value: null },
        },
      ],
    },
  ],
};

describe('DesignerBlueprintGraphSession', () => {
  it('R7 projects canonical rules into ordered native graph nodes and edges without mutation', () => {
    const session = new DesignerBlueprintGraphSession();
    const before = structuredClone(blueprint);

    const graph = session.project(blueprint);

    expect(graph).toMatchObject({
      nodes: [
        { id: 'rule-1:trigger', kind: 'trigger', label: 'button-1.click' },
        { id: 'rule-1:condition', kind: 'condition', label: '条件' },
        { id: 'rule-1:action:0', kind: 'action', label: '设置 count' },
        { id: 'rule-1:action:1', kind: 'action', label: '发送 updated' },
      ],
      edges: [
        { from: 'rule-1:trigger', to: 'rule-1:condition' },
        { from: 'rule-1:condition', to: 'rule-1:action:0' },
        { from: 'rule-1:action:0', to: 'rule-1:action:1' },
      ],
    });
    expect(blueprint).toEqual(before);
  });

  it('R8 keeps graph selection, zoom, and cleanup isolated per Designer instance', () => {
    const first = new DesignerBlueprintGraphSession();
    const second = new DesignerBlueprintGraphSession();

    first.selectNode('rule-1:action:0');
    first.setZoom(3);

    expect(first.project(blueprint)).toMatchObject({ selectedNodeId: 'rule-1:action:0', zoom: 2 });
    expect(second.project(blueprint)).toMatchObject({ selectedNodeId: undefined, zoom: 1 });

    first.clear();

    expect(first.project(blueprint)).toMatchObject({ selectedNodeId: undefined, zoom: 1 });
    expect(second.project(blueprint)).toMatchObject({ selectedNodeId: undefined, zoom: 1 });
  });

  it('R7 keeps graph search, diagnostics, and simulation logs in the private session', () => {
    const session = new DesignerBlueprintGraphSession();

    session.setSearchQuery('设置');
    session.setDiagnostics([
      {
        severity: 'error',
        code: 'BLUEPRINT_EXPRESSION_INVALID',
        path: [],
        message: '表达式无效。',
      },
    ]);
    session.appendSimulationLog('模拟 button-1.click：变量 1 项，事件 0 项，动作 0 项。');

    expect(session.project(blueprint)).toMatchObject({
      nodes: [{ id: 'rule-1:action:0' }],
      searchQuery: '设置',
      diagnostics: [{ message: '表达式无效。' }],
      simulationLog: ['模拟 button-1.click：变量 1 项，事件 0 项，动作 0 项。'],
    });
    expect(blueprint).not.toHaveProperty('searchQuery');
  });

  it('R7 navigates the filtered graph nodes with a keyboard-equivalent path', () => {
    const session = new DesignerBlueprintGraphSession();
    session.setSearchQuery('发送');

    session.selectAdjacent(blueprint, 1);

    expect(session.project(blueprint).selectedNodeId).toBe('rule-1:action:1');
  });
});
