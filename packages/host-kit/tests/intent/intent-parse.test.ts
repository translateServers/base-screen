import { describe, expect, it } from 'vitest';
import {
  type IntentBlock,
  type IntentCatalog,
  type IntentCatalogMaterial,
  type IntentRegion,
  parseIntentBlock,
  parseIntentKpi,
  parseScreenIntent,
} from '../../src/index.js';

const NO_DEFAULTS = { props: {}, style: {} } as const;

function material(
  overrides: Partial<IntentCatalogMaterial> & { type: string },
): IntentCatalogMaterial {
  return {
    name: overrides.type,
    category: '基础',
    data: 'none',
    asset: false,
    size: { width: 240, height: 120 },
    props: {},
    roles: [],
    defaults: NO_DEFAULTS,
    ...overrides,
  };
}

const CATALOG: IntentCatalog = {
  assets: [{ id: 'asset-1', name: '现场图' }],
  materials: [
    material({ type: 'base.rectangle' }),
    material({ type: 'base.text', data: 'scalar' }),
    material({ type: 'base.image', data: 'scalar', asset: true }),
    material({
      type: 'base.chart',
      data: 'tabular',
      props: {
        seriesType: { kind: 'enum', values: ['line', 'bar'] },
        showTooltip: { kind: 'boolean' },
        smooth: { kind: 'number' },
      },
      roles: [
        { id: 'dimension', min: 1, max: 1 },
        { id: 'measures', min: 1, max: 8 },
      ],
    }),
  ],
};

const TABLE = {
  columns: [
    { id: 'day', label: '日期', type: 'string' },
    { id: 'amount', label: '金额', type: 'number' },
  ],
  rows: [
    { day: '10-21', amount: 120 },
    { day: '10-22', amount: 164 },
  ],
};

const KPIS = [
  {
    label: '总量',
    value: 286000,
    unit: '件',
    delta: { value: 4.2, unit: 'percent', direction: 'up-good' },
  },
  { label: '周转', value: 31.4, unit: '天' },
];

function parse(input: unknown) {
  return parseScreenIntent(input, { catalog: CATALOG });
}

function blocksOf(region: IntentRegion | undefined): readonly IntentBlock[] {
  if (region?.kind === 'grid') return region.blocks;
  if (region?.kind === 'split') return [...region.main, ...region.rail];
  return [];
}

function codes(result: ReturnType<typeof parse>, severity?: 'error' | 'warning'): string[] {
  return result.diagnostics
    .filter((item) => severity === undefined || item.severity === severity)
    .map((item) => `${item.code}@${item.path}`);
}

