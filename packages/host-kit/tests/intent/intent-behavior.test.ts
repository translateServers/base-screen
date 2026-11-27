import { parseScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  compileScreenIntent,
  createIntentSession,
  editIntent,
  type IntentCatalog,
  type IntentReferences,
  parseScreenIntent,
  prepareIntent,
  type ScreenIntent,
} from '../../src/index.js';
import { SHELL_CATALOG } from './fixtures.js';

/**
 * 行为编译（ADR-0115）：联动 → 变量 + 蓝图 + 数据源参数引用变量；阈值状态 → 组件状态。
 * 编出来的文档必须过契约解析（蓝图引用、变量名、状态判定都由它裁判）。
 */

const LINES = ['LINE-A', 'LINE-B', 'LINE-C'];

/** 目录：表格 / 图表带事件声明（宿主从编辑器描述符的 payloadSchema 上送）。 */
const CATALOG: IntentCatalog = {
  ...SHELL_CATALOG,
  materials: SHELL_CATALOG.materials.map((material) => {
    if (material.type === 'base.table') {
      return {
        ...material,
        events: [
          { name: 'rowClick', label: '点击行', payload: { rowIndex: 'number', row: 'object' } },
          {
            name: 'cellClick',
            label: '点击单元格',
            payload: { rowIndex: 'number', columnId: 'string', value: 'string' },
          },
        ],
      };
    }
    if (material.type === 'base.chart') {
      return {
        ...material,
        events: [
          {
            name: 'pointClick',
            label: '点击数据点',
            payload: { seriesId: 'string', pointIndex: 'number', x: 'string', y: 'number' },
          },
        ],
      };
    }
    if (material.type === 'base.text') {
      return {
        ...material,
        roles: [{ id: 'value', min: 1, max: 1, valueTypes: ['string', 'number'] }],
        events: [{ name: 'valueClick', payload: {} }],
      };
    }
    return material;
  }),
};
(CATALOG.materials as IntentCatalog['materials'][number][]).push({
  type: 'board.tabs',
  name: '页签',
  category: '看板',
  data: 'tabular',
  asset: false,
  size: { width: 480, height: 56 },
  props: {},
  roles: [{ id: 'items', min: 1, max: 2, valueTypes: ['string', 'number'] }],
  events: [
    {
      name: 'tabChange',
      label: '切换标签',
      payload: { index: 'number', label: 'string', value: 'string' },
    },
  ],
  defaults: { props: {}, style: {} },
});

const REFERENCES: IntentReferences = {
  assets: [],
  datasets: [
    {
      datasetId: 'monitor.lines',
      name: '产线概览',
      columns: [
        { id: 'line', type: 'string', label: '产线' },
        { id: 'devices', type: 'number', label: '设备数' },
        { id: 'avgLoad', type: 'number', label: '平均负载', unit: '%' },
      ],
      parameters: [],
      values: { line: LINES, devices: [16, 12, 9], avgLoad: [72.4, 91.2, 58] },
      rows: { sampled: 3, total: 3 },
    },
    {
      datasetId: 'monitor.devices',
      name: '设备清单',
      columns: [
        { id: 'name', type: 'string', label: '设备名称' },
        { id: 'line', type: 'string', label: '所属产线' },
        { id: 'load', type: 'number', label: '负载', unit: '%' },
      ],
      parameters: [
        {
          name: 'line',
          required: true,
          valueType: 'string',
          defaultValue: 'LINE-A',
          allowedValues: LINES,
        },
      ],
      values: { name: ['冲压机 1', '焊接机 2'], line: ['LINE-A'], load: [81, 64] },
      rows: { sampled: 2, total: 2 },
    },
    {
      datasetId: 'monitor.alarms',
      name: '告警事件',
      columns: [
        { id: 'level', type: 'string', label: '等级' },
        { id: 'message', type: 'string', label: '告警内容' },
      ],
      parameters: [
        { name: 'line', required: true, valueType: 'string', allowedValues: LINES },
        { name: 'level', required: false, valueType: 'string', defaultValue: 'all' },
      ],
    },
    {
      datasetId: 'monitor.line-summary',
      name: '产线汇总',
      columns: [
        { id: 'line', type: 'string', label: '产线' },
        { id: 'avgLoad', type: 'number', label: '平均负载', unit: '%' },
      ],
      parameters: [
        {
          name: 'line',
          required: true,
          valueType: 'string',
          defaultValue: 'LINE-A',
          allowedValues: LINES,
        },
      ],
      values: { line: ['LINE-A'], avgLoad: [72.4] },
      rows: { sampled: 1, total: 1 },
    },
  ],
};

