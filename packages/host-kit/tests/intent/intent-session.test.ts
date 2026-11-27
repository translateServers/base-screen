import { describe, expect, it } from 'vitest';
import {
  type CompiledComponent,
  createIntentSession,
  describeSession,
  editIntent,
  type IntentEditBaseline,
  type IntentEditCommand,
  type IntentSession,
  isSessionUsable,
  pickSession,
  prepareIntent,
} from '../../src/index.js';
import { flatOutput, SHELL_CATALOG, TREND_TABLE } from './fixtures.js';

const text = (title: string, extra: Record<string, unknown> = {}) => ({
  type: 'base.text',
  title,
  text: '甲',
  ...extra,
});

const REGIONS = {
  title: '仓储作战室',
  subtitle: '按日汇总的出入库口径',
  regions: [
    {
      kind: 'band',
      items: [
        { label: '总量', value: 286000, unit: '件' },
        { label: '周转', value: 31.4, unit: '天' },
        { label: '缺货', value: 12, unit: '家' },
      ],
    },
    {
      kind: 'split',
      main: [{ type: 'base.chart', title: '趋势', table: TREND_TABLE }],
      rail: [text('结论', { text: '库存平稳' }), text('提醒')],
    },
    {
      kind: 'grid',
      blocks: [
        { type: 'base.chart', title: '明细', span: 2, table: TREND_TABLE },
        text('备注', { span: 2 }),
      ],
    },
  ],
};

const ASSETS = [{ id: 'a-1', name: '现场图' }];

function sessionOf(output: unknown): IntentSession {
  const catalog = { ...SHELL_CATALOG, assets: ASSETS };
  const references = { assets: ASSETS, datasets: [] };
  const prepared = prepareIntent({
    output: JSON.stringify(output),
    catalog,
    references,
    mode: 'llm',
  });
  if (
    prepared.compiled === undefined ||
    prepared.intent === undefined ||
    prepared.issues.length > 0
  ) {
    throw new Error(`fixture is not clean: ${JSON.stringify(prepared.issues)}`);
  }
  return createIntentSession({
    intent: prepared.intent,
    compiled: prepared.compiled,
    catalog,
    references,
    mode: 'llm',
  });
}

/** 活文档：就是上一次编译出的组件（用户没动过）。 */
interface Live {
  canvas: { width: number; height: number };
  components: CompiledComponent[];
  dataSources?: Record<string, unknown>[];
}

function baselineOf(session: IntentSession): Live & IntentEditBaseline {
  const document = session.compiled.document;
  return {
    canvas: document.canvas,
    components: document.components.map((component) => ({ ...component })),
    ...(document.dataSources === undefined ? {} : { dataSources: [...document.dataSources] }),
  };
}

/** 主区那块图表的主体组件 id（外壳、标题之后）。 */
function chartBodyId(session: IntentSession): string {
  const body = session.compiled.document.components.find(
    (component) => component.type === 'base.chart' && component.id.startsWith('agent-r1-m0-'),
  );
  if (body === undefined) throw new Error('fixture: chart body');
  return body.id;
}

function run(session: IntentSession, ops: unknown[], baseline: Live = baselineOf(session)) {
  const outcome = editIntent(session, ops, baseline);
  if (!outcome.ok) throw new Error(`edit failed: ${JSON.stringify(outcome.diagnostics)}`);
  return outcome;
}

const ids = (commands: readonly IntentEditCommand[], type: IntentEditCommand['type']): string[] =>
  commands.flatMap((command) => {
    if (command.type !== type) return [];
    if (command.type === 'remove-components') return [...command.componentIds];
    if (command.type === 'update-components') return [...command.componentIds];
    if (command.type === 'add-component') return [command.component.id];
    return [];
  });

