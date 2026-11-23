import { describe, expect, it } from 'vitest';
import { deriveScreenBlueprintRules } from '../../src/document/blueprint-graph.js';
import { parseScreenDocument } from '../../src/document/parse.js';
import { resolveScreenStartPageId } from '../../src/document/sub-canvas.js';
import { component, document } from './__fixtures__/document-test-fixtures.js';

const popup = {
  id: 'detail',
  name: '告警详情',
  display: 'popup',
  width: 640,
  height: 400,
  backgroundColor: '#141c2b',
  borderRadius: 8,
  maskColor: 'rgba(0, 0, 0, 0.6)',
  closeOnMaskClick: true,
  closeOnEscape: true,
};

function paths(input: Record<string, unknown>): readonly string[] {
  const parsed = parseScreenDocument(document(input));
  expect(parsed.ok).toBe(false);
  return parsed.ok ? [] : parsed.diagnostics.map((item) => item.path.join('.'));
}

describe('popup sub canvases (ADR-0109)', () => {
  it('parses popup sub canvases, root ownership and sub-canvas blueprint nodes', () => {
    const parsed = parseScreenDocument(
      document({
        subCanvases: [popup],
        components: [
          component({ id: 'table' }),
          component({ id: 'panel', canvasId: 'detail' }),
          component({ id: 'close', parentId: 'panel' }),
        ],
        blueprint: {
          nodes: [
            { kind: 'component', id: 'table-node', componentId: 'table' },
            { kind: 'component', id: 'close-node', componentId: 'close' },
            { kind: 'sub-canvas', id: 'canvas:detail', canvasId: 'detail' },
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
              id: 'close',
              from: { node: 'close-node', port: 'event:click' },
              to: { node: 'canvas:detail', port: 'close' },
            },
            {
              kind: 'flow',
              id: 'opened',
              from: { node: 'canvas:detail', port: 'opened' },
              to: { node: 'table-node', port: 'request-data' },
            },
          ],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rules = deriveScreenBlueprintRules(parsed.value.blueprint);
    expect(rules.map((rule) => rule.id)).toEqual([
      'table-node/event:rowClick',
      'close-node/event:click',
      'canvas:detail/opened',
    ]);
    expect(rules[0]?.steps).toEqual([
      {
        type: 'action',
        edgeId: 'open',
        action: { type: 'canvas-visibility', canvasId: 'detail', operation: 'open' },
      },
    ]);
    expect(rules[0]?.requiredCapabilities).toContain('blueprint.action.canvas-visibility');
    expect(rules[2]?.trigger).toEqual({
      type: 'canvas-event',
      canvasId: 'detail',
      eventName: 'opened',
    });
    expect(rules[2]?.requiredCapabilities).toContain('blueprint.trigger.canvas-event');
  });

  it('fails closed on invalid popup sub canvases', () => {
    expect(paths({ subCanvases: [popup, popup] })).toContain('subCanvases.1.id');
    expect(paths({ subCanvases: [{ ...popup, extra: true }] })).toEqual(['subCanvases.0.extra']);
    expect(paths({ subCanvases: [{ ...popup, width: 0 }] })).toContain('subCanvases.0.width');
    expect(paths({ subCanvases: [{ ...popup, name: '' }] })).toContain('subCanvases.0.name');
    expect(paths({ components: [component({ id: 'a', canvasId: 'missing' })] })).toContain(
      'components.0.canvasId',
    );
    expect(
      paths({
        subCanvases: [popup],
        components: [
          component({ id: 'a', canvasId: 'detail' }),
          component({ id: 'b', parentId: 'a', canvasId: 'detail' }),
        ],
      }),
    ).toContain('components.1.canvasId');
    expect(
      paths({
        blueprint: { nodes: [{ kind: 'sub-canvas', id: 'p', canvasId: 'missing' }], edges: [] },
      }),
    ).toContain('blueprint.nodes.0.canvasId');
    expect(
      paths({
        subCanvases: [popup],
        blueprint: {
          nodes: [
            { kind: 'sub-canvas', id: 'p1', canvasId: 'detail' },
            { kind: 'sub-canvas', id: 'p2', canvasId: 'detail' },
          ],
          edges: [],
        },
      }),
    ).toContain('blueprint.nodes.1.canvasId');
    expect(
      paths({
        subCanvases: [popup],
        blueprint: {
          nodes: [
            { kind: 'lifecycle', id: 'ready' },
            { kind: 'sub-canvas', id: 'p', canvasId: 'detail' },
          ],
          edges: [
            {
              kind: 'flow',
              id: 'bad',
              from: { node: 'ready', port: 'ready' },
              to: { node: 'p', port: 'opened' },
            },
          ],
        },
      }),
    ).toContain('blueprint.edges.0.to.port');
  });

  it('accepts placements and optional open parameters (ADR-0108 §2.5–§2.6 behaviour)', () => {
    const parsed = parseScreenDocument(
      document({
        subCanvases: [{ ...popup, placement: { anchor: 'top-right', offsetX: -24, offsetY: 24 } }],
        components: [component({ id: 'table' })],
        blueprint: {
          nodes: [
            { kind: 'component', id: 'table-node', componentId: 'table' },
            { kind: 'sub-canvas', id: 'p', canvasId: 'detail' },
          ],
          edges: [
            {
              kind: 'flow',
              id: 'open',
              from: { node: 'table-node', port: 'event:rowClick' },
              to: { node: 'p', port: 'open' },
              payload: { kind: 'event-payload', path: ['row'] },
            },
          ],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [rule] = deriveScreenBlueprintRules(parsed.value.blueprint);
    expect(rule?.steps[0]).toMatchObject({
      action: {
        type: 'canvas-visibility',
        operation: 'open',
        payload: { kind: 'event-payload', path: ['row'] },
      },
    });
    expect(rule?.requiredCapabilities).toContain('blueprint.value.event-payload');
    expect(
      paths({
        subCanvases: [{ ...popup, placement: { anchor: 'middle', offsetX: 0, offsetY: 0 } }],
      }),
    ).toContain('subCanvases.0.placement.anchor');
    expect(
      paths({
        subCanvases: [popup],
        blueprint: {
          nodes: [
            { kind: 'lifecycle', id: 'ready' },
            { kind: 'sub-canvas', id: 'p', canvasId: 'detail' },
          ],
          edges: [
            {
              kind: 'flow',
              id: 'close',
              from: { node: 'ready', port: 'ready' },
              to: { node: 'p', port: 'close' },
              payload: { kind: 'literal', value: 1 },
            },
          ],
        },
      }),
    ).toContain('blueprint.edges.0.payload');
  });
});

describe('page sub canvases (ADR-0109)', () => {
  const overview = { id: 'overview', name: '总览', display: 'page' };
  const security = {
    id: 'security',
    name: '安防',
    display: 'page',
    backgroundColor: '#0b1a2a',
    background: { type: 'solid', color: '#0b1a2a' },
  };

  it('parses pages, start page, below-sub-canvas roots and the main canvas node', () => {
    const parsed = parseScreenDocument(
      document({
        subCanvases: [overview, security, popup],
        startCanvasId: 'security',
        components: [
          component({ id: 'frame', belowSubCanvas: true }),
          component({ id: 'nav' }),
          component({ id: 'kpi', canvasId: 'overview' }),
        ],
        blueprint: {
          nodes: [
            { kind: 'component', id: 'nav-node', componentId: 'nav' },
            { kind: 'sub-canvas', id: 'canvas:security', canvasId: 'security' },
            { kind: 'main-canvas', id: 'main-canvas' },
          ],
          edges: [
            {
              kind: 'flow',
              id: 'goto',
              from: { node: 'nav-node', port: 'event:click' },
              to: { node: 'canvas:security', port: 'open' },
              payload: { kind: 'literal', value: { tab: 1 } },
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
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rules = deriveScreenBlueprintRules(parsed.value.blueprint);
    expect(rules[0]?.steps.map((step) => step.type === 'action' && step.action)).toEqual([
      {
        type: 'canvas-visibility',
        canvasId: 'security',
        operation: 'open',
        payload: { kind: 'literal', value: { tab: 1 } },
      },
      { type: 'page-navigation', operation: 'next' },
    ]);
    expect(rules[0]?.requiredCapabilities).toContain('blueprint.action.page-navigation');
    expect(rules[1]?.trigger).toEqual({ type: 'page-changed', eventName: 'page-changed' });
    expect(rules[1]?.requiredCapabilities).toContain('blueprint.trigger.page-changed');
    expect(resolveScreenStartPageId(parsed.value)).toBe('security');
    expect(resolveScreenStartPageId({ subCanvases: [popup, overview] } as never)).toBe('overview');
    expect(resolveScreenStartPageId({ subCanvases: [popup] } as never)).toBeNull();
  });

  it('fails closed on invalid pages, start pages and ownership', () => {
    expect(paths({ subCanvases: [{ ...overview, width: 100 }] })).toEqual(['subCanvases.0.width']);
    expect(paths({ subCanvases: [{ ...overview, display: 'tab' }] })).toContain(
      'subCanvases.0.display',
    );
    expect(paths({ subCanvases: [overview, popup], startCanvasId: 'detail' })).toContain(
      'startCanvasId',
    );
    expect(paths({ startCanvasId: 'missing' })).toContain('startCanvasId');
    expect(
      paths({
        subCanvases: [overview],
        components: [component({ id: 'a', canvasId: 'overview', belowSubCanvas: true })],
      }),
    ).toContain('components.0.belowSubCanvas');
    expect(
      paths({
        components: [
          component({ id: 'a' }),
          component({ id: 'b', parentId: 'a', belowSubCanvas: true }),
        ],
      }),
    ).toContain('components.1.belowSubCanvas');
    expect(paths({ components: [component({ id: 'a', belowSubCanvas: false })] })).toContain(
      'components.0.belowSubCanvas',
    );
    expect(
      paths({
        blueprint: {
          nodes: [
            { kind: 'main-canvas', id: 'm1' },
            { kind: 'main-canvas', id: 'm2' },
          ],
          edges: [],
        },
      }),
    ).toContain('blueprint.nodes.1.kind');
    expect(
      paths({
        blueprint: { nodes: [{ kind: 'main-canvas', id: 'm', canvasId: 'x' }], edges: [] },
      }),
    ).toContain('blueprint.nodes.0.canvasId');
  });
});
