import type { ScreenBlueprint, ScreenBlueprintFlowEdge } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  connectDesignerBlueprintPorts,
  updateDesignerBlueprintEdge,
} from '../../../../src/common/operations/blueprint/designer-blueprint-graph.js';

const blueprint: ScreenBlueprint = {
  nodes: [
    { kind: 'lifecycle', id: 'ready' },
    { kind: 'sub-canvas', id: 'p', canvasId: 'detail' },
  ],
  edges: [],
};

const context = { isEventAvailable: () => true, isHostActionAvailable: () => true };

function flowEdge(graph: ScreenBlueprint, id: string): ScreenBlueprintFlowEdge {
  const edge = graph.edges.find((candidate) => candidate.id === id);
  if (edge?.kind !== 'flow') throw new Error('flow edge expected');
  return edge;
}

describe('sub-canvas edge parameters (ADR-0109, ADR-0108 §2.5)', () => {
  it('connects without parameters, toggles them on and off, and drops them on close', () => {
    const connected = connectDesignerBlueprintPorts(
      blueprint,
      { node: 'ready', port: 'ready' },
      { node: 'p', port: 'open' },
      context,
    );
    if (!connected.ok) throw new Error('must connect');
    expect(flowEdge(connected.blueprint, connected.edgeId).payload).toBeUndefined();

    const withPayload = updateDesignerBlueprintEdge(connected.blueprint, connected.edgeId, {
      type: 'payload',
      payload: { kind: 'literal', value: { id: 1 } },
    });
    expect(withPayload && flowEdge(withPayload, connected.edgeId).payload).toEqual({
      kind: 'literal',
      value: { id: 1 },
    });

    const toggled = updateDesignerBlueprintEdge(withPayload!, connected.edgeId, {
      type: 'target-port',
      port: 'toggle',
    });
    expect(toggled && flowEdge(toggled, connected.edgeId).payload).toEqual({
      kind: 'literal',
      value: { id: 1 },
    });

    const closed = updateDesignerBlueprintEdge(withPayload!, connected.edgeId, {
      type: 'target-port',
      port: 'close',
    });
    expect(closed && flowEdge(closed, connected.edgeId).payload).toBeUndefined();
    expect(
      updateDesignerBlueprintEdge(closed!, connected.edgeId, {
        type: 'payload',
        payload: { kind: 'literal', value: 1 },
      }),
    ).toBeNull();

    const cleared = updateDesignerBlueprintEdge(withPayload!, connected.edgeId, {
      type: 'payload',
      payload: null,
    });
    expect(cleared && flowEdge(cleared, connected.edgeId).payload).toBeUndefined();
  });
});