describe('editIntent · operations on the held IR', () => {
  it('changes one block’s text: only that component is updated, nothing moves', () => {
    const session = sessionOf(REGIONS);
    const outcome = run(session, [
      { op: 'change', target: 'regions[1].rail[0]', set: { text: '库存紧张' } },
    ]);

    expect(ids(outcome.commands, 'add-component')).toEqual([]);
    expect(ids(outcome.commands, 'remove-components')).toEqual([]);
    const updated = outcome.commands.filter((command) => command.type === 'update-components');
    expect(updated).toHaveLength(1);
    const [update] = updated;
    if (update?.type !== 'update-components') throw new Error('expected an update');
    // 只改了文字：补丁里只有取值，没有几何。
    expect(Object.keys(update.patch)).toEqual(['dataValue']);
    expect(JSON.stringify(update.patch)).toContain('库存紧张');
    expect(outcome.summary).toEqual({ changed: 1, added: 0, removed: 0 });
  });

  it('swaps the material of one block and keeps its place', () => {
    const session = sessionOf(REGIONS);
    const outcome = run(session, [
      {
        op: 'swap',
        target: 'regions[1].main[0]',
        type: 'plugin.echarts',
        props: { seriesType: 'bar' },
      },
    ]);

    const body = outcome.session.compiled.document.components.find(
      (component) => component.type === 'plugin.echarts',
    );
    expect(body?.props).toMatchObject({ seriesType: 'bar' });
    // 换物料不改版面位置：外壳与标题没有任何命令。
    expect(ids(outcome.commands, 'update-components')).not.toContain('agent-r1-m0-0');
    expect(ids(outcome.commands, 'update-components')).not.toContain('agent-r1-m0-1');
    // `update-components` 改不了 type：换掉的组件先移除、再用同一个 id 新增（层级沿用活文档里的）。
    const bodyId = chartBodyId(session);
    expect(body?.id).toBe(bodyId);
    expect(ids(outcome.commands, 'remove-components')).toEqual([bodyId]);
    expect(ids(outcome.commands, 'add-component')).toEqual([bodyId]);
    const order = outcome.commands.map((command) => command.type);
    expect(order.indexOf('remove-components')).toBeLessThan(order.indexOf('add-component'));
    expect(outcome.summary).toEqual({ changed: 1, added: 0, removed: 0 });
  });

  it('deletes a block: the one after it moves up but keeps every component id', () => {
    const session = sessionOf(
      flatOutput([
        { type: 'base.chart', title: '一', span: 4, table: TREND_TABLE },
        { type: 'base.chart', title: '二', span: 4, table: TREND_TABLE },
        text('三', { span: 4 }),
      ]),
    );
    const outcome = run(session, [{ op: 'delete', target: 'blocks[1]' }]);

    const removed = ids(outcome.commands, 'remove-components');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((id) => id.startsWith('agent-block-1-'))).toBe(true);
    // 第三块位置前移：它的组件被更新，但没有被删除再新增——id 没漂。
    expect(ids(outcome.commands, 'add-component')).toEqual([]);
    const moved = ids(outcome.commands, 'update-components');
    expect(moved.some((id) => id.startsWith('agent-block-2-'))).toBe(true);
    expect(
      outcome.session.compiled.document.components.some((c) => c.id.startsWith('agent-block-2-')),
    ).toBe(true);
    expect(
      outcome.session.compiled.document.components.some((c) => c.id.startsWith('agent-block-1-')),
    ).toBe(false);
  });

  it('turns a split whose rail emptied into a full-width grid instead of a one-sided split', () => {
    const session = sessionOf(REGIONS);
    const outcome = run(session, [
      { op: 'delete', target: 'regions[1].rail[0]' },
      { op: 'delete', target: 'regions[1].rail[1]' },
    ]);

    const region = outcome.session.intent.regions[1];
    expect(region?.kind).toBe('grid');
    expect(region?.kind === 'grid' && region.blocks.map((block) => block.span)).toEqual([4]);
    expect(
      ids(outcome.commands, 'remove-components').some((id) => id.startsWith('agent-r1-s')),
    ).toBe(true);
  });

  it('adds a block to a grid with a fresh stable id', () => {
    const session = sessionOf(REGIONS);
    const outcome = run(session, [
      { op: 'add', region: 'regions[2]', block: text('新增', { span: 4 }) },
    ]);

    const added = ids(outcome.commands, 'add-component');
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((id) => id.startsWith('agent-r2-b2-'))).toBe(true);
    expect(
      outcome.session.intent.regions[2]?.kind === 'grid' &&
        outcome.session.intent.regions[2].blocks,
    ).toHaveLength(3);
  });

  it('changes the title and a KPI', () => {
    const session = sessionOf(REGIONS);
    const outcome = run(session, [
      { op: 'change', target: 'title', set: { text: '华东仓储作战室' } },
      { op: 'change', target: 'regions[0].items[1]', set: { value: 28.6, unit: '天' } },
    ]);

    const changed = ids(outcome.commands, 'update-components');
    expect(changed).toContain('agent-title-0');
    expect(changed.some((id) => id.startsWith('agent-r0-k1-'))).toBe(true);
    expect(outcome.session.intent.title).toBe('华东仓储作战室');
  });

  it('is atomic: one bad operation means none are applied', () => {
    const session = sessionOf(REGIONS);
    const outcome = editIntent(
      session,
      [
        { op: 'change', target: 'regions[1].rail[0]', set: { text: '库存紧张' } },
        { op: 'delete', target: 'regions[9].main[0]' },
      ],
      baselineOf(session),
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({ code: 'INTENT_OP_TARGET_UNKNOWN', path: 'ops[1]' }),
    ]);
  });

  it.each([
    // rebind 已支持（ADR-0114 D9）；没给 bind 的仍是形状不对。
    [
      'a rebind without a bind',
      { op: 'rebind', target: 'regions[1].main[0]' },
      'INTENT_OP_INVALID',
    ],
    ['an unknown operation', { op: 'explode', target: 'x' }, 'INTENT_OP_INVALID'],
    [
      'a swap to a material that is not in the catalog',
      { op: 'swap', target: 'regions[1].main[0]', type: 'map.china' },
      'INTENT_OP_FAILED',
    ],
    [
      'a swap to a shell',
      { op: 'swap', target: 'regions[1].main[0]', type: 'base.container' },
      'INTENT_OP_FAILED',
    ],
    [
      'a title change without text',
      { op: 'change', target: 'title', set: { text: ' ' } },
      'INTENT_OP_INVALID',
    ],
    ['deleting the title', { op: 'delete', target: 'title' }, 'INTENT_OP_INVALID'],
    [
      'a KPI change with a field KPIs do not have',
      { op: 'change', target: 'regions[0].items[0]', set: { name: '订单量' } },
      'INTENT_OP_INVALID',
    ],
    [
      'a block change with a field blocks do not have',
      { op: 'change', target: 'regions[1].rail[0]', set: { color: 'red' } },
      'INTENT_OP_INVALID',
    ],
  ])('rejects %s with a path-bearing diagnostic', (_name, op, code) => {
    const session = sessionOf(REGIONS);
    const outcome = editIntent(session, [op], baselineOf(session));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics[0]).toMatchObject({ code, path: 'ops[0]' });
  });

  it('refuses an edit that would leave no block at all', () => {
    const session = sessionOf(flatOutput([text('唯一')]));
    const outcome = editIntent(
      session,
      [{ op: 'delete', target: 'blocks[0]' }],
      baselineOf(session),
    );

    expect(outcome.ok).toBe(false);
  });

  it('reports a capacity conflict instead of squeezing the new block in', () => {
    const session = sessionOf(REGIONS);
    const adds = Array.from({ length: 6 }, (_, index) => ({
      op: 'add',
      region: 'regions[2]',
      block: text(`多${index}`, { span: 4 }),
    }));
    const outcome = editIntent(session, adds, baselineOf(session));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics[0]?.code).toBe('LAYOUT_CAPACITY_EXCEEDED');
  });
});

