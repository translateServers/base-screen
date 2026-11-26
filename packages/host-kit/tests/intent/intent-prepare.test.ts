import { describe, expect, it } from 'vitest';
import {
  compileScreenIntent,
  createIntentStreamAssembler,
  mapDocumentIssues,
  parseIntentSkeleton,
  prepareIntent,
  repairKey,
} from '../../src/index.js';
import {
  COMPILE_CATALOG,
  flatOutput,
  SHELL_CATALOG,
  SIX_ROW_TABLE,
  TREND_TABLE,
} from './fixtures.js';

const CHART = { type: 'base.chart', title: '趋势', span: 2, table: TREND_TABLE };
const NOTE = { type: 'base.text', title: '要点', span: 2, text: '甲' };

function prepare(output: unknown, catalog = SHELL_CATALOG) {
  return prepareIntent({
    output: typeof output === 'string' ? output : JSON.stringify(output),
    catalog,
    mode: 'llm',
  });
}

describe('prepareIntent', () => {
  it('hands back a compiled document and no issues for a clean output', () => {
    const result = prepare(flatOutput([CHART, NOTE]));

    expect(result.issues).toEqual([]);
    expect(result.deliverable).toBe(true);
    expect(result.compiled?.document.components.length).toBeGreaterThan(5);
    expect(result.intent?.title).toBe('华东渠道周会');
  });

  it('turns a dropped item into a repair issue at the model path, and stays deliverable', () => {
    const output = flatOutput([CHART, NOTE]);
    (output.kpis as unknown[])[1] = { label: '坏', value: 'abc' };
    const result = prepare(output);

    expect(result.issues).toEqual([{ code: 'AGENT_KPI_INVALID', path: 'kpis[1]' }]);
    expect(result.deliverable).toBe(true);
    expect(result.compiled).toBeDefined();
  });

  it('is not deliverable when the whole output is unusable', () => {
    const result = prepare('这不是 JSON');

    expect(result.issues).toEqual([{ code: 'AGENT_SPEC_INVALID', path: '' }]);
    expect(result.deliverable).toBe(false);
    expect(result.compiled).toBeUndefined();
  });

  it('is not deliverable when no block survived', () => {
    const result = prepare(flatOutput([{ type: 'no.such', title: 'x', span: 1 }]));

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['AGENT_BLOCK_TYPE_UNKNOWN', 'AGENT_BLOCKS_ALL_INVALID']),
    );
    expect(result.deliverable).toBe(false);
  });

  it('reports a capacity conflict at the region and refuses to compile', () => {
    const grid = (index: number) => ({
      kind: 'grid',
      blocks: [{ type: 'base.text', title: `块${index}`, span: 4, text: '甲' }],
    });
    const result = prepare({
      title: '仓储作战室',
      subtitle: '按日汇总',
      regions: [
        { kind: 'band', items: [{ label: '总量', value: 1 }] },
        grid(0),
        grid(1),
        grid(2),
        grid(3),
        grid(4),
      ],
    });

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'LAYOUT_CAPACITY_EXCEEDED',
        path: expect.stringMatching(/^regions\[\d\]$/),
      }),
    ]);
    expect(result.deliverable).toBe(false);
    expect(result.compiled).toBeUndefined();
  });

  it('asks for a repair when a chart degraded to empty because its columns do not fit', () => {
    const result = prepare(
      flatOutput([
        {
          type: 'board.status-grid',
          title: '状态',
          span: 2,
          table: {
            columns: [{ id: 'name', label: '名称', type: 'string' }],
            rows: [{ name: '甲' }],
          },
        },
        NOTE,
      ]),
    );

    expect(result.issues).toEqual([{ code: 'AGENT_BLOCK_BINDING_UNSATISFIED', path: 'blocks[0]' }]);
    // 修不好时空图照样可以交出，由宿主如实说明。
    expect(result.deliverable).toBe(true);
    expect(result.compiled).toBeDefined();
  });

  it('keeps what the model said it substituted as a warning with structured detail', () => {
    const result = prepare(
      flatOutput([{ ...CHART, title: '门店排行', substituteFor: '全国门店分布地图' }, NOTE]),
    );

    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'INTENT_BLOCK_SUBSTITUTED',
        path: 'blocks[0]',
        detail: { wanted: '全国门店分布地图', used: '图表' },
      }),
    ]);
  });

  it('does not repeat an issue that several places reported', () => {
    const output = flatOutput([CHART, NOTE]);
    output.kpis = [
      { label: '坏', value: 'a' },
      { label: '坏', value: 'b' },
      { label: '好', value: 1 },
    ];
    const result = prepare(output);

    expect(result.issues).toEqual([
      { code: 'AGENT_KPI_INVALID', path: 'kpis[0]' },
      { code: 'AGENT_KPI_INVALID', path: 'kpis[1]' },
    ]);
  });
});

