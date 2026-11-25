import type { ScreenDocument, ScreenSubCanvas } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  traceScreenBlueprintEvent,
} from '../../src/blueprint/runtime.js';
import { applyScreenDocumentTransaction } from '../../src/commands/apply.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

const popup: ScreenSubCanvas = {
  id: 'detail',
  name: 'Detail',
  display: 'popup',
  width: 640,
  height: 400,
  backgroundColor: '#141c2b',
  borderRadius: 8,
  maskColor: 'rgba(0, 0, 0, 0.6)',
  closeOnMaskClick: true,
  closeOnEscape: true,
};
const overview: ScreenSubCanvas = { id: 'overview', name: 'Overview', display: 'page' };
const security: ScreenSubCanvas = { id: 'security', name: 'Security', display: 'page' };

function canvasDocument(): ScreenDocument {
  return makeDocument({
    subCanvases: [overview, security, popup],
    components: [
      makeComponent({ id: 'table', canvasId: 'overview' }),
      makeComponent({ id: 'panel', canvasId: 'detail' }),
      makeComponent({ id: 'nav' }),
    ],
    blueprint: {
      nodes: [
        { kind: 'component', id: 'table-node', componentId: 'table' },
        { kind: 'component', id: 'panel-node', componentId: 'panel' },
        { kind: 'component', id: 'nav-node', componentId: 'nav' },
        { kind: 'sub-canvas', id: 'canvas:detail', canvasId: 'detail' },
        { kind: 'sub-canvas', id: 'canvas:security', canvasId: 'security' },
        { kind: 'main-canvas', id: 'main-canvas' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'open',
          from: { node: 'table-node', port: 'event:rowClick' },
          to: { node: 'canvas:detail', port: 'open' },
        },
        {
          kind: 'flow',
          id: 'toggle',
          from: { node: 'table-node', port: 'event:rowClick' },
          to: { node: 'canvas:detail', port: 'toggle' },
        },
        {
          kind: 'flow',
          id: 'opened',
          from: { node: 'canvas:detail', port: 'opened' },
          to: { node: 'panel-node', port: 'request-data' },
        },
        {
          kind: 'flow',
          id: 'goto',
          from: { node: 'nav-node', port: 'event:click' },
          to: { node: 'canvas:security', port: 'open' },
        },
        {
          kind: 'flow',
          id: 'next',
          from: { node: 'nav-node', port: 'event:click' },
          to: { node: 'main-canvas', port: 'next' },
        },
        {
          kind: 'flow',
          id: 'changed',
          from: { node: 'main-canvas', port: 'page-changed' },
          to: { node: 'nav-node', port: 'request-data' },
        },
      ],
    },
  });
}