describe('editIntent · what the user touched is not overwritten', () => {
  it('keeps a component the user edited and says so, instead of resetting it', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    const body = baseline.components.find((component) => component.id === 'agent-r1-s0-2');
    if (body === undefined) throw new Error('fixture: rail body');
    // 用户把结论文字手改了。
    body.dataValue = { kind: 'inline', value: '用户自己写的结论' };

    const outcome = run(
      session,
      [{ op: 'change', target: 'regions[1].rail[0]', set: { text: '库存紧张' } }],
      baseline,
    );

    expect(outcome.commands.filter((command) => command.type === 'update-components')).toEqual([]);
    expect(outcome.keptForUser).toEqual(['agent-r1-s0-2']);
    expect(outcome.summary.changed).toBe(0);
  });

  it('still moves the untouched neighbours when only one component was touched', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    const note = baseline.components.find((component) => component.id === 'agent-r1-s0-2');
    if (note === undefined) throw new Error('fixture');
    note.dataValue = { kind: 'inline', value: '用户自己写的结论' };

    const outcome = run(session, [{ op: 'delete', target: 'regions[1].rail[1]' }], baseline);

    // 删了一格：被改过的那块不被覆盖，其余照常上移 / 拉伸。
    expect(outcome.keptForUser).toContain('agent-r1-s0-2');
    expect(
      ids(outcome.commands, 'remove-components').every((id) => id.startsWith('agent-r1-s1-')),
    ).toBe(true);
  });

  it('does not bring back a component the user deleted', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    baseline.components.splice(
      baseline.components.findIndex((component) => component.id === 'agent-r1-s0-2'),
      1,
    );

    const outcome = run(
      session,
      [{ op: 'change', target: 'regions[1].rail[0]', set: { text: '库存紧张' } }],
      baseline,
    );

    expect(ids(outcome.commands, 'add-component')).toEqual([]);
    expect(ids(outcome.commands, 'update-components')).toEqual([]);
  });

  it('ignores layer numbers: raising every layer on adoption is not a user touch', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    baseline.components = baseline.components.map((component) => ({
      ...component,
      zIndex: component.zIndex + 500,
    }));

    const outcome = run(
      session,
      [{ op: 'change', target: 'regions[1].rail[0]', set: { text: '库存紧张' } }],
      baseline,
    );

    expect(outcome.keptForUser).toEqual([]);
    expect(outcome.summary.changed).toBe(1);
  });

  it('lifts the layers of newly added components above everything that is already there', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    baseline.components = baseline.components.map((component) => ({
      ...component,
      zIndex: component.zIndex + 500,
    }));
    const top = Math.max(...baseline.components.map((component) => component.zIndex));

    const outcome = run(
      session,
      [{ op: 'add', region: 'regions[2]', block: text('新增', { span: 4 }) }],
      baseline,
    );

    for (const command of outcome.commands) {
      if (command.type === 'add-component') expect(command.component.zIndex).toBeGreaterThan(top);
    }
  });
});