describe('repairKey / mapDocumentIssues', () => {
  it('makes the same set of issues compare equal regardless of order', () => {
    const a = repairKey([
      { code: 'X', path: 'blocks[0]' },
      { code: 'Y', path: '' },
    ]);
    const b = repairKey([
      { code: 'Y', path: '' },
      { code: 'X', path: 'blocks[0]' },
    ]);
    expect(a).toBe(b);
  });

  it('maps document paths back to the model path, and falls back to the whole output', () => {
    const issues = mapDocumentIssues(
      [
        {
          severity: 'error',
          code: 'LAYOUT_FONT_TOO_SMALL',
          path: ['components', 1, 'style', 'fontSize'],
        },
        { severity: 'error', code: 'LAYOUT_OVERLAP', path: ['components', 9] },
        { severity: 'error', code: 'LAYOUT_OUT_OF_BOUNDS', path: ['canvas'] },
        { severity: 'warning', code: 'LAYOUT_OVERLAP', path: ['components', 0] },
        { severity: 'error', code: 'CHANGE_DRAFT_PENDING', path: [] },
        { severity: 'error', code: 'LAYOUT_FONT_TOO_SMALL', path: ['components', 1, 'style'] },
      ],
      ['a', 'b'],
      { a: 'title', b: 'blocks[2]' },
    );

    expect(issues).toEqual([
      { code: 'LAYOUT_FONT_TOO_SMALL', path: 'blocks[2]' },
      { code: 'LAYOUT_OVERLAP', path: '' },
      { code: 'LAYOUT_OUT_OF_BOUNDS', path: '' },
    ]);
  });
});

describe('parseIntentSkeleton', () => {
  it('reads the flat layout and derives data-ness from the catalog', () => {
    const skeleton = parseIntentSkeleton(
      {
        kpis: 3,
        blocks: [
          { type: 'base.chart', span: 2 },
          { type: 'base.text', span: 9 },
        ],
      },
      COMPILE_CATALOG,
    );

    expect(skeleton).toEqual({
      flat: true,
      regions: [
        { kind: 'band', count: 3 },
        {
          kind: 'grid',
          slots: [
            { span: 2, data: true },
            { span: 4, data: false },
          ],
        },
      ],
    });
  });

  it('reads regions, defaulting the split ratio and rail side', () => {
    const skeleton = parseIntentSkeleton(
      {
        regions: [
          { kind: 'band', count: 3 },
          {
            kind: 'split',
            main: [{ type: 'base.chart' }],
            rail: [{ type: 'base.text' }, { type: 'base.text' }],
          },
        ],
      },
      COMPILE_CATALOG,
    );

    expect(skeleton?.regions[1]).toEqual({
      kind: 'split',
      ratio: 'wide-narrow',
      railSide: 'right',
      main: [{ data: true }],
      rail: [{ data: false }, { data: false }],
    });
  });

  it.each([
    ['unknown block type', { kpis: 3, blocks: [{ type: 'no.such', span: 2 }] }],
    ['a shell as a block', { kpis: 3, blocks: [{ type: 'base.container', span: 2 }] }],
    ['no blocks', { kpis: 3, blocks: [] }],
    ['too many KPIs', { kpis: 9, blocks: [{ type: 'base.text', span: 1 }] }],
    ['unknown region kind', { regions: [{ kind: 'carousel' }] }],
    ['empty regions', { regions: [] }],
    ['not an object', 'oops'],
  ])('rejects %s', (_name, layout) => {
    expect(parseIntentSkeleton(layout, SHELL_CATALOG)).toBeUndefined();
  });
});

