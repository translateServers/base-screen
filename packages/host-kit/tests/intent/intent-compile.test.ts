import { describe, expect, it } from 'vitest';
import {
  type CompiledComponent,
  type CompiledScreenDocument,
  compileScreenIntent,
  type IntentCatalog,
  type IntentCompileResult,
  type IntentStreamFrame,
  parseIntentBlock,
  parseIntentKpi,
  parseScreenIntent,
  type ScreenIntent,
} from '../../src/index.js';
import {
  COMPILE_CATALOG,
  flatOutput,
  intentOf,
  SHAPE_CATALOG,
  SIX_ROW_TABLE,
  TREND_TABLE,
} from './fixtures.js';

function compileOk(
  intent: ScreenIntent,
  extra: { catalog?: IntentCatalog; mode?: 'llm' | 'deterministic' } = {},
): IntentCompileResult {
  const outcome = compileScreenIntent({
    intent,
    catalog: extra.catalog ?? COMPILE_CATALOG,
    ...(extra.mode === undefined ? {} : { mode: extra.mode }),
  });
  if (!outcome.ok) throw new Error(`compile failed: ${outcome.diagnostics[0]?.code}`);
  return outcome.value;
}

function nodes(document: CompiledScreenDocument): readonly CompiledComponent[] {
  return document.components;
}

function named(document: CompiledScreenDocument, name: string): CompiledComponent {
  const found = nodes(document).find((node) => node.name === name);
  if (found === undefined) throw new Error(`no component named ${name}`);
  return found;
}

const CHART = { type: 'base.chart', title: '近三日趋势', span: 2, table: TREND_TABLE };
const NOTE = { type: 'base.text', title: '要点', span: 2, text: '甲' };

