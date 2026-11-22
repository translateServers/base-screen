import { parseBaseScreenMaterialEditorDescriptor } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createBaseScreenChartLegendConfig,
  createBaseScreenChartTitleConfig,
  createBaseScreenNumberFormatConfig,
  mergeBaseScreenMaterialConfigGroups,
} from '../src/index.js';

describe('material config groups (ADR-0102 §11)', () => {
  it('keeps one field order and one set of keys for number formats', () => {
    const full = createBaseScreenNumberFormatConfig({
      prefix: true,
      unit: true,
      decimals: 1,
      thousandsSeparator: true,
    });
    expect(full.fields.map((field) => field.path[0])).toEqual([
      'prefix',
      'unit',
      'decimals',
      'thousandsSeparator',
    ]);
    expect(full.defaults).toEqual({ prefix: '', unit: '', decimals: 1, thousandsSeparator: true });
    expect(full.required).toEqual(['decimals', 'thousandsSeparator']);
    // 只要小数位时其余字段不出现。
    const minimal = createBaseScreenNumberFormatConfig({ maxDecimals: 3 });
    expect(Object.keys(minimal.properties)).toEqual(['decimals']);
    expect(minimal.properties.decimals).toEqual({ kind: 'number', minimum: 0, maximum: 3 });
  });

  it('leaves controls to inference so the same keys render the same controls', () => {
    const merged = mergeBaseScreenMaterialConfigGroups([
      createBaseScreenNumberFormatConfig({ unit: true, thousandsSeparator: false }),
      createBaseScreenChartTitleConfig(),
      createBaseScreenChartLegendConfig(),
    ]);
    const fields = [
      ...createBaseScreenChartTitleConfig().fields,
      ...createBaseScreenChartLegendConfig().fields,
      ...createBaseScreenNumberFormatConfig({ unit: true, thousandsSeparator: false }).fields,
    ];
    const parsed = parseBaseScreenMaterialEditorDescriptor(
      { appearance: [{ id: 'all', label: '全部', fields }] },
      { kind: 'object', properties: merged.properties, required: [...merged.required] },
      undefined,
      undefined,
      undefined,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.appearance?.[0]?.fields.map((field) => field.control)).toEqual([
      'text',
      'boolean',
      'text',
      'stepper',
      'boolean',
    ]);
  });

  it('rejects groups that claim the same props key', () => {
    expect(() =>
      mergeBaseScreenMaterialConfigGroups([
        createBaseScreenChartLegendConfig(),
        createBaseScreenChartLegendConfig(),
      ]),
    ).toThrow(/showLegend/);
  });
});
