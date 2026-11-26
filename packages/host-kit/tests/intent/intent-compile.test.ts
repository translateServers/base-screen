import { parseScreenDocument } from '@base-screen/contracts';
import { auditScreenLayout } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  type CompiledComponent,
  type CompiledScreenDocument,
  compileScreenIntent,
  flatSkeleton,
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
          origin: 'kpis',
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
          { kind: 'band', items: [{ label: '量', value: 1, origin: 'kpis[0]' }], origin: 'kpis' },
          {
            kind: 'grid',
            origin: 'blocks',
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
  const skeleton = flatSkeleton(3, [
    { span: 2, data: true },
    { span: 2, data: false },
  ]);
  const output = flatOutput([CHART, NOTE]);
  const intent = intentOf(output);
  const kpiAt = (index: number) =>
    parseIntentKpi((output.kpis as unknown[])[index], `kpis[${index}]`).value;
  const blockAt = (index: number) =>
    parseIntentBlock((output.blocks as unknown[])[index], COMPILE_CATALOG, `blocks[${index}]`, {
      grid: true,
    }).value;

  function frame(kpis: number[], blocks: number[]): IntentStreamFrame {
    return {
      skeleton,
      kpis: Object.fromEntries(
        kpis.map((i) => [`kpis[${i}]`, kpiAt(i)]),
      ) as IntentStreamFrame['kpis'],
      blocks: Object.fromEntries(
        blocks.map((i) => [`blocks[${i}]`, blockAt(i)]),
      ) as IntentStreamFrame['blocks'],
    };
  }

  function geometry(document: CompiledScreenDocument) {
    return Object.fromEntries(
      nodes(document).map((node) => [node.id, { position: node.position, size: node.size }]),
    );
  }

  it('draws a placeholder per unarrived slot, with a stable id and no content counter', () => {
    const outcome = compileScreenIntent({
      intent,
      catalog: COMPILE_CATALOG,
      stream: frame([], []),
    });
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
      stream: frame([0], []),
    });
    const second = compileScreenIntent({
      intent,
      catalog: COMPILE_CATALOG,
      stream: frame([0, 1, 2], [0]),
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
      stream: frame([0, 1, 2], [0, 1]),
    });
    if (!streamed.ok) throw new Error('compile failed');

    expect(streamed.value.document).toEqual(plain.document);
    expect(streamed.value.sources).toEqual(plain.sources);
  });
});

