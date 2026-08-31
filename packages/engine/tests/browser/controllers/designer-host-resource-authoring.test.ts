import type { ScreenDocument, ScreenHostResourcePort } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

const firstDataSource = {
  type: 'host-resource' as const,
  resourceType: 'xj_asset',
  resourceId: 'asset-12',
  params: {},
  binding: null,
};

const secondDataSource = { ...firstDataSource, resourceId: 'asset-13' };

function document(): ScreenDocument {
  return {
    canvas: { width: 800, height: 600, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };
}

function configuredDesigner(
  options: { hidden?: boolean; staticOnly?: boolean } = {},
): BaseScreenDesignerElement {
  const designer = new BaseScreenDesignerElement();
  Object.assign(designer, {
    dispatchEvent: () => true,
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  const entry: BaseScreenMaterialCatalogEntry = {
    manifest: {
      type: 'base.image',
      tagName: 'base-image-material',
      name: 'Image',
      libraryVisible: !options.hidden,
      category: 'Base',
      keywords: [],
      defaultSize: { width: 200, height: 100 },
      defaultProps: {},
      defaultStyle: { objectFit: 'cover' },
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      styleSchema: {
        kind: 'object',
        properties: { objectFit: { kind: 'enum', values: ['cover', 'contain'] } },
        required: ['objectFit'],
      },
      stylePanel: [],
      events: [],
      dataCapabilities: options.staticOnly ? ['static'] : ['static', 'host-resource'],
      designCapabilities: { resize: true, rotate: true, children: false },
    },
    constructor: class {} as never,
  };
  const catalog = createBaseScreenMaterialCatalog([
    entry,
    { ...entry, manifest: { ...entry.manifest, type: 'xj.gis-map', tagName: 'xj-gis-map' } },
  ]);
  const resourcePort: ScreenHostResourcePort = {
    resolve: async () => ({ ok: true, value: 'signed-image', diagnostics: [] }),
  };
  const configured = designer.configure({
    catalog,
    resourcePort,
    runtimeContributions: {
      getResourceType: (resourceType) =>
        ['xj_asset', 'xj_gis_map'].includes(resourceType)
          ? {
              kind: 'dataResourceType',
              id: resourceType,
              name: 'Image asset',
              configSchema: { kind: 'object', properties: {}, required: [] },
            }
          : undefined,
      hasBlueprintCapability: () => false,
    },
  });
  expect(configured.ok).toBe(true);
  expect(designer.replaceDocument(document()).ok).toBe(true);
  return designer;
}

describe('BaseScreenDesignerElement host resource authoring', () => {
  it('inserts at the canonical canvas center with manifest defaults and one undo step', () => {
    const designer = configuredDesigner();
    const events = vi.spyOn(designer, 'dispatchEvent');
    const result = designer.insertHostResource({
      materialType: 'base.image',
      dataSource: firstDataSource,
      name: '封面图',
    });

    expect(result.ok).toBe(true);
    const state = getDesignerElementState(designer);
    expect(state.session.interaction.focusedComponentId).toBe('base-image-1');
    expect(events.mock.calls.filter(([event]) => event.type === 'base-screen-change')).toHaveLength(
      1,
    );
    expect(
      events.mock.calls.filter(([event]) => event.type === 'base-screen-dirty-change'),
    ).toHaveLength(1);
    expect(designer.getDocument()?.components).toEqual([
      expect.objectContaining({
        id: 'base-image-1',
        type: 'base.image',
        name: '封面图',
        position: { x: 300, y: 250 },
        size: { width: 200, height: 100 },
        zIndex: 0,
        props: {},
        style: { objectFit: 'cover' },
        dataSource: firstDataSource,
      }),
    ]);
    expect(designer.undo().ok).toBe(true);
    expect(state.session.canUndo).toBe(false);
    expect(designer.getDocument()?.components).toEqual([]);
    expect(designer.redo().ok).toBe(true);
    expect(designer.getDocument()?.components[0]?.dataSource).toEqual(firstDataSource);
  });

  it('uses the visible viewport center and clamps the default rectangle to the canvas', () => {
    const designer = configuredDesigner();
    const state = getDesignerElementState(designer);
    const center = vi.spyOn(state.viewportController, 'visibleCanvasCenter');
    center.mockReturnValue({ x: 400, y: 200 });
    designer.insertHostResource({ materialType: 'base.image', dataSource: firstDataSource });
    expect(designer.getDocument()?.components[0]?.position).toEqual({ x: 300, y: 150 });
    center.mockReturnValue({ x: -50, y: 800 });
    designer.insertHostResource({ materialType: 'base.image', dataSource: firstDataSource });
    expect(designer.getDocument()?.components[1]?.position).toEqual({ x: 0, y: 500 });
    expect(designer.getDocument()?.components[1]?.zIndex).toBe(1);
  });

  it.each([{ hidden: true }, { staticOnly: true }])(
    'rejects unavailable authoring materials: %s',
    (options) => {
      const designer = configuredDesigner(options);
      expect(
        designer.insertHostResource({ materialType: 'base.image', dataSource: firstDataSource }),
      ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }] });
      expect(designer.getDocument()?.components).toEqual([]);
      expect(getDesignerElementState(designer).session.canUndo).toBe(false);
    },
  );

  it('replaces only dataSource and rejects an exact type mismatch', () => {
    const designer = configuredDesigner();
    expect(
      designer.insertHostResource({ materialType: 'base.image', dataSource: firstDataSource }).ok,
    ).toBe(true);
    const before = designer.getDocument()?.components[0];
    expect(designer.replaceDocument(designer.getDocument()!).ok).toBe(true);
    const events = vi.spyOn(designer, 'dispatchEvent');

    expect(
      designer.replaceHostResource('base-image-1', {
        materialType: 'base.image',
        dataSource: secondDataSource,
        name: '不得覆盖名称',
      }).ok,
    ).toBe(true);
    expect(designer.getDocument()?.components[0]).toEqual({
      ...before,
      dataSource: secondDataSource,
    });
    expect(events.mock.calls.filter(([event]) => event.type === 'base-screen-change')).toHaveLength(
      1,
    );
    expect(
      events.mock.calls.filter(([event]) => event.type === 'base-screen-dirty-change'),
    ).toHaveLength(1);
    expect(designer.undo().ok).toBe(true);
    expect(getDesignerElementState(designer).session.canUndo).toBe(false);
    expect(designer.getDocument()?.components[0]).toEqual(before);
    expect(designer.redo().ok).toBe(true);
    expect(designer.getDocument()?.components[0]?.dataSource).toEqual(secondDataSource);
    expect(
      designer.replaceHostResource('missing', {
        materialType: 'base.image',
        dataSource: firstDataSource,
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_COMPONENT_MISSING' }] });
    const mismatch = designer.replaceHostResource('base-image-1', {
      materialType: 'xj.gis-map',
      dataSource: { ...secondDataSource, resourceType: 'xj_gis_map' },
    });
    expect(mismatch).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }],
    });
  });
});
