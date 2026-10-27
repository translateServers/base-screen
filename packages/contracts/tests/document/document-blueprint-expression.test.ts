import { describe, expect, it } from 'vitest';
import {
  MAX_BLUEPRINT_EXPRESSION_BYTES,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_EXPRESSION_DEPTH,
} from '../../src/document/limits.js';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

interface RelationOptions {
  readonly condition?: unknown;
  readonly requiredCapabilities?: readonly string[];
  readonly targetKind?: 'component' | 'variable' | 'host';
  readonly targetId?: string;
}

function relation(id: string, effect: Record<string, unknown>, options: RelationOptions = {}) {
  const targetKind =
    options.targetKind ??
    (effect.type === 'set-variable' || effect.type === 'request-variable'
      ? 'variable'
      : effect.type === 'emit-host-event' || effect.type === 'host-action'
        ? 'host'
        : 'component');
  const target =
    targetKind === 'host'
      ? { kind: 'host' }
      : targetKind === 'variable'
        ? { kind: 'variable', variableId: options.targetId ?? 'count' }
        : { kind: 'component', componentId: options.targetId ?? 'button' };
  return {
    type: 'behavior',
    id,
    source: {
      kind: 'component',
      componentId: 'button',
      event: { type: 'material-event', eventName: 'click' },
    },
    ...(options.condition === undefined ? {} : { condition: options.condition }),
    target,
    effect,
    ...(options.requiredCapabilities === undefined
      ? {}
      : { requiredCapabilities: options.requiredCapabilities }),
  };
}

describe('parseScreenDocument blueprint expressions', () => {
  it('R6 accepts host variables and authorized host actions without transport details', () => {
    const result = parse(
      document({
        components: [component({ id: 'button' })],
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
        blueprint: {
          relations: [
            relation('notify', {
              type: 'host-action',
              actionId: 'project.notify',
              payload: { kind: 'variable', variableId: 'tenant' },
            }),
          ],
        },
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
      components: [component({ id: 'button' })],
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
      blueprint: {
        relations: [relation('raw', { type: 'set-variable', value: 1 })],
      },
    });
    const existsWithRight = document({
      components: [component({ id: 'button' })],
      blueprint: {
        relations: [
          relation(
            'exists',
            { type: 'request-component-data' },
            {
              condition: {
                left: { kind: 'literal', value: true },
                operator: 'exists',
                right: { kind: 'literal', value: true },
              },
            },
          ),
        ],
      },
    });
    expect(parse(rawValue).ok).toBe(false);
    expect(parse(existsWithRight).ok).toBe(false);
  });

  it('accepts dotted Blueprint capability identities without coercing them', () => {
    const input = document({
      components: [component({ id: 'button' })],
      blueprint: {
        relations: [
          relation(
            'capability',
            { type: 'request-component-data' },
            { requiredCapabilities: ['blueprint.value.variable'] },
          ),
        ],
      },
    });

    expect(parse(input)).toMatchObject({ ok: true });
  });

  it('rejects unknown expression fields and dangerous event paths', () => {
    const expressionExtra = document({
      components: [component({ id: 'button' })],
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
      blueprint: {
        relations: [
          relation('extra', {
            type: 'set-variable',
            value: { kind: 'literal', value: 1, extra: true },
          }),
        ],
      },
    });
    const dangerousPath = document({
      components: [component({ id: 'button' })],
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
      blueprint: {
        relations: [
          relation('path', {
            type: 'set-variable',
            value: { kind: 'event-payload', path: ['constructor'] },
          }),
        ],
      },
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
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          relations: [
            relation('key', {
              type: 'set-variable',
              value: { kind: 'object', properties },
            }),
          ],
        },
      }),
    );

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_DANGEROUS_KEY');
      expect(result.diagnostics[0]?.path).toEqual([
        'blueprint',
        'relations',
        0,
        'effect',
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
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          relations: [relation('deep', { type: 'set-variable', value: deep })],
        },
      }),
      document({
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          relations: [relation('containers', { type: 'set-variable', value: containers })],
        },
      }),
      document({
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          relations: [
            relation('bytes', {
              type: 'set-variable',
              value: { kind: 'literal', value: 'x'.repeat(MAX_BLUEPRINT_EXPRESSION_BYTES) },
            }),
          ],
        },
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
