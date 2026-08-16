import { describe, expect, it } from 'vitest';
import { isScreenMaterialType } from '../../src/document/identity.js';
import {
  MAX_BLUEPRINT_EXPRESSION_BYTES,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_EXPRESSION_DEPTH,
} from '../../src/document/limits.js';
import { parseScreenDocument } from '../../src/document/parse.js';

function component(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    type: 'acme.kpi-card',
    name: 'KPI Card',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

function document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
    ...overrides,
  };
}

const parse = parseScreenDocument;

describe('isScreenMaterialType', () => {
  it('uses the canonical namespaced material identity grammar', () => {
    expect(isScreenMaterialType('acme.kpi-card')).toBe(true);
    expect(isScreenMaterialType('acme.kpi.card')).toBe(true);
    expect(isScreenMaterialType('acme/kpi-card')).toBe(false);
    expect(isScreenMaterialType('acme')).toBe(false);
    expect(isScreenMaterialType('Acme.kpi-card')).toBe(false);
  });
});

describe('parseScreenDocument', () => {
  it('parses a minimal document', () => {
    const result = parse(document());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([]);
      expect(result.value).toEqual(document());
      expect(result.value).not.toBe(document());
    }
  });

  it('R6 accepts host variables and authorized host actions without transport details', () => {
    const result = parse(
      document({
        components: [component({ id: 'button' })],
        variables: [{ type: 'host', name: 'tenant', variableId: 'tenant-context' }],
        blueprint: {
          rules: [
            {
              id: 'notify',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [
                {
                  type: 'host-action',
                  actionId: 'project.notify',
                  payload: { kind: 'variable', name: 'tenant' },
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
        variables: [{ type: 'host', name: 'tenant', variableId: 'tenant-context', url: '/secret' }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toEqual(['variables', 0, 'url']);
  });

  it('rejects legacy raw blueprint action values and invalid condition right placement', () => {
    const rawValue = document({
      components: [component({ id: 'button' })],
      variables: [{ type: 'static', name: 'count', value: 0 }],
      blueprint: {
        rules: [
          {
            id: 'raw',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [{ type: 'set-variable', variableName: 'count', value: 1 }],
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
      variables: [{ type: 'static', name: 'count', value: 0 }],
      blueprint: {
        rules: [
          {
            id: 'extra',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'set-variable',
                variableName: 'count',
                value: { kind: 'literal', value: 1, extra: true },
              },
            ],
          },
        ],
      },
    });
    const dangerousPath = document({
      components: [component({ id: 'button' })],
      variables: [{ type: 'static', name: 'count', value: 0 }],
      blueprint: {
        rules: [
          {
            id: 'path',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'set-variable',
                variableName: 'count',
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
        variables: [{ type: 'static', name: 'count', value: 0 }],
        blueprint: {
          rules: [
            {
              id: 'key',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [
                {
                  type: 'set-variable',
                  variableName: 'count',
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
        variables: [{ type: 'static', name: 'count', value: 0 }],
        blueprint: {
          rules: [
            {
              id: 'deep',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [{ type: 'set-variable', variableName: 'count', value: deep }],
            },
          ],
        },
      }),
      document({
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', name: 'count', value: 0 }],
        blueprint: {
          rules: [
            {
              id: 'containers',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [{ type: 'set-variable', variableName: 'count', value: containers }],
            },
          ],
        },
      }),
      document({
        components: [component({ id: 'button' })],
        variables: [{ type: 'static', name: 'count', value: 0 }],
        blueprint: {
          rules: [
            {
              id: 'bytes',
              trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
              actions: [
                {
                  type: 'set-variable',
                  variableName: 'count',
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

  it('parses multiple roots and parents declared after children', () => {
    const input = document({
      components: [
        component({ id: 'child', parentId: 'parent' }),
        component({ id: 'parent' }),
        component({ id: 'sibling' }),
      ],
    });
    expect(parse(input)).toMatchObject({ ok: true });
  });

  it('parses host resource intent and validates blueprint references', () => {
    const input = document({
      components: [
        component({
          id: 'button',
          dataSource: {
            type: 'host-resource',
            resourceType: 'dataset',
            resourceId: 'orders',
            params: { limit: { kind: 'literal', value: 5 } },
            binding: null,
          },
        }),
      ],
      variables: [{ type: 'static', name: 'count', value: 0 }],
      blueprint: {
        rules: [
          {
            id: 'refresh',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'valueClick' },
            actions: [
              {
                type: 'set-variable',
                variableName: 'count',
                value: { kind: 'literal', value: 1 },
              },
            ],
          },
        ],
      },
    });
    expect(parse(input).ok).toBe(true);
    expect(
      parse(
        document({
          blueprint: {
            rules: [
              {
                id: 'bad',
                trigger: { type: 'material-event', componentId: 'missing', eventName: 'click' },
                actions: [],
              },
            ],
          },
        }),
      ).ok,
    ).toBe(false);
  });

  it('parses deep JSON, unicode names and -0 values', () => {
    const input = document({
      canvas: { width: 1, height: 1, backgroundColor: '#fff' },
      components: [
        component({
          name: 'emoji \u{1f600}',
          props: { nested: { list: [1, 2, -0] }, 中文: '值' },
        }),
      ],
      variables: [{ type: 'static', name: 'count', value: { deep: [true, null] } }],
    });
    const result = parse(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const first = result.value.components[0];
      expect(first?.name).toBe('emoji \u{1f600}');
      const nested = first?.props.nested as { list: readonly (number | boolean | null)[] };
      expect(Object.is(nested.list[2], -0)).toBe(true);
    }
  });

  it('clones shared references and rejects nothing on valid input', () => {
    const shared = { leaf: 1 };
    const input = document({
      components: [component({ id: 'a', props: shared }), component({ id: 'b', props: shared })],
    });
    const result = parse(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const propsA = result.value.components[0]?.props;
      const propsB = result.value.components[1]?.props;
      expect(propsA).toEqual(propsB);
      expect(propsA).not.toBe(propsB);
    }
  });

  it('rejects non-object roots', () => {
    for (const input of [null, 42, 'text', [], true, undefined]) {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('DOCUMENT_NOT_OBJECT');
        expect(result.diagnostics[0]?.path).toEqual([]);
      }
    }
  });

  it('rejects unknown fields on every strict object', () => {
    const cases: Array<{ input: Record<string, unknown>; path: (string | number)[] }> = [
      {
        input: document({ blueprint: { rules: [], extra: true } }),
        path: ['blueprint', 'extra'],
      },
      {
        input: document({ canvas: { width: 1, height: 1, backgroundColor: '#000', extra: 1 } }),
        path: ['canvas', 'extra'],
      },
      {
        input: document({ components: [component({ position: { x: 0, y: 0, z: 0 } })] }),
        path: ['components', 0, 'position', 'z'],
      },
      {
        input: document({ components: [component({ size: { width: 1, height: 1, depth: 1 } })] }),
        path: ['components', 0, 'size', 'depth'],
      },
      {
        input: document({
          components: [component({ status: { locked: false, hidden: false, active: true } })],
        }),
        path: ['components', 0, 'status', 'active'],
      },
      {
        input: document({
          components: [component({ dataSource: { type: 'static', value: 1, label: 'x' } })],
        }),
        path: ['components', 0, 'dataSource', 'label'],
      },
      {
        input: document({ components: [component({ postion: { x: 0, y: 0 } })] }),
        path: ['components', 0, 'postion'],
      },
      {
        input: document({ variables: [{ type: 'static', name: 'a', value: 1, extra: true }] }),
        path: ['variables', 0, 'extra'],
      },
    ];
    for (const { input, path } of cases) {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
        expect(result.diagnostics[0]?.path).toEqual(path);
      }
    }
  });

  it('rejects missing required fields without defaults', () => {
    const withMissingId = document({ components: [component()] });
    delete (withMissingId.components as Array<Record<string, unknown>>)[0]?.id;
    const withMissingPosition = document({ components: [component()] });
    delete (withMissingPosition.components as Array<Record<string, unknown>>)[0]?.position;
    const withMissingStatus = document({ components: [component()] });
    delete (withMissingStatus.components as Array<Record<string, unknown>>)[0]?.status;
    const withMissingVariable = document({ variables: [{ type: 'static', name: 'a', value: 1 }] });
    delete (withMissingVariable.variables as Array<Record<string, unknown>>)[0]?.value;
    const withMissingCanvas = document();
    delete (withMissingCanvas.canvas as Record<string, unknown>).width;
    const cases: Array<[Record<string, unknown>, (string | number)[], string]> = [
      [withMissingCanvas, ['canvas', 'width'], 'DOCUMENT_FIELD_INVALID'],
      [withMissingId, ['components', 0, 'id'], 'DOCUMENT_FIELD_INVALID'],
      [withMissingPosition, ['components', 0, 'position'], 'COMPONENT_GEOMETRY_INVALID'],
      [withMissingStatus, ['components', 0, 'status'], 'DOCUMENT_FIELD_INVALID'],
      [withMissingVariable, ['variables', 0, 'value'], 'DOCUMENT_FIELD_INVALID'],
    ];
    for (const [input, path, code] of cases) {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.path).toEqual(path);
        expect(result.diagnostics[0]?.code).toBe(code);
      }
    }
  });

  it('rejects explicit undefined values at the JSON boundary', () => {
    const input = document({ components: [component({ id: undefined as unknown as string })] });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_VALUE_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'id']);
    }
  });

  it('reports geometry violations with the geometry code', () => {
    const cases: Array<[Record<string, unknown>, (string | number)[]]> = [
      [
        document({ components: [component({ position: { x: 1_000_001, y: 0 } })] }),
        ['components', 0, 'position', 'x'],
      ],
      [
        document({ components: [component({ position: { x: -1_000_001, y: 0 } })] }),
        ['components', 0, 'position', 'x'],
      ],
      [
        document({ components: [component({ size: { width: 0, height: 1 } })] }),
        ['components', 0, 'size', 'width'],
      ],
      [
        document({ components: [component({ size: { width: 1, height: 1_000_001 } })] }),
        ['components', 0, 'size', 'height'],
      ],
      [document({ components: [component({ rotation: 180 })] }), ['components', 0, 'rotation']],
      [document({ components: [component({ rotation: -180.5 })] }), ['components', 0, 'rotation']],
      [document({ components: [component({ zIndex: 1.5 })] }), ['components', 0, 'zIndex']],
      [document({ components: [component({ zIndex: -1 })] }), ['components', 0, 'zIndex']],
      [document({ canvas: { width: 0, height: 1, backgroundColor: '#000' } }), ['canvas', 'width']],
    ];
    for (const [input, path] of cases) {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe(
          path[0] === 'canvas' ? 'DOCUMENT_FIELD_INVALID' : 'COMPONENT_GEOMETRY_INVALID',
        );
        expect(result.diagnostics[0]?.path).toEqual(path);
      }
    }
  });

  it('rejects invalid material types', () => {
    for (const type of ['kpi-card', 'acme.', 'acme.KPI', 'acme/kpi-card', 'acme/kpi', 'acme']) {
      const result = parse(document({ components: [component({ type })] }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('COMPONENT_TYPE_INVALID');
      }
    }
  });

  it('accepts names at the code point limit and rejects beyond', () => {
    const atLimit = document({ components: [component({ name: '\u{1f600}'.repeat(256) })] });
    expect(parse(atLimit)).toMatchObject({ ok: true });
    const beyond = document({ components: [component({ name: '\u{1f600}'.repeat(257) })] });
    const result = parse(beyond);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'name']);
    }
  });

  it('rejects blank or control-character names and background colors', () => {
    const blank = parse(document({ components: [component({ name: '   ' })] }));
    expect(blank.ok).toBe(false);
    if (!blank.ok) {
      expect(blank.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
    }
    const control = parse(document({ components: [component({ name: 'a\u0007b' })] }));
    expect(control.ok).toBe(false);
    const color = parse(document({ canvas: { width: 1, height: 1, backgroundColor: '#0\u007f' } }));
    expect(color.ok).toBe(false);
  });

  it('rejects invalid ids, parent ids and variable names', () => {
    const badId = parse(document({ components: [component({ id: '-abc' })] }));
    expect(badId.ok).toBe(false);
    if (!badId.ok) {
      expect(badId.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
    }
    const badParent = parse(document({ components: [component({ parentId: 'has space' })] }));
    expect(badParent.ok).toBe(false);
    const badVariable = parse(
      document({ variables: [{ type: 'static', name: '1abc', value: 0 }] }),
    );
    expect(badVariable.ok).toBe(false);
    if (!badVariable.ok) {
      expect(badVariable.diagnostics[0]?.code).toBe('VARIABLE_NAME_INVALID');
    }
  });

  it('rejects wrong container shapes', () => {
    const propsArray = parse(document({ components: [component({ props: [] })] }));
    expect(propsArray.ok).toBe(false);
    if (!propsArray.ok) {
      expect(propsArray.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
      expect(propsArray.diagnostics[0]?.path).toEqual(['components', 0, 'props']);
    }
    const dataSourceType = parse(
      document({ components: [component({ dataSource: { type: 'dynamic', value: 1 } })] }),
    );
    expect(dataSourceType.ok).toBe(false);
  });

  it('rejects duplicate component ids', () => {
    const input = document({
      components: [component({ id: 'a' }), component({ id: 'b' }), component({ id: 'a' })],
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('COMPONENT_ID_DUPLICATE');
      expect(result.diagnostics[0]?.path).toEqual(['components', 2, 'id']);
    }
  });

  it('rejects missing and self parent references', () => {
    const missing = parse(document({ components: [component({ parentId: 'ghost' })] }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.diagnostics[0]?.code).toBe('COMPONENT_PARENT_MISSING');
      expect(missing.diagnostics[0]?.path).toEqual(['components', 0, 'parentId']);
    }
    const self = parse(document({ components: [component({ parentId: 'c1' })] }));
    expect(self.ok).toBe(false);
    if (!self.ok) {
      expect(self.diagnostics[0]?.code).toBe('COMPONENT_PARENT_SELF');
    }
  });

  it('reports one cycle diagnostic at the smallest member index', () => {
    const input = document({
      components: [
        component({ id: 'a', parentId: 'c' }),
        component({ id: 'b', parentId: 'a' }),
        component({ id: 'c', parentId: 'b' }),
      ],
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const cycle = result.diagnostics.find(
        (diagnostic) => diagnostic.code === 'COMPONENT_PARENT_CYCLE',
      );
      expect(cycle).toBeDefined();
      expect(cycle?.path).toEqual(['components', 0, 'parentId']);
    }
  });

  it('reports two independent cycles', () => {
    const input = document({
      components: [
        component({ id: 'a', parentId: 'b' }),
        component({ id: 'b', parentId: 'a' }),
        component({ id: 'x', parentId: 'y' }),
        component({ id: 'y', parentId: 'x' }),
      ],
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const cycles = result.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'COMPONENT_PARENT_CYCLE',
      );
      expect(cycles).toHaveLength(2);
    }
  });

  it('accepts long acyclic parent chains', () => {
    const components: Array<Record<string, unknown>> = [];
    for (let index = 0; index < 10_000; index++) {
      const parentId = index === 0 ? null : `c${index - 1}`;
      components.push(component({ id: `c${index}`, parentId }));
    }
    const result = parse(document({ components }));
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate variable names', () => {
    const input = document({
      variables: [
        { type: 'static', name: 'a', value: 1 },
        { type: 'static', name: 'a', value: 2 },
      ],
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('VARIABLE_NAME_DUPLICATE');
      expect(result.diagnostics[0]?.path).toEqual(['variables', 1, 'name']);
    }
  });

  it('enforces component and variable count limits', () => {
    const manyComponents = document({
      components: Array.from({ length: 10_001 }, (_, index) => component({ id: `c${index}` })),
    });
    const componentsResult = parse(manyComponents);
    expect(componentsResult.ok).toBe(false);
    if (!componentsResult.ok) {
      expect(componentsResult.diagnostics[0]?.code).toBe('DOCUMENT_LIMIT_EXCEEDED');
      expect(componentsResult.diagnostics[0]?.path).toEqual(['components']);
    }
    const manyVariables = document({
      variables: Array.from({ length: 1_001 }, (_, index) => ({
        type: 'static' as const,
        name: `v${index}`,
        value: 0,
      })),
    });
    const variablesResult = parse(manyVariables);
    expect(variablesResult.ok).toBe(false);
    if (!variablesResult.ok) {
      expect(variablesResult.diagnostics[0]?.code).toBe('DOCUMENT_LIMIT_EXCEEDED');
      expect(variablesResult.diagnostics[0]?.path).toEqual(['variables']);
    }
  });

  it('enforces the single data source value budget', () => {
    const payload: Record<string, string> = {};
    for (let index = 0; index < 10_000; index++) {
      payload[`key-${'x'.repeat(90)}${index}`] = 'value';
    }
    const input = document({
      components: [component({ dataSource: { type: 'static', value: payload } })],
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_LIMIT_EXCEEDED');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'dataSource', 'value']);
    }
  });

  it('enforces the total canonical byte budget', () => {
    const components: Array<Record<string, unknown>> = [];
    for (let index = 0; index < 10_000; index++) {
      const props: Record<string, string> = {};
      for (let key = 0; key < 60; key++) {
        props[`k${key}`] = 'v'.repeat(90);
      }
      components.push(component({ id: `c${index}`, props }));
    }
    const result = parse(document({ components }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === 'DOCUMENT_LIMIT_EXCEEDED'),
      ).toBe(true);
    }
  });

  it('orders diagnostics deterministically by path', () => {
    const input = document({
      components: [component({ position: { x: 1_000_001, y: 0 } })],
      variables: [{ type: 'static', name: '1bad', value: 0 }],
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'position', 'x']);
      expect(result.diagnostics[1]?.path).toEqual(['variables', 0, 'name']);
    }
  });

  it('truncates diagnostics at the limit with a sentinel', () => {
    const input: Record<string, unknown> = document();
    for (let index = 0; index < 150; index++) {
      input[`unknown${index}`] = 1;
    }
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(100);
      expect(result.diagnostics[99]?.code).toBe('DIAGNOSTIC_LIMIT_REACHED');
      expect(result.diagnostics[99]?.path).toEqual([]);
    }
  });

  it('never leaks input values into diagnostic messages', () => {
    const secret = 'super-secret-canary-value-7f3a';
    const input = document({
      components: [
        component({
          name: 'bad\u0000name',
          props: { token: secret },
          dataSource: { type: 'static', value: secret },
        }),
      ],
      variables: [{ type: 'static', name: 'a', value: secret }],
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
      for (const diagnostic of result.diagnostics) {
        expect(diagnostic.message).not.toContain(secret);
      }
    }
  });

  it('does not mutate input and is deterministic', () => {
    const input = document({
      components: [component({ id: 'a' }), component({ id: 'b', parentId: 'a' })],
    });
    const snapshot = structuredClone(input);
    const first = parse(input);
    const second = parse(input);
    expect(input).toEqual(snapshot);
    expect(first).toEqual(second);
  });
});

describe('parseScreenDocument canvas background image', () => {
  function canvasWithBackgroundImage(backgroundImage: unknown): Record<string, unknown> {
    return document({
      canvas: { width: 1920, height: 1080, backgroundColor: '#000000', backgroundImage },
    });
  }

  const VALID_URLS = [
    'https://cdn.x/data-hub/bg.png',
    'http://x/y/z.jpg',
    '/assets/screen-bg.png',
    './bg.png',
    '../assets/bg.png',
    '//cdn.x/bg.png',
    'https://x/bg.png?size=large#frag',
    `https://x/${'a'.repeat(2038)}`,
  ];

  const INVALID_URLS = [
    null,
    42,
    true,
    {},
    [],
    '',
    'a'.repeat(2049),
    'https://x/a b.png',
    'https://x/a\tb.png',
    'https://x/a\u0000b.png',
    'https://x/a\u007fb.png',
    'https://x/a\u0085b.png',
    'https://x/a\\b.png',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'blob:https://x/1',
    'file:///c:/bg.png',
    'ftp://x/bg.png',
    'a.png',
    '/',
    './',
    '//',
    '///x',
    'https://',
    'https:///x',
    'http://?x',
  ];

  it('R1 accepts bounded background image URLs and preserves them', () => {
    for (const url of VALID_URLS) {
      const result = parse(canvasWithBackgroundImage(url));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canvas.backgroundImage).toBe(url);
      }
    }
  });

  it('R1 accepts optional fit values and rejects anything else', () => {
    for (const fit of ['cover', 'contain']) {
      const result = parse(
        document({
          canvas: {
            width: 1920,
            height: 1080,
            backgroundColor: '#000000',
            backgroundImage: 'https://x/bg.png',
            backgroundImageFit: fit,
          },
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canvas.backgroundImageFit).toBe(fit);
      }
    }
    for (const fit of ['fill', 'none', 1, null, {}]) {
      const result = parse(
        document({
          canvas: {
            width: 1920,
            height: 1080,
            backgroundColor: '#000000',
            backgroundImage: 'https://x/bg.png',
            backgroundImageFit: fit,
          },
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.path).toEqual(['canvas', 'backgroundImageFit']);
      }
    }
  });

  it('R1 rejects unbounded, malformed, or injected background image URLs fail-closed', () => {
    for (const url of INVALID_URLS) {
      const result = parse(canvasWithBackgroundImage(url));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
        expect(result.diagnostics[0]?.path).toEqual(['canvas', 'backgroundImage']);
      }
    }
  });

  it('R1 treats an absent background image as declared and keeps unknown-field rejection', () => {
    const result = parse(document());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canvas.backgroundImage).toBeUndefined();
      expect(result.value.canvas.backgroundImageFit).toBeUndefined();
    }
    const unknown = parse(
      document({
        canvas: {
          width: 1920,
          height: 1080,
          backgroundColor: '#000000',
          backgroundUrl: 'https://x/bg.png',
        },
      }),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(unknown.diagnostics[0]?.path).toEqual(['canvas', 'backgroundUrl']);
    }
  });
});
