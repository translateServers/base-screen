import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerBlueprintCanvasBridge } from '../../../../src/browser/controllers/blueprint/designer-blueprint-canvas-bridge.js';
import { buildDesignerBlueprintGraph } from '../../../../src/common/operations/blueprint/designer-blueprint-model.js';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
  EMPTY_BLUEPRINT_CANVAS_SELECTION,
} from '../../../../src/common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

function component(id: string, index: number): ScreenDocument['components'][number] {
  return {
    id,
    type: 'base.button',
    name: id,
    parentId: null,
    position: { x: index * 20, y: 0 },
    size: { width: 10, height: 10 },
    rotation: 0,
    zIndex: index,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

/** 点击 → 条件(level = high) → 满足：设置 selected，并显示 detail；selected 值更新 → 隐藏 other。 */
function fixture(): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components: [component('source', 0), component('detail', 1), component('other', 2)],
    variables: [{ type: 'static', id: 'selected', name: 'selected', initialValue: null }],
    blueprint: {
      nodes: [
        { kind: 'component', id: 'component:source', componentId: 'source' },
        {
          kind: 'condition',
          id: 'condition-1',
          condition: {
            left: { kind: 'event-payload', path: ['level'] },
            operator: 'eq',
            right: { kind: 'literal', value: 'high' },
          },
        },
        { kind: 'variable', id: 'variable:selected', variableId: 'selected' },
        { kind: 'component', id: 'component:detail', componentId: 'detail' },
        { kind: 'component', id: 'component:other', componentId: 'other' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'judge',
          from: { node: 'component:source', port: 'event:click' },
          to: { node: 'condition-1', port: 'judge' },
        },
        {
          kind: 'flow',
          id: 'set',
          from: { node: 'condition-1', port: 'yes' },
          to: { node: 'variable:selected', port: 'set' },
          value: { kind: 'event-payload', path: ['id'] },
        },
        {
          kind: 'flow',
          id: 'show',
          from: { node: 'condition-1', port: 'yes' },
          to: { node: 'component:detail', port: 'show' },
        },
        {
          kind: 'flow',
          id: 'cascade',
          from: { node: 'variable:selected', port: 'data-updated' },
          to: { node: 'component:other', port: 'hide' },
        },
      ],
    },
  };
}

const catalog = {
  get: () => ({ manifest: { events: ['click'] } }),
} as unknown as BaseScreenMaterialCatalog;
const runtime: BaseScreenRuntimeContributionIndex = {
  getResourceType: () => undefined,
  hasBlueprintCapability: () => true,
};

function harness(initial: ScreenDocument | undefined = fixture()) {
  let document = initial;
  let revision = 0;
  let selection: BaseScreenBlueprintCanvasSelection = EMPTY_BLUEPRINT_CANVAS_SELECTION;
  const host = new EventTarget();
  const canvas = new EventTarget();
  const states: BaseScreenBlueprintCanvasState[] = [];
  canvas.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT, (event) => {
    states.push((event as CustomEvent<{ state: BaseScreenBlueprintCanvasState }>).detail.state);
  });
  const diagnostics = vi.fn();
  const executeCommand = vi.fn((command: ScreenDocumentCommand) => {
    if (command.type === 'replace-blueprint' && document !== undefined) {
      document = { ...document, blueprint: command.blueprint as ScreenDocument['blueprint'] };
      revision++;
    }
    return { ok: true as const, value: document!, diagnostics: [] };
  });
  const bridge: DesignerBlueprintCanvasBridge = new DesignerBlueprintCanvasBridge({
    getDocument: () => document,
    getGraph: () =>
      document === undefined
        ? { nodes: [], edges: [] }
        : buildDesignerBlueprintGraph(document, catalog, runtime, DESIGNER_UI_TEXT.blueprint),
    getMode: () => 'blueprint',
    getSelection: () => selection,
    getShowSemantic: () => true,
    getViewRequest: () => undefined,
    getCatalog: () => catalog,
    getRuntimeContributions: () => runtime,
    getDocumentRevision: () => revision,
    getProjectRevision: () => null,
    canUndo: () => revision > 0,
    canRedo: () => false,
    select: (value) => {
      selection = value;
      return { ok: true, value: null, diagnostics: [] };
    },
    executeCommand,
    undo: () => ({ ok: true, value: document!, diagnostics: [] }),
    redo: () => ({ ok: true, value: document!, diagnostics: [] }),
    render: () => bridge.dispatchState(),
    emitDiagnostics: diagnostics,
  });
  bridge.connect(host as unknown as HTMLElement);
  bridge.setCanvas(canvas as unknown as Element);
  let sequence = 0;
  const send = (
    command: Record<string, unknown> & { readonly type: BaseScreenBlueprintCanvasCommand['type'] },
    overrides: { generation?: number; documentRevision?: number } = {},
  ) => {
    const event = new CustomEvent(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, {
      detail: {
        command: {
          commandId: `c-${++sequence}`,
          generation: overrides.generation ?? 1,
          documentRevision: overrides.documentRevision ?? revision,
          ...command,
        },
      },
    });
    Object.defineProperty(event, 'composedPath', { value: () => [canvas, host] });
    host.dispatchEvent(event);
    return states.at(-1);
  };
  return {
    bridge,
    send,
    states,
    diagnostics,
    executeCommand,
    get document() {
      return document;
    },
    get selection() {
      return selection;
    },
  };
}

