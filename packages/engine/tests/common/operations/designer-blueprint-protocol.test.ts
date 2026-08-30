import { describe, expect, it } from 'vitest';
import { parseBaseScreenBlueprintCanvasCommand } from '../../../src/common/operations/designer-blueprint-protocol.js';

const base = { commandId: 'command-1', generation: 2, documentRevision: 3 } as const;

describe('Blueprint canvas command protocol', () => {
  it('parses every bounded command family as a strict discriminated union', () => {
    const commands = [
      { ...base, type: 'ready' },
      { ...base, type: 'select', selection: { kind: 'node', id: 'component:a' } },
      {
        ...base,
        type: 'connect',
        sourceNodeId: 'component:a',
        sourceHandle: 'event:click',
        targetNodeId: 'component:b',
        targetHandle: 'visibility:show',
      },
      { ...base, type: 'delete-selection', selection: { kind: 'edge', id: 'edge:r:action:0' } },
      { ...base, type: 'insert-node', kind: 'condition' },
      { ...base, type: 'commit-layout', nodes: [{ id: 'component:a', x: 12.345, y: -6 }] },
      { ...base, type: 'commit-viewport', viewport: { x: 0, y: 0, zoom: 1 } },
      { ...base, type: 'history-undo' },
      { ...base, type: 'history-redo' },
      {
        ...base,
        type: 'run-simulation',
        componentId: 'a',
        eventName: 'click',
        payload: { id: 1 },
      },
    ];
    for (const command of commands)
      expect(parseBaseScreenBlueprintCanvasCommand(command).ok).toBe(true);
  });

  it('fails closed for unknown fields, stale-shaped values and out-of-range geometry', () => {
    expect(
      parseBaseScreenBlueprintCanvasCommand({ ...base, type: 'ready', callback: true }).ok,
    ).toBe(false);
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        ...base,
        type: 'commit-viewport',
        viewport: { x: 0, y: 0, zoom: 9 },
      }).ok,
    ).toBe(false);
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        ...base,
        type: 'commit-layout',
        nodes: [{ id: 'a', x: Number.POSITIVE_INFINITY, y: 0 }],
      }).ok,
    ).toBe(false);
  });
});