describe('flat shape (kpis + blocks)', () => {
  const flat = {
    title: '华东渠道周会',
    subtitle: '按周汇总的渠道经营口径',
    style: 'light-biz',
    kpis: KPIS,
    blocks: [
      { type: 'base.chart', title: '趋势', span: 2, table: TABLE },
      { type: 'base.text', title: '要点', span: 2, text: '甲\n乙' },
    ],
  };

  it('becomes one band and one grid, and keeps where each item sat in the model output', () => {
    const result = parse(flat);

    expect(result.diagnostics).toEqual([]);
    const regions = result.intent?.regions ?? [];
    expect(regions.map((region) => region.kind)).toEqual(['band', 'grid']);
    expect(regions[0]).toMatchObject({
      kind: 'band',
      items: [
        {
          label: '总量',
          value: 286000,
          unit: '件',
          delta: { value: 4.2, unit: 'percent', direction: 'up-good' },
          origin: 'kpis[0]',
        },
        { label: '周转', value: 31.4, unit: '天', origin: 'kpis[1]' },
      ],
    });
    expect(blocksOf(regions[1]).map((block) => [block.type, block.span, block.origin])).toEqual([
      ['base.chart', 2, 'blocks[0]'],
      ['base.text', 2, 'blocks[1]'],
    ]);
    expect(result.intent?.style).toBe('light-biz');
  });

  it('accepts the raw model text, including a code fence', () => {
    const result = parse(`\`\`\`json\n${JSON.stringify(flat)}\n\`\`\``);
    expect(result.intent?.title).toBe('华东渠道周会');
    expect(result.diagnostics).toEqual([]);
  });

  it('normalizes the flat block fields into one bind per block', () => {
    const result = parse({
      ...flat,
      blocks: [
        { type: 'base.chart', title: '趋势', span: 2, table: TABLE },
        { type: 'base.chart', title: '排行', span: 2, datasetId: 'orders' },
        { type: 'base.text', title: '要点', span: 1, text: '甲' },
        { type: 'base.image', title: '现场', span: 1, assetId: 'asset-1' },
      ],
    });

    expect(blocksOf(result.intent?.regions[1]).map((block) => block.bind.kind)).toEqual([
      'table',
      'dataset',
      'text',
      'asset',
    ]);
  });

  it('keeps the original index of surviving items after a bad one is dropped', () => {
    const result = parse({
      ...flat,
      kpis: [{ label: '坏', value: 'abc' }, KPIS[1]],
      blocks: [
        { type: 'no.such.material', title: 'x', span: 1 },
        { type: 'base.text', title: '要点', span: 1, text: '甲' },
      ],
    });

    expect(codes(result, 'error')).toEqual([
      'AGENT_KPI_INVALID@kpis[0]',
      'AGENT_BLOCK_TYPE_UNKNOWN@blocks[0]',
    ]);
    // 下标前移了，但来源仍指回模型原文里的位置：修复提示靠它。
    const [band, grid] = result.intent?.regions ?? [];
    expect(band?.kind === 'band' && band.items[0]?.origin).toBe('kpis[1]');
    expect(blocksOf(grid)[0]?.origin).toBe('blocks[1]');
  });

  it('fails the whole intent only when it is genuinely unusable', () => {
    expect(parse('这不是 JSON').intent).toBeUndefined();
    expect(parse({ ...flat, title: '' }).intent).toBeUndefined();
    expect(parse({ ...flat, subtitle: '  ' }).intent).toBeUndefined();
    expect(parse({ ...flat, kpis: [{ label: '坏', value: 'abc' }] }).intent).toBeUndefined();
    expect(parse({ title: 't', subtitle: 's', kpis: KPIS }).intent).toBeUndefined();
    const failure = parse({ ...flat, blocks: undefined });
    expect(codes(failure, 'error')).toEqual(['AGENT_SPEC_INVALID@']);
  });

  it('rejects the retired panels shape and mixing the two shapes', () => {
    expect(parse({ ...flat, panels: [] }).intent).toBeUndefined();
    const mixed = parse({ ...flat, regions: [{ kind: 'band', items: KPIS }] });
    expect(mixed.intent).toBeUndefined();
    expect(codes(mixed, 'error')).toEqual(['AGENT_SPEC_INVALID@']);
  });

  it('hands back the intent with an error when every block was dropped', () => {
    const result = parse({ ...flat, blocks: [{ type: 'no.such.material', title: 'x', span: 1 }] });

    expect(result.intent?.regions.map((region) => region.kind)).toEqual(['band']);
    expect(codes(result, 'error')).toContain('AGENT_BLOCKS_ALL_INVALID@');
  });

  it('keeps at most five KPIs and four blocks, like the first shape did', () => {
    const many = parse({
      ...flat,
      kpis: Array.from({ length: 7 }, (_, index) => ({ label: `指标${index}`, value: index })),
      blocks: Array.from({ length: 6 }, (_, index) => ({
        type: 'base.text',
        title: `块${index}`,
        span: 1,
        text: '甲',
      })),
    });

    const [band, grid] = many.intent?.regions ?? [];
    expect(band?.kind === 'band' && band.items.length).toBe(5);
    expect(blocksOf(grid)).toHaveLength(4);
    expect(many.diagnostics).toEqual([]);
  });
});

