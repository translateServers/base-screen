import type { ScreenDocument } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
  parseBaseScreenComponentFragmentInsertionIntent,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  nextMaterialComponentId,
  nextMaterialComponentZIndex,
} from '../../../../src/common/operations/material-component/material-component.js';
import { createBaseScreenComponentFragmentTransaction } from '../../../../src/common/operations/material-component/material-component-fragment.js';

function manifest(overrides: Partial<BaseScreenMaterialManifest> = {}): BaseScreenMaterialManifest {
  return {
    type: 'acme.text',
    tagName: 'acme-text',
    name: 'Text',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 120, height: 40 },
    defaultProps: { unit: '%' },
    defaultStyle: { color: '#fff' },
    styleSchema: { kind: 'object', properties: { color: { kind: 'string' } }, required: [] },
    stylePanel: [],
    propsSchema: {
      kind: 'object',
      properties: { unit: { kind: 'string' } },
      required: [],
    },
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

function documentWith(
  components: readonly Partial<ScreenDocument['components'][number]>[] = [],
): ScreenDocument {
  return {
    canvas: { width: 640, height: 480, backgroundColor: '#000000' },
    components: components as ScreenDocument['components'],
    variables: [],
    blueprint: { relations: [] },
  } as ScreenDocument;
}

const SHELL = manifest({
  type: 'acme.container',
  tagName: 'acme-container',
  name: 'Container',
  libraryVisible: false,
  defaultSize: { width: 260, height: 120 },
  designCapabilities: { resize: true, rotate: true, children: true },
});
const CARD_CATALOG = catalogOf(SHELL, manifest(), manifest({ type: 'acme.rect' }));

function okFragment(input: unknown) {
  const parsed = parseBaseScreenComponentFragmentInsertionIntent(input);
  if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.diagnostics)}`);
  return parsed.value;
}

function build(intent: unknown, anchor = { x: 0, y: 0 }, document = documentWith()) {
  return createBaseScreenComponentFragmentTransaction({
    document,
    catalog: CARD_CATALOG,
    intent: okFragment(intent),
    anchor,
  });
}

describe('component fragment intent parsing', () => {
  it('rejects unknown keys instead of stripping them', () => {
    const parsed = parseBaseScreenComponentFragmentInsertionIntent({
      nodes: [{ key: 'a', materialType: 'acme.text', extra: true }],
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]).toMatchObject({
      code: 'AUTHORING_PAYLOAD_INVALID',
      path: ['nodes', 0],
    });
  });

  it('rejects an empty node list and a duplicate key', () => {
    expect(
      parseBaseScreenComponentFragmentInsertionIntent({ nodes: [] }).diagnostics[0]?.code,
    ).toBe('AUTHORING_LIMIT_EXCEEDED');
    const duplicated = parseBaseScreenComponentFragmentInsertionIntent({
      nodes: [
        { key: 'a', materialType: 'acme.text' },
        { key: 'a', materialType: 'acme.rect' },
      ],
    });
    expect(duplicated.diagnostics[0]).toMatchObject({ path: ['nodes', 1, 'key'] });
  });

  it('rejects a non-canonical material type on the shell', () => {
    const parsed = parseBaseScreenComponentFragmentInsertionIntent({
      shell: { key: 'shell', materialType: 'acme container' },
      nodes: [{ key: 'a', materialType: 'acme.text' }],
    });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a circular payload rather than throwing during serialization', () => {
    const cyclic: Record<string, unknown> = { nodes: [] };
    cyclic.self = cyclic;
    expect(parseBaseScreenComponentFragmentInsertionIntent(cyclic).ok).toBe(false);
  });

  it('accepts a minimal fragment and keeps optional fields absent', () => {
    const parsed = parseBaseScreenComponentFragmentInsertionIntent({
      nodes: [{ key: 'a', materialType: 'acme.text' }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ nodes: [{ key: 'a', materialType: 'acme.text' }] });
  });
});

describe('component fragment transaction', () => {
  it('assigns distinct ids to same-type nodes and increasing zIndex', () => {
    const result = build({
      nodes: [
        { key: 'a', materialType: 'acme.text' },
        { key: 'b', materialType: 'acme.text' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.componentIds).toEqual(['acme-text-1', 'acme-text-2']);
    // 没有 shell 时两个根节点都选中。
    expect(result.value.selectionIds).toEqual(['acme-text-1', 'acme-text-2']);
    const commands = result.value.transaction.commands;
    const zIndexes = commands.map((command) =>
      command.type === 'add-component' ? command.component.zIndex : -1,
    );
    expect(zIndexes).toEqual([0, 1]);
  });

  it('starts zIndex above the existing document layers', () => {
    const result = build(
      { nodes: [{ key: 'a', materialType: 'acme.text' }] },
      { x: 0, y: 0 },
      documentWith([{ id: 'x-1', zIndex: 7 }]),
    );
    expect(result.ok && result.value.transaction.commands[0]).toMatchObject({
      component: { zIndex: 8 },
    });
  });

  it('parents nodes to the shell and puts the shell first', () => {
    const result = build({
      shell: { key: 'shell', materialType: 'acme.container' },
      nodes: [
        { key: 'a', materialType: 'acme.text' },
        { key: 'b', materialType: 'acme.rect', parent: 'a' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const components = result.value.transaction.commands.map((command) =>
      command.type === 'add-component' ? command.component : undefined,
    );
    expect(components.map((component) => component?.id)).toEqual([
      'acme-container-1',
      'acme-text-1',
      'acme-rect-1',
    ]);
    expect(components.map((component) => component?.parentId)).toEqual([
      null,
      'acme-container-1',
      'acme-text-1',
    ]);
    expect(result.value.focusedComponentId).toBe('acme-container-1');
    // 只选 shell：外壳与其子节点混选会让画布拖动失效（选区必须同属一个父级）。
    expect(result.value.selectionIds).toEqual(['acme-container-1']);
  });

  it('rejects an unknown parent key rather than silently rooting the node', () => {
    const result = build({
      nodes: [{ key: 'a', materialType: 'acme.text', parent: 'missing' }],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ path: ['nodes', 0, 'parent'] });
  });

  it('accepts a library-hidden shell but rejects a library-hidden node', () => {
    const hidden = manifest({ type: 'acme.hidden', libraryVisible: false });
    const catalog = catalogOf(SHELL, hidden);
    const intent = okFragment({
      nodes: [{ key: 'a', materialType: 'acme.hidden' }],
    });
    const result = createBaseScreenComponentFragmentTransaction({
      document: documentWith(),
      catalog,
      intent,
      anchor: { x: 0, y: 0 },
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'AUTHORING_SOURCE_INVALID',
      path: ['nodes', 0, 'materialType'],
    });
  });

  it('rejects a shell that does not accept children', () => {
    const result = build({
      shell: { key: 'shell', materialType: 'acme.text' },
      nodes: [{ key: 'a', materialType: 'acme.rect' }],
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: 'AUTHORING_SOURCE_INVALID',
      path: ['shell', 'materialType'],
    });
  });

  it('translates the whole fragment so its bounding box lands on the anchor', () => {
    const result = build(
      {
        nodes: [
          { key: 'a', materialType: 'acme.text', offset: { x: 10, y: 10 } },
          { key: 'b', materialType: 'acme.rect', offset: { x: 50, y: 90 } },
        ],
      },
      { x: 200, y: 150 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second] = result.value.transaction.commands.map((command) =>
      command.type === 'add-component' ? command.component.position : undefined,
    );
    expect(first).toEqual({ x: 200, y: 150 });
    // 相对位移保持不变：组合不被逐节点裁剪拉变形。
    expect(second).toEqual({ x: first!.x + 40, y: first!.y + 80 });
  });

  it('keeps the fragment intact when the anchor would push it off the canvas', () => {
    const result = build(
      {
        nodes: [
          { key: 'a', materialType: 'acme.text', offset: { x: 0, y: 0 } },
          { key: 'b', materialType: 'acme.rect', offset: { x: 400, y: 0 } },
        ],
      },
      { x: 600, y: 40 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const components = result.value.transaction.commands.map(
      (command) => (command.type === 'add-component' ? command.component : undefined)!,
    );
    // 整体贴右边：0..520 宽的组合，左边界落在 640 - 520 = 120。
    expect(components[0]?.position).toEqual({ x: 120, y: 40 });
    expect(components[1]?.position).toEqual({ x: 520, y: 40 });
  });

  it('fails closed when the fragment is larger than the canvas', () => {
    const result = build({
      nodes: [
        { key: 'a', materialType: 'acme.text', offset: { x: 0, y: 0 } },
        { key: 'b', materialType: 'acme.text', offset: { x: 900, y: 0 } },
      ],
    });
    expect(result.diagnostics[0]?.code).toBe('AUTHORING_LIMIT_EXCEEDED');
  });

  it('places a dropped fragment at the anchor without fitting it into the canvas', () => {
    const intent = okFragment({
      nodes: [
        { key: 'a', materialType: 'acme.text', offset: { x: 0, y: 0 } },
        { key: 'b', materialType: 'acme.rect', offset: { x: 400, y: 0 } },
      ],
    });
    const positions = (anchor: { x: number; y: number }) => {
      const result = createBaseScreenComponentFragmentTransaction({
        document: documentWith(),
        catalog: CARD_CATALOG,
        intent,
        anchor,
        placement: 'at-anchor',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return [];
      return result.value.transaction.commands.map((command) =>
        command.type === 'add-component' ? command.component.position : undefined,
      );
    };
    // 拖放落点即包围盒左上角：越出画布也不贴边（与单个物料拖放一致），相对位移不变。
    expect(positions({ x: 600, y: 300 })).toEqual([
      { x: 600, y: 300 },
      { x: 1000, y: 300 },
    ]);
    // 比画布还宽的组合在拖放时也能放下，不失败关闭。
    const wide = createBaseScreenComponentFragmentTransaction({
      document: documentWith(),
      catalog: CARD_CATALOG,
      intent: okFragment({
        nodes: [
          { key: 'a', materialType: 'acme.text', offset: { x: 0, y: 0 } },
          { key: 'b', materialType: 'acme.text', offset: { x: 900, y: 0 } },
        ],
      }),
      anchor: { x: 10, y: 10 },
      placement: 'at-anchor',
    });
    expect(wide.ok).toBe(true);
  });

  it('merges props over manifest defaults and validates them against the schema', () => {
    const merged = build({
      nodes: [{ key: 'a', materialType: 'acme.text', props: { unit: 'GB' } }],
    });
    expect(merged.ok && merged.value.transaction.commands[0]).toMatchObject({
      component: { props: { unit: 'GB' } },
    });
    const invalid = build({
      nodes: [{ key: 'a', materialType: 'acme.text', props: { unit: 7 } }],
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics[0]).toMatchObject({ path: ['nodes', 0, 'props'] });
  });

  it('applies explicit size and dataSource overrides', () => {
    const result = build({
      nodes: [
        {
          key: 'a',
          materialType: 'acme.text',
          size: { width: 42, height: 24 },
          dataSource: { type: 'static', value: 'CPU' },
        },
        { key: 'b', materialType: 'acme.text', dataSource: null },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const components = result.value.transaction.commands.map(
      (command) => (command.type === 'add-component' ? command.component : undefined)!,
    );
    expect(components[0]?.size).toEqual({ width: 42, height: 24 });
    expect(components[0]?.dataSource).toEqual({ type: 'static', value: 'CPU' });
    expect(components[1]?.dataSource).toBeNull();
  });
});

describe('material component factory extensions', () => {
  it('reserves fragment-local ids so same-type nodes do not collide', () => {
    const document = documentWith([{ id: 'acme-text-1' }]);
    expect(nextMaterialComponentId(document, 'acme.text')).toBe('acme-text-2');
    expect(nextMaterialComponentId(document, 'acme.text', new Set(['acme-text-2']))).toBe(
      'acme-text-3',
    );
  });

  it('counts reserved zIndex levels', () => {
    expect(nextMaterialComponentZIndex(documentWith())).toBe(0);
    expect(nextMaterialComponentZIndex(documentWith([{ id: 'x', zIndex: 4 }]))).toBe(5);
    expect(nextMaterialComponentZIndex(documentWith(), new Set([9]))).toBe(10);
  });
});

describe('component fragment transaction with shared data and relations (ADR-0100 phase 2)', () => {
  const sales = {
    key: 'sales',
    name: '销售',
    source: { kind: 'dataset', datasetId: 'sales' },
    params: {},
  };
  const detail = {
    key: 'detail',
    name: '明细',
    source: { kind: 'dataset', datasetId: 'detail' },
    params: { region: { kind: 'data-source-field', dataSourceId: 'sales', path: ['region'] } },
  };

  function withExisting(): ScreenDocument {
    return {
      ...documentWith([{ id: 'acme.text', type: 'acme.text', zIndex: 0 }]),
      dataSources: [
        { id: 'sales', name: '已有', source: { kind: 'dataset', datasetId: 'x' }, params: {} },
      ],
      blueprint: {
        relations: [
          {
            type: 'semantic',
            id: 'link',
            source: { kind: 'component', componentId: 'acme.text' },
            target: { kind: 'component', componentId: 'acme.text' },
            role: 'related',
          },
        ],
      },
    } as ScreenDocument;
  }

  it('creates data sources first, remaps keys to unique ids and keeps params pointing inside', () => {
    const built = build(
      {
        nodes: [
          {
            key: 'value',
            materialType: 'acme.text',
            dataValue: { kind: 'data-source-field', dataSourceId: 'detail', path: [] },
          },
        ],
        dataSources: [sales, detail],
      },
      { x: 0, y: 0 },
      withExisting(),
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const [first, second] = built.value.transaction.commands;
    expect(first?.type).toBe('replace-data-sources');
    expect(second?.type).toBe('add-component');
    expect(built.value.dataSourceIds).toEqual(['sales-2', 'detail']);
    if (first?.type !== 'replace-data-sources') return;
    const replaced = first.dataSources;
    expect(replaced.map((source) => source.id)).toEqual(['sales', 'sales-2', 'detail']);
    expect(replaced[2]?.params.region).toMatchObject({ dataSourceId: 'sales-2' });
    const component = (second as { component: ScreenDocument['components'][number] }).component;
    expect(component.dataSource).toBeNull();
    expect(component.dataValue).toEqual({
      kind: 'data-source-field',
      dataSourceId: 'detail',
      path: [],
    });
  });

  it('appends remapped relations after the components and dedupes relation ids', () => {
    const built = build(
      {
        nodes: [
          { key: 'a', materialType: 'acme.text' },
          { key: 'b', materialType: 'acme.text', offset: { x: 0, y: 50 } },
        ],
        relations: [
          {
            type: 'semantic',
            id: 'link',
            source: { kind: 'component', componentId: 'a' },
            target: { kind: 'component', componentId: 'b' },
            role: 'detail',
          },
        ],
      },
      { x: 0, y: 0 },
      withExisting(),
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const commands = built.value.transaction.commands;
    expect(commands.at(-1)?.type).toBe('replace-blueprint');
    const blueprint = (commands.at(-1) as { blueprint: ScreenDocument['blueprint'] }).blueprint;
    expect(blueprint.relations.map((relation) => relation.id)).toEqual(['link', 'link-2']);
    const added = blueprint.relations[1] as {
      source: { componentId: string };
      target: { componentId: string };
    };
    expect([added.source.componentId, added.target.componentId]).toEqual(built.value.componentIds);
    expect(built.value.relationIds).toEqual(['link-2']);
  });

  it('applies an entry rotation to the created component', () => {
    const built = build({ nodes: [{ key: 'a', materialType: 'acme.text', rotation: 30 }] });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const component = (
      built.value.transaction.commands[0] as {
        component: ScreenDocument['components'][number];
      }
    ).component;
    expect(component.rotation).toBe(30);
  });
});

describe('fragment nodes and the document theme (ADR-0101)', () => {
  const palette = {
    primary: '#ff6600',
    text: '#ffffff',
    textSecondary: '#cccccc',
    background: '#000000',
    accent: '#00ccff',
    accentSecondary: '#0066aa',
  };
  const themed = manifest({ themeStyle: { color: 'primary' } });
  const themedCatalog = catalogOf(SHELL, themed);

  function styles(intent: unknown, document: ScreenDocument) {
    const built = createBaseScreenComponentFragmentTransaction({
      document,
      catalog: themedCatalog,
      intent: okFragment(intent),
      anchor: { x: 0, y: 0 },
    });
    if (!built.ok) throw new Error(JSON.stringify(built.diagnostics));
    return built.value.transaction.commands.map((command) =>
      command.type === 'add-component' ? command.component.style : undefined,
    );
  }

  it('takes the palette colour for keys the fragment does not set', () => {
    const document = { ...documentWith(), theme: { palette } } as ScreenDocument;
    expect(styles({ nodes: [{ key: 'a', materialType: 'acme.text' }] }, document)).toEqual([
      { color: '#ff6600' },
    ]);
  });

  it('keeps the colour the fragment writes explicitly', () => {
    const document = { ...documentWith(), theme: { palette } } as ScreenDocument;
    expect(
      styles(
        { nodes: [{ key: 'a', materialType: 'acme.text', style: { color: '#123456' } }] },
        document,
      ),
    ).toEqual([{ color: '#123456' }]);
  });

  it('falls back to the manifest default without a palette', () => {
    expect(styles({ nodes: [{ key: 'a', materialType: 'acme.text' }] }, documentWith())).toEqual([
      { color: '#fff' },
    ]);
  });
});