function screen(extra: Record<string, unknown>, blocks?: readonly unknown[]): unknown {
  return {
    title: '产线监控',
    subtitle: '按产线查看设备与告警',
    regions: [
      {
        kind: 'band',
        items: [
          {
            label: '平均负载',
            key: 'load',
            bind: { datasetId: 'monitor.line-summary', field: 'avgLoad' },
            states: [
              { op: 'gte', value: 90, tone: 'danger', label: '过载' },
              { op: 'gte', value: 70, tone: 'warning' },
            ],
          },
          { label: '在线设备', value: 37, unit: '台' },
        ],
      },
      {
        kind: 'grid',
        blocks: blocks ?? [
          {
            type: 'base.table',
            key: 'lines',
            title: '产线概览',
            span: 2,
            datasetId: 'monitor.lines',
          },
          {
            type: 'base.table',
            key: 'alarms',
            title: '告警明细',
            span: 2,
            datasetId: 'monitor.alarms',
          },
        ],
      },
    ],
    ...extra,
  };
}

function intentOf(raw: unknown): ScreenIntent {
  const parsed = parseScreenIntent(raw, { catalog: CATALOG });
  if (parsed.intent === undefined) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.intent;
}

function compile(raw: unknown, capabilities?: readonly string[]) {
  const outcome = compileScreenIntent({
    intent: intentOf(raw),
    catalog: CATALOG,
    references: REFERENCES,
    mode: 'llm',
    ...(capabilities === undefined ? {} : { capabilities }),
  });
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
  return outcome.value;
}

const FILTER = {
  kind: 'filter',
  from: 'lines',
  event: 'rowClick',
  field: 'line',
  to: ['alarms'],
  param: 'line',
};

