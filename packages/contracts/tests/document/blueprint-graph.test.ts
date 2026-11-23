import { describe, expect, it } from 'vitest';
import {
  deriveScreenBlueprintRules,
  readScreenBlueprintEdgeCategory,
  screenBlueprintRuleActions,
} from '../../src/document/blueprint-graph.js';
import { parseScreenDocument } from '../../src/document/parse.js';
import { migrateScreenDocument } from '../../src/migration/migrate-document.js';
import type { ScreenBlueprint, ScreenBlueprintRuleStep } from '../../src/types/document.js';
import { component, document } from './__fixtures__/document-test-fixtures.js';

const components = [component({ id: 'a' }), component({ id: 'b' }), component({ id: 'c' })];
const variables = [{ type: 'static', id: 'v', name: 'v', initialValue: 0 }];

const nodeA = { kind: 'component', id: 'a-node', componentId: 'a' };
const nodeB = { kind: 'component', id: 'b-node', componentId: 'b' };
const nodeC = { kind: 'component', id: 'c-node', componentId: 'c' };
const nodeV = { kind: 'variable', id: 'v-node', variableId: 'v' };
const host = { kind: 'host', id: 'host' };
const levelIsHigh = {
  kind: 'condition',
  id: 'cond',
  condition: {
    left: { kind: 'event-payload', path: ['level'] },
    operator: 'eq',
    right: { kind: 'literal', value: 'high' },
  },
};

function flow(
  id: string,
  from: [string, string],
  to: [string, string],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: 'flow',
    id,
    from: { node: from[0], port: from[1] },
    to: { node: to[0], port: to[1] },
    ...extra,
  };
}

function parseGraph(blueprint: Record<string, unknown>) {
  return parseScreenDocument(document({ components, variables, blueprint }));
}

function mustParse(blueprint: Record<string, unknown>): ScreenBlueprint {
  const parsed = parseGraph(blueprint);
  if (!parsed.ok) {
    throw new Error(`fixture must parse: ${JSON.stringify(parsed.diagnostics)}`);
  }
  return parsed.value.blueprint;
}

function rejectedAt(blueprint: Record<string, unknown>): readonly string[] {
  const parsed = parseGraph(blueprint);
  expect(parsed.ok).toBe(false);
  return parsed.ok ? [] : parsed.diagnostics.map((diagnostic) => diagnostic.path.join('.'));
}

/** 步骤树的读法：动作写连线 id，条件写 `节点?[yes]:[no]`。 */
function shape(steps: readonly ScreenBlueprintRuleStep[]): unknown[] {
  return steps.map((step) =>
    step.type === 'action'
      ? step.edgeId
      : { [step.nodeId]: { yes: shape(step.yes), no: shape(step.no) } },
  );
}

