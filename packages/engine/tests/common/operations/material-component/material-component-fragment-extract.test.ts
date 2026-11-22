import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenComponentFragmentTransaction } from '../../../../src/common/operations/material-component/material-component-fragment.js';
import { extractBaseScreenComponentFragment } from '../../../../src/common/operations/material-component/material-component-fragment-extract.js';

function manifest(type: string, children = false): BaseScreenMaterialManifest {
  return {
    type,
    tagName: type.replace('.', '-'),
    name: type,
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: { color: { kind: 'string' } }, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: ['valueClick'],
    dataCapabilities: ['static', 'dataset'],
    designCapabilities: { resize: true, rotate: true, children },
  };
}

const CATALOG = (() => {
  const entries = [manifest('acme.box', true), manifest('acme.text')].map((item) => ({
    manifest: item,
    constructor: class {},
  }));
  return {
    get: (type: string) => entries.find((entry) => entry.manifest.type === type),
    has: (type: string) => entries.some((entry) => entry.manifest.type === type),
    list: () => entries,
  } as unknown as BaseScreenMaterialCatalog;
})();

function node(overrides: Partial<ScreenComponentNode> & { id: string }): ScreenComponentNode {
  return {
    type: 'acme.text',
    name: overrides.id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { color: '#fff' },
    dataSource: null,
    ...overrides,
  };
}

function documentWith(partial: Partial<ScreenDocument>): ScreenDocument {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { relations: [] },
    ...partial,
  };
}

const CARD = documentWith({
  components: [
    node({
      id: 'card',
      type: 'acme.box',
      position: { x: 100, y: 200 },
      size: { width: 300, height: 200 },
    }),
    node({ id: 'title', parentId: 'card', position: { x: 120, y: 210 }, zIndex: 1 }),
    node({
      id: 'value',
      parentId: 'card',
      position: { x: 120, y: 260 },
      zIndex: 2,
      rotation: 10,
      dataValue: { kind: 'data-source-field', dataSourceId: 'detail', path: [] },
      dataBinding: { fields: { value: ['amount'] } },
    }),
    node({ id: 'elsewhere', position: { x: 900, y: 900 }, zIndex: 3 }),
  ],
  dataSources: [
    { id: 'sales', name: '销售', source: { kind: 'dataset', datasetId: 'sales' }, params: {} },
    {
      id: 'detail',
      name: '明细',
      source: { kind: 'dataset', datasetId: 'detail' },
      params: { region: { kind: 'data-source-field', dataSourceId: 'sales', path: ['region'] } },
    },
    { id: 'unused', name: '无关', source: { kind: 'dataset', datasetId: 'x' }, params: {} },
  ],
  blueprint: {
    relations: [
      {
        type: 'semantic',
        id: 'inside',
        source: { kind: 'component', componentId: 'title' },
        target: { kind: 'component', componentId: 'value' },
        role: 'detail',
      },
      {
        type: 'semantic',
        id: 'outside',
        source: { kind: 'component', componentId: 'title' },
        target: { kind: 'component', componentId: 'elsewhere' },
        role: 'related',
      },
    ],
  },
});

function extract(document: ScreenDocument, componentIds: readonly string[]) {
  return extractBaseScreenComponentFragment({ document, componentIds, catalog: CATALOG });
}

describe('extractBaseScreenComponentFragment', () => {
  it('turns a selected container into the shell and its descendants into nodes', () => {
    const extracted = extract(CARD, ['card']);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const body = extracted.value;
    expect(body.shell).toMatchObject({
      key: 'card',
      materialType: 'acme.box',
      offset: { x: 0, y: 0 },
    });
    expect(body.nodes.map((item) => [item.key, item.offset])).toEqual([
      ['title', { x: 20, y: 10 }],
      ['value', { x: 20, y: 60 }],
    ]);
    expect(body.nodes.every((item) => item.parent === undefined)).toBe(true);
    expect(body.nodes[1]?.rotation).toBe(10);
  });

  it('carries the data sources the selection reads, dependencies first, and only those', () => {
    const extracted = extract(CARD, ['card']);
    if (!extracted.ok) throw new Error('extract failed');
    expect(extracted.value.dataSources?.map((source) => source.key)).toEqual(['sales', 'detail']);
    expect(extracted.value.dataSources?.[1]?.params.region).toMatchObject({
      dataSourceId: 'sales',
    });
    expect(extracted.value.nodes[1]?.dataValue).toMatchObject({ dataSourceId: 'detail' });
    expect(extracted.value.nodes[1]?.dataBinding).toEqual({ fields: { value: ['amount'] } });
  });

  it('keeps relations inside the selection and warns about the ones that reach outside', () => {
    const extracted = extract(CARD, ['card']);
    if (!extracted.ok) throw new Error('extract failed');
    expect(extracted.value.relations?.map((relation) => relation.id)).toEqual(['inside']);
    expect(extracted.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', path: ['relations'] }),
    ]);
  });

  it('round-trips into an insertion transaction on another document', () => {
    const extracted = extract(CARD, ['card']);
    if (!extracted.ok) throw new Error('extract failed');
    const built = createBaseScreenComponentFragmentTransaction({
      document: CARD,
      catalog: CATALOG,
      intent: extracted.value,
      anchor: { x: 500, y: 500 },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.componentIds).toHaveLength(3);
    expect(built.value.dataSourceIds).toEqual(['sales-2', 'detail-2']);
    expect(built.value.relationIds).toEqual(['inside-2']);
  });

  it('treats several selected roots as plain nodes without a shell', () => {
    const extracted = extract(CARD, ['title', 'elsewhere']);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.value.shell).toBeUndefined();
    expect(extracted.value.nodes.map((item) => item.key)).toEqual(['title', 'elsewhere']);
    expect(extracted.value.nodes[1]?.offset).toEqual({ x: 780, y: 690 });
  });

  it('fails closed when the selection reads a variable', () => {
    const document = documentWith({
      components: [node({ id: 'value', dataValue: { kind: 'variable', variableId: 'region' } })],
    });
    const extracted = extract(document, ['value']);
    expect(extracted.ok).toBe(false);
  });

  it('warns that conditional style rules and locked state are not saved', () => {
    const document = documentWith({
      components: [
        node({
          id: 'value',
          status: { locked: true, hidden: false },
          styleRules: [
            {
              id: 'warn',
              when: { path: ['level'], operator: 'eq', value: 1 },
              style: { color: '#f00' },
            },
          ],
        }),
      ],
    });
    const extracted = extract(document, ['value']);
    expect(extracted.ok).toBe(true);
    expect(extracted.diagnostics.map((item) => item.severity)).toEqual(['warning', 'warning']);
  });

  it('rejects an empty selection', () => {
    expect(extract(CARD, []).ok).toBe(false);
    expect(extract(CARD, ['missing']).ok).toBe(false);
  });
});