describe('createIntentStreamAssembler', () => {
  const output = flatOutput([CHART, NOTE]);
  const layout = {
    kpis: 3,
    blocks: [
      { type: 'base.chart', span: 2 },
      { type: 'base.text', span: 2 },
    ],
  };
  const head = { title: '华东渠道周会', subtitle: '按周汇总的渠道经营口径', layout };

  function feed() {
    const assembler = createIntentStreamAssembler(COMPILE_CATALOG);
    return assembler;
  }

  it('produces no frame before the skeleton, and ignores items that come too early', () => {
    const assembler = feed();

    expect(assembler.frame()).toBeUndefined();
    expect(assembler.item('kpis[0]', (output.kpis as unknown[])[0])).toBe(false);
    expect(assembler.skeleton({ ...head, title: ' ' })).toBe(false);
    expect(assembler.skeleton({ ...head, layout: { kpis: 3, blocks: [] } })).toBe(false);
    expect(assembler.frame()).toBeUndefined();
  });

  it('accepts the skeleton once, then fills in items by position path', () => {
    const assembler = feed();
    expect(assembler.skeleton(head)).toBe(true);
    expect(assembler.skeleton(head)).toBe(false);

    expect(assembler.item('kpis[1]', (output.kpis as unknown[])[1])).toBe(true);
    // 重复、越界、坏内容：都不改变帧。
    expect(assembler.item('kpis[1]', (output.kpis as unknown[])[1])).toBe(false);
    expect(assembler.item('kpis[7]', (output.kpis as unknown[])[0])).toBe(false);
    expect(assembler.item('blocks[0]', { type: 'no.such', title: 'x' })).toBe(false);
    expect(assembler.item('blocks[0]', CHART)).toBe(true);

    const frame = assembler.frame();
    expect(Object.keys(frame?.stream.kpis ?? {})).toEqual(['kpis[1]']);
    expect(Object.keys(frame?.stream.blocks ?? {})).toEqual(['blocks[0]']);
  });

  it('compiles every frame, and the last one equals the plain compile of the whole output', () => {
    const assembler = feed();
    assembler.skeleton(head);
    const compileFrame = () => {
      const frame = assembler.frame();
      if (frame === undefined) throw new Error('no frame');
      const outcome = compileScreenIntent({
        intent: frame.intent,
        catalog: COMPILE_CATALOG,
        mode: 'llm',
        stream: frame.stream,
      });
      if (!outcome.ok) throw new Error('compile failed');
      return outcome.value;
    };

    const first = compileFrame();
    expect(first.document.components.some((node) => node.id.endsWith('-pending'))).toBe(true);

    for (const [index, kpi] of (output.kpis as unknown[]).entries()) {
      assembler.item(`kpis[${index}]`, kpi);
    }
    for (const [index, block] of (output.blocks as unknown[]).entries()) {
      assembler.item(`blocks[${index}]`, block);
    }
    const last = compileFrame();
    const plain = prepareIntent({
      output: JSON.stringify(output),
      catalog: COMPILE_CATALOG,
      mode: 'llm',
    }).compiled;

    expect(last.document.components.some((node) => node.id.endsWith('-pending'))).toBe(false);
    expect(last.document).toEqual(plain?.document);
  });

  it('streams a regions layout the same way', () => {
    const regions = {
      title: '仓储作战室',
      subtitle: '按日汇总',
      regions: [
        { kind: 'band', items: [{ label: '总量', value: 1, unit: '件' }] },
        {
          kind: 'split',
          main: [{ type: 'base.chart', title: '趋势', table: SIX_ROW_TABLE }],
          rail: [{ type: 'base.text', title: '要点', text: '甲' }],
        },
      ],
    };
    const assembler = createIntentStreamAssembler(COMPILE_CATALOG);
    expect(
      assembler.skeleton({
        title: regions.title,
        subtitle: regions.subtitle,
        layout: {
          regions: [
            { kind: 'band', count: 1 },
            { kind: 'split', main: [{ type: 'base.chart' }], rail: [{ type: 'base.text' }] },
          ],
        },
      }),
    ).toBe(true);

    expect(assembler.item('regions[0].items[0]', regions.regions[0]?.items?.[0])).toBe(true);
    expect(assembler.item('regions[1].main[0]', regions.regions[1]?.main?.[0])).toBe(true);
    expect(assembler.item('regions[1].rail[0]', regions.regions[1]?.rail?.[0])).toBe(true);
    const frame = assembler.frame();
    if (frame === undefined) throw new Error('no frame');
    const outcome = compileScreenIntent({
      intent: frame.intent,
      catalog: COMPILE_CATALOG,
      mode: 'llm',
      stream: frame.stream,
    });
    const plain = prepareIntent({
      output: JSON.stringify(regions),
      catalog: COMPILE_CATALOG,
      mode: 'llm',
    }).compiled;

    if (!outcome.ok) throw new Error('compile failed');
    expect(outcome.value.document).toEqual(plain?.document);
  });
});