describe('deriveScreenBlueprintRules', () => {
  it('compiles one rule per trigger port and walks edges depth first in edge order', () => {
    const graph = mustParse({
      nodes: [nodeA, nodeB, nodeC, nodeV, levelIsHigh, host],
      edges: [
        flow('e1', ['a-node', 'event:click'], ['b-node', 'show']),
        flow('e2', ['a-node', 'event:click'], ['cond', 'judge']),
        flow('e3', ['cond', 'yes'], ['host', 'event:escalate'], {
          payload: { kind: 'event-payload', path: [] },
        }),
        flow('e4', ['cond', 'no'], ['c-node', 'hide']),
        flow('e5', ['a-node', 'event:click'], ['v-node', 'set'], {
          value: { kind: 'event-payload', path: ['level'] },
        }),
        flow('e6', ['a-node', 'event:change'], ['b-node', 'request-data']),
      ],
    });
    const rules = deriveScreenBlueprintRules(graph);
    expect(rules.map((rule) => rule.id)).toEqual(['a-node/event:click', 'a-node/event:change']);
    expect(rules[0]!.trigger).toEqual({
      type: 'material-event',
      componentId: 'a',
      eventName: 'click',
    });
    expect(shape(rules[0]!.steps)).toEqual(['e1', { cond: { yes: ['e3'], no: ['e4'] } }, 'e5']);
    expect(rules[0]!.requiredCapabilities).toEqual(
      expect.arrayContaining([
        'blueprint.trigger.material-event',
        'blueprint.condition.compare',
        'blueprint.value.event-payload',
        'blueprint.action.component-visibility',
        'blueprint.action.emit-host-event',
        'blueprint.action.set-variable',
      ]),
    );
    expect(screenBlueprintRuleActions(rules[0]!).map((action) => action.type)).toEqual([
      'component-visibility',
      'emit-host-event',
      'component-visibility',
      'set-variable',
    ]);
    expect(rules[1]!.steps).toEqual([
      {
        type: 'action',
        edgeId: 'e6',
        action: { type: 'request-component-data', componentId: 'b' },
      },
    ]);
  });

  it('skips disabled triggers, truncates at disabled conditions and drops disabled targets', () => {
    const graph = mustParse({
      nodes: [
        nodeA,
        { ...nodeB, enabled: false },
        nodeC,
        { ...levelIsHigh, enabled: false },
        { kind: 'timer', id: 't', intervalSeconds: 5, enabled: false },
      ],
      edges: [
        flow('e1', ['a-node', 'event:click'], ['b-node', 'show']),
        flow('e2', ['a-node', 'event:click'], ['cond', 'judge']),
        flow('e3', ['cond', 'yes'], ['c-node', 'show']),
        flow('e4', ['a-node', 'event:click'], ['c-node', 'hide']),
        flow('e5', ['t', 'tick'], ['c-node', 'toggle']),
      ],
    });
    const rules = deriveScreenBlueprintRules(graph);
    expect(rules).toHaveLength(1);
    expect(shape(rules[0]!.steps)).toEqual(['e4']);
  });

  it('gives each same-interval timer node its own rule with the same trigger', () => {
    const graph = mustParse({
      nodes: [
        nodeA,
        { kind: 'timer', id: 't1', intervalSeconds: 5 },
        { kind: 'timer', id: 't2', intervalSeconds: 5, name: 'Second' },
      ],
      edges: [
        flow('e1', ['t1', 'tick'], ['a-node', 'show']),
        flow('e2', ['t2', 'tick'], ['a-node', 'hide']),
      ],
    });
    const rules = deriveScreenBlueprintRules(graph);
    expect(rules.map((rule) => rule.trigger)).toEqual([
      { type: 'timer', eventName: 'tick', intervalSeconds: 5 },
      { type: 'timer', eventName: 'tick', intervalSeconds: 5 },
    ]);
  });

  it('derives nothing from semantic edges', () => {
    const graph = mustParse({
      nodes: [nodeA, nodeB],
      edges: [
        {
          kind: 'semantic',
          id: 's',
          from: { node: 'a-node' },
          to: { node: 'b-node' },
          role: 'detail',
        },
      ],
    });
    expect(deriveScreenBlueprintRules(graph)).toEqual([]);
  });

  it('classifies edges into the five authoring categories', () => {
    const graph = mustParse({
      nodes: [nodeA, nodeB, nodeV, levelIsHigh, host],
      edges: [
        flow('interaction', ['a-node', 'event:click'], ['b-node', 'show']),
        flow('data', ['a-node', 'event:click'], ['v-node', 'request']),
        flow('flow', ['a-node', 'event:click'], ['cond', 'judge']),
        flow('exit', ['a-node', 'event:change'], ['host', 'action:open'], {
          payload: { kind: 'literal', value: null },
        }),
        {
          kind: 'semantic',
          id: 'semantic',
          from: { node: 'a-node' },
          to: { node: 'b-node' },
          role: 'related',
        },
      ],
    });
    const kinds = new Map(graph.nodes.map((node) => [node.id, node.kind]));
    expect(
      graph.edges.map((edge) => readScreenBlueprintEdgeCategory(edge, (id) => kinds.get(id))),
    ).toEqual(['interaction', 'data', 'flow', 'exit', 'semantic']);
  });
});

