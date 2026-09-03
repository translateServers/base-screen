import { describe, expect, it } from 'vitest';
import {
  MAX_BLUEPRINT_EXPRESSION_BYTES,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_EXPRESSION_DEPTH,
} from '../../src/document/limits.js';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

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
          rules: [
            {
              id: 'notify',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [
                {
                  type: 'host-action',
                  actionId: 'project.notify',
                  payload: { kind: 'variable', variableId: 'tenant' },
                },
              ],
            },
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
        rules: [
          {
            id: 'raw',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [{ type: 'set-variable', variableId: 'count', value: 1 }],
          },
        ],
      },
    });
    const existsWithRight = document({
      components: [component({ id: 'button' })],
      blueprint: {
        rules: [
          {
            id: 'exists',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            condition: {
              left: { kind: 'literal', value: true },
              operator: 'exists',
              right: { kind: 'literal', value: true },
            },
            actions: [],
          },
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
        rules: [
          {
            id: 'capability',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            requiredCapabilities: ['blueprint.value.variable'],
            actions: [],
          },
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
        rules: [
          {
            id: 'extra',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'set-variable',
                variableId: 'count',
                value: { kind: 'literal', value: 1, extra: true },
              },
            ],
          },
        ],
      },
    });
    const dangerousPath = document({
      components: [component({ id: 'button' })],
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
      blueprint: {
        rules: [
          {
            id: 'path',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'set-variable',
                variableId: 'count',
                value: { kind: 'event-payload', path: ['constructor'] },
              },
            ],
          },
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
          rules: [
            {
              id: 'key',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [
                {
                  type: 'set-variable',
                  variableId: 'count',
                  value: { kind: 'object', properties },
                },
              ],
            },
          ],
        },
      }),
    );

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_DANGEROUS_KEY');
      expect(result.diagnostics[0]?.path).toEqual([
        'blueprint',
        'rules',
        0,
        'actions',
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
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          rules: [
            {
              id: 'deep',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [{ type: 'set-variable', variableId: 'count', value: deep }],
            },
          ],
        },
      }),
      document({
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          rules: [
            {
              id: 'containers',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [{ type: 'set-variable', variableId: 'count', value: containers }],
            },
          ],
        },
      }),
      document({
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          rules: [
            {
              id: 'bytes',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [
                {
                  type: 'set-variable',
                  variableId: 'count',
                  value: { kind: 'literal', value: 'x'.repeat(MAX_BLUEPRINT_EXPRESSION_BYTES) },
                },
              ],
            },
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
