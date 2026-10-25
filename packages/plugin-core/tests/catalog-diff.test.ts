import { describe, expect, it } from 'vitest';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  createBaseScreenMaterialCatalog,
  diffBaseScreenMaterialCatalogs,
  sameBaseScreenMaterialDefinition,
} from '../src/index.js';

function manifest(
  type: string,
  overrides: Partial<BaseScreenMaterialManifest> = {},
): BaseScreenMaterialManifest {
  return {
    type,
    tagName: type.replaceAll('.', '-'),
    name: type,
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    events: [],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: true, children: false },
    ...overrides,
  };
}

function constructor(): BaseScreenMaterialConstructor {
  return class {} as unknown as BaseScreenMaterialConstructor;
}

function adapter(): BaseScreenMaterialTabularDataAdapter {
  return {
    adapt: () => ({ ok: true, value: [], diagnostics: [] }),
  } as unknown as BaseScreenMaterialTabularDataAdapter;
}

function entry(
  type: string,
  options: {
    readonly manifest?: BaseScreenMaterialManifest;
    readonly ctor?: BaseScreenMaterialConstructor;
    readonly tabularDataAdapter?: BaseScreenMaterialTabularDataAdapter;
  } = {},
): BaseScreenMaterialCatalogEntry {
  return {
    manifest: options.manifest ?? manifest(type),
    constructor: options.ctor ?? constructor(),
    ...(options.tabularDataAdapter === undefined
      ? {}
      : { tabularDataAdapter: options.tabularDataAdapter }),
  };
}

function catalog(entries: readonly BaseScreenMaterialCatalogEntry[]) {
  return createBaseScreenMaterialCatalog(entries);
}

describe('diffBaseScreenMaterialCatalogs', () => {
  it('classifies added, removed and unchanged types', () => {
    const sharedConstructor = constructor();
    const beta = entry('acme.beta');
    const before = catalog([entry('acme.alpha', { ctor: sharedConstructor }), beta]);
    const after = catalog([
      beta,
      entry('acme.gamma'),
      entry('acme.alpha', { ctor: sharedConstructor }),
    ]);

    expect(diffBaseScreenMaterialCatalogs(before, after)).toEqual({
      added: ['acme.gamma'],
      changed: [],
      removed: [],
      unchanged: ['acme.alpha', 'acme.beta'],
      implementationChanged: [],
    });
  });

  it('detects a structurally different manifest as changed', () => {
    const sharedConstructor = constructor();
    const before = catalog([entry('acme.alpha', { ctor: sharedConstructor })]);
    const after = catalog([
      entry('acme.alpha', {
        ctor: sharedConstructor,
        manifest: manifest('acme.alpha', { name: 'Renamed' }),
      }),
    ]);

    expect(diffBaseScreenMaterialCatalogs(before, after)).toEqual({
      added: [],
      changed: ['acme.alpha'],
      removed: [],
      unchanged: [],
      implementationChanged: [],
    });
  });

  it('detects a changed constructor as changed even when the manifest is equal', () => {
    const oldConstructor = constructor();
    const newConstructor = constructor();
    const before = catalog([entry('acme.alpha', { ctor: oldConstructor })]);
    const after = catalog([entry('acme.alpha', { ctor: newConstructor })]);

    const diff = diffBaseScreenMaterialCatalogs(before, after);
    expect(diff.changed).toEqual(['acme.alpha']);
    expect(diff.implementationChanged).toEqual(['acme.alpha']);
  });

  it('treats structurally equal manifests with the same constructor as unchanged', () => {
    const sharedConstructor = constructor();
    const before = catalog([entry('acme.alpha', { ctor: sharedConstructor })]);
    const after = catalog([
      entry('acme.alpha', {
        manifest: manifest('acme.alpha'),
        ctor: sharedConstructor,
      }),
    ]);

    expect(diffBaseScreenMaterialCatalogs(before, after).unchanged).toEqual(['acme.alpha']);
  });

  it('detects removed types and sorts every result array', () => {
    const alpha = entry('acme.alpha');
    const middle = entry('acme.middle');
    const before = catalog([entry('acme.zeta'), alpha, middle]);
    const after = catalog([middle, entry('acme.beta'), alpha]);

    const diff = diffBaseScreenMaterialCatalogs(before, after);
    expect(diff.added).toEqual(['acme.beta']);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual(['acme.zeta']);
    expect(diff.unchanged).toEqual(['acme.alpha', 'acme.middle']);
  });

  it('compares adapter identity through sameBaseScreenMaterialDefinition', () => {
    const sharedManifest = manifest('acme.alpha');
    const sharedConstructor = constructor();
    const left = entry('acme.alpha', {
      manifest: sharedManifest,
      ctor: sharedConstructor,
      tabularDataAdapter: adapter(),
    });
    const right = entry('acme.alpha', {
      manifest: sharedManifest,
      ctor: sharedConstructor,
      tabularDataAdapter: adapter(),
    });

    expect(sameBaseScreenMaterialDefinition(left, left)).toBe(true);
    expect(sameBaseScreenMaterialDefinition(left, right)).toBe(false);
  });
});