describe('blueprint graph validation', () => {
  it('rejects ports that do not belong to the node kind', () => {
    expect(
      rejectedAt({
        nodes: [nodeA, nodeV],
        edges: [
          flow('e', ['a-node', 'ready'], ['v-node', 'set'], {
            value: { kind: 'literal', value: 1 },
          }),
        ],
      }),
    ).toContain('blueprint.edges.0.from.port');
    expect(
      rejectedAt({
        nodes: [nodeA, nodeB],
        edges: [flow('e', ['a-node', 'event:click'], ['b-node', 'judge'])],
      }),
    ).toContain('blueprint.edges.0.to.port');
  });

  it('requires and forbids edge fields by target port', () => {
    expect(
      rejectedAt({
        nodes: [nodeA, nodeV],
        edges: [flow('e', ['a-node', 'event:click'], ['v-node', 'set'])],
      }),
    ).toContain('blueprint.edges.0.value');
    expect(
      rejectedAt({
        nodes: [nodeA, host],
        edges: [flow('e', ['a-node', 'event:click'], ['host', 'event:x'])],
      }),
    ).toContain('blueprint.edges.0.payload');
    expect(
      rejectedAt({
        nodes: [nodeA, nodeB],
        edges: [
          flow('e', ['a-node', 'event:click'], ['b-node', 'request-data'], {
            transition: { effect: 'fade', durationMs: 200, easing: 'linear' },
          }),
        ],
      }),
    ).toContain('blueprint.edges.0.transition');
  });

  it('rejects duplicate ids, duplicate entities, extra singletons and duplicate edges', () => {
    expect(rejectedAt({ nodes: [nodeA, { ...nodeB, id: 'a-node' }], edges: [] })).toContain(
      'blueprint.nodes.1.id',
    );
    expect(rejectedAt({ nodes: [nodeA, { ...nodeA, id: 'other' }], edges: [] })).toContain(
      'blueprint.nodes.1.componentId',
    );
    expect(rejectedAt({ nodes: [host, { kind: 'host', id: 'host-2' }], edges: [] })).toContain(
      'blueprint.nodes.1.kind',
    );
    expect(
      rejectedAt({
        nodes: [nodeA, nodeB],
        edges: [
          flow('e1', ['a-node', 'event:click'], ['b-node', 'show']),
          flow('e2', ['a-node', 'event:click'], ['b-node', 'show']),
        ],
      }),
    ).toContain('blueprint.edges.1');
  });

  it('accepts only enabled: false and rejects self loops', () => {
    expect(rejectedAt({ nodes: [{ ...nodeA, enabled: true }], edges: [] }).length).toBeGreaterThan(
      0,
    );
    expect(
      rejectedAt({ nodes: [levelIsHigh], edges: [flow('e', ['cond', 'yes'], ['cond', 'judge'])] }),
    ).toContain('blueprint.edges.0.to.node');
  });

  it('rejects condition cycles and overly deep condition chains', () => {
    const second = { ...levelIsHigh, id: 'cond-2' };
    expect(
      parseGraph({
        nodes: [levelIsHigh, second],
        edges: [
          flow('e1', ['cond', 'yes'], ['cond-2', 'judge']),
          flow('e2', ['cond-2', 'no'], ['cond', 'judge']),
        ],
      }).ok,
    ).toBe(false);
    const chain = Array.from({ length: 17 }, (_, index) => ({ ...levelIsHigh, id: `c${index}` }));
    const result = parseGraph({
      nodes: chain,
      edges: chain
        .slice(1)
        .map((node, index) => flow(`e${index}`, [`c${index}`, 'yes'], [node.id, 'judge'])),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]!.code).toBe('DOCUMENT_LIMIT_EXCEEDED');
  });

  it('checks semantic edge endpoints, entity references and layout ids', () => {
    expect(
      rejectedAt({
        nodes: [nodeA, nodeV],
        edges: [
          {
            kind: 'semantic',
            id: 's',
            from: { node: 'a-node' },
            to: { node: 'v-node' },
            role: 'detail',
          },
        ],
      }),
    ).toContain('blueprint.edges.0.to.node');
    expect(
      rejectedAt({ nodes: [{ kind: 'component', id: 'x', componentId: 'missing' }], edges: [] }),
    ).toContain('blueprint.nodes.0.componentId');
    expect(
      rejectedAt({ nodes: [nodeA], edges: [], layout: { nodes: [{ id: 'nope', x: 0, y: 0 }] } }),
    ).toContain('blueprint.layout.nodes.0.id');
  });

  it('rejects the removed relations field', () => {
    expect(parseScreenDocument(document({ components, blueprint: { relations: [] } })).ok).toBe(
      false,
    );
  });
});

