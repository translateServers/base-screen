import { describe, expect, it } from 'vitest';
import {
  parseBaseScreenMaterialEditorDescriptor,
  parseBaseScreenMaterialManifest,
  resolveSchema,
} from '../../src/index.js';

const propsSchema = {
  kind: 'object' as const,
  properties: {
    title: { kind: 'string' as const, minLength: 1 },
    value: { kind: 'number' as const },
    visible: { kind: 'boolean' as const },
    align: { kind: 'enum' as const, values: ['left', 'center', 'right'] },
    accent: { kind: 'string' as const },
    legend: {
      kind: 'object' as const,
      properties: {
        show: { kind: 'boolean' as const },
        position: { kind: 'enum' as const, values: ['top', 'bottom'] },
        fontSize: { kind: 'number' as const },
      },
      required: [],
    },
    grid: {
      kind: 'array' as const,
      items: { kind: 'number' as const },
      maxItems: 4,
    },
    series: {
      kind: 'array' as const,
      items: {
        kind: 'object' as const,
        properties: {
          name: { kind: 'string' as const },
          type: { kind: 'enum' as const, values: ['line', 'bar'] },
          xField: { kind: 'string' as const },
          yField: { kind: 'string' as const },
          color: { kind: 'string' as const },
        },
        required: [],
      },
      maxItems: 16,
    },
  },
  required: ['title'],
};

const styleSchema = {
  kind: 'object' as const,
  properties: {
    color: { kind: 'string' as const },
    width: { kind: 'number' as const },
    seriesColors: {
      kind: 'array' as const,
      items: {
        kind: 'object' as const,
        properties: {
          field: { kind: 'string' as const },
          color: { kind: 'string' as const },
        },
        required: ['field', 'color'],
      },
      maxItems: 8,
    },
  },
  required: [],
};

const roles = [{ id: 'dimension', minFields: 1, maxFields: 1, valueTypes: ['string'] }];

function firstField(input: Record<string, unknown>, fieldIndex: number): Record<string, unknown> {
  const section = (input.appearance as unknown[])[0] as { fields?: unknown[] } | undefined;
  return (section?.fields?.[fieldIndex] ?? {}) as Record<string, unknown>;
}

function descriptor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appearance: [
      {
        id: 'text',
        label: '文本',
        fields: [
          { id: 'title', target: 'props', path: ['title'], label: '标题', control: 'text' },
          {
            id: 'value',
            target: 'props',
            path: ['value'],
            label: '数值',
            control: 'unit-number',
            unit: '%',
            help: '显示百分比',
            when: [{ path: ['visible'], operator: 'eq', value: true }],
          },
        ],
      },
    ],
    data: [
      {
        id: 'binding',
        label: '数据',
        fields: [
          {
            id: 'xField',
            target: 'data',
            path: ['binding', 'fields', 'dimension'],
            label: '维度字段',
            control: 'field-selector',
          },
        ],
      },
    ],
    interaction: [
      {
        id: 'behaviors',
        label: '交互',
        fields: [
          {
            id: 'tooltipShow',
            target: 'interaction',
            projection: 'props',
            path: ['legend', 'show'],
            label: '显示图例',
            control: 'boolean',
            advanced: true,
            keywords: ['legend', '图例'],
            batchable: true,
          },
        ],
      },
    ],
    events: [
      {
        name: 'valueClick',
        label: '数值点击',
        hint: '点击数值时触发',
        maxPayloadBytes: 65536,
        triggerContexts: ['blueprint'],
        requiredCapability: 'blueprint.material-event',
        payloadSchema: {
          kind: 'object',
          properties: { value: { kind: 'number' } },
          required: [],
        },
      },
    ],
    ...overrides,
  };
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'base.chart',
    tagName: 'base-screen-chart',
    name: '图表',
    category: '数据',
    keywords: [],
    defaultSize: { width: 320, height: 240 },
    defaultProps: { title: '标题', legend: { show: true }, grid: [20, 20, 20, 20], series: [] },
    defaultStyle: { color: '#888888', width: 2 },
    propsSchema,
    propertyPanel: [],
    styleSchema,
    stylePanel: [],
    events: ['valueClick'],
    dataCapabilities: ['static', 'host-resource'],
    dataBinding: { roles },
    designCapabilities: { resize: true, rotate: true, children: false },
    ...overrides,
  };
}

