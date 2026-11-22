import type {
  BaseScreenFragmentDefinition,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenPluginFragmentContribution,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  materialLibraryFragmentKey,
  parseBaseScreenMaterialLibraryFragments,
  resolveBaseScreenFragmentLibraryItems,
} from '../../../../src/common/operations/material-library/material-library-fragments.js';

function manifest(overrides: Partial<BaseScreenMaterialManifest> = {}): BaseScreenMaterialManifest {
  return {
    type: 'acme.text',
    tagName: 'acme-text',
    name: 'Text',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 120, height: 40 },
    defaultProps: {},
    defaultStyle: { color: '#fff' },
    styleSchema: { kind: 'object', properties: { color: { kind: 'string' } }, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: false, children: false },
    ...overrides,
  };
}

function catalogOf(...manifests: readonly BaseScreenMaterialManifest[]): BaseScreenMaterialCatalog {
  const entries = manifests.map((item) => ({ manifest: item, constructor: class {} }));
  return {
    get: (type: string) => entries.find((entry) => entry.manifest.type === type),
    has: (type: string) => entries.some((entry) => entry.manifest.type === type),
    list: () => entries,
  } as unknown as BaseScreenMaterialCatalog;
}

const SHELL = manifest({
  type: 'acme.container',
  tagName: 'acme-container',
  name: 'Container',
  libraryVisible: false,
  defaultSize: { width: 260, height: 120 },
  designCapabilities: { resize: true, rotate: true, children: true },
});
const CATALOG = catalogOf(SHELL, manifest(), manifest({ type: 'acme.value', tagName: 'acme-v' }));

function card(
  id: string,
  overrides: Partial<BaseScreenFragmentDefinition> = {},
): BaseScreenFragmentDefinition {
  return {
    id,
    name: `Card ${id}`,
    category: 'Cards',
    keywords: ['kpi'],
    shell: { key: 'shell', materialType: 'acme.container' },
    nodes: [
      { key: 'title', materialType: 'acme.text', offset: { x: 16, y: 12 } },
      { key: 'value', materialType: 'acme.value', offset: { x: 16, y: 60 } },
    ],
    ...overrides,
  };
}

describe('host material library fragments', () => {
  it('parses through the single fragment definition parser and keeps ids unique', () => {
    const parsed = parseBaseScreenMaterialLibraryFragments([card('acme.kpi')]);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.map((fragment) => fragment.id)).toEqual(['acme.kpi']);

    const duplicated = parseBaseScreenMaterialLibraryFragments([
      card('acme.kpi'),
      card('acme.kpi'),
    ]);
    expect(duplicated.ok).toBe(false);
    expect(duplicated.diagnostics[0]).toMatchObject({ path: [1, 'id'] });
  });

  it('fails closed on shape errors and prefixes nested diagnostics with the entry index', () => {
    expect(parseBaseScreenMaterialLibraryFragments({}).ok).toBe(false);
    const invalid = parseBaseScreenMaterialLibraryFragments([
      card('acme.kpi'),
      { ...card('acme.other'), extra: true },
    ]);
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics[0]?.path[0]).toBe(1);
  });
});

describe('fragment library trial run', () => {
  it('lists fragments that expand against the catalog, with a normalized wireframe', () => {
    const resolved = resolveBaseScreenFragmentLibraryItems({
      catalog: CATALOG,
      hostFragments: [card('acme.kpi')],
    });
    expect(resolved.diagnostics).toEqual([]);
    const [item] = resolved.items;
    expect(item).toMatchObject({
      id: 'acme.kpi',
      key: materialLibraryFragmentKey('acme.kpi'),
      materialTypes: ['acme.container', 'acme.text', 'acme.value'],
    });
    expect(item?.wireframe.width).toBe(260);
    expect(item?.wireframe.height).toBe(120);
    expect(item?.wireframe.boxes[0]).toMatchObject({ x: 0, y: 0, shell: true });
    expect(item?.wireframe.boxes[1]).toMatchObject({ x: 16, y: 12, shell: false });
  });

  it('hides a fragment whose material is missing and reports a warning instead of failing', () => {
    const resolved = resolveBaseScreenFragmentLibraryItems({
      catalog: CATALOG,
      hostFragments: [
        card('acme.broken', {
          nodes: [{ key: 'value', materialType: 'acme.missing' }],
        }),
        card('acme.kpi'),
      ],
    });
    expect(resolved.items.map((item) => item.id)).toEqual(['acme.kpi']);
    expect(resolved.diagnostics).toHaveLength(1);
    expect(resolved.diagnostics[0]).toMatchObject({
      severity: 'warning',
      path: ['fragments', 'acme.broken', 'nodes', 0, 'materialType'],
    });
  });

  it('hides a fragment whose overrides no longer satisfy the material schema', () => {
    const resolved = resolveBaseScreenFragmentLibraryItems({
      catalog: CATALOG,
      hostFragments: [
        card('acme.stale', {
          nodes: [{ key: 'title', materialType: 'acme.text', style: { color: 3 } }],
        }),
      ],
    });
    expect(resolved.items).toEqual([]);
    expect(resolved.diagnostics[0]?.severity).toBe('warning');
  });

  it('lists a fragment with shared data sources and relations after validating the expansion', () => {
    const resolved = resolveBaseScreenFragmentLibraryItems({
      catalog: CATALOG,
      hostFragments: [
        card('acme.shared', {
          dataSources: [
            {
              key: 'sales',
              name: '销售',
              source: { kind: 'dataset', datasetId: 'sales' },
              params: {},
            },
          ],
          nodes: [
            { key: 'title', materialType: 'acme.text', offset: { x: 16, y: 12 } },
            {
              key: 'value',
              materialType: 'acme.value',
              offset: { x: 16, y: 60 },
              dataValue: { kind: 'data-source-field', dataSourceId: 'sales', path: [] },
            },
          ],
          relations: [
            {
              type: 'semantic',
              id: 'detail',
              source: { kind: 'component', componentId: 'title' },
              target: { kind: 'component', componentId: 'value' },
              role: 'detail',
            },
          ],
        }),
      ],
    });
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.items[0]?.fragment.dataSources?.[0]?.key).toBe('sales');
    expect(resolved.items[0]?.fragment.relations?.[0]?.id).toBe('detail');
  });

  it('keeps host fragments first, strips plugin contribution fields and drops duplicate ids', () => {
    const contribution: BaseScreenPluginFragmentContribution = {
      ...card('acme.kpi', { name: 'Plugin copy' }),
      kind: 'fragment',
    };
    const plugin: BaseScreenPluginFragmentContribution = {
      ...card('acme.plugin'),
      kind: 'fragment',
    };
    const resolved = resolveBaseScreenFragmentLibraryItems({
      catalog: CATALOG,
      hostFragments: [card('acme.kpi')],
      pluginFragments: [contribution, plugin],
    });
    expect(resolved.items.map((item) => [item.id, item.fragment.name])).toEqual([
      ['acme.kpi', 'Card acme.kpi'],
      ['acme.plugin', 'Card acme.plugin'],
    ]);
    expect(Object.hasOwn(resolved.items[1]!.fragment, 'kind')).toBe(false);
    expect(resolved.diagnostics).toHaveLength(1);
    expect(resolved.diagnostics[0]).toMatchObject({
      severity: 'warning',
      path: ['fragments', 'acme.kpi'],
    });
  });
});