describe('regions shape', () => {
  const regions = {
    title: '仓储作战室',
    subtitle: '按日汇总的出入库口径',
    regions: [
      { kind: 'band', items: KPIS },
      {
        kind: 'split',
        ratio: 'even',
        railSide: 'left',
        main: [{ type: 'base.chart', title: '趋势', span: 4, table: TABLE }],
        rail: [
          { type: 'base.text', title: '要点', text: '甲' },
          { type: 'base.text', title: '提醒', text: '乙' },
        ],
      },
      { kind: 'grid', blocks: [{ type: 'base.chart', title: '明细', span: 3, table: TABLE }] },
    ],
  };

  it('reads band, split and grid with origins along the model path', () => {
    const result = parse(regions);

    expect(result.diagnostics).toEqual([]);
    const [band, split, grid] = result.intent?.regions ?? [];
    expect(band?.kind === 'band' && band.items.map((item) => item.origin)).toEqual([
      'regions[0].items[0]',
      'regions[0].items[1]',
    ]);
    expect(split).toMatchObject({ kind: 'split', ratio: 'even', railSide: 'left' });
    expect(blocksOf(split).map((block) => block.origin)).toEqual([
      'regions[1].main[0]',
      'regions[1].rail[0]',
      'regions[1].rail[1]',
    ]);
    expect(blocksOf(grid)[0]?.span).toBe(3);
  });

  it('pins the span of stacked blocks to 1 without complaining about what the model wrote', () => {
    const result = parse({
      ...regions,
      regions: [
        regions.regions[0],
        {
          kind: 'split',
          main: [{ type: 'base.chart', title: '趋势', span: 4, table: TABLE }],
          rail: [{ type: 'base.text', title: '要点', span: 3, text: '甲' }],
        },
      ],
    });

    expect(blocksOf(result.intent?.regions[1]).map((block) => block.span)).toEqual([1, 1]);
    expect(result.diagnostics).toEqual([]);
  });

  it('defaults an unknown split ratio or side and says so', () => {
    const result = parse({
      ...regions,
      regions: [
        {
          kind: 'split',
          ratio: 'tiny',
          railSide: 'top',
          main: [{ type: 'base.text', title: 'a', text: '甲' }],
          rail: [{ type: 'base.text', title: 'b', text: '乙' }],
        },
      ],
    });

    expect(result.intent?.regions[0]).toMatchObject({ ratio: 'wide-narrow', railSide: 'right' });
    expect(codes(result, 'warning')).toEqual([
      'INTENT_REGION_VALUE_DEFAULTED@regions[0].ratio',
      'INTENT_REGION_VALUE_DEFAULTED@regions[0].railSide',
    ]);
  });

  it('drops a malformed region and keeps the others', () => {
    const result = parse({
      ...regions,
      regions: [{ kind: 'carousel' }, 'oops', regions.regions[0], regions.regions[2]],
    });

    expect(result.intent?.regions.map((region) => region.kind)).toEqual(['band', 'grid']);
    expect(codes(result, 'error')).toEqual([
      'INTENT_REGION_INVALID@regions[0]',
      'INTENT_REGION_INVALID@regions[1]',
    ]);
  });

  it('drops a split that lost its rail, keeping the item errors that explain why', () => {
    const result = parse({
      ...regions,
      regions: [
        regions.regions[0],
        {
          kind: 'split',
          main: [{ type: 'base.chart', title: '趋势', table: TABLE }],
          rail: [{ type: 'no.such.material', title: 'x' }],
        },
        regions.regions[2],
      ],
    });

    expect(result.intent?.regions.map((region) => region.kind)).toEqual(['band', 'grid']);
    expect(codes(result, 'error')).toEqual(['AGENT_BLOCK_TYPE_UNKNOWN@regions[1].rail[0]']);
  });

  it('fails when no region is usable, and flags a region given as an empty array', () => {
    expect(parse({ ...regions, regions: [] }).intent).toBeUndefined();
    expect(
      parse({ ...regions, regions: [{ kind: 'band', items: [{ label: '坏' }] }] }).intent,
    ).toBe(undefined);
    const empty = parse({
      ...regions,
      regions: [regions.regions[0], { kind: 'grid', blocks: [] }, regions.regions[2]],
    });
    expect(empty.intent?.regions.map((region) => region.kind)).toEqual(['band', 'grid']);
    expect(codes(empty, 'error')).toEqual(['INTENT_REGION_INVALID@regions[1]']);
  });

  it('warns about reserved parts and ignores them', () => {
    const result = parse({ ...regions, pages: [{ id: 'p1' }], interactions: [], states: {} });

    expect(result.intent?.regions).toHaveLength(3);
    expect(codes(result, 'warning')).toEqual([
      'INTENT_PART_NOT_SUPPORTED@pages',
      'INTENT_PART_NOT_SUPPORTED@interactions',
      'INTENT_PART_NOT_SUPPORTED@states',
    ]);
  });

  it('trims a long block list per region and says so', () => {
    const blocks = Array.from({ length: 10 }, (_, index) => ({
      type: 'base.text',
      title: `块${index}`,
      text: '甲',
    }));
    const result = parse({ ...regions, regions: [{ kind: 'grid', blocks }] });

    expect(blocksOf(result.intent?.regions[0])).toHaveLength(8);
    expect(codes(result, 'warning')).toEqual(['INTENT_ITEMS_TRIMMED@regions[0].blocks']);
  });

  it('keeps what the model said it substituted, so the gap can be explained later', () => {
    const result = parse({
      ...regions,
      regions: [
        {
          kind: 'grid',
          blocks: [
            {
              type: 'base.chart',
              title: '门店排行',
              span: 4,
              table: TABLE,
              substituteFor: '全国门店分布地图',
            },
          ],
        },
      ],
    });

    expect(blocksOf(result.intent?.regions[0])[0]?.substituteFor).toBe('全国门店分布地图');
  });
});

