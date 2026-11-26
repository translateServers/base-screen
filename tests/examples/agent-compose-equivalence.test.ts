import { parseScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  type AgentCatalog,
  FALLBACK_AGENT_CATALOG,
} from '../../examples/shared-backend/src/agent/agent-catalog';
import {
  formatKpiDelta as backendFormatKpiDelta,
  formatKpiValue as backendFormatKpiValue,
  type ComposeStreamFrame,
  composeScreenDocument,
} from '../../examples/shared-backend/src/agent/agent-compose';
import type {
  AgentBlock,
  AgentKpi,
  AgentScreenSpec,
} from '../../examples/shared-backend/src/agent/agent-spec';
import {
  resolveStylePreset,
  STYLE_PRESET_IDS,
  STYLE_PRESETS,
} from '../../examples/shared-backend/src/agent/agent-style';
// 根级测试没有依赖 core 包：按源码路径导入（与导入示例后端源码同法）。
import { auditScreenLayout } from '../../packages/core/src/index.js';
import {
  compileScreenIntent,
  formatKpiDelta,
  formatKpiValue,
  INTENT_STYLE_PRESET_IDS,
  INTENT_STYLE_PRESETS,
  type IntentCatalog,
  type IntentReferences,
  type IntentStreamFrame,
  parseIntentBlock,
  parseIntentKpi,
  parseScreenIntent,
} from '../../packages/host-kit/src/index.js';
import {
  COMPILE_CATALOG,
  SHAPE_CATALOG,
  SIX_ROW_TABLE,
  TREND_TABLE,
} from '../../packages/host-kit/tests/intent/fixtures.js';

/**
 * ADR-0113 S2 的验收：编译器从示例后端迁进 `host-kit` 之后行为等价。
 *
 * 同一份内容分别走「后端 `composeScreenDocument`」与「`host-kit` 的 `parseScreenIntent` +
 * `compileScreenIntent`」，要求文档逐字相同（JSON 字符串相等，连键顺序都一致）。
 * 在 S5 删除后端编译器之前，这是两份实现不漂移的唯一防线；S5 切换前同一批用例必须保持通过。
 *
 * 来源表只对「没有丢弃项」的输入逐项比对：丢弃坏项之后 `host-kit` 的来源表指回模型原文下标
 * （这是迁移带来的有意改进，见 ADR-0113 §8），后端指回位置下标。
 */

const asAgentCatalog = (catalog: IntentCatalog, source: 'client' | 'fallback' = 'client') =>
  ({ ...catalog, source }) as unknown as AgentCatalog;

const CHART = {
  type: 'base.chart',
  title: '各仓水位',
  note: '单位：%',
  span: 2,
  table: TREND_TABLE,
};
const TREND = { type: 'base.chart', title: '周转趋势', span: 2, table: TREND_TABLE };
const NOTE = { type: 'base.text', title: '要点', span: 2, text: '甲' };
const LONG_NOTE = {
  type: 'base.text',
  title: '结论与建议',
  note: '本周口径',
  span: 2,
  text: '第一条结论\n第二条结论\n第三条结论',
};
const TITLE_IS_BODY = { type: 'base.text', title: '整体平稳', span: 4, text: '整体平稳' };
const TABLE_BLOCK = { type: 'base.table', title: '仓库明细', span: 4, table: SIX_ROW_TABLE };
const ECHARTS = {
  type: 'plugin.echarts',
  title: '趋势',
  span: 3,
  table: TREND_TABLE,
  props: { seriesType: 'bar', showTooltip: false, bogus: 'x' },
};
const IMAGE = { type: 'base.image', title: '现场', span: 1, assetId: 'a-1' };
const IMAGE_TEXT = { type: 'base.image', title: '现场', span: 1, text: '拣选作业现场' };
const DATASET = { type: 'base.chart', title: '订单', span: 2, datasetId: 'orders' };
const MISSING_DATASET = { type: 'base.chart', title: '订单', span: 2, datasetId: 'gone' };
const STATUS_ONE_COLUMN = {
  type: 'board.status-grid',
  title: '状态',
  span: 2,
  table: { columns: [{ id: 'name', label: '名称', type: 'string' }], rows: [{ name: '甲' }] },
};
const DECOR = { type: 'base.rectangle', title: '装饰', span: 1 };

