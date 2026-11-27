import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { simulateScreenBlueprint } from '../../src/index.js';
import { makeComponent, makeDocument, makeVariable } from '../__fixtures__/document.js';

/** 级联模拟（ADR-0115 D6）：变量级联、显隐、数据源参数变化与级联上限。 */

function filterDocument(): ScreenDocument {
  return makeDocument({
    components: [
      makeComponent({ id: 'lines' }),
      makeComponent({
        id: 'alarms',
        dataValue: { kind: 'data-source-field', dataSourceId: 'alarms', path: [] },
      }),
      makeComponent({ id: 'detail', status: { locked: false, hidden: true } }),
    ],
    variables: [
      makeVariable({ id: 'line', name: 'line', initialValue: 'LINE-A' }),
      makeVariable({ id: 'echo', name: 'echo' }),
    ],
    dataSources: [
      {
        id: 'alarms',
        name: 'alarms',
        source: { kind: 'dataset', datasetId: 'monitor.alarms' },
        params: { line: { kind: 'variable', variableId: 'line' } },
      },
    ],
    blueprint: {
      nodes: [
        { kind: 'component', id: 'n-lines', componentId: 'lines' },
        { kind: 'component', id: 'n-detail', componentId: 'detail' },
        { kind: 'variable', id: 'n-line', variableId: 'line' },
        { kind: 'variable', id: 'n-echo', variableId: 'echo' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'e-set',
          from: { node: 'n-lines', port: 'event:rowClick' },
          to: { node: 'n-line', port: 'set' },
          value: { kind: 'event-payload', path: ['row', 'line'] },
        },
        {
          kind: 'flow',
          id: 'e-show',
          from: { node: 'n-lines', port: 'event:rowClick' },
          to: { node: 'n-detail', port: 'show' },
        },
        // 变量改变后的级联：line 的 data-updated 把新值抄进 echo。
        {
          kind: 'flow',
          id: 'e-echo',
          from: { node: 'n-line', port: 'data-updated' },
          to: { node: 'n-echo', port: 'set' },
          value: { kind: 'event-payload', path: [] },
        },
      ],
    },
  });
}

describe('simulateScreenBlueprint', () => {
  it('follows variable cascades and reports what changed at the end', () => {
    const result = simulateScreenBlueprint(filterDocument(), {
      componentId: 'lines',
      name: 'rowClick',
      payload: { rowIndex: 1, row: { line: 'LINE-B' } },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const simulation = result.value;
    expect(simulation.failure).toBeUndefined();
    expect(simulation.dispatches.map((item) => item.depth)).toEqual([0, 1, 2]);
    expect(simulation.variables).toMatchObject({ line: 'LINE-B', echo: 'LINE-B' });
    expect([...simulation.changedVariableIds].sort()).toEqual(['echo', 'line']);
    expect(simulation.visibility).toEqual({ detail: true });
    expect(simulation.dataSourceChanges).toEqual({
      alarms: { line: { before: 'LINE-A', after: 'LINE-B' } },
    });
  });

  it('reports no parameter change when the clicked row has the current value', () => {
    const result = simulateScreenBlueprint(filterDocument(), {
      componentId: 'lines',
      name: 'rowClick',
      payload: { rowIndex: 0, row: { line: 'LINE-A' } },
    });
    if (!result.ok) throw new Error('simulate');
    expect(result.value.dataSourceChanges).toEqual({});
    expect(result.value.changedVariableIds).toEqual([]);
  });

  it('stops a cascade that never settles', () => {
    const document = makeDocument({
      variables: [makeVariable({ id: 'a', name: 'a', initialValue: 0 })],
      blueprint: {
        nodes: [{ kind: 'variable', id: 'n-a', variableId: 'a' }],
        edges: [
          {
            kind: 'flow',
            id: 'e-loop',
            from: { node: 'n-a', port: 'data-updated' },
            to: { node: 'n-a', port: 'set' },
            // 每次写入一个和当前不同的值：写 [当前值]，永远在变。
            value: { kind: 'array', items: [{ kind: 'event-payload', path: [] }] },
          },
        ],
      },
    });
    const result = simulateScreenBlueprint(document, {
      type: 'variable-event',
      variableId: 'a',
      name: 'data-updated',
      payload: 1,
    });
    if (!result.ok) throw new Error('simulate');
    expect(result.value.failure?.kind).toBe('depth-exceeded');
  });
});