describe('single items', () => {
  const grid = { grid: true } as const;

  it('trims over-long text and clamps the span, reporting each as a warning', () => {
    const result = parseIntentBlock(
      {
        type: 'base.text',
        title: '一二三四五六七八九十一二三四五六七八九十一二三四五六',
        note: '注'.repeat(40),
        span: 9,
        text: '字'.repeat(200),
      },
      CATALOG,
      'blocks[0]',
      grid,
    );

    expect(result.value?.title).toHaveLength(24);
    expect(result.value?.note).toHaveLength(32);
    expect(result.value?.span).toBe(4);
    expect(result.value?.bind).toMatchObject({ kind: 'text' });
    expect(result.diagnostics.map((item) => item.code).sort()).toEqual([
      'AGENT_BLOCK_SPAN_CLAMPED',
      'AGENT_BLOCK_TEXT_TRIMMED',
      'AGENT_BLOCK_TEXT_TRIMMED',
      'AGENT_BLOCK_TEXT_TRIMMED',
    ]);
    expect(result.diagnostics.every((item) => item.severity === 'warning')).toBe(true);
  });

  it('trims a table to the renderable range and degrades a mistyped column to text', () => {
    const result = parseIntentBlock(
      {
        type: 'base.chart',
        title: '趋势',
        table: {
          columns: [
            { id: 'day', label: '日期', type: 'string' },
            { id: 'amount', label: '金额', type: 'number' },
            { id: 'a', label: 'a', type: 'string' },
            { id: 'b', label: 'b', type: 'string' },
            { id: 'c', label: 'c', type: 'string' },
          ],
          rows: Array.from({ length: 10 }, (_, index) => ({
            day: `d${index}`,
            amount: index === 3 ? '很多' : index,
          })),
        },
      },
      CATALOG,
      'blocks[0]',
      grid,
    );

    const bind = result.value?.bind;
    expect(bind?.kind).toBe('table');
    if (bind?.kind !== 'table') throw new Error('expected a table');
    expect(bind.table.columns).toHaveLength(4);
    expect(bind.table.rows).toHaveLength(8);
    expect(bind.table.columns.find((column) => column.id === 'amount')?.type).toBe('string');
    expect(result.diagnostics.map((item) => item.code).sort()).toEqual([
      'AGENT_BLOCK_COLUMNS_TRIMMED',
      'AGENT_BLOCK_COLUMN_COERCED',
      'AGENT_BLOCK_ROWS_TRIMMED',
    ]);
  });

  it.each([
    [
      'a data block with neither table nor dataset',
      { type: 'base.chart', title: 'x' },
      'AGENT_BLOCK_DATA_MISSING',
    ],
    [
      'a text block without text',
      { type: 'base.text', title: 'x', text: ' ' },
      'AGENT_BLOCK_DATA_MISSING',
    ],
    [
      'an asset outside the authorized list',
      { type: 'base.image', title: 'x', assetId: 'forged' },
      'AGENT_ASSET_UNKNOWN',
    ],
    [
      'an asset on a material that cannot take one',
      { type: 'base.text', title: 'x', assetId: 'asset-1' },
      'AGENT_ASSET_UNKNOWN',
    ],
    [
      'a type missing from the catalog',
      { type: 'map.china', title: 'x' },
      'AGENT_BLOCK_TYPE_UNKNOWN',
    ],
    ['something that is not an object', 'oops', 'AGENT_BLOCK_INVALID'],
  ])('drops %s', (_name, raw, code) => {
    const result = parseIntentBlock(raw, CATALOG, 'blocks[2]', grid);

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code, path: 'blocks[2]' }),
    ]);
  });

  it('keeps only the props the material declares, with the declared type', () => {
    const result = parseIntentBlock(
      {
        type: 'base.chart',
        title: '趋势',
        table: TABLE,
        props: { seriesType: 'area', showTooltip: true, smooth: 'x', color: 'red' },
      },
      CATALOG,
      'blocks[0]',
      grid,
    );

    // 枚举值不在声明里、数值写成字符串、未声明的键：各丢各的，合法的 showTooltip 留下。
    expect(result.value?.props).toEqual({ showTooltip: true });
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'AGENT_BLOCK_PROPS_DROPPED',
      'AGENT_BLOCK_PROPS_DROPPED',
      'AGENT_BLOCK_PROPS_DROPPED',
    ]);
  });

  it('keeps the KPI when only its delta is malformed, and says which', () => {
    const result = parseIntentKpi(
      { label: '总量', value: 12, delta: { value: 3, unit: 'percent', direction: 'sideways' } },
      'kpis[1]',
    );

    expect(result.value).toMatchObject({ label: '总量', value: 12, origin: 'kpis[1]' });
    expect(result.value?.delta).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_KPI_DELTA_DROPPED',
        path: 'kpis[1]',
      }),
    ]);
  });

  it('clamps KPI precision and trims label and unit', () => {
    const result = parseIntentKpi(
      { label: '一二三四五六七八九十一二三', value: 1, unit: '万元万元万元万元', precision: 9 },
      'kpis[0]',
    );

    expect(result.value?.label).toHaveLength(12);
    expect(result.value?.unit).toHaveLength(6);
    expect(result.value?.precision).toBe(3);
  });
});

describe('text limits by script', () => {
  it('lets plain Latin text run twice as long, so an English title is not cut mid-word', () => {
    const result = parse({
      title: 'East China Control Tower Overview',
      subtitle: 'Warehouse throughput and carrier handoffs this week',
      kpis: KPIS,
      blocks: [{ type: 'base.text', title: 'Today highlights and risks', span: 2, text: 'a' }],
    });

    expect(result.intent?.title).toBe('East China Control Tower Overview');
    expect(result.intent?.subtitle).toBe('Warehouse throughput and carrier handoffs this week');
    const block = result.intent?.regions[1];
    expect(block?.kind === 'grid' && block.blocks[0]?.title).toBe('Today highlights and risks');
    expect(result.diagnostics).toEqual([]);
  });

  it('still cuts Latin text at twice the limit, and keeps the Chinese limit for Chinese', () => {
    const long = 'x'.repeat(100);
    const result = parse({
      title: long,
      subtitle: '一二三四五六七八九十'.repeat(6),
      kpis: KPIS,
      blocks: [{ type: 'base.text', title: 't', span: 2, text: 'a' }],
    });

    expect(result.intent?.title).toHaveLength(40);
    expect(result.intent?.subtitle).toHaveLength(40);
  });
});