describe('compileScreenIntent', () => {
  it('compiles a flat intent into components with catalog-driven types and bindings', () => {
    const result = compileOk(intentOf(flatOutput([CHART])), { mode: 'llm' });
    const chart = named(result.document, '近三日趋势');

    expect(chart.type).toBe('base.chart');
    expect(chart.dataSource).toBeNull();
    expect(chart.dataValue).toEqual({
      kind: 'inline',
      value: {
        fields: [
          { id: 'day', label: '日期', valueType: 'string', nullable: false },
          { id: 'amount', label: '金额', valueType: 'number', nullable: false },
        ],
        rows: TREND_TABLE.rows,
      },
      sample: true,
    });
    expect(chart.dataBinding).toEqual({ fields: { dimension: ['day'], measures: ['amount'] } });
    expect(result.document.dataSources).toBeUndefined();
    expect(result.document.canvas).toEqual({
      width: 1920,
      height: 1080,
      backgroundColor: '#0b1020',
    });
    expect(result.materials).toEqual(expect.arrayContaining(['base.text', 'base.chart']));
    expect(result.warnings).toEqual([]);
  });

  it('derives ids and layers from the position, and records the model path in the source table', () => {
    const { document, sources } = compileOk(intentOf(flatOutput([CHART])));

    expect(nodes(document).map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'agent-title-0',
        'agent-subtitle-0',
        'agent-kpi-0-0',
        'agent-kpi-0-1',
        'agent-kpi-0-2',
        'agent-kpi-2-0',
        'agent-block-0-0',
        'agent-block-0-1',
        'agent-footer-0',
      ]),
    );
    expect(sources['agent-title-0']).toBe('title');
    expect(sources['agent-kpi-1-1']).toBe('kpis[1]');
    expect(sources['agent-block-0-1']).toBe('blocks[0]');
    // 页脚是编译器自己的内容，不属于 IR 的任何位置。
    expect(sources['agent-footer-0']).toBe('');
    const zIndexes = nodes(document).map((node) => [node.id, node.zIndex] as const);
    expect(Object.fromEntries(zIndexes)).toMatchObject({
      'agent-title-0': 1,
      'agent-subtitle-0': 2,
      'agent-kpi-0-0': 10,
      'agent-kpi-1-0': 20,
      'agent-block-0-0': 100,
      'agent-footer-0': 1000,
    });
  });

  it('points the source table at where the model wrote an item, even after a bad one was dropped', () => {
    const output = flatOutput([CHART]);
    (output.kpis as unknown[]).unshift({ label: '坏', value: 'abc' });
    const parsed = parseScreenIntent(output, { catalog: COMPILE_CATALOG }).intent;
    if (parsed === undefined) throw new Error('intent is unusable');
    const { document, sources } = compileOk(parsed);

    // 位置 0 的指标其实是模型写的第 2 条：id 仍按位置分段（流式帧之间不漂移），来源指回模型原文。
    expect(nodes(document).some((node) => node.id === 'agent-kpi-0-0')).toBe(true);
    expect(sources['agent-kpi-0-0']).toBe('kpis[1]');
    expect(sources['agent-kpi-1-0']).toBe('kpis[2]');
  });

  it('marks model KPI values as sample data, but not the title or a null placeholder', () => {
    const intent = intentOf(flatOutput([CHART]));
    const llm = compileOk(intent, { mode: 'llm' }).document;
    for (const node of nodes(llm).filter((item) => item.name === '指标值')) {
      expect(node.dataValue).toMatchObject({ sample: true });
    }
    expect(named(llm, '标题').dataValue).not.toHaveProperty('sample');

    const fallback = compileOk(intent, { mode: 'deterministic' }).document;
    for (const node of nodes(fallback).filter((item) => item.name === '指标值')) {
      expect(node.dataValue).not.toHaveProperty('sample');
    }
    expect(named(fallback, '页脚').dataValue).toMatchObject({
      value: expect.stringContaining('确定性兜底'),
    });
  });

  it('formats a missing KPI value as a dash instead of zero', () => {
    const intent: ScreenIntent = {
      title: '指标',
      subtitle: '口径',
      regions: [
        {
          kind: 'band',
          items: [{ label: '缺数', value: null, origin: 'kpis[0]' }],
        },
      ],
    };
    const document = compileOk(intent, { mode: 'llm' }).document;

    expect(named(document, '指标值').dataValue).toEqual({ kind: 'inline', value: '—' });
  });

  it('takes the card surface from the rectangle, never from a catalog ellipse listed first', () => {
    const intent = intentOf(flatOutput([NOTE]), SHAPE_CATALOG);
    const document = compileOk(intent, { catalog: SHAPE_CATALOG }).document;

    const cards = nodes(document).filter((node) => node.name === '指标卡');
    expect(cards.length).toBe(3);
    expect(new Set(cards.map((node) => node.type))).toEqual(new Set(['base.rectangle']));
  });

  it('raises a font size below the legible floor to 16px', () => {
    const document = compileOk(
      intentOf(flatOutput([{ type: 'base.table', title: '仓库', span: 4, table: SIX_ROW_TABLE }])),
    ).document;
    const table = nodes(document).find((node) => node.type === 'base.table');

    expect(table?.style.fontSize).toBe(16);
    // 表格行高按块高收紧：6 行数据 + 表头不会溢出成滚动条。
    expect(typeof table?.style.rowHeight).toBe('number');
    expect(table?.style.rowHeight as number).toBeLessThanOrEqual(32);
  });

  it('stretches a lone block over the full row and keeps spans proportional otherwise', () => {
    const width = (blocks: Record<string, unknown>[]) =>
      nodes(compileOk(intentOf(flatOutput(blocks))).document)
        .filter((node) => node.type === 'base.chart')
        .map((node) => node.size.width);
    const chart = (span: number) => ({ ...CHART, span });

    const [alone] = width([chart(2)]);
    expect(alone).toBeGreaterThan(1700);
    const [first, second] = width([chart(2), chart(2)]);
    expect(first).toBe(second);
    const wide = width([chart(3), chart(1)]);
    expect((wide[0] ?? 0) / (wide[1] ?? 1)).toBeGreaterThan(2);
  });

  it('writes an asset as a data source instance and keeps the URL out of the document', () => {
    const intent = intentOf(
      flatOutput([{ type: 'base.image', title: '现场', span: 1, assetId: 'a-1' }]),
    );
    const result = compileOk(intent);
    const image = nodes(result.document).find((node) => node.type === 'base.image');

    expect(image?.dataValue).toEqual({
      kind: 'data-source-field',
      dataSourceId: 'agent-ds-1',
      path: [],
    });
    // 配图铺满它占的那块：manifest 默认 contain，会留一圈边。
    expect(image?.style.objectFit).toBe('cover');
    expect(result.imageCount).toBe(1);
    expect(result.document.dataSources).toEqual([
      {
        id: 'agent-ds-1',
        name: '远山',
        source: { kind: 'host-resource', resourceType: 'host_image', resourceId: 'a-1' },
        params: {},
      },
    ]);
    expect(JSON.stringify(result.document)).not.toContain('http');
  });

  it('binds a referenced dataset through a data source and its column types', () => {
    const intent = intentOf(
      flatOutput([{ type: 'base.chart', title: '订单', span: 4, datasetId: 'orders' }]),
    );
    const outcome = compileScreenIntent({
      intent,
      catalog: COMPILE_CATALOG,
      references: {
        assets: [],
        datasets: [
          {
            datasetId: 'orders',
            name: '订单',
            columns: [
              { id: 'day', type: 'string' },
              { id: 'amount', type: 'number' },
            ],
          },
        ],
      },
    });
    if (!outcome.ok) throw new Error('compile failed');
    const chart = nodes(outcome.value.document).find((node) => node.type === 'base.chart');

    expect(chart?.dataValue).toEqual({
      kind: 'data-source-field',
      dataSourceId: 'agent-ds-1',
      path: [],
    });
    expect(chart?.dataBinding).toEqual({ fields: { dimension: ['day'], measures: ['amount'] } });
    // 引用真实数据集：不是示例数据，不带标记。
    expect(chart?.dataValue).not.toHaveProperty('sample');
    expect(outcome.value.document.dataSources).toEqual([
      {
        id: 'agent-ds-1',
        name: '订单',
        source: { kind: 'dataset', datasetId: 'orders' },
        params: {},
      },
    ]);
  });

  describe('degrades one block without failing the screen', () => {
    it('drops a dataset block when the dataset is not among this turn’s references', () => {
      const intent = intentOf(
        flatOutput([
          { type: 'base.chart', title: '订单', span: 2, datasetId: 'gone' },
          { type: 'base.text', title: '要点', span: 2, text: '甲' },
        ]),
      );
      const result = compileOk(intent);

      expect(result.warnings.map((item) => `${item.code}@${item.path}`)).toEqual([
        'AGENT_DATASET_UNKNOWN@blocks[0]',
        'AGENT_BLOCK_DATA_MISSING@blocks[0]',
      ]);
      expect(result.warnings.every((item) => item.severity === 'warning')).toBe(true);
      expect(nodes(result.document).some((node) => node.name === '订单')).toBe(false);
      expect(nodes(result.document).some((node) => node.name === '要点')).toBe(true);
    });

    it('turns a block into an empty one when the columns cannot satisfy the binding roles', () => {
      const intent = intentOf(
        flatOutput([
          {
            type: 'board.status-grid',
            title: '状态',
            span: 4,
            table: {
              columns: [{ id: 'name', label: '名称', type: 'string' }],
              rows: [{ name: '甲' }],
            },
          },
        ]),
      );
      const result = compileOk(intent);
      const grid = nodes(result.document).find((node) => node.type === 'board.status-grid');

      expect(result.warnings.map((item) => item.code)).toEqual(['AGENT_BLOCK_BINDING_UNSATISFIED']);
      expect(grid?.dataValue).toBeNull();
      expect(grid?.dataBinding).toBeUndefined();
    });

    it('skips an asset-only material that was given text, and does not leave its title behind', () => {
      const intent = intentOf(
        flatOutput([{ type: 'base.image', title: '现场', span: 1, text: '拣选作业现场' }]),
      );
      const result = compileOk(intent);

      expect(result.warnings.map((item) => item.code)).toEqual(['AGENT_BLOCK_ASSET_REQUIRED']);
      expect(nodes(result.document).some((node) => node.name === '现场')).toBe(false);
      expect(nodes(result.document).some((node) => node.type === 'base.image')).toBe(false);
    });

    it('reports a material that is not in the catalog and keeps the others', () => {
      const intent: ScreenIntent = {
        title: '指标',
        subtitle: '口径',
        regions: [
          { kind: 'band', items: [{ label: '量', value: 1, origin: 'kpis[0]' }] },
          {
            kind: 'grid',
            blocks: [
              {
                type: 'base.heatmap',
                title: '热力',
                span: 2,
                bind: { kind: 'none' },
                origin: 'blocks[0]',
              },
              {
                type: 'base.text',
                title: '要点',
                span: 2,
                bind: { kind: 'text', text: '甲' },
                origin: 'blocks[1]',
              },
            ],
          },
        ],
      };
      const result = compileOk(intent);

      expect(result.warnings.map((item) => `${item.code}@${item.path}`)).toEqual([
        'AGENT_MATERIAL_UNKNOWN@blocks[0]',
      ]);
      expect(nodes(result.document).some((node) => node.name === '要点')).toBe(true);
    });
  });

  it('refuses a region layout it cannot compile yet, saying where', () => {
    const intent = intentOf(flatOutput([CHART]));
    const split: ScreenIntent = {
      ...intent,
      regions: [
        ...intent.regions,
        {
          kind: 'split',
          ratio: 'wide-narrow',
          railSide: 'right',
          main: [
            {
              type: 'base.text',
              title: 'a',
              span: 1,
              bind: { kind: 'text', text: '甲' },
              origin: 'regions[2].main[0]',
            },
          ],
          rail: [
            {
              type: 'base.text',
              title: 'b',
              span: 1,
              bind: { kind: 'text', text: '乙' },
              origin: 'regions[2].rail[0]',
            },
          ],
        },
      ],
    };
    const outcome = compileScreenIntent({ intent: split, catalog: COMPILE_CATALOG });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'INTENT_LAYOUT_UNSUPPORTED',
        path: 'regions[2]',
      }),
    ]);
  });

  it('fails the whole screen when the catalog has nothing to lay out with', () => {
    const outcome = compileScreenIntent({
      intent: intentOf(flatOutput([CHART])),
      catalog: { assets: [], materials: [] },
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics.map((item) => item.code)).toEqual(['AGENT_CATALOG_UNUSABLE']);
  });

  it('draws no KPI cards when the intent has no band region', () => {
    const base = intentOf(flatOutput([CHART]));
    const intent: ScreenIntent = {
      ...base,
      regions: base.regions.filter((region) => region.kind === 'grid'),
    };
    const document = compileOk(intent).document;

    expect(nodes(document).some((node) => node.name === '指标卡')).toBe(false);
    expect(nodes(document).some((node) => node.name === '近三日趋势')).toBe(true);
  });

  it('falls back to the default style preset for an unknown style', () => {
    const base = intentOf(flatOutput([CHART]));
    const unknown = compileOk({ ...base, style: 'neon-pink' }).document;
    const light = compileOk({ ...base, style: 'light-biz' }).document;

    expect(unknown.canvas.backgroundColor).toBe('#0b1020');
    expect(light.canvas.backgroundColor).toBe('#f4f6fa');
    expect(named(light, '标题').style.color).toBe('#0f172a');
  });
});

