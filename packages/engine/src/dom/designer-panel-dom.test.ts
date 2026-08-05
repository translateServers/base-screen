import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { createPropertyTransaction, parsePropertyControlValue } from './designer-panel-dom.js';

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

  it('accepts only schema props that are exposed by the manifest property panel', () => {
    class FakeInput {
      readonly dataset: { prop?: string };
      readonly value: string;

      constructor(prop: string, value: string) {
        this.dataset = { prop };
        this.value = value;
      }
    }
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const manifest = {
      type: 'base.text',
      propsSchema: {
        kind: 'object',
        properties: { title: { kind: 'string' }, internal: { kind: 'string' } },
        required: ['title', 'internal'],
      },
      propertyPanel: [{ prop: 'title', label: '标题', control: 'text' }],
    } as unknown as BaseScreenMaterialManifest;
    const document = {
      canvas: { width: 100, height: 100, backgroundColor: '#000000' },
      components: [
        {
          id: 'text-1',
          type: 'base.text',
          name: '文本',
          parentId: null,
          position: { x: 0, y: 0 },
          size: { width: 10, height: 10 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: { title: '原始', internal: '受保护' },
          style: {},
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    } as ScreenDocument;
    const catalog = {
      get: () => ({ manifest }),
      has: () => true,
      list: () => [],
    } as unknown as BaseScreenMaterialCatalog;
    const interaction = { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] };

    expect(
      createPropertyTransaction(
        new FakeInput('internal', '泄露') as unknown as HTMLInputElement,
        document,
        interaction,
        catalog,
      ),
    ).toBeUndefined();
    expect(
      createPropertyTransaction(
        new FakeInput('title', '更新') as unknown as HTMLInputElement,
        document,
        interaction,
        catalog,
      ),
    ).toMatchObject({ ok: true });
    vi.unstubAllGlobals();
  });
});
