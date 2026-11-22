import { describe, expect, it } from 'vitest';
import {
  inferBaseScreenMaterialEditorControl,
  parseBaseScreenMaterialEditorDescriptor,
} from '../../src/index.js';

const props = (path: string) => ({ target: 'props' as const, path: [path] });
const style = (path: string) => ({ target: 'style' as const, path: [path] });

describe('inferBaseScreenMaterialEditorControl (ADR-0102 §4)', () => {
  it('maps booleans, enums and spacing objects to one control each', () => {
    expect(inferBaseScreenMaterialEditorControl(props('visible'), { kind: 'boolean' })).toBe(
      'boolean',
    );
    expect(
      inferBaseScreenMaterialEditorControl(style('textAlign'), {
        kind: 'enum',
        values: ['left', 'center', 'right'],
      }),
    ).toBe('segmented');
    expect(
      inferBaseScreenMaterialEditorControl(props('shape'), {
        kind: 'enum',
        values: ['circle', 'rect'],
      }),
    ).toBe('select');
    const side = { kind: 'number' as const };
    expect(
      inferBaseScreenMaterialEditorControl(style('padding'), {
        kind: 'object',
        properties: { top: side, right: side, bottom: side, left: side },
        required: [],
      }),
    ).toBe('spacing');
  });

  it('tells color keys from text by the style-key naming convention', () => {
    const text = { kind: 'string' as const };
    expect(inferBaseScreenMaterialEditorControl(style('color'), text)).toBe('color');
    expect(inferBaseScreenMaterialEditorControl(style('backgroundColor'), text)).toBe('color');
    expect(inferBaseScreenMaterialEditorControl(props('titleText'), text)).toBe('text');
    // 键名不像颜色，但声明了渐变能力：只有取色器能承载渐变。
    expect(
      inferBaseScreenMaterialEditorControl({ ...style('fill'), allowGradient: true }, text),
    ).toBe('color');
  });

  it('gives the same numeric semantics the same control', () => {
    const bounded = { kind: 'number' as const, minimum: 0, maximum: 6 };
    // 小整数计数（props、无单位）→ 步进器。
    expect(inferBaseScreenMaterialEditorControl(props('decimals'), bounded)).toBe('stepper');
    // 同样的跨度放在 style 上是长度 → 滑杆（control 'number'），带单位时也一样。
    expect(inferBaseScreenMaterialEditorControl(style('strokeWidth'), bounded)).toBe('number');
    expect(
      inferBaseScreenMaterialEditorControl({ ...style('strokeWidth'), unit: 'px' }, bounded),
    ).toBe('number');
    // props 上带单位的有界值是长度不是计数。
    expect(
      inferBaseScreenMaterialEditorControl({ ...props('gap'), unit: 'px' }, bounded),
    ).toBe('number');
    // 无界：有单位 → 带单位数字，无单位 → 数字框。
    expect(
      inferBaseScreenMaterialEditorControl({ ...props('offset'), unit: 'px' }, { kind: 'number' }),
    ).toBe('unit-number');
    expect(inferBaseScreenMaterialEditorControl(props('threshold'), { kind: 'number' })).toBe(
      'number',
    );
    // 跨度超过 1000 不做滑杆。
    expect(
      inferBaseScreenMaterialEditorControl(style('maxWidth'), {
        kind: 'number',
        minimum: 0,
        maximum: 4000,
      }),
    ).toBe('number');
    // 小数步长不是计数。
    expect(
      inferBaseScreenMaterialEditorControl({ ...props('ratio'), step: 0.5 }, bounded),
    ).toBe('number');
  });

  it('routes custom tags and data bindings without needing a schema', () => {
    expect(
      inferBaseScreenMaterialEditorControl({ ...props('tone'), tagName: 'x-tone' }, undefined),
    ).toBe('custom');
    expect(
      inferBaseScreenMaterialEditorControl(
        { target: 'data', path: ['binding', 'fields', 'value'] },
        undefined,
      ),
    ).toBe('field-selector');
    expect(
      inferBaseScreenMaterialEditorControl({ target: 'data', path: ['params', 'limit'] }, undefined),
    ).toBeUndefined();
  });
});

describe('parseBaseScreenMaterialEditorDescriptor control normalization (ADR-0102 D2)', () => {
  const propsSchema = {
    kind: 'object' as const,
    properties: {
      decimals: { kind: 'number' as const, minimum: 0, maximum: 4 },
      series: {
        kind: 'array' as const,
        items: {
          kind: 'object' as const,
          properties: { name: { kind: 'string' as const }, color: { kind: 'string' as const } },
          required: [],
        },
        maxItems: 8,
      },
    },
    required: [],
  };
  const styleSchema = {
    kind: 'object' as const,
    properties: { color: { kind: 'string' as const } },
    required: [],
  };

  it('fills omitted controls, including item fields, and keeps declared ones', () => {
    const parsed = parseBaseScreenMaterialEditorDescriptor(
      {
        appearance: [
          {
            id: 'format',
            label: '读数格式',
            fields: [
              { id: 'decimals', target: 'props', path: ['decimals'], label: '小数位' },
              { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
              {
                id: 'series',
                target: 'props',
                path: ['series'],
                label: '系列',
                control: 'reorderable-array',
                itemFields: [
                  { id: 'name', target: 'props', path: ['name'], label: '名称' },
                  { id: 'seriesColor', target: 'props', path: ['color'], label: '颜色' },
                ],
              },
            ],
          },
        ],
      },
      propsSchema,
      styleSchema,
      undefined,
      undefined,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const fields = parsed.value.appearance?.[0]?.fields ?? [];
    expect(fields.map((field) => field.control)).toEqual(['stepper', 'color', 'reorderable-array']);
    expect(fields[2]?.itemFields?.map((field) => field.control)).toEqual(['text', 'color']);
  });

  it('requires an explicit control when it cannot be inferred', () => {
    const parsed = parseBaseScreenMaterialEditorDescriptor(
      {
        data: [
          {
            id: 'query',
            label: '查询',
            fields: [{ id: 'limit', target: 'data', path: ['params', 'limit'], label: '条数' }],
          },
        ],
      },
      propsSchema,
      styleSchema,
      undefined,
      undefined,
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.diagnostics[0]?.path).toEqual(['editorDescriptor', 'data', 0, 'fields', 0, 'control']);
  });
});