describe('filter interactions', () => {
  it('derives a variable, points the target parameter at it and wires the event', () => {
    const compiled = compile(screen({ interactions: [FILTER] }));
    const { document } = compiled;

    expect(document.variables).toEqual([
      {
        id: 'agent-var-1',
        name: 'line_1',
        description: '点「产线概览」设置，筛选「告警明细」',
        type: 'static',
        initialValue: 'LINE-A',
      },
    ]);
    const alarms = document.dataSources?.find(
      (source) => (source.source as { datasetId?: string }).datasetId === 'monitor.alarms',
    );
    expect(alarms?.params).toEqual({
      line: { kind: 'variable', variableId: 'agent-var-1' },
      level: { kind: 'inline', value: 'all' },
    });
    const table = document.components.find(
      (component) =>
        component.type === 'base.table' &&
        (component.dataValue as { dataSourceId?: string }).dataSourceId !== alarms?.id,
    );
    expect(document.blueprint.edges).toEqual([
      {
        kind: 'flow',
        id: 'agent-edge-1',
        from: { node: `agent:c:${table?.id}`, port: 'event:rowClick' },
        to: { node: 'agent:v:agent-var-1', port: 'set' },
        value: { kind: 'event-payload', path: ['row', 'line'] },
      },
    ]);
    expect(compiled.behaviors).toEqual([
      expect.objectContaining({ kind: 'filter', from: '产线概览', to: ['告警明细'] }),
      expect.objectContaining({ kind: 'state', from: '平均负载' }),
    ]);
    // 告警的 line 必填无默认：从来源样本的第一个合法取值起步，并如实说明。
    expect(compiled.warnings.map((item) => item.code)).toContain(
      'INTENT_FILTER_INITIAL_FROM_SOURCE',
    );
    expect(parseScreenDocument(document).ok).toBe(true);
  });

  it('flags a filter that can never change anything (every source row is the current line)', () => {
    const compiled = compile(
      screen({ interactions: [{ ...FILTER, from: 'devices' }] }, [
        {
          type: 'base.table',
          key: 'devices',
          title: '设备',
          span: 2,
          datasetId: 'monitor.devices',
        },
        {
          type: 'base.table',
          key: 'alarms',
          title: '告警明细',
          span: 2,
          datasetId: 'monitor.alarms',
          params: { line: 'LINE-A' },
        },
      ]),
    );
    expect(compiled.warnings).toContainEqual(
      expect.objectContaining({
        code: 'AGENT_INTERACTION_NO_EFFECT',
        path: 'interactions[0]',
        detail: expect.objectContaining({ reason: 'same' }),
      }),
    );
    expect(compiled.document.variables).toEqual([]);
  });

  it('sends unknown events and fields into the repair loop', () => {
    const prepared = prepareIntent({
      output: JSON.stringify(
        screen({
          interactions: [
            { ...FILTER, event: 'doubleClick' },
            { ...FILTER, field: 'nope' },
          ],
        }),
      ),
      catalog: CATALOG,
      references: REFERENCES,
      mode: 'llm',
    });
    expect(prepared.issues).toEqual(
      expect.arrayContaining([
        { code: 'AGENT_INTERACTION_EVENT_UNKNOWN', path: 'interactions[0]' },
        { code: 'AGENT_INTERACTION_FIELD_UNKNOWN', path: 'interactions[1]' },
      ]),
    );
    // 联动有问题不拖累版面：去掉那条联动照样可以交出。
    expect(prepared.deliverable).toBe(true);
  });

  it('only filters through dataset parameters', () => {
    const compiled = compile(
      // 「在线设备」是示例数值的指标卡：没有数据集参数可写，筛选不了。
      screen({ interactions: [{ ...FILTER, to: ['在线设备'] }] }),
    );
    expect(compiled.warnings).toContainEqual(
      expect.objectContaining({
        code: 'AGENT_INTERACTION_TARGET_INVALID',
        detail: { target: '在线设备', param: 'line' },
      }),
    );
  });

  it('skips interactions the host has not granted, without asking for a repair', () => {
    const prepared = prepareIntent({
      output: JSON.stringify(screen({ interactions: [FILTER] })),
      catalog: CATALOG,
      references: REFERENCES,
      mode: 'llm',
      capabilities: ['blueprint.trigger.material-event', 'blueprint.value.event-payload'],
    });
    expect(prepared.warnings).toContainEqual(
      expect.objectContaining({
        code: 'AGENT_INTERACTION_CAPABILITY_MISSING',
        detail: { capability: 'blueprint.action.set-variable' },
      }),
    );
    expect(prepared.issues).toEqual([]);
    expect(prepared.compiled?.document.blueprint.edges).toEqual([]);
  });
});

describe('gaps', () => {
  it('turns what the model could not do into warnings the host can show', () => {
    const parsed = parseScreenIntent(
      screen({ gaps: ['设备清单没有班组参数，无法按班组筛选', '', 42] }),
      { catalog: CATALOG },
    );
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'INTENT_BEHAVIOR_GAP',
        path: 'gaps[0]',
        detail: { text: '设备清单没有班组参数，无法按班组筛选' },
      }),
    );
    expect(parsed.diagnostics.filter((item) => item.code === 'INTENT_BEHAVIOR_GAP')).toHaveLength(
      1,
    );
  });
});

describe('simulation through core (ADR-0115 D6)', () => {
  const tabs = (datasetId: string) => [
    {
      type: 'board.tabs',
      key: 'tabs',
      title: '产线',
      span: 4,
      datasetId,
      fields: { items: ['line'] },
    },
    {
      type: 'base.table',
      key: 'alarms',
      title: '告警明细',
      span: 4,
      datasetId: 'monitor.alarms',
      params: { line: 'LINE-A' },
    },
  ];
  const TAB_FILTER = {
    kind: 'filter',
    from: 'tabs',
    event: 'tabChange',
    to: ['alarms'],
    param: 'line',
  };

  it('wires a tab change to the target parameter when some tab changes it', () => {
    const compiled = compile(screen({ interactions: [TAB_FILTER] }, tabs('monitor.lines')));
    expect(compiled.behaviors.filter((item) => item.kind === 'filter')).toHaveLength(1);
    expect(compiled.document.blueprint.edges[0]).toMatchObject({
      value: { kind: 'event-payload', path: ['value'] },
    });
  });

  it('drops a tab change that can never change anything', () => {
    const compiled = compile(screen({ interactions: [TAB_FILTER] }, tabs('monitor.line-summary')));
    expect(compiled.warnings).toContainEqual(
      expect.objectContaining({
        code: 'AGENT_INTERACTION_NO_EFFECT',
        detail: expect.objectContaining({ reason: 'same' }),
      }),
    );
    expect(compiled.document.blueprint.edges).toEqual([]);
  });
});

