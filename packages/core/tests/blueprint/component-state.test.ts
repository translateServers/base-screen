import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  traceScreenBlueprintEvent,
} from '../../src/blueprint/runtime.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

function stateDocument(): ScreenDocument {
  return makeDocument({
    components: [
      makeComponent({ id: 'stop' }),
      makeComponent({
        id: 'light',
        states: { items: [{ id: 'halt', name: '停机', style: { fillColor: '#555555' } }] },
      }),
      makeComponent({ id: 'log' }),
    ],
    blueprint: {
      nodes: [
        { kind: 'component', id: 'stop-node', componentId: 'stop' },
        { kind: 'component', id: 'light-node', componentId: 'light' },
        { kind: 'component', id: 'log-node', componentId: 'log' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'set',
          from: { node: 'stop-node', port: 'event:click' },
          to: { node: 'light-node', port: 'set-state' },
          stateId: 'halt',
        },
        {
          kind: 'flow',
          id: 'reset',
          from: { node: 'stop-node', port: 'event:dblclick' },
          to: { node: 'light-node', port: 'reset-state' },
        },
        {
          kind: 'flow',
          id: 'changed',
          from: { node: 'light-node', port: 'state-changed' },
          to: { node: 'log-node', port: 'request-data' },
        },
      ],
    },
  });
}

describe('blueprint component states (ADR-0110)', () => {
  it('emits state effects and traces them', () => {
    const compiled = compileScreenBlueprint(stateDocument());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const click = {
      type: 'material-event',
      componentId: 'stop',
      name: 'click',
      payload: null,
    } as const;
    const set = dispatchScreenBlueprintEvent(compiled.value, {}, click);
    expect(set.ok && set.value.stateEffects).toEqual([
      { componentId: 'light', operation: 'set', stateId: 'halt' },
    ]);
    const reset = dispatchScreenBlueprintEvent(
      compiled.value,
      {},
      {
        ...click,
        name: 'dblclick',
      },
    );
    expect(reset.ok && reset.value.stateEffects).toEqual([
      { componentId: 'light', operation: 'reset' },
    ]);
    const traced = traceScreenBlueprintEvent(compiled.value, {}, click);
    expect(traced.ok && traced.value.ruleTraces[0]?.actions[0]).toMatchObject({
      type: 'component-state',
      edgeId: 'set',
      componentId: 'light',
      stateId: 'halt',
    });
  });

  it('matches state-changed events by component id', () => {
    const compiled = compileScreenBlueprint(stateDocument());
    if (!compiled.ok) throw new Error('fixture must compile');
    const event = (componentId: string) =>
      ({
        type: 'component-state-changed',
        componentId,
        name: 'state-changed',
        payload: { from: 'default', to: 'halt', cause: 'blueprint' },
      }) as const;
    const light = dispatchScreenBlueprintEvent(compiled.value, {}, event('light'));
    expect(light.ok && light.value.componentDataRequests).toEqual(['log']);
    const other = dispatchScreenBlueprintEvent(compiled.value, {}, event('stop'));
    expect(other.ok && other.value.componentDataRequests).toEqual([]);
  });
});