describe('Blueprint canvas state bridge', () => {
  it('accepts the ready handshake before a document is loaded', () => {
    const test = harness(undefined);
    const state = test.send({ type: 'ready' });
    expect(state?.lastCommand).toMatchObject({ status: 'accepted', diagnostics: [] });
    expect(test.diagnostics).not.toHaveBeenCalled();
  });

  it('rejects stale writes but lets selection through, and deduplicates command ids', () => {
    const test = harness();
    const stale = test.send({ type: 'insert-node', kind: 'timer' }, { documentRevision: 9 });
    expect(stale?.lastCommand?.status).toBe('rejected');
    expect(test.executeCommand).not.toHaveBeenCalled();
    const selected = test.send(
      { type: 'select', selection: { nodes: ['condition-1'], edges: [] } },
      { documentRevision: 9 },
    );
    expect(selected?.lastCommand?.status).toBe('accepted');
    expect(test.selection).toEqual({ nodes: ['condition-1'], edges: [] });
    expect(Object.isFrozen(selected)).toBe(true);
    expect(selected?.simulationTriggers).toEqual([
      { nodeId: 'component:source', port: 'event:click', label: 'source · click' },
      { nodeId: 'variable:selected', port: 'data-updated', label: expect.any(String) },
    ]);
  });

  it('connects, inserts, updates, reorders, duplicates and deletes through one document command each', () => {
    const test = harness();
    test.send({
      type: 'connect',
      from: { node: 'condition-1', port: 'no' },
      to: { node: 'component:other', port: 'toggle' },
    });
    const added = test.document?.blueprint.edges.at(-1);
    expect(added).toMatchObject({ kind: 'flow', to: { node: 'component:other', port: 'toggle' } });
    expect(test.selection).toEqual({ nodes: [], edges: [added?.id] });
    test.send({
      type: 'insert-node',
      kind: 'timer',
      intervalSeconds: 30,
      position: { x: 10, y: 20 },
    });
    expect(test.selection.nodes).toEqual(['timer-1']);
    test.send({
      type: 'update-node',
      nodeIds: ['timer-1'],
      update: { type: 'name', name: 'Poll' },
    });
    expect(test.document?.blueprint.nodes.at(-1)).toMatchObject({
      name: 'Poll',
      intervalSeconds: 30,
    });
    test.send({ type: 'reorder-edge', edgeId: 'show', direction: 'earlier' });
    expect(test.document?.blueprint.edges.map((edge) => edge.id).slice(1, 3)).toEqual([
      'show',
      'set',
    ]);
    test.send({ type: 'duplicate-nodes', nodeIds: ['condition-1'] });
    expect(test.selection.nodes).toEqual(['condition-2']);
    test.send({ type: 'delete-selection', selection: { nodes: ['condition-2'], edges: [] } });
    expect(test.document?.blueprint.nodes.some((node) => node.id === 'condition-2')).toBe(false);
    const invalid = test.send({
      type: 'connect',
      from: { node: 'component:detail', port: 'show' },
      to: { node: 'component:other', port: 'show' },
    });
    expect(invalid?.lastCommand?.status).toBe('rejected');
    expect(test.diagnostics).toHaveBeenCalled();
  });

  it('simulates depth first with condition branches and variable cascades', () => {
    const test = harness();
    const passed = test.send({
      type: 'run-simulation',
      nodeId: 'component:source',
      port: 'event:click',
      payload: { level: 'high', id: 7 },
    });
    expect(passed?.trace?.executedEdgeIds).toEqual(['judge', 'set', 'show', 'cascade']);
    expect(passed?.trace?.steps.map((step) => [step.kind, step.depth])).toEqual([
      ['trigger', 0],
      ['condition', 1],
      ['action', 2],
      ['action', 2],
      ['cascade', 1],
      ['action', 2],
    ]);
    expect(passed?.trace?.visitedNodeIds).toEqual(
      expect.arrayContaining([
        'component:source',
        'condition-1',
        'variable:selected',
        'component:other',
      ]),
    );
    const failed = test.send({
      type: 'run-simulation',
      nodeId: 'component:source',
      port: 'event:click',
      payload: { level: 'low' },
    });
    expect(failed?.trace?.executedEdgeIds).toEqual(['judge']);
    expect(failed?.trace?.steps.find((step) => step.kind === 'condition')?.passed).toBe(false);
    const cleared = test.send({ type: 'clear-simulation' });
    expect(cleared?.trace).toBeNull();
    expect(test.executeCommand).not.toHaveBeenCalled();
  });
});
