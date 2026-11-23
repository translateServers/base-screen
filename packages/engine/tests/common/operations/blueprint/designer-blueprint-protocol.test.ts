import { describe, expect, it } from 'vitest';
import { parseBaseScreenBlueprintCanvasCommand } from '../../../../src/common/operations/blueprint/designer-blueprint-protocol.js';

const base = { commandId: 'command-1', generation: 2, documentRevision: 3 } as const;

describe('Blueprint canvas command protocol', () => {
  it('parses every bounded command family as a strict discriminated union', () => {
    const commands = [
      { ...base, type: 'ready' },
      { ...base, type: 'select', selection: { nodes: ['component:a'], edges: [] } },
      {
        ...base,
        type: 'connect',
        from: { node: 'component:a', port: 'event:click' },
        to: { node: 'component:b', port: 'show' },
      },
      { ...base, type: 'delete-selection', selection: { nodes: [], edges: ['edge-1'] } },
      { ...base, type: 'insert-node', kind: 'host' },
      { ...base, type: 'insert-node', kind: 'lifecycle' },
      { ...base, type: 'insert-node', kind: 'condition', position: { x: 1, y: 2 } },
      { ...base, type: 'insert-node', kind: 'timer', intervalSeconds: 30 },
      {
        ...base,
        type: 'update-node',
        nodeIds: ['timer-1'],
        update: { type: 'interval', intervalSeconds: 5 },
      },
      {
        ...base,
        type: 'update-node',
        nodeIds: ['a', 'b'],
        update: { type: 'enabled', enabled: false },
      },
      {
        ...base,
        type: 'update-node',
        nodeIds: ['condition-1'],
        update: { type: 'name', name: null },
      },
      { ...base, type: 'reorder-edge', edgeId: 'edge-1', direction: 'later' },
      { ...base, type: 'duplicate-nodes', nodeIds: ['condition-1'] },
      { ...base, type: 'commit-layout', nodes: [{ id: 'component:a', x: 12.345, y: -6 }] },
      { ...base, type: 'commit-viewport', viewport: { x: 0, y: 0, zoom: 1 } },
      { ...base, type: 'history-undo' },
      { ...base, type: 'history-redo' },
      { ...base, type: 'clear-simulation' },
      {
        ...base,
        type: 'run-simulation',
        nodeId: 'component:a',
        port: 'event:click',
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
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        ...base,
        type: 'insert-node',
        kind: 'timer',
        intervalSeconds: 0,
      }).ok,
    ).toBe(false);
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        ...base,
        type: 'insert-node',
        kind: 'lifecycle',
        intervalSeconds: 5,
      }).ok,
    ).toBe(false);
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        ...base,
        type: 'select',
        selection: { kind: 'node', id: 'component:a' },
      }).ok,
    ).toBe(false);
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        ...base,
        type: 'connect',
        from: { node: 'a', port: 'Not A Port' },
        to: { node: 'b', port: 'show' },
      }).ok,
    ).toBe(false);
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        ...base,
        type: 'delete-selection',
        selection: { nodes: [], edges: [] },
      }).ok,
    ).toBe(false);
  });
});