const KPIS: readonly AgentKpi[] = [
  {
    label: '总库存',
    value: 286000,
    unit: '件',
    delta: { value: 4.2, unit: 'percent', direction: 'neutral' },
  },
  {
    label: '周转天数',
    value: 23.7,
    unit: '天',
    delta: { value: -1.1, unit: 'point', direction: 'down-good' },
  },
  { label: '缺货仓', value: 15, unit: '家' },
  {
    label: '营收',
    value: 325000000,
    unit: '元',
    delta: { value: 12000, unit: 'absolute', direction: 'up-good' },
  },
  { label: '水位', value: 92.5, unit: '%', precision: 1 },
];

const REFERENCES: IntentReferences = {
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
};

interface Case {
  readonly name: string;
  readonly kpis: readonly AgentKpi[];
  readonly blocks: readonly AgentBlock[];
  readonly catalog?: IntentCatalog;
  readonly references?: IntentReferences;
  /** 夹具允许的解析错误码：例如「没有块」本来就会得到 AGENT_BLOCKS_ALL_INVALID。 */
  readonly tolerate?: readonly string[];
}

const CASES: readonly Case[] = [
  { name: '三条指标 + 两块图表', kpis: KPIS.slice(0, 3), blocks: [CHART, TREND] as AgentBlock[] },
  { name: '五条指标含各种增减量', kpis: KPIS, blocks: [CHART, NOTE] as AgentBlock[] },
  { name: '一条指标', kpis: KPIS.slice(0, 1), blocks: [CHART] as AgentBlock[] },
  {
    name: '没有块',
    kpis: KPIS.slice(0, 3),
    blocks: [],
    tolerate: ['AGENT_BLOCKS_ALL_INVALID'],
  },
  { name: '单块独占一行（span 2 铺满）', kpis: KPIS.slice(0, 2), blocks: [CHART] as AgentBlock[] },
  { name: '3 + 1 同行', kpis: KPIS.slice(0, 3), blocks: [ECHARTS, NOTE] as AgentBlock[] },
  {
    name: '三块 span 2 折行',
    kpis: KPIS.slice(0, 3),
    blocks: [CHART, TREND, NOTE] as AgentBlock[],
  },
  {
    name: '四块含表格、文本与长结论',
    kpis: KPIS.slice(0, 4),
    blocks: [TABLE_BLOCK, LONG_NOTE, CHART, NOTE] as AgentBlock[],
  },
  {
    name: '标题即正文的文本块省略块标题',
    kpis: KPIS.slice(0, 3),
    blocks: [TITLE_IS_BODY] as AgentBlock[],
  },
  {
    name: '6 行表格按块高收紧行高',
    kpis: KPIS.slice(0, 3),
    blocks: [TABLE_BLOCK, NOTE] as AgentBlock[],
  },
  { name: '参数只留目录声明过的键', kpis: KPIS.slice(0, 3), blocks: [ECHARTS] as AgentBlock[] },
  { name: '素材图片走数据源实例', kpis: KPIS.slice(0, 3), blocks: [IMAGE, NOTE] as AgentBlock[] },
  {
    name: '素材型物料只给 text 时跳过',
    kpis: KPIS.slice(0, 3),
    blocks: [IMAGE_TEXT, NOTE] as AgentBlock[],
  },
  {
    name: '引用数据集走数据源与角色分配',
    kpis: KPIS.slice(0, 3),
    blocks: [DATASET, NOTE] as AgentBlock[],
    references: REFERENCES,
  },
  {
    name: '引用的数据集不在本轮上下文里',
    kpis: KPIS.slice(0, 3),
    blocks: [MISSING_DATASET, NOTE] as AgentBlock[],
  },
  {
    name: '列满足不了绑定角色退化为空图',
    kpis: KPIS.slice(0, 3),
    blocks: [STATUS_ONE_COLUMN, NOTE] as AgentBlock[],
  },
  { name: '无数据装饰物料', kpis: KPIS.slice(0, 3), blocks: [DECOR, NOTE] as AgentBlock[] },
  {
    name: '椭圆排在矩形前面的目录',
    kpis: KPIS.slice(0, 3),
    blocks: [NOTE, { ...NOTE, title: '提醒' }] as AgentBlock[],
    catalog: SHAPE_CATALOG,
  },
];