describe('show interactions', () => {
  it('hides the target block up front and wires the source event to its shell', () => {
    const compiled = compile(
      screen(
        {
          interactions: [
            { kind: 'show', from: '产线概览', event: 'rowClick', to: ['alarms'], mode: 'show' },
          ],
        },
        EDIT_BLOCKS,
      ),
    );
    const { document } = compiled;
    const edge = document.blueprint.edges[0] as { to: { node: string; port: string } };
    expect(edge.to.port).toBe('show');
    const shellId = edge.to.node.replace('agent:c:', '');
    const shell = document.components.find((component) => component.id === shellId);
    expect(shell?.parentId).toBeNull();
    expect(shell?.status.hidden).toBe(true);
    expect(parseScreenDocument(document).ok).toBe(true);
  });
});

describe('threshold states', () => {
  it('judges a bound KPI by the first row of its field', () => {
    const compiled = compile(screen({}));
    const value = compiled.document.components.find(
      (component) => component.name === '指标值' && component.states !== undefined,
    );
    expect(value?.states).toEqual({
      items: [
        { id: 'agent-state-1', name: '过载', style: { color: 'theme:danger' } },
        { id: 'agent-state-2', name: '预警', style: { color: 'theme:warning' } },
      ],
      judge: {
        input: {
          kind: 'data-source-field',
          dataSourceId: (value?.dataValue as { dataSourceId: string }).dataSourceId,
          path: ['rows', '0', 'avgLoad'],
        },
        cases: [
          { operator: 'gte', value: 90, stateId: 'agent-state-1' },
          { operator: 'gte', value: 70, stateId: 'agent-state-2' },
        ],
      },
    });
    expect(parseScreenDocument(compiled.document).ok).toBe(true);
  });

  it('does not judge a sample value', () => {
    const raw = screen({}) as { regions: { items?: unknown[] }[] };
    raw.regions[0]?.items?.push({
      label: '良率',
      value: 98.2,
      unit: '%',
      states: { rules: [{ op: 'lt', value: 95, tone: 'danger' }], suggested: true },
    });
    const compiled = compile(raw);
    expect(compiled.warnings).toContainEqual(
      expect.objectContaining({ code: 'AGENT_STATE_NEEDS_DATA', path: 'regions[0].items[2]' }),
    );
  });

  it('tells the user when the thresholds were suggested by the model', () => {
    const raw = screen({}) as { regions: { items?: { states?: unknown }[] }[] };
    const first = raw.regions[0]?.items?.[0];
    if (first !== undefined)
      first.states = { rules: [{ op: 'gte', value: 90, tone: 'danger' }], suggested: true };
    const compiled = compile(raw);
    expect(compiled.warnings.map((item) => item.code)).toContain('INTENT_STATE_SUGGESTED');
    expect(compiled.behaviors.find((item) => item.kind === 'state')?.suggested).toBe(true);
  });
});

/** 编辑用例：告警块显式给了产线，加 / 删联动都不改变版面。 */
const EDIT_BLOCKS = [
  { type: 'base.table', key: 'lines', title: '产线概览', span: 2, datasetId: 'monitor.lines' },
  {
    type: 'base.table',
    key: 'alarms',
    title: '告警明细',
    span: 2,
    datasetId: 'monitor.alarms',
    params: { line: 'LINE-B' },
  },
];

