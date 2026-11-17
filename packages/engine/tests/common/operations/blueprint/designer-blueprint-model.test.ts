import type { ScreenBlueprint, ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { connectDesignerBlueprintNodes } from '../../../../src/common/operations/blueprint/designer-blueprint-connection.js';
import {
  buildDesignerBlueprintEventOptions,
  buildDesignerBlueprintGraph,
  commitDesignerBlueprintLayout,
  deleteDesignerBlueprintSelection,
  insertDesignerBlueprintTimerNode,
  updateDesignerBlueprintCondition,
  updateDesignerBlueprintTimerInterval,
} from '../../../../src/common/operations/blueprint/designer-blueprint-model.js';

const document: ScreenDocument = {
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
  variables: [{ type: 'static', id: 'selected', name: 'selected', initialValue: null }],
  blueprint: { relations: [] },
};

const catalog = {
  get: () => ({
    manifest: {
      events: ['click'],
      editorDescriptor: { events: [{ name: 'click', label: 'Click' }] },
    },
  }),
} as unknown as BaseScreenMaterialCatalog;

const runtime: BaseScreenRuntimeContributionIndex = {
  getResourceType: () => undefined,
  hasBlueprintCapability: () => true,
};

describe('shared Blueprint model', () => {
  it('projects catalog events and canonical saved layout', () => {
    const graph = buildDesignerBlueprintGraph(
      {
        ...document,
        blueprint: {
          relations: [],
          layout: { nodes: [{ id: 'component:source', x: 17, y: 29 }] },
        },
      },
      catalog,
      runtime,
    );
    expect(graph.nodes.find((node) => node.id === 'component:source')).toMatchObject({
      x: 17,
      y: 29,
      events: [{ name: 'click', label: 'Click', available: true }],
    });
    expect(graph.nodes.some((node) => node.id === 'variable:selected')).toBe(false);
  });

  it('creates one component relation, adds a condition, and deletes the relation', () => {
    const events = buildDesignerBlueprintEventOptions(document, catalog, runtime);
    const connection = connectDesignerBlueprintNodes(
      document,
      'component:source',
      'event:click',
      'component:target',
      'relation:in',
      events,
    );
    expect(connection.ok).toBe(true);
    if (!connection.ok) return;
    const relation = connection.blueprint.relations[0]!;
    expect(relation.type).toBe('behavior');

    const withCondition = updateDesignerBlueprintCondition(connection.blueprint, relation.id, {
      left: { kind: 'event-payload', path: [] },
      operator: 'exists',
    });
    expect(withCondition).not.toBeNull();
    const projection = buildDesignerBlueprintGraph(
      { ...document, blueprint: withCondition! },
      catalog,
      runtime,
    );
    const edge = projection.edges.find((candidate) => candidate.relationId === relation.id);
    expect(edge).toMatchObject({
      kind: 'relation',
      effectType: 'component-visibility',
      eventName: 'click',
    });
    const removed = deleteDesignerBlueprintSelection(withCondition!, {
      kind: 'edge',
      id: `relation:${relation.id}`,
    });
    expect(removed?.relations).toEqual([]);
  });

  it('commits layout atomically while retaining an existing viewport', () => {
    const blueprint = commitDesignerBlueprintLayout(
      { relations: [], layout: { nodes: [], viewport: { x: 4, y: 8, zoom: 1.2 } } },
      [{ id: 'component:source', x: 20, y: 30 }],
    );
    expect(blueprint.layout).toEqual({
      nodes: [{ id: 'component:source', x: 20, y: 30 }],
      viewport: { x: 4, y: 8, zoom: 1.2 },
    });
  });
});

describe('instance source nodes (lifecycle / timer)', () => {
  const relations: ScreenBlueprint['relations'] = [
    {
      type: 'behavior',
      id: 'ready-hide',
      source: { kind: 'lifecycle', event: { type: 'lifecycle', eventName: 'ready' } },
      target: { kind: 'component', componentId: 'target' },
      effect: { type: 'component-visibility', operation: 'hide' },
    },
    {
      type: 'behavior',
      id: 'tick-show',
      source: {
        kind: 'timer',
        intervalSeconds: 5,
        event: { type: 'timer', eventName: 'tick' },
      },
      target: { kind: 'component', componentId: 'target' },
      effect: { type: 'component-visibility', operation: 'show' },
    },
  ];

  it('projects lifecycle and timer nodes with their relation edges', () => {
    const graph = buildDesignerBlueprintGraph(
      { ...document, blueprint: { relations } },
      catalog,
      runtime,
    );
    expect(graph.nodes.find((node) => node.id === 'lifecycle')).toMatchObject({
      kind: 'lifecycle',
    });
    expect(graph.nodes.find((node) => node.id === 'timer:5')).toMatchObject({
      kind: 'timer',
      intervalSeconds: 5,
      outboundCount: 1,
    });
    expect(
      graph.edges.some((edge) => edge.source === 'lifecycle' && edge.kind === 'relation'),
    ).toBe(true);
    expect(graph.edges.some((edge) => edge.source === 'timer:5' && edge.kind === 'relation')).toBe(
      true,
    );
  });

  it('keeps pinned instance nodes even without relations', () => {
    const graph = buildDesignerBlueprintGraph(
      {
        ...document,
        blueprint: {
          relations: [],
          layout: {
            nodes: [
              { id: 'lifecycle', x: 9, y: 9 },
              { id: 'timer:30', x: 9, y: 99 },
            ],
          },
        },
      },
      catalog,
      runtime,
    );
    expect(graph.nodes.some((node) => node.id === 'lifecycle')).toBe(true);
    expect(graph.nodes.find((node) => node.id === 'timer:30')).toMatchObject({
      intervalSeconds: 30,
    });
  });

  it('connects instance sources and rejects duplicates or wrong handles', () => {
    const first = connectDesignerBlueprintNodes(
      { ...document, blueprint: { relations: [] } },
      'lifecycle',
      'event:ready',
      'component:target',
      'relation:in',
      [],
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const withLifecycle = { ...document, blueprint: first.blueprint };
    expect(
      connectDesignerBlueprintNodes(
        withLifecycle,
        'lifecycle',
        'event:ready',
        'component:target',
        'relation:in',
        [],
      ),
    ).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(
      connectDesignerBlueprintNodes(
        withLifecycle,
        'timer:5',
        'event:tick',
        'component:target',
        'relation:in',
        [],
      ).ok,
    ).toBe(true);
    expect(
      connectDesignerBlueprintNodes(
        withLifecycle,
        'lifecycle',
        'event:tick',
        'component:target',
        'relation:in',
        [],
      ),
    ).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('inserts timer nodes, keeps interval edits in sync, and rejects collisions', () => {
    const inserted = insertDesignerBlueprintTimerNode(document.blueprint, 5);
    if (inserted === null) throw new Error('insert 5 failed');
    const withBoth = insertDesignerBlueprintTimerNode(inserted, 30);
    if (withBoth === null) throw new Error('insert 30 failed');
    const connected = connectDesignerBlueprintNodes(
      { ...document, blueprint: withBoth },
      'timer:5',
      'event:tick',
      'component:target',
      'relation:in',
      [],
    );
    if (!connected.ok) throw new Error('connect failed');
    const updated = updateDesignerBlueprintTimerInterval(connected.blueprint, 5, 20);
    expect(updated).not.toBeNull();
    if (updated === null) return;
    expect(updated.layout?.nodes.map((node) => node.id)).toEqual(['timer:20', 'timer:30']);
    expect(updated.relations[0]).toMatchObject({
      source: { kind: 'timer', intervalSeconds: 20 },
    });
    expect(updateDesignerBlueprintTimerInterval(updated, 20, 30)).toBeNull();
    const removed = deleteDesignerBlueprintSelection(updated, { kind: 'node', id: 'timer:20' });
    expect(removed?.relations).toEqual([]);
    expect(removed?.layout?.nodes.map((node) => node.id)).toEqual(['timer:30']);
  });
});