describe('compileScreenIntent · regions', () => {
  const text = (title: string, extra: Record<string, unknown> = {}) => ({
    type: 'base.text',
    title,
    text: '甲\n乙',
    ...extra,
  });
  const regionsOutput = (regions: unknown[]) => ({
    title: '仓储作战室',
    subtitle: '按日汇总的出入库口径',
    regions,
  });
  const band = {
    kind: 'band',
    items: [
      { label: '总量', value: 286000, unit: '件' },
      { label: '周转', value: 31.4, unit: '天' },
    ],
  };

  it('lays a split out as a wide main column and a narrow rail on the right', () => {
    const intent = intentOf(
      regionsOutput([
        band,
        {
          kind: 'split',
          main: [{ type: 'base.chart', title: '趋势', table: TREND_TABLE }],
          rail: [text('要点'), text('提醒')],
        },
      ]),
    );
    const { document, sources } = compileOk(intent);
    const chart = named(document, '趋势');
    const rail = nodes(document).filter((node) => node.name === '要点' || node.name === '提醒');

    // 主区约占三列，侧栏占一列且在主区右侧，纵向堆叠两格。
    expect(chart.size.width).toBeGreaterThan(1200);
    const [first, second] = rail;
    expect(first?.position.x).toBeGreaterThan(chart.position.x + chart.size.width);
    expect(first?.position.x).toBe(second?.position.x);
    expect(first?.position.y).toBeLessThan(second?.position.y ?? 0);
    // id 带区域序号，来源表指回模型原文。
    expect(nodes(document).map((node) => node.id)).toEqual(
      expect.arrayContaining(['agent-r0-k0-0', 'agent-r1-m0-0', 'agent-r1-s0-0', 'agent-r1-s1-0']),
    );
    expect(sources['agent-r1-m0-1']).toBe('regions[1].main[0]');
    expect(sources['agent-r1-s1-1']).toBe('regions[1].rail[1]');
  });

  it('puts the rail on the left when asked, and splits even columns evenly', () => {
    const base = (extra: Record<string, unknown>) =>
      compileOk(
        intentOf(
          regionsOutput([
            band,
            {
              kind: 'split',
              ...extra,
              main: [{ type: 'base.chart', title: '趋势', table: TREND_TABLE }],
              rail: [text('要点')],
            },
          ]),
        ),
      ).document;

    const left = base({ railSide: 'left' });
    expect(named(left, '要点').position.x).toBeLessThan(named(left, '趋势').position.x);

    const even = base({ ratio: 'even' });
    expect(named(even, '趋势').size.width).toBe(named(even, '要点').size.width);
  });

  it('stacks regions from top to bottom and gives data regions more height', () => {
    const intent = intentOf(
      regionsOutput([
        band,
        {
          kind: 'grid',
          blocks: [{ type: 'base.chart', title: '趋势', span: 4, table: TREND_TABLE }],
        },
        { kind: 'grid', blocks: [text('结论', { span: 4 })] },
      ]),
    );
    const { document } = compileOk(intent);
    const chart = named(document, '趋势');
    const note = named(document, '结论');

    expect(note.position.y).toBeGreaterThan(chart.position.y);
    expect(chart.size.height).toBeGreaterThan(note.size.height);
    // 最下面的块不越过页脚上方。
    expect(note.position.y + note.size.height).toBeLessThanOrEqual(1010);
  });

  it('works without a band, starting right below the header', () => {
    const intent = intentOf(
      regionsOutput([
        {
          kind: 'grid',
          blocks: [{ type: 'base.chart', title: '趋势', span: 4, table: TREND_TABLE }],
        },
      ]),
    );
    const { document } = compileOk(intent);

    expect(nodes(document).some((node) => node.name === '指标卡')).toBe(false);
    // 区域从 172 起；块标题占 36、内边距 16，图表落在 224。
    expect(named(document, '块标题').position.y).toBe(172);
    expect(named(document, '趋势').position.y).toBe(224);
  });

  it('reports a capacity conflict naming the region and how far short it is', () => {
    const grid = (index: number) => ({
      kind: 'grid',
      blocks: [text(`块${index}`, { span: 4 })],
    });
    const outcome = compileScreenIntent({
      intent: intentOf(regionsOutput([band, grid(0), grid(1), grid(2), grid(3), grid(4)])),
      catalog: COMPILE_CATALOG,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'LAYOUT_CAPACITY_EXCEEDED',
        message: expect.stringContaining('short by'),
      }),
    ]);
    expect(outcome.diagnostics[0]?.path).toMatch(/^regions\[\d\]$/);
  });

  it('reports a band with too many cards instead of squeezing them', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      label: `指标${index}`,
      value: index,
    }));
    const outcome = compileScreenIntent({
      intent: intentOf(
        regionsOutput([
          { kind: 'band', items },
          { kind: 'grid', blocks: [text('要点', { span: 4 })] },
        ]),
      ),
      catalog: COMPILE_CATALOG,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({ code: 'LAYOUT_CAPACITY_EXCEEDED', path: 'regions[0]' }),
    ]);
  });

  it('keeps every compiled region screen free of layout violations', () => {
    const intent = intentOf(
      regionsOutput([
        band,
        {
          kind: 'split',
          main: [{ type: 'base.chart', title: '趋势', table: TREND_TABLE }],
          rail: [text('要点'), text('提醒')],
        },
        {
          kind: 'grid',
          blocks: [
            { type: 'base.table', title: '明细', span: 3, table: TREND_TABLE },
            text('结论', { span: 1 }),
          ],
        },
      ]),
    );
    const { document } = compileOk(intent, { mode: 'llm' });
    const parsed = parseScreenDocument(document);

    expect(parsed.ok, JSON.stringify(parsed.diagnostics)).toBe(true);
    if (parsed.ok) expect(auditScreenLayout(parsed.value)).toEqual([]);
  });
});