describe('blueprint sub canvases (ADR-0109)', () => {
  it('emits canvas effects in depth-first order and traces them', () => {
    const compiled = compileScreenBlueprint(canvasDocument());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const event = {
      type: 'material-event',
      componentId: 'table',
      name: 'rowClick',
      payload: null,
    } as const;
    const result = dispatchScreenBlueprintEvent(
      compiled.value,
      compiled.value.initialVariables,
      event,
    );
    expect(result.ok && result.value.canvasEffects).toEqual([
      { type: 'canvas-visibility', canvasId: 'detail', operation: 'open' },
      { type: 'canvas-visibility', canvasId: 'detail', operation: 'toggle' },
    ]);
    const traced = traceScreenBlueprintEvent(
      compiled.value,
      compiled.value.initialVariables,
      event,
    );
    expect(traced.ok && traced.value.ruleTraces[0]?.actions.map((action) => action.edgeId)).toEqual(
      ['open', 'toggle'],
    );
  });

  it('emits page navigation after page open in edge order', () => {
    const compiled = compileScreenBlueprint(canvasDocument());
    if (!compiled.ok) throw new Error('fixture must compile');
    const result = dispatchScreenBlueprintEvent(
      compiled.value,
      {},
      { type: 'material-event', componentId: 'nav', name: 'click', payload: null },
    );
    expect(result.ok && result.value.canvasEffects).toEqual([
      { type: 'canvas-visibility', canvasId: 'security', operation: 'open' },
      { type: 'page-navigation', operation: 'next' },
    ]);
  });

  it('matches canvas events by canvas id and page-changed events', () => {
    const compiled = compileScreenBlueprint(canvasDocument());
    if (!compiled.ok) throw new Error('fixture must compile');
    const opened = dispatchScreenBlueprintEvent(
      compiled.value,
      {},
      { type: 'canvas-event', canvasId: 'detail', name: 'opened', payload: null },
    );
    expect(opened.ok && opened.value.componentDataRequests).toEqual(['panel']);
    const closed = dispatchScreenBlueprintEvent(
      compiled.value,
      {},
      { type: 'canvas-event', canvasId: 'detail', name: 'closed', payload: null },
    );
    expect(closed.ok && closed.value.componentDataRequests).toEqual([]);
    const changed = dispatchScreenBlueprintEvent(
      compiled.value,
      {},
      {
        type: 'page-changed',
        name: 'page-changed',
        payload: { from: 'overview', to: 'security' },
      },
    );
    expect(changed.ok && changed.value.componentDataRequests).toEqual(['nav']);
  });

  it('fails closed without the canvas capabilities', () => {
    for (const missing of [
      'blueprint.action.canvas-visibility',
      'blueprint.action.page-navigation',
      'blueprint.trigger.canvas-event',
      'blueprint.trigger.page-changed',
    ]) {
      const compiled = compileScreenBlueprint(canvasDocument(), {
        hasBlueprintCapability: (id) => id !== missing,
      });
      expect(compiled.ok).toBe(false);
    }
  });

  it('replaces sub canvases, keeps or drops the start page and strips ownership on reparent', () => {
    const base = makeDocument({
      components: [makeComponent({ id: 'group' }), makeComponent({ id: 'panel' })],
    });
    const added = applyScreenDocumentTransaction(base, {
      commands: [
        { type: 'replace-sub-canvases', subCanvases: [overview, popup], startCanvasId: 'overview' },
      ],
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.document.subCanvases).toEqual([overview, popup]);
    expect(added.document.startCanvasId).toBe('overview');
    // 起始页改为弹框：缺省 startCanvasId 时随之去掉。
    const demoted = applyScreenDocumentTransaction(added.document, {
      commands: [
        {
          type: 'replace-sub-canvases',
          subCanvases: [{ ...popup, id: 'overview', name: 'Overview' }, popup].slice(0, 1),
        },
      ],
    });
    expect(demoted.ok && 'startCanvasId' in demoted.document).toBe(false);
    const invalidStart = applyScreenDocumentTransaction(added.document, {
      commands: [{ type: 'replace-sub-canvases', subCanvases: [popup], startCanvasId: 'detail' }],
    });
    expect(invalidStart.ok).toBe(false);
    const owned = {
      ...added.document,
      components: added.document.components.map((item) =>
        item.id === 'panel' ? { ...item, canvasId: 'detail' } : item,
      ),
    };
    const reparented = applyScreenDocumentTransaction(owned, {
      commands: [{ type: 'reparent-components', componentIds: ['panel'], parentId: 'group' }],
    });
    expect(reparented.ok).toBe(true);
    if (reparented.ok) {
      expect(reparented.document.components.find((item) => item.id === 'panel')).not.toHaveProperty(
        'canvasId',
      );
    }
    const removed = applyScreenDocumentTransaction(owned, {
      commands: [{ type: 'replace-sub-canvases', subCanvases: [] }],
    });
    // 组件仍归属被删的从画布：文档校验失败关闭。
    expect(removed.ok).toBe(false);
    const cleared = applyScreenDocumentTransaction(added.document, {
      commands: [{ type: 'replace-sub-canvases', subCanvases: [], startCanvasId: null }],
    });
    expect(cleared.ok && 'subCanvases' in cleared.document).toBe(false);
  });

  it('moves root components between canvases and clamps into popups', () => {
    const base = makeDocument({
      subCanvases: [overview, popup],
      components: [
        makeComponent({
          id: 'wide',
          position: { x: 900, y: 600 },
          size: { width: 200, height: 100 },
          belowSubCanvas: true,
        }),
        makeComponent({ id: 'child', parentId: 'wide' }),
      ],
    });
    const toPopup = applyScreenDocumentTransaction(base, {
      commands: [{ type: 'move-components', componentIds: ['wide'], canvasId: 'detail' }],
    });
    expect(toPopup.ok).toBe(true);
    if (!toPopup.ok) return;
    const moved = toPopup.document.components.find((item) => item.id === 'wide');
    expect(moved?.canvasId).toBe('detail');
    expect(moved).not.toHaveProperty('belowSubCanvas');
    expect(moved?.position).toEqual({ x: 440, y: 300 });
    const back = applyScreenDocumentTransaction(toPopup.document, {
      commands: [{ type: 'move-components', componentIds: ['wide'], canvasId: null }],
    });
    expect(back.ok && back.document.components[0]).not.toHaveProperty('canvasId');
    const child = applyScreenDocumentTransaction(base, {
      commands: [{ type: 'move-components', componentIds: ['child'], canvasId: 'overview' }],
    });
    expect(child.ok).toBe(false);
    const unknown = applyScreenDocumentTransaction(base, {
      commands: [{ type: 'move-components', componentIds: ['wide'], canvasId: 'missing' }],
    });
    expect(unknown.ok).toBe(false);
  });

  it('evaluates open parameters against the triggering event', () => {
    const base = canvasDocument();
    const document: ScreenDocument = {
      ...base,
      blueprint: {
        ...base.blueprint,
        edges: base.blueprint.edges.map((edge) =>
          edge.id === 'open' && edge.kind === 'flow'
            ? { ...edge, payload: { kind: 'event-payload', path: ['row'] } }
            : edge,
        ),
      },
    };
    const compiled = compileScreenBlueprint(document);
    if (!compiled.ok) throw new Error('fixture must compile');
    const result = dispatchScreenBlueprintEvent(
      compiled.value,
      {},
      {
        type: 'material-event',
        componentId: 'table',
        name: 'rowClick',
        payload: { row: { id: 3 } },
      },
    );
    expect(result.ok && result.value.canvasEffects[0]).toEqual({
      type: 'canvas-visibility',
      canvasId: 'detail',
      operation: 'open',
      payload: { id: 3 },
    });
  });
});