describe('editIntent · data sources of added blocks', () => {
  const imageBlock = { type: 'base.image', title: '现场', span: 4, assetId: 'a-1' };

  it('adds a data source for a new asset block', () => {
    const session = sessionOf(REGIONS);
    const outcome = run(session, [{ op: 'add', region: 'regions[2]', block: imageBlock }]);

    const replaced = outcome.commands.find((command) => command.type === 'add-data-sources');
    expect(replaced?.type === 'add-data-sources' && replaced.dataSources).toHaveLength(1);
    // 数据源在新增组件之前：组件引用它。
    const order = outcome.commands.map((command) => command.type);
    expect(order.indexOf('add-data-sources')).toBeLessThan(order.indexOf('add-component'));
  });

  it('renames a clashing data source id and rewrites the reference, keeping the existing instance', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    const outcome = run(session, [{ op: 'add', region: 'regions[2]', block: imageBlock }], {
      ...baseline,
      dataSources: [
        {
          id: 'agent-ds-1',
          name: '别的图',
          source: { kind: 'host-resource', resourceType: 'host_image', resourceId: 'other' },
          params: {},
        },
      ],
    });

    // 已有的 agent-ds-1 原样保留，只追加换了 id 的新实例。
    const replaced = outcome.commands.find((command) => command.type === 'add-data-sources');
    if (replaced?.type !== 'add-data-sources') throw new Error('expected data sources');
    expect(replaced.dataSources.map((source) => source.id)).toEqual(['agent-ds-1-e2']);
    const image = outcome.commands.find(
      (command) => command.type === 'add-component' && command.component.type === 'base.image',
    );
    expect(image?.type === 'add-component' && image.component.dataValue).toMatchObject({
      dataSourceId: 'agent-ds-1-e2',
    });
  });
});

describe('isSessionUsable', () => {
  it('holds only while the canvas is the size the session was compiled for', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);

    expect(isSessionUsable(session, baseline)).toBe(true);
    expect(isSessionUsable(session, { ...baseline, canvas: { width: 1280, height: 720 } })).toBe(
      false,
    );
  });
});

describe('canonical comparison', () => {
  it('does not mistake a live component with reordered keys for a user edit', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    baseline.components = baseline.components.map((component) => ({
      ...component,
      // 活文档经引擎读写后键顺序不同、缺省字段显式为 null：都不算用户改过。
      style: Object.fromEntries(Object.entries(component.style).reverse()),
      ...(component.dataBinding === undefined ? { dataBinding: undefined } : {}),
    })) as CompiledComponent[];

    const outcome = run(
      session,
      [{ op: 'change', target: 'regions[1].rail[0]', set: { text: '库存紧张' } }],
      baseline,
    );

    expect(outcome.keptForUser).toEqual([]);
    expect(outcome.summary.changed).toBe(1);
  });
});