describe('editing interactions', () => {
  it('adds a filter in place: variables first, then the parameter, then the wiring', () => {
    const compiled = compile(screen({}, EDIT_BLOCKS));
    const session = createIntentSession({
      intent: intentOf(screen({}, EDIT_BLOCKS)),
      compiled,
      catalog: CATALOG,
      references: REFERENCES,
      mode: 'llm',
    });
    const live = compiled.document;
    const outcome = editIntent(session, [{ op: 'link', interaction: FILTER }], {
      canvas: live.canvas,
      components: live.components,
      ...(live.dataSources === undefined ? {} : { dataSources: live.dataSources }),
      variables: live.variables,
      blueprint: live.blueprint,
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
    // 只加联动：全是按 id 的局部命令，不整体替换任何集合。
    expect(outcome.commands.map((command) => command.type)).toEqual([
      'add-variables',
      'update-data-source-params',
      'add-blueprint-elements',
    ]);
    expect(outcome.commands[1]).toMatchObject({
      params: { line: { kind: 'variable', variableId: 'agent-var-1' } },
    });
    expect(outcome.session.intent.interactions).toHaveLength(1);
    // 版面没动：不给分组提示（只有一组，没得拆）。
    expect(outcome.groups).toBeUndefined();
  });

  it('splits a layout change and a new interaction into two groups that each stand alone', () => {
    const compiled = compile(screen({}, EDIT_BLOCKS));
    const session = createIntentSession({
      intent: intentOf(screen({}, EDIT_BLOCKS)),
      compiled,
      catalog: CATALOG,
      references: REFERENCES,
      mode: 'llm',
    });
    const live = compiled.document;
    const grid = session.intent.regions[1];
    const alarms = grid?.kind === 'grid' ? grid.blocks[1] : undefined;
    const outcome = editIntent(
      session,
      [
        { op: 'change', target: alarms?.ident ?? '', set: { title: '告警流水' } },
        { op: 'link', interaction: FILTER },
      ],
      {
        canvas: live.canvas,
        components: live.components,
        ...(live.dataSources === undefined ? {} : { dataSources: live.dataSources }),
        variables: live.variables,
        blueprint: live.blueprint,
      },
    );
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
    const [layout, link] = outcome.groups ?? [];
    expect(layout?.commandIndexes.map((index) => outcome.commands[index]?.type)).toEqual(
      expect.arrayContaining(['update-components']),
    );
    expect(link?.commandIndexes.map((index) => outcome.commands[index]?.type)).toEqual([
      'add-variables',
      'update-data-source-params',
      'add-blueprint-elements',
    ]);
    expect(link?.notes).toEqual(['新增：点「产线概览」点击行 → 按 line 筛选「告警流水」']);
  });

  it('removes the interactions of a deleted block', () => {
    const compiled = compile(screen({ interactions: [FILTER] }, EDIT_BLOCKS));
    const session = createIntentSession({
      intent: intentOf(screen({ interactions: [FILTER] }, EDIT_BLOCKS)),
      compiled,
      catalog: CATALOG,
      references: REFERENCES,
      mode: 'llm',
    });
    const live = compiled.document;
    const target = session.intent.regions[1];
    const lines = target?.kind === 'grid' ? target.blocks[0] : undefined;
    const outcome = editIntent(session, [{ op: 'delete', target: lines?.ident ?? '' }], {
      canvas: live.canvas,
      components: live.components,
      ...(live.dataSources === undefined ? {} : { dataSources: live.dataSources }),
      variables: live.variables,
      blueprint: live.blueprint,
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
    expect(outcome.session.intent.interactions).toBeUndefined();
    // 先摘连线、退回常量、删变量，再动组件（右边那块左移补位）。
    const types = outcome.commands.map((command) => command.type);
    expect(types.slice(0, 3)).toEqual([
      'remove-blueprint-elements',
      'update-data-source-params',
      'remove-variables',
    ]);
    expect(types).toContain('remove-components');
    // 告警块读的还是活文档里那个实例（只是编译编号前移了），不新建重复实例。
    expect(types).not.toContain('add-data-sources');
    expect(JSON.stringify(outcome.commands)).not.toContain('"dataValue"');
    expect(outcome.commands[1]).toMatchObject({
      params: { line: { kind: 'inline', value: 'LINE-B' } },
    });
    // 版面与联动各一组；但删组件离不开先摘连线，引擎按「每组能否单独成立」自会退回整批。
    expect(outcome.groups?.map((group) => group.label)).toEqual(['版面与内容', '联动']);
    expect(outcome.groups?.[1]?.notes).toEqual([
      '去掉：点「产线概览」点击行 → 按 line 筛选「告警明细」',
    ]);
  });
});
