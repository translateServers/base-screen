import { describe, expect, it } from 'vitest';
import {
  isBaseScreenBoundedName,
  parseBaseScreenComponentFragmentInsertionIntent,
  parseBaseScreenFragmentDefinition,
} from '../../src/fragment/fragment.js';
import { parseBaseScreenPluginManifest } from '../../src/plugin.js';

function definition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'board.kpi-card',
    name: '指标卡',
    category: '指标',
    keywords: ['指标', '卡片'],
    shell: { key: 'frame', materialType: 'base.container', size: { width: 320, height: 160 } },
    nodes: [
      { key: 'title', materialType: 'base.text', offset: { x: 16, y: 12 } },
      { key: 'value', materialType: 'board.digital-flop', offset: { x: 16, y: 56 } },
    ],
    ...overrides,
  };
}

describe('parseBaseScreenFragmentDefinition', () => {
  it('accepts a definition and keeps optional fields absent', () => {
    const parsed = parseBaseScreenFragmentDefinition(definition());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.id).toBe('board.kpi-card');
    expect(parsed.value.keywords).toEqual(['指标', '卡片']);
    expect(parsed.value).not.toHaveProperty('cover');
    expect(parsed.value.nodes.map((node) => node.key)).toEqual(['title', 'value']);
  });

  it('rejects unknown keys instead of stripping them', () => {
    const parsed = parseBaseScreenFragmentDefinition(definition({ anchor: { x: 0, y: 0 } }));

    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
  });

  it('validates id, display metadata, keywords and cover with manifest codes', () => {
    const parsed = parseBaseScreenFragmentDefinition(
      definition({
        id: '1-starts-with-digit',
        name: '',
        keywords: ['指标', '指标'],
        cover: 'javascript:alert(1)',
      }),
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics.map((item) => [item.code, item.path])).toEqual(
      expect.arrayContaining([
        ['PLUGIN_CORE_MANIFEST_FIELD_INVALID', ['id']],
        ['PLUGIN_CORE_MANIFEST_FIELD_INVALID', ['name']],
        ['PLUGIN_CORE_CONTRIBUTION_DUPLICATE', ['keywords', 1]],
        ['PLUGIN_CORE_MANIFEST_FIELD_INVALID', ['cover']],
      ]),
    );
  });

  it('reports composition problems with manifest codes on the same paths', () => {
    const empty = parseBaseScreenFragmentDefinition(definition({ nodes: [] }));
    expect(empty.diagnostics[0]).toMatchObject({
      code: 'PLUGIN_CORE_LIMIT_EXCEEDED',
      path: ['nodes'],
    });

    const badSize = parseBaseScreenFragmentDefinition(
      definition({
        nodes: [{ key: 'a', materialType: 'base.text', size: { width: 0, height: 10 } }],
      }),
    );
    expect(badSize.diagnostics[0]).toMatchObject({
      code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path: ['nodes', 0, 'size'],
    });
  });
});