describe('describeSession', () => {
  it('lists every operable target with its current words and the region paths for adding', () => {
    const digest = describeSession(sessionOf(REGIONS));

    expect(digest.title).toBe('仓储作战室');
    expect(digest.regions.map((region) => [region.path, region.kind])).toEqual([
      ['regions[0]', 'band'],
      ['regions[1]', 'split'],
      ['regions[2]', 'grid'],
    ]);
    expect(digest.regions[0]?.items[0]).toEqual({
      target: 'regions[0].items[0]',
      kind: 'kpi',
      part: 'items',
      title: '总量',
      value: '28.6 万件',
    });
    expect(digest.regions[1]?.items.map((item) => [item.target, item.part])).toEqual([
      ['regions[1].main[0]', 'main'],
      ['regions[1].rail[0]', 'rail'],
      ['regions[1].rail[1]', 'rail'],
    ]);
    expect(digest.regions[2]?.items[0]).toMatchObject({ type: 'base.chart', title: '明细' });
  });

  it('keeps the target of a block that moved: it is the stable identifier, not the position', () => {
    const session = sessionOf(
      flatOutput([text('一', { span: 4 }), text('二', { span: 4 }), text('三', { span: 4 })]),
    );
    const outcome = run(session, [{ op: 'delete', target: 'blocks[1]' }]);

    const items = describeSession(outcome.session).regions[1]?.items ?? [];
    expect(items.map((item) => [item.target, item.title])).toEqual([
      ['blocks[0]', '一'],
      ['blocks[2]', '三'],
    ]);
  });
});

describe('pickSession', () => {
  it('picks the session whose components are on the canvas', () => {
    const first = sessionOf(REGIONS);
    const edited = run(first, [{ op: 'delete', target: 'regions[1].rail[1]' }]).session;

    // 用户采纳了删除：活文档是编辑后的那份。
    expect(pickSession([edited, first], baselineOf(edited))).toBe(edited);
    // 用户拒绝了删除：活文档还是原来那份。
    expect(pickSession([edited, first], baselineOf(first))).toBe(first);
  });

  it('breaks ties by how many components are exactly as compiled', () => {
    const first = sessionOf(REGIONS);
    const edited = run(first, [
      { op: 'change', target: 'regions[1].rail[0]', set: { text: '库存紧张' } },
    ]).session;

    expect(pickSession([edited, first], baselineOf(edited))).toBe(edited);
    expect(pickSession([edited, first], baselineOf(first))).toBe(first);
  });

  it('returns nothing when the canvas is a different screen, or a different size', () => {
    const session = sessionOf(REGIONS);

    expect(
      pickSession([session], { canvas: session.compiled.document.canvas, components: [] }),
    ).toBeUndefined();
    expect(
      pickSession([session], { ...baselineOf(session), canvas: { width: 1280, height: 720 } }),
    ).toBeUndefined();
  });

  it('tolerates a few components being deleted by hand, but not most of them', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);

    const few = { ...baseline, components: baseline.components.slice(0, -4) };
    const most = { ...baseline, components: baseline.components.slice(0, 2) };

    expect(pickSession([session], few)).toBe(session);
    expect(pickSession([session], most)).toBeUndefined();
  });
});

describe('editIntent · swapping the material keeps the stacking order', () => {
  it('re-adds the swapped component at the layer it already has on the canvas', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    baseline.components = baseline.components.map((component) => ({
      ...component,
      zIndex: component.zIndex + 500,
    }));
    const live = baseline.components.find((component) => component.id === chartBodyId(session));

    const outcome = run(
      session,
      [
        {
          op: 'swap',
          target: 'regions[1].main[0]',
          type: 'plugin.echarts',
          props: { seriesType: 'bar' },
        },
      ],
      baseline,
    );

    const added = outcome.commands.find((command) => command.type === 'add-component');
    expect(added?.type === 'add-component' && added.component.zIndex).toBe(live?.zIndex);
    expect(added?.type === 'add-component' && added.component.type).toBe('plugin.echarts');
  });

  it('does not swap a component the user already edited by hand', () => {
    const session = sessionOf(REGIONS);
    const baseline = baselineOf(session);
    const chart = baseline.components.find((component) => component.id === chartBodyId(session));
    if (chart === undefined) throw new Error('fixture');
    chart.style = { ...chart.style, backgroundColor: '#ff0000' };

    const outcome = run(
      session,
      [{ op: 'swap', target: 'regions[1].main[0]', type: 'plugin.echarts' }],
      baseline,
    );

    expect(outcome.keptForUser).toContain(chartBodyId(session));
    expect(ids(outcome.commands, 'remove-components')).not.toContain(chartBodyId(session));
  });
});