describe('parseBaseScreenMaterialEditorDescriptor', () => {
  it('AE-DC-C01 parses a full valid descriptor and round-trips it', () => {
    const input = descriptor();
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appearance?.[0]?.fields).toHaveLength(2);
    expect(result.value.events?.[0]?.name).toBe('valueClick');
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(input);
  });

  it('AE-DC-C01 accepts a descriptor embedded in a manifest', () => {
    const result = parseBaseScreenMaterialManifest(manifest({ editorDescriptor: descriptor() }));
    expect(result.ok).toBe(true);
  });

  it('accepts explicit gradient capability only on descriptor color controls', () => {
    const supported = descriptor();
    firstField(supported, 0).control = 'color';
    firstField(supported, 0).allowGradient = true;
    const invalid = descriptor();
    firstField(invalid, 0).allowGradient = true;

    expect(
      parseBaseScreenMaterialEditorDescriptor(
        supported,
        propsSchema,
        styleSchema,
        ['valueClick'],
        roles,
      ),
    ).toMatchObject({ ok: true });
    expect(
      parseBaseScreenMaterialEditorDescriptor(
        invalid,
        propsSchema,
        styleSchema,
        ['valueClick'],
        roles,
      ),
    ).toMatchObject({ ok: false });
  });

  it('accepts item fields relative to a style array item schema', () => {
    const input = descriptor({
      appearance: [
        {
          id: 'series-colors',
          label: '系列颜色',
          fields: [
            {
              id: 'seriesColors',
              target: 'style',
              path: ['seriesColors'],
              label: '系列颜色',
              control: 'reorderable-array',
              itemFields: [
                {
                  id: 'seriesField',
                  target: 'style',
                  path: ['field'],
                  label: '字段',
                  control: 'text',
                },
                {
                  id: 'seriesColor',
                  target: 'style',
                  path: ['color'],
                  label: '颜色',
                  control: 'color',
                },
              ],
            },
          ],
        },
      ],
    });
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(true);
  });

  it('AE-DC-C02 rejects an unknown zone and unknown field keys', () => {
    const input = descriptor({ appearance: 'nope' });
    const unknownZone = { ...input, layout: [] };
    const result = parseBaseScreenMaterialEditorDescriptor(
      unknownZone,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((d) => d.code === 'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD')).toBe(
      true,
    );
  });

  it('AE-DC-C02 rejects unknown field keys inside a field', () => {
    const input = descriptor();
    firstField(input, 0).mystery = 1;
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.path).toEqual([
        'editorDescriptor',
        'appearance',
        0,
        'fields',
        0,
        'mystery',
      ]);
    }
  });

  it('AE-DC-C02 rejects dangerous path segments', () => {
    const input = descriptor();
    firstField(input, 0).path = ['__proto__'];
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
  });

  it('AE-DC-C02 rejects a path that does not resolve in the schema', () => {
    const input = descriptor();
    firstField(input, 0).path = ['missing', 'deep'];
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code === 'PLUGIN_CORE_MANIFEST_FIELD_INVALID')).toBe(
        true,
      );
    }
  });

  it('AE-DC-C02 rejects control/kind mismatches and invalid enum targets', () => {
    const input = descriptor();
    firstField(input, 0).control = 'number';
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.message.includes('requires a number field'))).toBe(
        true,
      );
    }
  });

  it('AE-DC-C02 rejects non-JSON and cyclic input values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = parseBaseScreenMaterialEditorDescriptor(
      circular,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
  });

  it('AE-DC-C02 rejects interaction fields without a projection', () => {
    const input = descriptor();
    const field = firstField(input, 0);
    field.target = 'interaction';
    delete field.projection;
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.message.includes('project'))).toBe(true);
    }
  });

  it('AE-DC-C03 rejects descriptors beyond section/field/path limits', () => {
    const tooManySections = descriptor();
    tooManySections.appearance = Array.from({ length: 17 }, (_, i) => ({
      id: `s${i}`,
      label: 's',
      fields: [],
    }));
    const sections = parseBaseScreenMaterialEditorDescriptor(
      tooManySections,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(sections.ok).toBe(false);
    if (!sections.ok) {
      expect(sections.diagnostics.some((d) => d.code === 'PLUGIN_CORE_LIMIT_EXCEEDED')).toBe(true);
    }

    const tooDeep = descriptor();
    const longPath = Array.from({ length: 9 }, (_, i) => `k${i}`);
    firstField(tooDeep, 0).path = longPath;
    const deep = parseBaseScreenMaterialEditorDescriptor(
      tooDeep,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(deep.ok).toBe(false);

    const manyConditions = descriptor();
    firstField(manyConditions, 0).when = Array.from({ length: 9 }, (_, i) => ({
      path: ['visible'],
      operator: 'eq',
      value: i === 0,
    }));
    const conditions = parseBaseScreenMaterialEditorDescriptor(
      manyConditions,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(conditions.ok).toBe(false);
  });

  it('AE-DC-C03 rejects duplicate ids', () => {
    const input = descriptor();
    firstField(input, 1).id = 'title';
    const result = parseBaseScreenMaterialEditorDescriptor(
      input,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code === 'PLUGIN_CORE_CONTRIBUTION_DUPLICATE')).toBe(
        true,
      );
    }
  });

  it('AE-DC-C04 validates event declarations fail closed', () => {
    const unknownEvent = descriptor({
      events: [{ name: 'other', label: 'x' }],
    });
    const result = parseBaseScreenMaterialEditorDescriptor(
      unknownEvent,
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(result.ok).toBe(false);

    const badBudget = descriptor();
    const budget = parseBaseScreenMaterialEditorDescriptor(
      {
        ...badBudget,
        events: [
          {
            ...((badBudget.events as unknown[])[0] as Record<string, unknown>),
            maxPayloadBytes: 100,
          },
        ],
      },
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(budget.ok).toBe(false);

    const badContext = descriptor();
    const context = parseBaseScreenMaterialEditorDescriptor(
      {
        ...badContext,
        events: [
          {
            ...((badContext.events as unknown[])[0] as Record<string, unknown>),
            triggerContexts: ['viewer'],
          },
        ],
      },
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(context.ok).toBe(false);

    const badSchema = descriptor();
    const payload = parseBaseScreenMaterialEditorDescriptor(
      {
        ...badSchema,
        events: [
          {
            ...((badSchema.events as unknown[])[0] as Record<string, unknown>),
            payloadSchema: { kind: 'string' },
          },
        ],
      },
      propsSchema,
      styleSchema,
      ['valueClick'],
      roles,
    );
    expect(payload.ok).toBe(false);
  });
});

describe('resolveSchema', () => {
  it('resolves nested object paths and array items', () => {
    const legend = resolveSchema(['legend', 'show'], propsSchema);
    expect(legend?.kind).toBe('boolean');
    const series = resolveSchema(['series'], propsSchema);
    expect(series?.kind).toBe('array');
  });

  it('returns undefined for unresolvable paths', () => {
    expect(resolveSchema(['nope'], propsSchema)).toBeUndefined();
    expect(resolveSchema(['legend', 'nope'], propsSchema)).toBeUndefined();
  });
});
