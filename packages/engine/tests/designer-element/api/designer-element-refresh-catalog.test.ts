import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import type { BaseScreenMaterialLibraryGrouping } from '../../../src/common/operations/material-library/material-library-grouping.js';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

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

function entry(
  type: string,
  options: {
    readonly manifest?: BaseScreenMaterialManifest;
    readonly ctor?: BaseScreenMaterialConstructor;
  } = {},
): BaseScreenMaterialCatalogEntry {
  return {
    manifest: options.manifest ?? manifest(type),
    constructor: options.ctor ?? constructor(),
  };
}

function catalog(entries: readonly BaseScreenMaterialCatalogEntry[]): BaseScreenMaterialCatalog {
  return createBaseScreenMaterialCatalog(entries);
}

function fakeDesigner(): BaseScreenDesignerElement {
  const designer = new BaseScreenDesignerElement();
  Object.assign(designer, {
    dispatchEvent: () => true,
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  return designer;
}

function configuredDesigner(
  catalogValue: BaseScreenMaterialCatalog,
  grouping?: BaseScreenMaterialLibraryGrouping,
): BaseScreenDesignerElement {
  const designer = fakeDesigner();
  const configured = designer.configure({
    catalog: catalogValue,
    ...(grouping === undefined ? {} : { materialLibraryGrouping: grouping }),
  });
  expect(configured.ok).toBe(true);
  return designer;
}

function component(): ScreenComponentNode {
  return {
    id: 'card',
    type: 'acme.alpha',
    name: 'Card',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function document(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [component()],
    variables: [],
    blueprint: { relations: [] },
  };
}

describe('BaseScreenDesignerElement.refreshCatalog', () => {
  it('requires a configured designer', () => {
    const result = fakeDesigner().refreshCatalog(catalog([entry('acme.alpha')]));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
  });

  it('rejects an invalid catalog without changing the current one', () => {
    const current = catalog([entry('acme.alpha')]);
    const designer = configuredDesigner(current);

    const result = designer.refreshCatalog({} as never);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_INVALID');
    expect(designer.catalog).toBe(current);
  });

  it('adds, removes and keeps unchanged types without a loaded document', () => {
    const beta = entry('acme.beta');
    const designer = configuredDesigner(catalog([entry('acme.alpha'), beta]));
    const next = catalog([beta, entry('acme.gamma')]);

    const result = designer.refreshCatalog(next);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        added: ['acme.gamma'],
        changed: [],
        removed: ['acme.alpha'],
      });
    }
    expect(designer.catalog).toBe(next);
    expect(
      getDesignerElementState(designer).resolvedMaterialLibraryItems.map(
        (item) => item.materialType,
      ),
    ).toEqual(['acme.beta', 'acme.gamma']);
  });

  it('reports a manifest-only change as changed', () => {
    const sharedConstructor = constructor();
    const designer = configuredDesigner(
      catalog([entry('acme.alpha', { ctor: sharedConstructor })]),
    );
    const next = catalog([
      entry('acme.alpha', {
        manifest: manifest('acme.alpha', { name: 'Renamed' }),
        ctor: sharedConstructor,
      }),
    ]);

    const result = designer.refreshCatalog(next);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toEqual(['acme.alpha']);
      expect(result.value.removed).toEqual([]);
    }
  });

  it('rejects a removal referenced by the material library grouping', () => {
    const current = catalog([entry('acme.alpha')]);
    const grouping: BaseScreenMaterialLibraryGrouping = {
      groups: [{ id: 'main', label: 'Main', materialTypes: ['acme.alpha'] }],
    };
    const designer = configuredDesigner(current, grouping);

    const result = designer.refreshCatalog(catalog([entry('acme.beta')]));

    expect(result.ok).toBe(false);
    expect(designer.catalog).toBe(current);
    expect(
      getDesignerElementState(designer).resolvedMaterialLibraryItems.map(
        (item) => item.materialType,
      ),
    ).toEqual(['acme.alpha']);
  });

  it('fails closed when a document is loaded without an initialized renderer', () => {
    const current = catalog([entry('acme.alpha')]);
    const designer = configuredDesigner(current);
    expect(designer.replaceDocument(document()).ok).toBe(true);

    const result = designer.refreshCatalog(catalog([entry('acme.alpha')]));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    expect(designer.catalog).toBe(current);
  });
});
