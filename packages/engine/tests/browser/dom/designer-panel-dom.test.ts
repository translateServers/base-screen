import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialPropSchema,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import {
  createDataSourceTransaction,
  createPropertyTransaction,
  parsePropertyControlValue,
} from '../../../src/browser/dom/designer-panel-dom.js';

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

class DataPanel {
  constructor(
    private readonly values: Record<string, string>,
    private readonly sourceType: string,
  ) {}

  querySelector<T>(selector: string): T | null {
    if (selector === '[data-data-source-type]') return { value: this.sourceType } as T;
    const field = /data-data-source-field="([^"]+)"/.exec(selector)?.[1];
    return field === undefined ? null : ({ value: this.values[field] ?? '' } as T);
  }
}

class DataInput {
  readonly dataset: Record<string, string>;

  constructor(
    readonly value: string,
    private readonly panel: DataPanel,
    dataset: Record<string, string> = { dataSourceField: 'params' },
  ) {
    this.dataset = dataset;
  }

  closest<T>(selector: string): T | null {
    return (selector === '[data-inspector-pane="data"]' ? this.panel : null) as T | null;
  }
}

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

function dataCatalog(): BaseScreenMaterialCatalog {
  return {
    get: () => ({ manifest: { dataCapabilities: ['static', 'host-resource'] } }),
  } as unknown as BaseScreenMaterialCatalog;
}

function resourceAuthority(): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'asset'
        ? {
            kind: 'dataResourceType',
            id: 'asset',
            name: '资源',
            configSchema: {
              kind: 'object',
              properties: { locale: { kind: 'string' } },
              required: ['locale'],
            },
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

function dataTarget(
  sourceType: string,
  values: Record<string, string>,
  dataset?: Record<string, string>,
): DataInput {
  return new DataInput(values.params ?? '', new DataPanel(values, sourceType), dataset);
}

describe('designer data source authoring', () => {
  it('R9 commits canonical static values without a host contribution', () => {
    const result = createDataSourceTransaction(
      dataTarget(
        'static',
        { static: '{"ready":true}' },
        { dataSourceType: 'true' },
      ) as unknown as HTMLSelectElement,
      dataDocument(),
      { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] },
      dataCatalog(),
      false,
      undefined,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        commands: [
          {
            patch: { dataSource: { type: 'static', value: { ready: true } } },
          },
        ],
      },
    });
  });

  it('R9 validates the active resource type and params before creating a host-resource transaction', () => {
    const document = dataDocument();
    const interaction = { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] };

    const valid = createDataSourceTransaction(
      dataTarget('host-resource', {
        resourceType: 'asset',
        resourceId: 'product-42',
        params: '{"locale":"zh-CN"}',
      }) as unknown as HTMLTextAreaElement,
      document,
      interaction,
      dataCatalog(),
      true,
      resourceAuthority(),
    );
    const invalid = createDataSourceTransaction(
      dataTarget('host-resource', {
        resourceType: 'asset',
        resourceId: 'product-42',
        params: '{"unexpected":true}',
      }) as unknown as HTMLTextAreaElement,
      document,
      interaction,
      dataCatalog(),
      true,
      resourceAuthority(),
    );

    expect(valid).toMatchObject({
      ok: true,
      value: {
        commands: [
          {
            patch: {
              dataSource: {
                type: 'host-resource',
                resourceType: 'asset',
                resourceId: 'product-42',
                params: { locale: { kind: 'literal', value: 'zh-CN' } },
                binding: null,
              },
            },
          },
        ],
      },
    });
    expect(invalid).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          path: [],
          message: '数据源配置无效，未保存修改。',
        },
      ],
    });
  });

  it('R9 fails closed for unknown resources without disclosing entered values', () => {
    const result = createDataSourceTransaction(
      dataTarget('host-resource', {
        resourceType: 'unknown',
        resourceId: 'https://example.test/private?token=secret',
        params: '{"credential":"secret"}',
      }) as unknown as HTMLTextAreaElement,
      dataDocument(),
      { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] },
      dataCatalog(),
      true,
      resourceAuthority(),
    );

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
          path: [],
          message: '资源类型不可用，未保存修改。',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('example.test');
  });

  it('R3 rejects unsafe JSON data drafts without creating a transaction', () => {
    const result = createDataSourceTransaction(
      dataTarget('static', {
        static: '{"__proto__":{"polluted":true}}',
      }) as unknown as HTMLTextAreaElement,
      dataDocument(),
      { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] },
      dataCatalog(),
      false,
      undefined,
    );

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'CORE_COMMAND_INVALID',
          path: [],
          message: '数据源配置无效，未保存修改。',
        },
      ],
    });
  });
});