describe('compileScreenIntent · streaming frame', () => {
  const skeleton = {
    kpis: 3,
    blocks: [
      { span: 2, data: true },
      { span: 2, data: false },
    ],
  } as const;
  const output = flatOutput([CHART, NOTE]);
  const intent = intentOf(output);
  const kpiAt = (index: number) =>
    parseIntentKpi((output.kpis as unknown[])[index], `kpis[${index}]`).value;
  const blockAt = (index: number) =>
    parseIntentBlock((output.blocks as unknown[])[index], COMPILE_CATALOG, `blocks[${index}]`, {
      grid: true,
    }).value;

  function frame(parts: Partial<IntentStreamFrame> = {}): IntentStreamFrame {
    return { skeleton, kpis: [], blocks: [], ...parts };
  }

  function geometry(document: CompiledScreenDocument) {
    return Object.fromEntries(
      nodes(document).map((node) => [node.id, { position: node.position, size: node.size }]),
    );
  }

  it('draws a placeholder per unarrived slot, with a stable id and no content counter', () => {
    const outcome = compileScreenIntent({ intent, catalog: COMPILE_CATALOG, stream: frame() });
    if (!outcome.ok) throw new Error('compile failed');

    const ids = nodes(outcome.value.document).map((node) => node.id);
    expect(ids).toEqual(
      expect.arrayContaining(['agent-block-0-pending', 'agent-block-1-pending', 'agent-kpi-0-0']),
    );
    expect(nodes(outcome.value.document).filter((node) => node.name === '占位')).toHaveLength(2);
  });

  it('never moves a component that already arrived when more content comes in', () => {
    const first = compileScreenIntent({
      intent,
      catalog: COMPILE_CATALOG,
      stream: frame({ kpis: [kpiAt(0), undefined, undefined] }),
    });
    const second = compileScreenIntent({
      intent,
      catalog: COMPILE_CATALOG,
      stream: frame({ kpis: [kpiAt(0), kpiAt(1), kpiAt(2)], blocks: [blockAt(0), undefined] }),
    });
    if (!first.ok || !second.ok) throw new Error('compile failed');

    const before = geometry(first.value.document);
    const after = geometry(second.value.document);
    // 两帧共有的组件，位置与尺寸一字不差；占位框被内容换掉，其余只增不减。
    for (const [id, box] of Object.entries(before)) {
      if (id.endsWith('-pending')) continue;
      expect(after[id]).toEqual(box);
    }
    expect(Object.keys(after)).not.toContain('agent-block-0-pending');
    expect(Object.keys(after)).toContain('agent-block-1-pending');
  });

  it('lays out the same document as the plain compile once everything has arrived', () => {
    const plain = compileOk(intent, { mode: 'llm' });
    const streamed = compileScreenIntent({
      intent,
      catalog: COMPILE_CATALOG,
      mode: 'llm',
      stream: frame({
        kpis: [kpiAt(0), kpiAt(1), kpiAt(2)],
        blocks: [blockAt(0), blockAt(1)],
      }),
    });
    if (!streamed.ok) throw new Error('compile failed');

    expect(streamed.value.document).toEqual(plain.document);
    expect(streamed.value.sources).toEqual(plain.sources);
  });
});
