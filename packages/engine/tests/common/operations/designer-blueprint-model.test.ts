import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  buildDesignerBlueprintEventOptions,
  buildDesignerBlueprintGraph,
  commitDesignerBlueprintLayout,
  createDesignerVisibilityRule,
  deleteDesignerBlueprintSelection,
  insertDesignerBlueprintNode,
} from '../../../src/common/operations/designer-blueprint-model.js';

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
  variables: [{ type: 'static', name: 'selected', value: null }],
  blueprint: { rules: [] },
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
  it('projects catalog events and canonical saved layout without Vue Flow dependencies', () => {
    const graph = buildDesignerBlueprintGraph(
      {
        ...document,
        blueprint: {
          rules: [],
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
  });

  it('constructs, extends and deletes one canonical visibility rule', () => {
    const events = buildDesignerBlueprintEventOptions(document, catalog, runtime);
    const rule = createDesignerVisibilityRule(
      document,
      'source',
      'click',
      'target',
      'show',
      events,
    );
    expect(rule).not.toBeNull();
    const withRule = { ...document, blueprint: { rules: [rule!] } };
    const withCondition = insertDesignerBlueprintNode(withRule, 'condition', rule!.id);
    expect(withCondition?.rules[0]?.condition?.operator).toBe('exists');
    const withNamedVariable = insertDesignerBlueprintNode(
      {
        ...withRule,
        variables: [
          ...withRule.variables,
          { type: 'static' as const, name: 'alternate', value: 1 },
        ],
      },
      'set-variable',
      rule!.id,
      'alternate',
    );
    expect(withNamedVariable?.rules[0]?.actions.at(-1)).toMatchObject({
      type: 'set-variable',
      variableName: 'alternate',
    });
    const projection = buildDesignerBlueprintGraph(
      { ...document, blueprint: withCondition! },
      catalog,
      runtime,
    );
    expect(projection.nodes.find((node) => node.kind === 'condition')?.summary).toEqual({
      kind: 'condition',
      primary: 'event.*',
      secondary: 'exists',
    });
    const removed = deleteDesignerBlueprintSelection(withCondition!, {
      kind: 'edge',
      id: `edge:${rule!.id}:action:0`,
    });
    expect(removed?.rules).toEqual([]);
  });

  it('commits layout atomically while retaining an existing viewport', () => {
    const blueprint = commitDesignerBlueprintLayout(
      { rules: [], layout: { nodes: [], viewport: { x: 4, y: 8, zoom: 1.2 } } },
      [{ id: 'component:source', x: 20, y: 30 }],
    );
    expect(blueprint.layout).toEqual({
      nodes: [{ id: 'component:source', x: 20, y: 30 }],
      viewport: { x: 4, y: 8, zoom: 1.2 },
    });
  });
});
