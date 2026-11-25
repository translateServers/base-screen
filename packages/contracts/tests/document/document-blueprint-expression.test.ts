import { describe, expect, it } from 'vitest';
import {
  MAX_BLUEPRINT_EXPRESSION_BYTES,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_EXPRESSION_DEPTH,
} from '../../src/document/limits.js';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

interface EdgeOptions {
  readonly condition?: unknown;
  readonly requiredCapabilities?: readonly string[];
}

/** 单条「按钮点击 → 目标锚点」的节点图；带条件时经条件节点的 `yes` 分支。 */
function edgeBlueprint(
  id: string,
  target: { readonly kind: 'component' | 'variable' | 'host'; readonly port: string },
  fields: Record<string, unknown>,
  options: EdgeOptions = {},
): { nodes: unknown[]; edges: unknown[] } {
  const targetNode =
    target.kind === 'host'
      ? { kind: 'host', id: 'host' }
      : target.kind === 'variable'
        ? { kind: 'variable', id: 'count-node', variableId: 'count' }
        : { kind: 'component', id: 'button-node', componentId: 'button' };
  const nodes: unknown[] = [{ kind: 'component', id: 'button-node', componentId: 'button' }];
  if (targetNode.id !== 'button-node') nodes.push(targetNode);
  const edges: unknown[] = [];
  let from = { node: 'button-node', port: 'event:click' };
  if (options.condition !== undefined) {
    nodes.push({ kind: 'condition', id: 'cond', condition: options.condition });
    edges.push({ kind: 'flow', id: `${id}-judge`, from, to: { node: 'cond', port: 'judge' } });
    from = { node: 'cond', port: 'yes' };
  }
  edges.push({
    kind: 'flow',
    id,
    from,
    to: { node: targetNode.id, port: target.port },
    ...fields,
    ...(options.requiredCapabilities === undefined
      ? {}
      : { requiredCapabilities: options.requiredCapabilities }),
  });
  // 组件自连会被拒绝：目标是按钮自己时改用独立的面板组件。
  if (targetNode.id === 'button-node') {
    nodes.push({ kind: 'component', id: 'panel-node', componentId: 'panel' });
    (edges[edges.length - 1] as { to: { node: string } }).to.node = 'panel-node';
  }
  return { nodes, edges };
}

const HOST_ACTION = { kind: 'host', port: 'action:project.notify' } as const;
const SET_COUNT = { kind: 'variable', port: 'set' } as const;
const REQUEST_DATA = { kind: 'component', port: 'request-data' } as const;
const COMPONENTS = [component({ id: 'button' }), component({ id: 'panel' })];

describe('parseScreenDocument blueprint expressions', () => {
  it('R6 accepts host variables and authorized host actions without transport details', () => {
    const result = parse(
      document({
        components: COMPONENTS,
        variables: [
          {
            type: 'data-source',
            id: 'tenant',
            name: 'tenant',
            initialValue: null,
            sourceId: 'tenant-context',
            controlled: true,
          },
        ],
        blueprint: edgeBlueprint('notify', HOST_ACTION, {
          payload: { kind: 'variable', variableId: 'tenant' },
        }),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('R6 rejects transport details on host variables and actions', () => {
    const result = parse(
      document({
        variables: [
          {
            type: 'data-source',
            id: 'tenant',
            name: 'tenant',
            initialValue: null,
            sourceId: 'tenant-context',
            controlled: true,
            url: '/secret',
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toEqual(['variables', 0, 'url']);
  });

  it('rejects legacy raw blueprint action values and invalid condition right placement', () => {
    const rawValue = document({
      components: COMPONENTS,
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
      blueprint: edgeBlueprint('raw', SET_COUNT, { value: 1 }),
    });
    const existsWithRight = document({
      components: COMPONENTS,
      blueprint: edgeBlueprint(
        'exists',
        REQUEST_DATA,
        {},
        {
          condition: {
            left: { kind: 'literal', value: true },
            operator: 'exists',
            right: { kind: 'literal', value: true },
          },
        },
      ),
    });
    expect(parse(rawValue).ok).toBe(false);
    expect(parse(existsWithRight).ok).toBe(false);
  });

  it('accepts dotted Blueprint capability identities without coercing them', () => {
    const input = document({
      components: COMPONENTS,
      blueprint: edgeBlueprint(
        'capability',
        REQUEST_DATA,
        {},
        {
          requiredCapabilities: ['blueprint.value.variable'],
        },
      ),
    });

    expect(parse(input)).toMatchObject({ ok: true });
  });

  it('rejects unknown expression fields and dangerous event paths', () => {
    const expressionExtra = document({
      components: COMPONENTS,
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
      blueprint: edgeBlueprint('extra', SET_COUNT, {
        value: { kind: 'literal', value: 1, extra: true },
      }),
    });
    const dangerousPath = document({
      components: COMPONENTS,
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
      blueprint: edgeBlueprint('path', SET_COUNT, {
        value: { kind: 'event-payload', path: ['constructor'] },
      }),
    });

    expect(parse(expressionExtra).ok).toBe(false);
    expect(parse(dangerousPath).ok).toBe(false);
  });

  it('rejects dangerous expression object keys', () => {
    const properties = JSON.parse('{"__proto__":{"kind":"literal","value":1}}') as Record<
      string,
      unknown
    >;
    const result = parse(
      document({
        components: COMPONENTS,
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: edgeBlueprint('key', SET_COUNT, { value: { kind: 'object', properties } }),
      }),
    );

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_DANGEROUS_KEY');
      expect(result.diagnostics[0]?.path).toEqual([
        'blueprint',
        'edges',
        0,
        'value',
        'properties',
        '__proto__',
      ]);
    }
  });

  it('enforces Blueprint expression depth, container, and byte budgets', () => {
    let deep: Record<string, unknown> = { kind: 'literal', value: 1 };
    for (let index = 0; index < MAX_BLUEPRINT_EXPRESSION_DEPTH; index++) {
      deep = { kind: 'array', items: [deep] };
    }
    const containers = {
      kind: 'array',
      items: Array.from({ length: MAX_BLUEPRINT_EXPRESSION_CONTAINERS }, () => ({
        kind: 'array',
        items: [],
      })),
    };
    const cases = [
      document({
        components: COMPONENTS,
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: edgeBlueprint('deep', SET_COUNT, { value: deep }),
      }),
      document({
        components: COMPONENTS,
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: edgeBlueprint('containers', SET_COUNT, { value: containers }),
      }),
      document({
        components: COMPONENTS,
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: edgeBlueprint('bytes', SET_COUNT, {
          value: { kind: 'literal', value: 'x'.repeat(MAX_BLUEPRINT_EXPRESSION_BYTES) },
        }),
      }),
    ];

    for (const input of cases) {
      const result = parse(input);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) {
        expect(
          result.diagnostics.some((diagnostic) => diagnostic.code === 'DOCUMENT_LIMIT_EXCEEDED'),
        ).toBe(true);
      }
    }
  });
});
