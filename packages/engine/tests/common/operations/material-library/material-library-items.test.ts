import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createInitialDataSourceForMaterialLibraryItem,
  parseBaseScreenMaterialLibraryItems,
  resolveBaseScreenMaterialLibraryItems,
} from '../../../../src/common/operations/material-library/material-library-items.js';

function entry(
  type: string,
  hidden = false,
  dataCapabilities: readonly ('static' | 'host-resource')[] = [],
) {
  return {
    manifest: {
      type,
      tagName: `${type.replace('.', '-')}-material`,
      name: type,
      category: 'Base',
      keywords: [],
      defaultSize: { width: 100, height: 80 },
      defaultProps: { source: '' },
      defaultStyle: { opacity: 1 },
      propsSchema: {
        kind: 'object' as const,
        properties: { source: { kind: 'string' as const, maxLength: 32 } },
        required: ['source'],
      },
      propertyPanel: [],
      styleSchema: {
        kind: 'object' as const,
        properties: { opacity: { kind: 'number' as const, minimum: 0, maximum: 1 } },
        required: ['opacity'],
      },
      stylePanel: [],
      events: [],
      dataCapabilities,
      designCapabilities: { resize: true, rotate: true, children: false },
      ...(hidden ? { libraryVisible: false } : {}),
    },
    constructor: class {} as never,
  };
}

describe('material library item projection', () => {
  it('allows multiple stable items to reuse one runtime material type', () => {
    const catalog = createBaseScreenMaterialCatalog([entry('base.image')]);
    const parsed = parseBaseScreenMaterialLibraryItems([
      {
        id: 'asset:12',
        materialType: 'base.image',
        name: 'Header',
        category: 'Assets',
        cover: 'https://cdn.example.com/12.png',
        defaultProps: { source: '12' },
      },
      {
        id: 'asset:13',
        materialType: 'base.image',
        name: 'Logo',
        category: 'Assets',
        defaultProps: { source: '13' },
      },
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = resolveBaseScreenMaterialLibraryItems(catalog, parsed.value);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.map((item) => item.materialType)).toEqual(['base.image', 'base.image']);
    expect(resolved.value.map((item) => item.manifest.name)).toEqual(['Header', 'Logo']);
    expect(resolved.value.map((item) => item.manifest.defaultProps.source)).toEqual(['12', '13']);
    expect(resolved.value[0]?.manifest.type).toBe('base.image');
  });

  it('derives the backward-compatible one-item-per-visible-type projection by default', () => {
    const catalog = createBaseScreenMaterialCatalog([
      entry('base.image'),
      entry('base.hidden', true),
    ]);
    const resolved = resolveBaseScreenMaterialLibraryItems(catalog);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.map((item) => item.id)).toEqual(['base.image']);
  });

  it('validates and preserves a host-resource template for new instances', () => {
    const catalog = createBaseScreenMaterialCatalog([
      entry('base.image', false, ['host-resource']),
    ]);
    const parsed = parseBaseScreenMaterialLibraryItems([
      {
        id: 'asset:12',
        materialType: 'base.image',
        defaultProps: { source: '12' },
        defaultDataSource: {
          type: 'host-resource',
          resourceType: 'xj_asset',
          resourceId: '12',
          params: {},
          binding: null,
        },
      },
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = resolveBaseScreenMaterialLibraryItems(catalog, parsed.value);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(createInitialDataSourceForMaterialLibraryItem(resolved.value[0]!)).toEqual({
      type: 'host-resource',
      resourceType: 'xj_asset',
      resourceId: '12',
      params: {},
      binding: null,
    });
  });

  it('rejects duplicate ids, missing coverage, hidden types, and invalid projected defaults', () => {
    const catalog = createBaseScreenMaterialCatalog([
      entry('base.image'),
      entry('base.text'),
      entry('base.hidden', true),
    ]);
    expect(
      parseBaseScreenMaterialLibraryItems([
        { id: 'asset:1', materialType: 'base.image' },
        { id: 'asset:1', materialType: 'base.image' },
      ]).ok,
    ).toBe(false);

    const hidden = parseBaseScreenMaterialLibraryItems([
      { id: 'asset:1', materialType: 'base.image' },
      { id: 'hidden:1', materialType: 'base.hidden' },
    ]);
    expect(hidden.ok).toBe(true);
    if (hidden.ok)
      expect(resolveBaseScreenMaterialLibraryItems(catalog, hidden.value).ok).toBe(false);

    const invalid = parseBaseScreenMaterialLibraryItems([
      { id: 'asset:1', materialType: 'base.image', defaultStyle: { opacity: 2 } },
      { id: 'text:1', materialType: 'base.text' },
    ]);
    expect(invalid.ok).toBe(true);
    if (invalid.ok)
      expect(resolveBaseScreenMaterialLibraryItems(catalog, invalid.value).ok).toBe(false);

    expect(
      parseBaseScreenMaterialLibraryItems([
        {
          id: 'asset:1',
          materialType: 'base.image',
          defaultDataSource: {
            type: 'host-resource',
            resourceType: 'xj_asset',
            resourceId: '',
            params: {},
            binding: null,
          },
        },
      ]).ok,
    ).toBe(false);

    const unsupported = parseBaseScreenMaterialLibraryItems([
      {
        id: 'asset:1',
        materialType: 'base.image',
        defaultDataSource: {
          type: 'host-resource',
          resourceType: 'xj_asset',
          resourceId: '1',
          params: {},
          binding: null,
        },
      },
      { id: 'text:1', materialType: 'base.text' },
    ]);
    expect(unsupported.ok).toBe(true);
    if (unsupported.ok)
      expect(resolveBaseScreenMaterialLibraryItems(catalog, unsupported.value).ok).toBe(false);
  });
});
