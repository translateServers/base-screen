import type { BaseScreenMaterialPropSchema } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { parsePropertyControlValue } from './designer-panel-dom.js';

describe('designer panel property parsing', () => {
  it('parses schema-driven number, enum, boolean, and json controls', () => {
    const number: BaseScreenMaterialPropSchema = { kind: 'number', minimum: 0 };
    const enumSchema: BaseScreenMaterialPropSchema = { kind: 'enum', values: ['left', 'right'] };
    const object: BaseScreenMaterialPropSchema = {
      kind: 'object',
      properties: { enabled: { kind: 'boolean' } },
      required: ['enabled'],
    };

    expect(parsePropertyControlValue({ value: '12.5' }, number)).toBe(12.5);
    expect(parsePropertyControlValue({ value: 'right' }, enumSchema)).toBe('right');
    expect(parsePropertyControlValue({ value: '', type: 'checkbox', checked: true }, object)).toBe(
      true,
    );
    expect(parsePropertyControlValue({ value: '{"enabled":true}' }, object)).toEqual({
      enabled: true,
    });
  });

  it('rejects invalid number, enum, and json input before mutations', () => {
    const number: BaseScreenMaterialPropSchema = { kind: 'number' };
    const enumSchema: BaseScreenMaterialPropSchema = { kind: 'enum', values: ['left', 'right'] };
    const object: BaseScreenMaterialPropSchema = {
      kind: 'object',
      properties: {},
      required: [],
    };

    expect(parsePropertyControlValue({ value: 'not-a-number' }, number)).toBeUndefined();
    expect(parsePropertyControlValue({ value: 'center' }, enumSchema)).toBeUndefined();
    expect(parsePropertyControlValue({ value: '{' }, object)).toBeUndefined();
  });
});