describe('parseBaseScreenComponentFragmentInsertionIntent', () => {
  it('keeps authoring codes for the insertion intent', () => {
    const parsed = parseBaseScreenComponentFragmentInsertionIntent({ nodes: [] });

    expect(parsed.diagnostics[0]?.code).toBe('AUTHORING_LIMIT_EXCEEDED');
  });

  it('does not accept definition metadata as part of an insertion intent', () => {
    const parsed = parseBaseScreenComponentFragmentInsertionIntent({
      id: 'board.kpi-card',
      nodes: [{ key: 'a', materialType: 'base.text' }],
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('AUTHORING_PAYLOAD_INVALID');
  });
});

describe('isBaseScreenBoundedName', () => {
  it('requires a non-blank value without control characters within the limit', () => {
    expect(isBaseScreenBoundedName('指标卡', 3)).toBe(true);
    expect(isBaseScreenBoundedName('指标卡片', 3)).toBe(false);
    expect(isBaseScreenBoundedName('   ', 8)).toBe(false);
    expect(isBaseScreenBoundedName('a\u0085b', 8)).toBe(false);
    expect(isBaseScreenBoundedName(42, 8)).toBe(false);
  });
});

describe('fragment plugin contribution', () => {
  function manifest(contribution: Record<string, unknown>) {
    return { id: 'acme.plugin', dependencies: [], capabilities: [], contributions: [contribution] };
  }

  it('accepts a fragment contribution without any capability', () => {
    const parsed = parseBaseScreenPluginManifest(manifest({ kind: 'fragment', ...definition() }));

    expect(parsed.ok).toBe(true);
  });

  it('reports fragment diagnostics under the contribution path', () => {
    const parsed = parseBaseScreenPluginManifest(
      manifest({ kind: 'fragment', ...definition({ nodes: [{ key: 'a', materialType: 'x' }] }) }),
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        path: ['contributions', 0, 'nodes', 0, 'materialType'],
      }),
    ]);
  });

  it('rejects two fragments with the same id', () => {
    const fragment = { kind: 'fragment', ...definition() };
    const parsed = parseBaseScreenPluginManifest({
      id: 'acme.plugin',
      dependencies: [],
      capabilities: [],
      contributions: [fragment, fragment],
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('PLUGIN_CORE_CONTRIBUTION_DUPLICATE');
  });
});

describe('fragment data sources, value references and relations (ADR-0100 phase 2)', () => {
  const salesSource = {
    key: 'sales',
    name: '销售',
    source: { kind: 'dataset', datasetId: 'sales' },
    params: { limit: { kind: 'inline', value: 10 } },
  };

  function intent(overrides: Record<string, unknown> = {}) {
    return parseBaseScreenComponentFragmentInsertionIntent({
      shell: { key: 'frame', materialType: 'base.container' },
      nodes: [
        { key: 'title', materialType: 'base.text', dataValue: { kind: 'inline', value: '销售额' } },
        {
          key: 'value',
          materialType: 'board.digital-flop',
          dataValue: { kind: 'data-source-field', dataSourceId: 'sales', path: [] },
          dataBinding: { fields: { value: ['amount'] } },
        },
      ],
      dataSources: [salesSource],
      ...overrides,
    });
  }

  it('accepts shared data sources and nodes that read them through dataValue', () => {
    const parsed = intent();
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.dataSources?.[0]).toMatchObject({ key: 'sales', name: '销售' });
    expect(parsed.value.dataSources?.[0]).not.toHaveProperty('id');
    expect(parsed.value.nodes[1]?.dataValue).toMatchObject({ dataSourceId: 'sales' });
    expect(parsed.value.nodes[1]?.dataBinding).toEqual({ fields: { value: ['amount'] } });
  });

  it('rejects a dataValue that points outside the fragment or at a variable', () => {
    const outside = parseBaseScreenComponentFragmentInsertionIntent({
      nodes: [
        {
          key: 'value',
          materialType: 'base.text',
          dataValue: { kind: 'data-source-field', dataSourceId: 'missing', path: [] },
        },
      ],
    });
    expect(outside.diagnostics[0]).toMatchObject({
      code: 'AUTHORING_PAYLOAD_INVALID',
      path: ['nodes', 0, 'dataValue', 'dataSourceId'],
    });
    const variable = parseBaseScreenComponentFragmentInsertionIntent({
      nodes: [
        {
          key: 'value',
          materialType: 'base.text',
          dataValue: { kind: 'variable', variableId: 'a' },
        },
      ],
    });
    expect(variable.diagnostics[0]?.path).toEqual(['nodes', 0, 'dataValue']);
  });

  it('keeps dataSource and dataValue mutually exclusive, and dataBinding tied to a field ref', () => {
    const both = parseBaseScreenComponentFragmentInsertionIntent({
      nodes: [
        {
          key: 'value',
          materialType: 'base.text',
          dataSource: { type: 'static', value: '1' },
          dataValue: { kind: 'inline', value: '1' },
        },
      ],
    });
    expect(both.diagnostics[0]?.path).toEqual(['nodes', 0, 'dataValue']);
    const binding = parseBaseScreenComponentFragmentInsertionIntent({
      nodes: [
        {
          key: 'value',
          materialType: 'base.text',
          dataValue: { kind: 'inline', value: '1' },
          dataBinding: { fields: { value: ['amount'] } },
        },
      ],
    });
    expect(binding.diagnostics[0]?.path).toEqual(['nodes', 0, 'dataBinding']);
  });

  it('only lets data source params reference earlier fragment data sources', () => {
    const later = intent({
      dataSources: [
        {
          ...salesSource,
          key: 'detail',
          params: { region: { kind: 'data-source-field', dataSourceId: 'sales', path: [] } },
        },
        salesSource,
      ],
    });
    expect(later.ok).toBe(false);
    expect(later.diagnostics[0]?.path).toEqual([
      'dataSources',
      0,
      'params',
      'region',
      'dataSourceId',
    ]);
    const malformed = intent({ dataSources: [{ ...salesSource, source: { kind: 'nope' } }] });
    expect(malformed.diagnostics[0]?.path.slice(0, 3)).toEqual(['dataSources', 0, 'source']);
  });

  it('accepts a blueprint between fragment entries and rejects outside endpoints or variables', () => {
    const blueprint = {
      nodes: [
        { kind: 'component', id: 'title-node', componentId: 'title' },
        { kind: 'component', id: 'value-node', componentId: 'value' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'reveal',
          from: { node: 'title-node', port: 'event:valueClick' },
          to: { node: 'value-node', port: 'toggle' },
        },
      ],
    };
    expect(intent({ blueprint }).ok).toBe(true);
    const outside = intent({
      blueprint: {
        ...blueprint,
        nodes: [
          blueprint.nodes[0],
          { kind: 'component', id: 'value-node', componentId: 'elsewhere' },
        ],
      },
    });
    expect(outside.diagnostics[0]?.path).toEqual(['blueprint', 'nodes', 1, 'componentId']);
    const variable = intent({
      blueprint: {
        nodes: [...blueprint.nodes, { kind: 'variable', id: 'region-node', variableId: 'region' }],
        edges: blueprint.edges,
      },
    });
    expect(variable.diagnostics[0]?.path).toEqual(['blueprint', 'nodes', 2, 'kind']);
    const duplicated = intent({
      blueprint: { ...blueprint, edges: [...blueprint.edges, blueprint.edges[0]] },
    });
    expect(duplicated.diagnostics[0]?.path).toEqual(['blueprint', 'edges', 1, 'id']);
  });

  it('accepts a bounded rotation on entries', () => {
    expect(
      intent({ shell: { key: 'frame', materialType: 'base.container', rotation: 15 } }).ok,
    ).toBe(true);
    expect(
      intent({ shell: { key: 'frame', materialType: 'base.container', rotation: 180 } }).ok,
    ).toBe(false);
  });

  it('reports phase-2 problems on definitions with manifest codes', () => {
    const parsed = parseBaseScreenFragmentDefinition(
      definition({ dataSources: [{ key: 'x', name: 'x', source: { kind: 'nope' }, params: {} }] }),
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
  });
});
