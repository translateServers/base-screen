import {
  parseScreenDocument,
  type ScreenBlueprint,
  type ScreenDocument,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  DESIGNER_BLUEPRINT_NODE_BORDER,
  DESIGNER_BLUEPRINT_NODE_HEADER_HEIGHT,
  DESIGNER_BLUEPRINT_NODE_MIN_HEIGHT,
  DESIGNER_BLUEPRINT_NODE_PADDING,
  DESIGNER_BLUEPRINT_NODE_ROW_HEIGHT,
} from '../../../../src/common/operations/blueprint/designer-blueprint-geometry.js';
import {
  buildDesignerBlueprintConnectionContext,
  buildDesignerBlueprintGraph,
  buildDesignerBlueprintSimulationTriggers,
  commitDesignerBlueprintLayout,
  connectDesignerBlueprintPorts,
  deleteDesignerBlueprintSelection,
  duplicateDesignerBlueprintNodes,
  estimateDesignerBlueprintNodeHeight,
  insertDesignerBlueprintNode,
  pruneDesignerBlueprintEntities,
  readDesignerBlueprintEdgeOrder,
  reorderDesignerBlueprintEdge,
  updateDesignerBlueprintEdge,
  updateDesignerBlueprintNode,
} from '../../../../src/common/operations/blueprint/designer-blueprint-model.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

