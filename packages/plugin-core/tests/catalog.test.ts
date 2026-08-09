import { describe, expect, it } from 'vitest';
import {
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  createBaseScreenMaterialCatalog,
} from '../src/index.js';

function materialManifest(): BaseScreenMaterialManifest {
  return {
    type: 'acme.kpi-card',
    tagName: 'acme-kpi-card',
    name: 'KPI Card',
    category: 'Charts',
    keywords: ['kpi'],
    defaultSize: { width: 320, height: 160 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: true, children: false },
  };
}

function tabularDataAdapter(): BaseScreenMaterialTabularDataAdapter {
  return {
    adapt: ({ dataset, fields }) => ({
      ok: true,
      value: { rows: dataset.rows, columns: fields.columns?.map((field) => field.id) ?? [] },
      diagnostics: [],
    }),
  };
}

describe('material catalog dataset adapter bridge', () => {
  it('preserves the adapter on the entry and attaches it as an own non-enumerable non-writable constructor property', () => {
    const manifest = materialManifest();
    const datasetAdapter = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;

    const catalog = createBaseScreenMaterialCatalog([
      { manifest, constructor, tabularDataAdapter: datasetAdapter },
    ]);

    const entry = catalog.get('acme.kpi-card');
    expect(entry?.tabularDataAdapter).toBe(datasetAdapter);
    const descriptor = Object.getOwnPropertyDescriptor(constructor, 'tabularDataAdapter');
    expect(descriptor).toBeDefined();
    expect(descriptor?.value).toBe(datasetAdapter);
    expect(descriptor?.configurable).toBe(false);
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.writable).toBe(false);
    expect(Object.hasOwn(constructor, 'tabularDataAdapter')).toBe(true);
  });

  it('keeps the serialized manifest unchanged when an adapter is attached', () => {
    const manifest = materialManifest();
    const datasetAdapter = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;

    const catalog = createBaseScreenMaterialCatalog([
      { manifest, constructor, tabularDataAdapter: datasetAdapter },
    ]);

    expect(JSON.stringify(catalog.get('acme.kpi-card')?.manifest)).toBe(JSON.stringify(manifest));
    expect(JSON.stringify(catalog.list()[0]?.manifest)).toBe(JSON.stringify(manifest));
  });

  it('exposes the attached adapter to registry-style descriptor reads', () => {
    const manifest = materialManifest();
    const datasetAdapter = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    createBaseScreenMaterialCatalog([
      { manifest, constructor, tabularDataAdapter: datasetAdapter },
    ]);

    const descriptor = Object.getOwnPropertyDescriptor(
      constructor,
      'tabularDataAdapter',
    ) as PropertyDescriptor;
    expect(Object.hasOwn(descriptor, 'value')).toBe(true);
    expect(descriptor.value).toBe(datasetAdapter);
    expect(typeof descriptor.value.adapt).toBe('function');
  });

  it('re-attaches the same adapter idempotently when a catalog is rebuilt', () => {
    const manifest = materialManifest();
    const datasetAdapter = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;

    const first = createBaseScreenMaterialCatalog([
      { manifest, constructor, tabularDataAdapter: datasetAdapter },
    ]);
    const second = createBaseScreenMaterialCatalog([
      { manifest, constructor, tabularDataAdapter: datasetAdapter },
    ]);

    expect(first.get('acme.kpi-card')?.tabularDataAdapter).toBe(datasetAdapter);
    expect(second.get('acme.kpi-card')?.tabularDataAdapter).toBe(datasetAdapter);
    expect(Object.getOwnPropertyDescriptor(constructor, 'tabularDataAdapter')?.value).toBe(
      datasetAdapter,
    );
  });

  it('leaves a material without an adapter unaffected', () => {
    const manifest = materialManifest();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;

    const catalog = createBaseScreenMaterialCatalog([{ manifest, constructor }]);

    expect(catalog.get('acme.kpi-card')?.tabularDataAdapter).toBeUndefined();
    expect(catalog.list()[0]?.tabularDataAdapter).toBeUndefined();
    expect(Object.hasOwn(constructor, 'tabularDataAdapter')).toBe(false);
  });

  it('rejects a constructor with a conflicting preexisting adapter without mutating it', () => {
    const manifest = materialManifest();
    const preexisting = tabularDataAdapter();
    const conflicting = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    Object.defineProperty(constructor, 'tabularDataAdapter', { value: preexisting });

    expect(() =>
      createBaseScreenMaterialCatalog([{ manifest, constructor, tabularDataAdapter: conflicting }]),
    ).toThrow(RangeError);
    expect(Object.getOwnPropertyDescriptor(constructor, 'tabularDataAdapter')?.value).toBe(
      preexisting,
    );
  });

  it('rejects a frozen constructor that needs a new adapter with a stable RangeError', () => {
    const manifest = materialManifest();
    const datasetAdapter = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    Object.freeze(constructor);

    expect(() =>
      createBaseScreenMaterialCatalog([
        { manifest, constructor, tabularDataAdapter: datasetAdapter },
      ]),
    ).toThrow(RangeError);
    expect(Object.isFrozen(constructor)).toBe(true);
    expect(Object.hasOwn(constructor, 'tabularDataAdapter')).toBe(false);
  });

  it('rejects a non-extensible constructor that needs a new adapter with a stable RangeError', () => {
    const manifest = materialManifest();
    const datasetAdapter = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    Object.preventExtensions(constructor);

    expect(() =>
      createBaseScreenMaterialCatalog([
        { manifest, constructor, tabularDataAdapter: datasetAdapter },
      ]),
    ).toThrow(RangeError);
    expect(Object.isExtensible(constructor)).toBe(false);
    expect(Object.hasOwn(constructor, 'tabularDataAdapter')).toBe(false);
  });

  it('accepts a frozen constructor that already hosts the same adapter', () => {
    const manifest = materialManifest();
    const datasetAdapter = tabularDataAdapter();
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    Object.defineProperty(constructor, 'tabularDataAdapter', { value: datasetAdapter });
    Object.freeze(constructor);

    const catalog = createBaseScreenMaterialCatalog([
      { manifest, constructor, tabularDataAdapter: datasetAdapter },
    ]);

    expect(catalog.get('acme.kpi-card')?.tabularDataAdapter).toBe(datasetAdapter);
  });
});
