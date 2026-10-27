import { describe, expect, it } from 'vitest';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

describe('parseScreenDocument validation', () => {
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
        input: document({ blueprint: { relations: [], extra: true } }),
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
        input: document({
          variables: [{ type: 'static', id: 'a', name: 'a', initialValue: 1, extra: true }],
        }),
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
    const withMissingVariable = document({
      variables: [{ type: 'static', id: 'a', name: 'a', initialValue: 1 }],
    });
    delete (withMissingVariable.variables as Array<Record<string, unknown>>)[0]?.initialValue;
    const withMissingCanvas = document();
    delete (withMissingCanvas.canvas as Record<string, unknown>).width;
    const cases: Array<[Record<string, unknown>, (string | number)[], string]> = [
      [withMissingCanvas, ['canvas', 'width'], 'DOCUMENT_FIELD_INVALID'],
      [withMissingId, ['components', 0, 'id'], 'DOCUMENT_FIELD_INVALID'],
      [withMissingPosition, ['components', 0, 'position'], 'COMPONENT_GEOMETRY_INVALID'],
      [withMissingStatus, ['components', 0, 'status'], 'DOCUMENT_FIELD_INVALID'],
      [withMissingVariable, ['variables', 0, 'initialValue'], 'DOCUMENT_FIELD_INVALID'],
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
      document({ variables: [{ type: 'static', id: '1abc', name: '1abc', initialValue: 0 }] }),
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
        { type: 'static', id: 'a', name: 'a', initialValue: 1 },
        { type: 'static', id: 'b', name: 'a', initialValue: 2 },
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
        id: `v${index}`,
        name: `v${index}`,
        initialValue: 0,
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
      variables: [{ type: 'static', id: 'variable-1', name: '1bad', initialValue: 0 }],
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
      variables: [{ type: 'static', id: 'a', name: 'a', initialValue: secret }],
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

  it('accepts empty and bounded variable descriptions and rejects control and over-limit text', () => {
    const accepted = parse(
      document({
        variables: [
          { type: 'static', id: 'empty', name: 'empty', description: '', initialValue: 0 },
          {
            type: 'static',
            id: 'count',
            name: 'count',
            description: '🚀'.repeat(4_096),
            initialValue: 1,
          },
          {
            type: 'data-source',
            id: 'tenant',
            name: 'tenant',
            description: '当前租户',
            initialValue: null,
            sourceId: 'tenant-id',
            controlled: true,
          },
        ],
      }),
    );
    expect(accepted).toMatchObject({ ok: true });
    for (const description of ['bad\ntext', 'x'.repeat(4_097)]) {
      expect(
        parse(
          document({
            variables: [
              { type: 'static', id: 'count', name: 'count', description, initialValue: 1 },
            ],
          }),
        ),
      ).toMatchObject({
        ok: false,
        diagnostics: [{ path: ['variables', 0, 'description'] }],
      });
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