const base: ScreenDocument = {
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
  blueprint: { nodes: [], edges: [] },
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

const context = buildDesignerBlueprintConnectionContext(base, catalog, runtime);

function withBlueprint(blueprint: ScreenBlueprint): ScreenDocument {
  return { ...base, blueprint };
}

function mustParse(blueprint: ScreenBlueprint): ScreenBlueprint {
  const parsed = parseScreenDocument(withBlueprint(blueprint));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.value.blueprint;
}

/** 两个组件节点 + 一个条件节点 + 变量节点，所有插入都必须产出可解析的文档。 */
function seeded(): ScreenBlueprint {
  let document = base;
  for (const spec of [
    { kind: 'component', componentId: 'source' },
    { kind: 'component', componentId: 'target' },
    { kind: 'variable', variableId: 'selected' },
    { kind: 'condition' },
  ] as const) {
    const inserted = insertDesignerBlueprintNode(document, spec);
    if (inserted === null) throw new Error('insert failed');
    document = withBlueprint(mustParse(inserted.blueprint));
  }
  return document.blueprint;
}

function connect(
  blueprint: ScreenBlueprint,
  from: [string, string],
  to: [string, string],
): { blueprint: ScreenBlueprint; edgeId: string } {
  const result = connectDesignerBlueprintPorts(
    blueprint,
    { node: from[0], port: from[1] },
    { node: to[0], port: to[1] },
    context,
  );
  if (!result.ok) throw new Error(result.reason);
  return { blueprint: mustParse(result.blueprint), edgeId: result.edgeId };
}

describe('Blueprint graph operations', () => {
  it('inserts unique entity nodes and repeatable timer / condition nodes', () => {
    const blueprint = seeded();
    expect(blueprint.nodes.map((node) => node.id)).toEqual([
      'component:source',
      'component:target',
      'variable:selected',
      'condition-1',
    ]);
    const again = insertDesignerBlueprintNode(withBlueprint(blueprint), {
      kind: 'component',
      componentId: 'source',
    });
    expect(again?.created).toBe(false);
    expect(again?.nodeId).toBe('component:source');
    const timer = insertDesignerBlueprintNode(
      withBlueprint(blueprint),
      { kind: 'timer' },
      { x: 9, y: 8 },
    );
    expect(timer?.nodeId).toBe('timer-1');
    expect(timer?.blueprint.layout?.nodes).toEqual([{ id: 'timer-1', x: 9, y: 8 }]);
    expect(
      insertDesignerBlueprintNode(withBlueprint(blueprint), {
        kind: 'component',
        componentId: 'ghost',
      }),
    ).toBeNull();
  });

  it('connects ports with default fields and rejects invalid, duplicate and cyclic edges', () => {
    let blueprint = seeded();
    let edge = connect(
      blueprint,
      ['component:source', 'event:click'],
      ['variable:selected', 'set'],
    );
    blueprint = edge.blueprint;
    expect(blueprint.edges.at(-1)).toMatchObject({
      kind: 'flow',
      value: { kind: 'event-payload', path: [] },
    });
    edge = connect(blueprint, ['component:source', 'event:click'], ['component:target', 'show']);
    blueprint = edge.blueprint;
    expect(blueprint.edges.at(-1)).toMatchObject({ transition: { effect: 'fade' } });
    const duplicate = connectDesignerBlueprintPorts(
      blueprint,
      { node: 'component:source', port: 'event:click' },
      { node: 'component:target', port: 'show' },
      context,
    );
    expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
    const wrongDirection = connectDesignerBlueprintPorts(
      blueprint,
      { node: 'component:target', port: 'show' },
      { node: 'component:source', port: 'event:click' },
      context,
    );
    expect(wrongDirection).toEqual({ ok: false, reason: 'invalid' });
    const unavailable = connectDesignerBlueprintPorts(
      blueprint,
      { node: 'component:source', port: 'event:hover' },
      { node: 'component:target', port: 'hide' },
      context,
    );
    expect(unavailable).toEqual({ ok: false, reason: 'unavailable' });
    const second = insertDesignerBlueprintNode(withBlueprint(blueprint), { kind: 'condition' });
    blueprint = mustParse(second!.blueprint);
    blueprint = connect(blueprint, ['condition-1', 'yes'], ['condition-2', 'judge']).blueprint;
    expect(
      connectDesignerBlueprintPorts(
        blueprint,
        { node: 'condition-2', port: 'no' },
        { node: 'condition-1', port: 'judge' },
        context,
      ),
    ).toEqual({ ok: false, reason: 'cycle' });
    const semantic = connect(
      blueprint,
      ['component:source', 'semantic'],
      ['component:target', 'semantic'],
    );
    expect(semantic.blueprint.edges.at(-1)).toMatchObject({ kind: 'semantic', role: 'related' });
  });

  it('updates nodes and edges, reorders same-source edges and keeps the document valid', () => {
    let blueprint = seeded();
    const first = connect(
      blueprint,
      ['component:source', 'event:click'],
      ['component:target', 'show'],
    );
    const second = connect(
      first.blueprint,
      ['component:source', 'event:click'],
      ['variable:selected', 'request'],
    );
    blueprint = second.blueprint;
    expect(readDesignerBlueprintEdgeOrder(blueprint, second.edgeId)).toEqual({
      order: 2,
      count: 2,
    });
    blueprint = mustParse(reorderDesignerBlueprintEdge(blueprint, second.edgeId, 'earlier')!);
    expect(readDesignerBlueprintEdgeOrder(blueprint, second.edgeId)).toEqual({
      order: 1,
      count: 2,
    });
    expect(reorderDesignerBlueprintEdge(blueprint, second.edgeId, 'earlier')).toBeNull();
    blueprint = mustParse(
      updateDesignerBlueprintEdge(blueprint, first.edgeId, {
        type: 'target-port',
        port: 'request-data',
      })!,
    );
    expect(blueprint.edges.find((edge) => edge.id === first.edgeId)).not.toHaveProperty(
      'transition',
    );
    blueprint = mustParse(
      updateDesignerBlueprintEdge(blueprint, second.edgeId, { type: 'target-port', port: 'set' })!,
    );
    expect(blueprint.edges.find((edge) => edge.id === second.edgeId)).toMatchObject({
      value: { kind: 'event-payload', path: [] },
    });
    blueprint = mustParse(
      updateDesignerBlueprintNode(blueprint, 'condition-1', { type: 'name', name: '  Severe  ' })!,
    );
    expect(blueprint.nodes.find((node) => node.id === 'condition-1')).toMatchObject({
      name: 'Severe',
    });
    blueprint = mustParse(
      updateDesignerBlueprintNode(blueprint, 'component:source', {
        type: 'enabled',
        enabled: false,
      })!,
    );
    expect(blueprint.nodes[0]).toMatchObject({ enabled: false });
    expect(
      updateDesignerBlueprintNode(blueprint, 'component:source', { type: 'name', name: 'x' }),
    ).toBeNull();
  });

  it('duplicates only timer / condition nodes with their internal edges', () => {
    let blueprint = seeded();
    const timer = insertDesignerBlueprintNode(
      withBlueprint(blueprint),
      { kind: 'timer' },
      { x: 0, y: 0 },
    );
    blueprint = mustParse(timer!.blueprint);
    blueprint = connect(blueprint, ['timer-1', 'tick'], ['condition-1', 'judge']).blueprint;
    const duplicated = duplicateDesignerBlueprintNodes(blueprint, [
      'timer-1',
      'condition-1',
      'component:source',
    ]);
    expect(duplicated?.nodeIds).toEqual(['condition-2', 'timer-2']);
    const parsed = mustParse(duplicated!.blueprint);
    expect(parsed.edges.at(-1)).toMatchObject({
      from: { node: 'timer-2', port: 'tick' },
      to: { node: 'condition-2', port: 'judge' },
    });
    expect(parsed.layout?.nodes.find((node) => node.id === 'timer-2')).toEqual({
      id: 'timer-2',
      x: 32,
      y: 32,
    });
    expect(duplicateDesignerBlueprintNodes(parsed, ['component:source'])).toBeNull();
  });

  it('deletes nodes with their edges and layout, and prunes removed entities', () => {
    let blueprint = seeded();
    blueprint = connect(
      blueprint,
      ['component:source', 'event:click'],
      ['condition-1', 'judge'],
    ).blueprint;
    blueprint = commitDesignerBlueprintLayout(blueprint, [
      { id: 'component:source', x: 1, y: 2 },
      { id: 'condition-1', x: 3, y: 4 },
      { id: 'missing', x: 5, y: 6 },
    ]);
    expect(blueprint.layout?.nodes.map((node) => node.id)).toEqual([
      'component:source',
      'condition-1',
    ]);
    const deleted = deleteDesignerBlueprintSelection(blueprint, {
      nodes: ['condition-1'],
      edges: [],
    });
    expect(deleted?.edges).toEqual([]);
    expect(deleted?.layout?.nodes).toEqual([{ id: 'component:source', x: 1, y: 2 }]);
    expect(deleteDesignerBlueprintSelection(blueprint, { nodes: ['nope'], edges: [] })).toBeNull();
    const pruned = pruneDesignerBlueprintEntities(blueprint, { componentIds: new Set(['source']) });
    expect(pruned.nodes.map((node) => node.id)).not.toContain('component:source');
    expect(pruned.edges).toEqual([]);
  });
});

describe('Blueprint canvas projection', () => {
  it('projects ports, saved layout, edge order and simulation triggers', () => {
    let blueprint = seeded();
    blueprint = connect(
      blueprint,
      ['component:source', 'event:click'],
      ['condition-1', 'judge'],
    ).blueprint;
    blueprint = connect(blueprint, ['condition-1', 'yes'], ['component:target', 'hide']).blueprint;
    blueprint = connect(blueprint, ['condition-1', 'yes'], ['variable:selected', 'set']).blueprint;
    blueprint = commitDesignerBlueprintLayout(blueprint, [
      { id: 'component:source', x: 17, y: 29 },
    ]);
    const document = withBlueprint(blueprint);
    const graph = buildDesignerBlueprintGraph(
      document,
      catalog,
      runtime,
      DESIGNER_UI_TEXT.blueprint,
    );
    const source = graph.nodes.find((node) => node.id === 'component:source');
    expect(source).toMatchObject({ x: 17, y: 29, semantic: true, renamable: false });
    expect(source?.outputs).toEqual([
      { id: 'event:click', direction: 'out', label: 'Click', available: true, connected: true },
    ]);
    expect(source?.inputs.map((port) => port.id)).toEqual([
      'show',
      'hide',
      'toggle',
      'request-data',
    ]);
    const condition = graph.nodes.find((node) => node.id === 'condition-1');
    expect(condition).toMatchObject({ renamable: true, duplicable: true });
    expect(condition?.outputs.map((port) => [port.id, port.connected])).toEqual([
      ['yes', true],
      ['no', false],
    ]);
    const yesEdges = graph.edges.filter((edge) => edge.source === 'condition-1');
    expect(yesEdges.map((edge) => [edge.order, edge.siblingCount, edge.category])).toEqual([
      [1, 2, 'flow'],
      [2, 2, 'data'],
    ]);
    expect(graph.edges[0]?.category).toBe('flow');
    expect(buildDesignerBlueprintSimulationTriggers(graph, document)).toEqual([
      { nodeId: 'component:source', port: 'event:click', label: 'source · Click' },
    ]);
  });

  it('stacks auto-placed nodes by their real card height so cards never overlap', () => {
    const blueprint = seeded();
    const graph = buildDesignerBlueprintGraph(
      withBlueprint(blueprint),
      catalog,
      runtime,
      DESIGNER_UI_TEXT.blueprint,
    );
    const columns = new Map<number, typeof graph.nodes>();
    for (const node of graph.nodes) columns.set(node.x, [...(columns.get(node.x) ?? []), node]);
    for (const list of columns.values()) {
      for (let index = 1; index < list.length; index++) {
        const previous = list[index - 1]!;
        expect(list[index]!.y).toBeGreaterThanOrEqual(
          previous.y + estimateDesignerBlueprintNodeHeight(previous),
        );
      }
    }
  });

  it('estimates card height with the same formula as the canvas, borders included', () => {
    type CanvasNode = Parameters<typeof estimateDesignerBlueprintNodeHeight>[0];
    const node = (rows: number): CanvasNode =>
      ({
        inputs: Array.from({ length: rows }, () => ({})),
        outputs: [],
        semantic: false,
      }) as unknown as CanvasNode;
    // 画布 height()：HEADER + BODY_TOP + rows × ROW + BODY_BOTTOM + BORDER，再与最小高度取大。
    const canvasHeight = (rows: number): number =>
      Math.max(
        DESIGNER_BLUEPRINT_NODE_MIN_HEIGHT,
        DESIGNER_BLUEPRINT_NODE_HEADER_HEIGHT +
          DESIGNER_BLUEPRINT_NODE_PADDING +
          DESIGNER_BLUEPRINT_NODE_BORDER +
          rows * DESIGNER_BLUEPRINT_NODE_ROW_HEIGHT,
      );
    for (const rows of [0, 1, 2, 4, 9]) {
      const estimated = estimateDesignerBlueprintNodeHeight(node(rows));
      expect(estimated, `${rows} rows`).toBe(canvasHeight(rows));
    }
    expect(estimateDesignerBlueprintNodeHeight(node(4))).toBe(179);
  });

  it('marks undeclared component events and host actions as unavailable ports', () => {
    const blueprint: ScreenBlueprint = {
      nodes: [
        { kind: 'component', id: 'a', componentId: 'source' },
        { kind: 'host', id: 'host' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'e1',
          from: { node: 'a', port: 'event:gone' },
          to: { node: 'host', port: 'action:missing' },
          payload: { kind: 'literal', value: null },
        },
      ],
    };
    const graph = buildDesignerBlueprintGraph(
      withBlueprint(blueprint),
      catalog,
      runtime,
      DESIGNER_UI_TEXT.blueprint,
    );
    const component = graph.nodes.find((node) => node.id === 'a');
    expect(component?.outputs.find((port) => port.id === 'event:gone')).toMatchObject({
      available: false,
    });
    const host = graph.nodes.find((node) => node.id === 'host');
    expect(host?.inputs.map((port) => [port.id, port.available])).toEqual([
      ['event:event1', true],
      ['action:missing', false],
    ]);
    expect(graph.edges[0]?.category).toBe('exit');
  });
});