const MODES = [undefined, 'llm', 'deterministic'] as const;
const STYLES = [undefined, ...STYLE_PRESET_IDS] as const;

function specOf(item: Case, style: string | undefined): Record<string, unknown> {
  return {
    title: '华东渠道周会',
    subtitle: '按周汇总的渠道经营口径',
    ...(style === undefined ? {} : { style }),
    kpis: item.kpis,
    blocks: item.blocks,
  };
}

function legacyCompose(
  item: Case,
  style: string | undefined,
  mode: (typeof MODES)[number],
  stream?: ComposeStreamFrame,
) {
  const spec = {
    ...specOf(item, style),
    ...(mode === undefined ? {} : { mode }),
  } as unknown as AgentScreenSpec;
  return composeScreenDocument({
    spec,
    catalog: asAgentCatalog(item.catalog ?? COMPILE_CATALOG),
    ...(item.references === undefined ? {} : { references: item.references }),
    style: resolveStylePreset(style),
    ...(stream === undefined ? {} : { stream }),
  });
}

function parsedIntent(item: Case, style: string | undefined) {
  const result = parseScreenIntent(specOf(item, style), {
    catalog: item.catalog ?? COMPILE_CATALOG,
  });
  // 夹具本身必须是干净的意图：解析不丢任何东西，对照才公平。
  const dropped = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === 'error' && item.tolerate?.includes(diagnostic.code) !== true,
  );
  if (result.intent === undefined || dropped.length > 0) {
    throw new Error(`fixture "${item.name}" is not clean: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.intent;
}

function expectSameOutcome(
  next: ReturnType<typeof compileScreenIntent>,
  legacy: ReturnType<typeof composeScreenDocument>,
): void {
  expect(next.ok).toBe(legacy.ok);
  if (!next.ok || !legacy.ok) return;
  // 逐字相同：连键顺序都一致。
  expect(JSON.stringify(next.value.document)).toBe(JSON.stringify(legacy.value.document));
  expect(next.value.imageCount).toBe(legacy.value.imageCount);
  expect(next.value.materials).toEqual(legacy.value.materials);
  expect(next.value.sources).toEqual(legacy.value.sources);
  // 降级告警：码与说明一致；路径不同是有意的（host-kit 写 IR 路径，后端写块标题）。
  expect(next.value.warnings.map((item) => [item.code, item.message])).toEqual(
    legacy.value.warnings.map((item) => [item.code, item.message]),
  );
}

describe('ADR-0113 S2 · 编译器迁移前后等价', () => {
  for (const item of CASES) {
    describe(item.name, () => {
      for (const mode of MODES) {
        for (const style of STYLES) {
          it(`mode=${mode ?? '缺省'} style=${style ?? '缺省'}`, () => {
            const next = compileScreenIntent({
              intent: parsedIntent(item, style),
              catalog: item.catalog ?? COMPILE_CATALOG,
              ...(item.references === undefined ? {} : { references: item.references }),
              ...(mode === undefined ? {} : { mode }),
            });
            expectSameOutcome(next, legacyCompose(item, style, mode));
          });
        }
      }
    });
  }

  it('回退目录（只有四种基础物料）同样等价', () => {
    const catalog = FALLBACK_AGENT_CATALOG as unknown as IntentCatalog;
    const item: Case = {
      name: '回退目录',
      kpis: KPIS.slice(0, 3),
      blocks: [CHART, TREND, NOTE] as AgentBlock[],
      catalog,
    };
    const next = compileScreenIntent({
      intent: parsedIntent(item, 'light-biz'),
      catalog,
      mode: 'llm',
    });
    expectSameOutcome(next, legacyCompose(item, 'light-biz', 'llm'));
  });

  it('流式落稿的每一帧都等价：骨架先行、逐项到达', () => {
    const item: Case = {
      name: '流式',
      kpis: KPIS.slice(0, 4),
      blocks: [CHART, TABLE_BLOCK, LONG_NOTE] as AgentBlock[],
    };
    const intent = parsedIntent(item, 'light-biz');
    const layout = {
      kpis: item.kpis.length,
      blocks: item.blocks.map((block) => ({
        span: block.span,
        data: block.table !== undefined || (block.datasetId ?? '') !== '',
      })),
    };
    const kpiAt = (index: number) => parseIntentKpi(item.kpis[index], `kpis[${index}]`).value;
    const blockAt = (index: number) =>
      parseIntentBlock(item.blocks[index], COMPILE_CATALOG, `blocks[${index}]`, { grid: true })
        .value;

    // 每一帧：已到达的前缀 + 还没到的占位。
    for (let kpiCount = 0; kpiCount <= item.kpis.length; kpiCount += 1) {
      for (let blockCount = 0; blockCount <= item.blocks.length; blockCount += 1) {
        const legacyFrame: ComposeStreamFrame = {
          layout,
          kpis: item.kpis.map((kpi, index) => (index < kpiCount ? kpi : undefined)),
          blocks: item.blocks.map((block, index) => (index < blockCount ? block : undefined)),
        };
        const nextFrame: IntentStreamFrame = {
          skeleton: layout,
          kpis: item.kpis.map((_, index) => (index < kpiCount ? kpiAt(index) : undefined)),
          blocks: item.blocks.map((_, index) => (index < blockCount ? blockAt(index) : undefined)),
        };
        const next = compileScreenIntent({
          intent,
          catalog: COMPILE_CATALOG,
          mode: 'llm',
          stream: nextFrame,
        });
        expectSameOutcome(next, legacyCompose(item, 'light-biz', 'llm', legacyFrame));
      }
    }
  });

  it('骨架与内容个数对不上时以骨架为准，两边一致', () => {
    const item: Case = {
      name: '骨架多一格',
      kpis: KPIS.slice(0, 2),
      blocks: [CHART] as AgentBlock[],
    };
    const intent = parsedIntent(item, undefined);
    const layout = {
      kpis: 3,
      blocks: [
        { span: 2, data: true },
        { span: 2, data: false },
      ],
    };
    const legacyFrame: ComposeStreamFrame = {
      layout,
      kpis: [KPIS[0], KPIS[1]],
      blocks: [CHART as AgentBlock],
    };
    const nextFrame: IntentStreamFrame = {
      skeleton: layout,
      kpis: [parseIntentKpi(KPIS[0], 'kpis[0]').value, parseIntentKpi(KPIS[1], 'kpis[1]').value],
      blocks: [parseIntentBlock(CHART, COMPILE_CATALOG, 'blocks[0]', { grid: true }).value],
    };
    const next = compileScreenIntent({ intent, catalog: COMPILE_CATALOG, stream: nextFrame });
    expectSameOutcome(next, legacyCompose(item, undefined, undefined, legacyFrame));
  });

  it('指标格式化与后端一致', () => {
    const values: readonly AgentKpi[] = [
      { label: 'a', value: 286000, unit: '件' },
      { label: 'a', value: 325000000, unit: '元' },
      { label: 'a', value: -12500, unit: '元' },
      { label: 'a', value: 23.7, unit: '天' },
      { label: 'a', value: 92.5, unit: '%' },
      { label: 'a', value: 1359, unit: '元', precision: 2 },
      { label: 'a', value: 0.123456 },
      { label: 'a', value: 0 },
      { label: 'a', value: null },
      ...KPIS,
    ];
    for (const kpi of values) {
      expect(formatKpiValue(kpi)).toBe(backendFormatKpiValue(kpi));
      expect(formatKpiDelta(kpi)).toBe(backendFormatKpiDelta(kpi));
    }
  });

  it('风格预设与后端逐项一致', () => {
    expect([...INTENT_STYLE_PRESET_IDS]).toEqual([...STYLE_PRESET_IDS]);
    expect(INTENT_STYLE_PRESETS).toEqual(STYLE_PRESETS);
  });
});

describe('ADR-0113 S2 · host-kit 编译产物通过契约与版面审计', () => {
  for (const item of CASES.filter((candidate) => candidate.catalog === undefined)) {
    it(item.name, () => {
      const outcome = compileScreenIntent({
        intent: parsedIntent(item, 'light-biz'),
        catalog: COMPILE_CATALOG,
        mode: 'llm',
        ...(item.references === undefined ? {} : { references: item.references }),
      });
      if (!outcome.ok) throw new Error(`compile failed: ${JSON.stringify(outcome.diagnostics)}`);

      const parsed = parseScreenDocument(outcome.value.document);
      expect(parsed.ok, JSON.stringify(parsed.diagnostics)).toBe(true);
      if (!parsed.ok) return;
      expect(auditScreenLayout(parsed.value)).toEqual([]);
    });
  }
});
