import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerBlueprintCanvasBridge } from '../../../src/browser/controllers/designer-blueprint-canvas-bridge.js';
import { buildDesignerBlueprintGraph } from '../../../src/common/operations/designer-blueprint-model.js';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
} from '../../../src/common/operations/designer-blueprint-protocol.js';

function fixture(): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components: ['source', 'target'].map((id, index) => ({
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
    })),
    variables: [],
    blueprint: {
      rules: [],
      layout: {
        nodes: [
          { id: 'component:source', x: 0, y: 0 },
          { id: 'component:target', x: 200, y: 0 },
        ],
      },
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

describe('Blueprint canvas state bridge', () => {
  it('accepts the canvas ready handshake before a document is loaded', () => {
    const host = new EventTarget();
    const canvas = new EventTarget();
    const diagnostics = vi.fn();
    const states: BaseScreenBlueprintCanvasState[] = [];
    canvas.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT, (event) => {
      states.push((event as CustomEvent<{ state: BaseScreenBlueprintCanvasState }>).detail.state);
    });
    let bridge: DesignerBlueprintCanvasBridge;
    bridge = new DesignerBlueprintCanvasBridge({
      getDocument: () => undefined,
      getGraph: () => ({ nodes: [], edges: [] }),
      getMode: () => 'canvas',
      getSelection: () => null,
      getViewRequest: () => undefined,
      getCatalog: () => undefined,
      getRuntimeContributions: () => undefined,
      getDocumentRevision: () => 0,
      getProjectRevision: () => null,
      canUndo: () => false,
      canRedo: () => false,
      select: () => ({ ok: true, value: null, diagnostics: [] }),
      executeCommand: () => {
        throw new Error('ready must not execute a document command');
      },
      undo: () => {
        throw new Error('ready must not undo');
      },
      redo: () => {
        throw new Error('ready must not redo');
      },
      render: () => bridge.dispatchState(),
      emitDiagnostics: diagnostics,
    });
    bridge.connect(host as unknown as HTMLElement);
    bridge.setCanvas(canvas as unknown as Element);

    host.dispatchEvent(
      canvasCommandEvent(
        {
          type: 'ready',
          commandId: 'ready-before-load',
          generation: 1,
          documentRevision: 0,
        },
        canvas,
        host,
      ),
    );

    expect(states.at(-1)?.lastCommand).toEqual({
      commandId: 'ready-before-load',
      status: 'accepted',
      diagnostics: [],
    });
    expect(diagnostics).not.toHaveBeenCalled();
    bridge.disconnect();
  });

  it('guards revision/generation, deduplicates commands and emits frozen authoritative state', () => {
    let document = fixture();
    let revision = 0;
    let selection: BaseScreenBlueprintCanvasSelection = null;
    const host = new EventTarget();
    const canvas = new EventTarget();
    const states: BaseScreenBlueprintCanvasState[] = [];
    canvas.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT, (event) => {
      states.push((event as CustomEvent<{ state: BaseScreenBlueprintCanvasState }>).detail.state);
    });
    const executeCommand = vi.fn((command) => {
      if (command.type === 'replace-blueprint') {
        document = { ...document, blueprint: command.blueprint };
        revision++;
      }
      return { ok: true as const, value: document, diagnostics: [] };
    });
    let bridge: DesignerBlueprintCanvasBridge;
    bridge = new DesignerBlueprintCanvasBridge({
      getDocument: () => document,
      getGraph: () => buildDesignerBlueprintGraph(document, catalog, runtime),
      getMode: () => 'blueprint',
      getSelection: () => selection,
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
      undo: () => ({ ok: true, value: document, diagnostics: [] }),
      redo: () => ({ ok: true, value: document, diagnostics: [] }),
      render: () => bridge.dispatchState(),
      emitDiagnostics: () => {},
    });
    bridge.connect(host as unknown as HTMLElement);
    bridge.setCanvas(canvas as unknown as Element);

    const command: BaseScreenBlueprintCanvasCommand = {
      type: 'connect',
      commandId: 'connect-1',
      generation: 1,
      documentRevision: 0,
      sourceNodeId: 'component:source',
      sourceHandle: 'event:click',
      targetNodeId: 'component:target',
      targetHandle: 'visibility:show',
    };
    host.dispatchEvent(canvasCommandEvent(command, canvas, host));
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(document.blueprint.rules).toHaveLength(1);
    expect(states.at(-1)?.lastCommand).toMatchObject({
      commandId: 'connect-1',
      status: 'accepted',
    });
    expect(Object.isFrozen(states.at(-1))).toBe(true);
    expect(Object.isFrozen(states.at(-1)?.graph.nodes)).toBe(true);

    host.dispatchEvent(canvasCommandEvent(command, canvas, host));
    expect(executeCommand).toHaveBeenCalledTimes(1);

    host.dispatchEvent(canvasCommandEvent({ ...command, commandId: 'stale-1' }, canvas, host));
    expect(states.at(-1)?.lastCommand?.status).toBe('rejected');
    expect(executeCommand).toHaveBeenCalledTimes(1);
    bridge.disconnect();
  });
});

function canvasCommandEvent(
  command: BaseScreenBlueprintCanvasCommand,
  canvas: EventTarget,
  host: EventTarget,
): Event {
  const event = new CustomEvent(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, {
    detail: { command },
  });
  Object.defineProperty(event, 'composedPath', { value: () => [canvas, host] });
  return event;
}
