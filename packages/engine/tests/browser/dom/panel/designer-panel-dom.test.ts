import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import {
  createPropertyTransaction,
  parsePropertyControlValue,
} from '../../../../src/browser/dom/panel/designer-panel-dom.js';

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

  it('rejects unsafe canvas background image URLs before canonical execution', () => {
    const interaction = { selectedComponentIds: [], focusedComponentId: null };
    const unsafe = createPropertyTransaction(
      {
        dataset: { canvasProperty: 'backgroundImage' },
        value: 'javascript:alert(1)',
      } as unknown as EventTarget,
      dataDocument(),
      interaction,
      undefined,
    );
    const valid = createPropertyTransaction(
      {
        dataset: { canvasProperty: 'backgroundImage' },
        value: '../assets/background.png',
      } as unknown as EventTarget,
      dataDocument(),
      interaction,
      undefined,
    );

    expect(unsafe).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: 'DOCUMENT_FIELD_INVALID',
          path: ['canvas', 'backgroundImage'],
        },
      ],
    });
    expect(valid).toMatchObject({
      ok: true,
      value: {
        commands: [
          { type: 'update-canvas', patch: { backgroundImage: '../assets/background.png' } },
        ],
      },
    });
  });

  it('AE-ED-C02 rejects invalid number, enum, and json input before mutations', () => {
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

  it('deletes an optional numeric style when its control is cleared', () => {
    const manifest = {
      type: 'base.text',
      stylePanel: [
        { style: 'fontSize', label: '字号', control: 'number' },
        { style: 'lineHeight', label: '行高', control: 'number' },
      ],
      styleSchema: {
        kind: 'object',
        properties: {
          fontSize: { kind: 'number', minimum: 1 },
          lineHeight: { kind: 'number', minimum: 1, maximum: 512 },
        },
        required: ['fontSize'],
      },
      propertyPanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
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
          size: { width: 100, height: 40 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: {},
          style: { fontSize: 32, lineHeight: 40 },
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    } as ScreenDocument;
    const catalog = {
      get: () => ({ manifest }),
    } as unknown as BaseScreenMaterialCatalog;

    expect(
      createPropertyTransaction(
        {
          dataset: { style: 'lineHeight' },
          type: 'number',
          value: '',
        } as unknown as HTMLInputElement,
        document,
        { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] },
        catalog,
      ),
    ).toEqual({
      ok: true,
      value: {
        commands: [
          {
            type: 'update-components',
            componentIds: ['text-1'],
            patch: { style: { fontSize: 32 } },
          },
        ],
      },
      diagnostics: [],
    });
  });

  it('R3 rejects unsafe JSON property drafts before mutations', () => {
    const object: BaseScreenMaterialPropSchema = {
      kind: 'object',
      properties: {},
      required: [],
    };

    expect(
      parsePropertyControlValue({ value: '{"__proto__":{"polluted":true}}' }, object),
    ).toBeUndefined();
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

  it('creates a subtree position transaction when editing a selected group position', () => {
    class FakeInput {
      readonly dataset: { property: string };

      constructor(
        property: string,
        readonly value: string,
      ) {
        this.dataset = { property };
      }
    }
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const document = {
      canvas: { width: 100, height: 100, backgroundColor: '#000000' },
      components: [
        {
          id: 'group',
          type: 'base.group',
          name: '组合',
          parentId: null,
          position: { x: 10, y: 20 },
          size: { width: 100, height: 100 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: {},
          style: {},
          dataSource: null,
        },
        {
          id: 'child',
          type: 'base.text',
          name: '子项',
          parentId: 'group',
          position: { x: 30, y: 50 },
          size: { width: 10, height: 10 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: {},
          style: {},
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    } as ScreenDocument;
    const catalog = {
      get: (type: string) => ({
        manifest: {
          type,
          designCapabilities: { resize: true, rotate: true, children: type === 'base.group' },
          propertyPanel: [],
          propsSchema: { kind: 'object', properties: {}, required: [] },
          stylePanel: [],
          styleSchema: { kind: 'object', properties: {}, required: [] },
        },
      }),
    } as unknown as BaseScreenMaterialCatalog;

    expect(
      createPropertyTransaction(
        new FakeInput('x', '40') as unknown as HTMLInputElement,
        document,
        { focusedComponentId: 'group', selectedComponentIds: ['group'] },
        catalog,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [
          { componentIds: ['group'], patch: { position: { x: 40, y: 20 } } },
          { componentIds: ['child'], patch: { position: { x: 60, y: 50 } } },
        ],
      },
    });
    expect(
      createPropertyTransaction(
        new FakeInput('width', '200') as unknown as HTMLInputElement,
        document,
        { focusedComponentId: 'group', selectedComponentIds: ['group'] },
        catalog,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [
          { componentIds: ['group'], patch: { size: { width: 200, height: 100 } } },
          { componentIds: ['child'], patch: { size: { width: 20, height: 10 } } },
        ],
      },
    });
    vi.unstubAllGlobals();
  });

  it('rounds geometry panel x/y/w/h input to two decimal places', () => {
    class FakeInput {
      readonly dataset: { property: string };
      readonly value: string;

      constructor(property: string, value: string) {
        this.dataset = { property };
        this.value = value;
      }
    }
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const document = {
      canvas: { width: 100, height: 100, backgroundColor: '#000000' },
      components: [
        {
          id: 'text-1',
          type: 'base.text',
          name: '文本',
          parentId: null,
          position: { x: 10.004, y: 20.006 },
          size: { width: 10, height: 10 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: {},
          style: {},
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    } as ScreenDocument;
    const interaction = { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] };

    expect(
      createPropertyTransaction(
        new FakeInput('x', '10.006') as unknown as HTMLInputElement,
        document,
        interaction,
        undefined,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [{ componentIds: ['text-1'], patch: { position: { x: 10.01, y: 20.006 } } }],
      },
    });
    expect(
      createPropertyTransaction(
        new FakeInput('y', '20.004') as unknown as HTMLInputElement,
        document,
        interaction,
        undefined,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [{ componentIds: ['text-1'], patch: { position: { x: 10.004, y: 20 } } }],
      },
    });
    expect(
      createPropertyTransaction(
        new FakeInput('width', '12.345') as unknown as HTMLInputElement,
        document,
        interaction,
        undefined,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [{ componentIds: ['text-1'], patch: { size: { width: 12.35, height: 10 } } }],
      },
    });
    expect(
      createPropertyTransaction(
        new FakeInput('height', '34.567') as unknown as HTMLInputElement,
        document,
        interaction,
        undefined,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [{ componentIds: ['text-1'], patch: { size: { width: 10, height: 34.57 } } }],
      },
    });
    vi.unstubAllGlobals();
  });
});

function dataDocument(): ScreenDocument {
  return {
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
        props: {},
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}
