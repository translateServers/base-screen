import type { ScreenDocument } from '@base-screen/contracts';
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
  updateDesignerBlueprintCondition,
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
