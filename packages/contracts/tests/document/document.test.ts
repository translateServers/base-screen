import { describe, expect, it } from 'vitest';
import { isScreenMaterialType } from '../../src/document/identity.js';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

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

  it('accepts a strict field binding on a static data source', () => {
    const result = parse(
      document({
        components: [
          component({
            dataSource: {
              type: 'static',
              value: {
                fields: [{ id: 'amount', label: 'Amount', valueType: 'number', nullable: false }],
                rows: [{ amount: 42 }],
              },
              binding: { fields: { measures: ['amount'] } },
            },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({ ok: true });
  });

  it('rejects an unknown static data binding shape', () => {
    const result = parse(
      document({
        components: [
          component({
            dataSource: {
              type: 'static',
              value: [],
              binding: { fields: { measures: ['amount'] }, extra: true },
            },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({ ok: false });
  });

  it('accepts solid, linear, and radial canvas backgrounds', () => {
    for (const background of [
      { type: 'solid', color: '#123456' },
      {
        type: 'linear-gradient',
        angle: 45,
        stops: [
          { color: '#123456', position: 0 },
          { color: '#abcdef', position: 100 },
        ],
      },
      {
        type: 'radial-gradient',
        position: { x: 25, y: 75 },
        stops: [
          { color: '#123456', position: 0 },
          { color: 'transparent', position: 100 },
        ],
      },
    ]) {
      expect(
        parse(document({ canvas: { width: 1, height: 1, backgroundColor: '#000', background } })),
      ).toMatchObject({ ok: true });
    }
  });

  it('rejects malformed canvas gradients fail-closed', () => {
    const result = parse(
      document({
        canvas: {
          width: 1,
          height: 1,
          backgroundColor: '#000',
          background: {
            type: 'linear-gradient',
            angle: 45,
            stops: [
              { color: '#123456', position: 60 },
              { color: '#abcdef', position: 40 },
            ],
          },
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics[0]?.path).toEqual(['canvas', 'background', 'stops', 1, 'position']);
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
});