describe('relation blueprint migration', () => {
  const condition = {
    left: { kind: 'event-payload', path: ['level'] },
    operator: 'eq',
    right: { kind: 'literal', value: 'high' },
  };
  const source = {
    kind: 'component',
    componentId: 'a',
    event: { type: 'material-event', eventName: 'click' },
  };

  it('turns relations into nodes and edges with condition nodes per group', () => {
    const migrated = migrateScreenDocument(
      document({
        components,
        variables,
        blueprint: {
          relations: [
            {
              type: 'behavior',
              id: 'r1',
              source,
              target: { kind: 'component', componentId: 'b' },
              effect: { type: 'component-visibility', operation: 'show' },
            },
            {
              type: 'behavior',
              id: 'r2',
              source,
              condition,
              target: { kind: 'variable', variableId: 'v' },
              effect: { type: 'set-variable', value: { kind: 'event-payload', path: ['level'] } },
            },
            {
              type: 'semantic',
              id: 's1',
              source: { kind: 'component', componentId: 'a' },
              target: { kind: 'component', componentId: 'b' },
              role: 'detail',
            },
            {
              type: 'behavior',
              id: 'r3',
              source,
              condition,
              target: { kind: 'host' },
              effect: {
                type: 'emit-host-event',
                eventName: 'notify',
                payload: { kind: 'literal', value: 1 },
              },
            },
            {
              type: 'behavior',
              id: 'r4',
              source: {
                kind: 'variable',
                variableId: 'v',
                event: { type: 'variable-event', eventName: 'request-state' },
              },
              target: { kind: 'component', componentId: 'c' },
              effect: { type: 'component-visibility', operation: 'hide' },
            },
            {
              type: 'behavior',
              id: 'r5',
              source: {
                kind: 'timer',
                intervalSeconds: 30,
                event: { type: 'timer', eventName: 'tick' },
              },
              target: { kind: 'component', componentId: 'b' },
              effect: { type: 'request-component-data' },
            },
          ],
          layout: {
            nodes: [
              { id: 'component:a', x: 1, y: 2 },
              { id: 'component:c', x: 3, y: 4 },
            ],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        },
      }),
    );
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const blueprint = migrated.document.blueprint;
    expect(blueprint.nodes.map((node) => node.id)).toEqual([
      'component:a',
      'component:b',
      'variable:v',
      'condition-1',
      'host',
      'timer:30',
    ]);
    expect(blueprint.edges.map((edge) => edge.id)).toEqual([
      'r1',
      'edge-1',
      'r2',
      's1',
      'r3',
      'r5',
    ]);
    expect(blueprint.layout).toEqual({
      nodes: [{ id: 'component:a', x: 1, y: 2 }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(
      migrated.decisions.some(
        (decision) => decision.kind === 'blueprint-edge' && decision.action === 'rejected',
      ),
    ).toBe(true);
    const rules = deriveScreenBlueprintRules(blueprint);
    expect(shape(rules[0]!.steps)).toEqual([
      'r1',
      { 'condition-1': { yes: ['r2', 'r3'], no: [] } },
    ]);
    expect(rules[1]!.trigger).toEqual({ type: 'timer', eventName: 'tick', intervalSeconds: 30 });

    const again = migrateScreenDocument(migrated.document);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.document).toEqual(migrated.document);
      expect(again.decisions).toEqual([]);
    }
  });

  it('keeps non-contiguous groups with the same condition apart', () => {
    const migrated = migrateScreenDocument(
      document({
        components,
        blueprint: {
          relations: [
            {
              type: 'behavior',
              id: 'r1',
              source,
              condition,
              target: { kind: 'component', componentId: 'b' },
              effect: { type: 'component-visibility', operation: 'show' },
            },
            {
              type: 'behavior',
              id: 'r2',
              source,
              target: { kind: 'component', componentId: 'c' },
              effect: { type: 'component-visibility', operation: 'show' },
            },
            {
              type: 'behavior',
              id: 'r3',
              source,
              condition,
              target: { kind: 'component', componentId: 'c' },
              effect: { type: 'component-visibility', operation: 'hide' },
            },
          ],
        },
      }),
    );
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const rules = deriveScreenBlueprintRules(migrated.document.blueprint);
    expect(shape(rules[0]!.steps)).toEqual([
      { 'condition-1': { yes: ['r1'], no: [] } },
      'r2',
      { 'condition-2': { yes: ['r3'], no: [] } },
    ]);
  });

  it('migrates legacy rules through relations in one pass', () => {
    const migrated = migrateScreenDocument(
      document({
        components,
        variables,
        blueprint: {
          rules: [
            {
              id: 'rule-1',
              trigger: { type: 'material-event', componentId: 'a', eventName: 'click' },
              condition,
              actions: [
                { type: 'component-visibility', componentId: 'b', operation: 'show' },
                { type: 'set-variable', variableId: 'v', value: { kind: 'literal', value: 1 } },
              ],
            },
          ],
          layout: { nodes: [{ id: 'condition:rule-1', x: 3, y: 4 }] },
        },
      }),
    );
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const rules = deriveScreenBlueprintRules(migrated.document.blueprint);
    expect(rules).toHaveLength(1);
    expect(screenBlueprintRuleActions(rules[0]!).map((action) => action.type)).toEqual([
      'component-visibility',
      'set-variable',
    ]);
    expect(migrated.decisions.some((decision) => decision.kind === 'blueprint-relation')).toBe(
      true,
    );
    expect(migrated.decisions.some((decision) => decision.kind === 'blueprint-node')).toBe(true);
  });

  it('leaves unrecognised relation shapes to fail closed', () => {
    const result = migrateScreenDocument(
      document({
        components,
        blueprint: { relations: [{ type: 'behavior', id: 'r', source: { kind: 'nope' } }] },
      }),
    );
    expect(result.ok).toBe(false);
  });
});
