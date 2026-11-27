#!/usr/bin/env node
/**
 * 智能体整屏生成评测（ADR-0112 §2.7 / ADR-0113 S9）。
 *
 * 对运行中的示例后端逐条发 `POST /agent/act/stream`，再在本脚本里**跑宿主前端那条链**（`host-kit` 的
 * 解析 → 编译 → 版面审计 → 最多 2 轮修复，与 `examples/*-host/src/screen/host-intent.ts` 同口径），
 * 记录每条用例：
 * - 首轮合法率（没有修复、没有失败码、走了模型）、修复轮数、模型调用次数；
 * - 收尾时去掉的指标 / 块、示例数据处数、`LAYOUT_*` 违规数、容量冲突次数；
 * （「带问题交出」= 修复仍有个别指标 / 块不合格，去掉或保留降级项后照常交出并说明）
 * - 版面（用到了哪些区域）、外壳（可整体移动的组合）个数、缺口说明（`substituteFor`）；
 * - 首个占位出现时间（skeleton 事件）与完成时间；
 * - 流式帧之间共有组件是否一字不差、最后一帧能否原地收尾。
 *
 * 不进 `verify:m0`：要连真实模型，结果随模型浮动（AGENTS.md：示例相关验证不进 verify:m0）。
 *
 * 用法（仓库根目录，先 `pnpm build` 并启动示例后端，模型配置在 examples/shared-backend/.env.local）：
 *   node tooling/verification/agent-eval.mjs [--base http://127.0.0.1:3000/api] [--only id,id] [--out file.json]
 *   [--data 1]      从数据出发的用例（ADR-0114 S7）
 *   [--behavior 1]  行为生成的用例（ADR-0115 S8）：联动、阈值状态、能力缺口
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const { parseScreenDocument } = await load('packages/contracts/dist/index.js');
const { auditScreenLayout, listSampleValueRefs } = await load('packages/core/dist/index.js');
const {
  compileScreenIntent,
  createIntentSession,
  createIntentStreamAssembler,
  describeSession,
  editIntent,
  createRestDatasetPort,
  mapDocumentIssues,
  prepareIntent,
  prepareIntentDataContext,
  repairKey,
  summarizeIntentDataContext,
  validateIntentData,
} = await load('packages/host-kit/dist/index.js');

const MAX_REPAIR_ROUNDS = 2;

/** 6 个主题沿用 2026-10-30 全链路测试；4 条边界用例见 ADR-0112 §2.7。 */
export const AGENT_EVAL_CASES = [
  { id: 'cold-chain', kind: '主题', text: '生成全国冷链干线运输实时监控大屏' },
  { id: 'double-11', kind: '主题', text: '生成双十一大促作战室大屏' },
  { id: 'metro', kind: '主题', text: '生成城市轨道交通客流调度大屏' },
  { id: 'hospital', kind: '主题', text: '生成三甲医院门诊运营大屏' },
  { id: 'finance', kind: '主题', text: '生成集团财务月度经营分析大屏' },
  { id: 'pue', kind: '主题', text: '生成数据中心能耗与 PUE 大屏' },
  {
    id: 'mixed-delta',
    kind: '边界',
    text: '生成区域销售周报大屏，指标的同比有升有降，下滑的要一眼看出来',
  },
  { id: 'map', kind: '边界', text: '生成全国门店分布地图大屏，按省份显示门店数量' },
  {
    id: 'long',
    kind: '边界',
    text:
      '生成一张给华东大区运营总监每天早会用的仓储与配送综合大屏：上面放今天的出库量、库存周转天数、订单履约率和异常单数，' +
      '中间左边看近两周的出库趋势、右边看各仓库存结构，下面列出各仓的作业明细和异常处理进度，' +
      '另外要有一段今日要点文字，提醒库容紧张的仓和需要协调的承运商，整体风格要稳重、数字要能在会议室大屏上看清。',
  },
  {
    id: 'english',
    kind: '边界',
    text: 'Generate a real-time logistics control tower dashboard for East China warehouses',
  },
  // ADR-0113 新增：版面多样（主区 + 侧栏）与缺口说明（目录里没有的组件形态）。
  {
    id: 'rail-left',
    kind: '版面',
    text: '生成区域销售周报大屏：左侧窄栏放今日要点和提醒，右边宽的主区放近两周销售趋势和各品类占比',
  },
  {
    id: 'rail-right',
    kind: '版面',
    text: '生成电商大促作战室大屏：主区放实时成交趋势与区域排行，右侧栏放库存预警和客服排队情况',
  },
];

/**
 * 从数据出发（ADR-0114 S7，`--data`）：引用示例后端的固定数据集，走与宿主同一条链——
 * describe → 默认参数取样 → 画像 → 候选随引用上送 → 编译。看数据源实例与参数、示例数据是否归零、缺参是否如实说明。
 */
export const DATA_EVAL_CASES = [
  {
    id: 'data-crew',
    kind: '数据',
    text: '用班组绩效数据做一屏 LINE-B 产线的班组对比大屏',
    datasets: ['monitor.crew'],
  },
  {
    id: 'data-crew-noline',
    kind: '数据',
    text: '用班组绩效数据做一屏班组对比大屏',
    datasets: ['monitor.crew'],
  },
  {
    id: 'data-alarms',
    kind: '数据',
    text: '用 LINE-A 的告警事件做一屏告警趋势大屏',
    datasets: ['monitor.alarms'],
  },
  {
    id: 'data-devices',
    kind: '数据',
    text: '用设备清单做一屏设备运行状态大屏',
    datasets: ['monitor.devices'],
  },
  {
    id: 'data-two',
    kind: '数据',
    text: '用设备清单和 LINE-A 的班组绩效做一屏产线对比大屏',
    datasets: ['monitor.devices', 'monitor.crew'],
  },
  {
    id: 'data-en',
    kind: '数据',
    text: 'Build a device status dashboard from the device list dataset',
    datasets: ['monitor.devices'],
  },
];

/**
 * 行为生成（ADR-0115 S8，`--behavior`）：联动与阈值状态。`capabilities` 模拟宿主已授权的蓝图能力
 * （缺省为全部授权）；看编进文档的联动 / 状态、采纳前模拟的拦截、能力缺口与缺口说明。
 */
const ALL_CAPABILITIES = [
  'blueprint.trigger.material-event',
  'blueprint.value.event-payload',
  'blueprint.action.set-variable',
  'blueprint.action.component-visibility',
];
export const BEHAVIOR_EVAL_CASES = [
  {
    id: 'b-filter',
    kind: '行为',
    text: '用产线概览和告警事件做一屏产线监控：点产线概览表里的一行，下面的告警明细只看这条产线',
    datasets: ['monitor.lines', 'monitor.alarms'],
    expect: { filter: 1 },
  },
  {
    id: 'b-noeffect',
    kind: '行为',
    text: '用设备清单和告警事件做一屏设备监控：点设备表里的一行，告警明细只看这台设备所在的产线',
    datasets: ['monitor.devices', 'monitor.alarms'],
    expect: { filter: 0 },
  },
  {
    id: 'b-threshold',
    kind: '行为',
    text: '用产线汇总做一屏 LINE-A 负载看板：平均负载超过 90 标红，超过 70 标黄',
    datasets: ['monitor.line-summary'],
    expect: { state: 1, suggested: false },
  },
  {
    id: 'b-suggested',
    kind: '行为',
    text: '用产线汇总做一屏 LINE-A 产线看板，平均负载高的时候标红',
    datasets: ['monitor.line-summary'],
    expect: { state: 1, suggested: true },
  },
  {
    id: 'b-nocap',
    kind: '行为',
    text: '用产线概览和告警事件做一屏产线监控：告警明细先不显示，点产线概览表里的一行再显示出来',
    datasets: ['monitor.lines', 'monitor.alarms'],
    capabilities: ALL_CAPABILITIES.filter((id) => id !== 'blueprint.action.component-visibility'),
    expect: { show: 0, capabilityMissing: true },
  },
  {
    id: 'b-gap',
    kind: '行为',
    text: '用 LINE-A 的班组绩效和设备清单做一屏：点班组绩效里的某个班组，设备清单只看这个班组的设备',
    datasets: ['monitor.crew', 'monitor.devices'],
    expect: { filter: 0 },
  },
];

const args = readArgs(process.argv.slice(2));
const base = (args.base ?? 'http://127.0.0.1:3000/api').replace(/\/+$/, '');
const catalog = withShell(
  JSON.parse(readFileSync(resolve(here, 'agent-eval-catalog.json'), 'utf8')),
);
const only = args.only === undefined ? undefined : new Set(args.only.split(','));
const datasetPort = createRestDatasetPort({ baseUrl: base });
const cases = (
  args.behavior !== undefined
    ? BEHAVIOR_EVAL_CASES
    : args.data !== undefined
      ? DATA_EVAL_CASES
      : AGENT_EVAL_CASES
).filter((item) => only === undefined || only.has(item.id));

if (args.edits !== undefined) {
  await runEdits();
  process.exit(0);
}

/** `/agent/candidate`（修复请求）要求一个真实存在的 screenId，用来读素材权限；评测临时建一个，跑完删掉。 */
const hostScreen = await fetch(`${base}/screens`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'agent-eval-host' }),
})
  .then((response) => response.json())
  .then((payload) => payload.screen?.id)
  .catch(() => undefined);

const results = [];
for (const item of cases) {
  process.stderr.write(`· ${item.id} … `);
  const result = await runCase(item);
  results.push(result);
  process.stderr.write(`${result.outcome} ${(result.totalMs / 1000).toFixed(1)}s\n`);
}
if (hostScreen !== undefined) {
  await fetch(`${base}/screens/${hostScreen}`, { method: 'DELETE' }).catch(() => undefined);
}
console.log(renderTable(results));
console.log(renderSummary(results));
if (args.data !== undefined) {
  for (const row of results) {
    console.log(
      `${row.id}: 画像 ${row.profiled?.join(' ') ?? '-'}；候选 ${row.candidates ?? '-'}（用了 ${row.usedCandidates ?? '-'}）；` +
        `实例 ${row.datasetSources?.join(' ') || '无'}；绑数指标卡 ${row.boundKpis ?? 0}；告警 ${row.dataWarnings?.join(',') || '无'}；` +
        `样例验证 ${
          (row.dataChecks ?? [])
            .map(
              (entry) =>
                `第${entry.round}轮 核对${entry.verified}/未核对${entry.unverified}${entry.issues.length === 0 ? '' : ` ${entry.issues.join(',')}`}`,
            )
            .join('；') || '无'
        }`,
    );
  }
}
if (args.behavior !== undefined) {
  for (const row of results) {
    console.log(
      `${row.id}: 行为 ${row.behaviors?.join('；') || '无'}；联动 filter ${row.filters ?? 0} / show ${row.shows ?? 0}；状态 ${row.states ?? 0}；` +
        `变量 ${row.variables ?? 0}、连线 ${row.edges ?? 0}；行为告警 ${row.behaviorWarnings?.join(',') || '无'}；符合预期 ${row.asExpected ? '是' : '否'}`,
    );
  }
}
if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(results, null, 2)}\n`);

/**
 * 局部修改评测（ADR-0113 S6，`--edits`）：先整屏生成一屏并留下会话，再对同一份会话分别发 6 条
 * 修改指令（改指标、删块、换物料、加块、改标题、目录里没有的形态），每条记：后端把关后是否有操作、
 * 宿主 `editIntent` 能否应用、命令里新增 / 移除 / 更新了多少组件（越小越好）、模型是否老实说「做不到」。
 */
async function runEdits() {
  const EDIT_BASE =
    '生成区域销售周报大屏：顶部四个核心指标，主区放近两周销售趋势和各品类占比，右侧栏放今日要点和提醒';
  const EDIT_CASES = [
    { id: 'kpi', text: '把第二个指标的名字改成「本周新签客户」' },
    { id: 'delete', text: '删掉提醒那一块' },
    { id: 'swap', text: '把近两周销售趋势图换成柱状图' },
    { id: 'add', text: '在主区下面加一块文字：本周重点盯库容紧张的仓' },
    { id: 'title', text: '把大屏标题改成：华东销售运营总览' },
    { id: 'gap', text: '加一个全国门店分布地图' },
  ];

  const post = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const generated = await post('/agent/act', { text: EDIT_BASE, scope: 'screen', catalog });
  if (generated.body?.kind !== 'generate_screen') {
    console.log(
      `基础屏生成失败：${generated.status} ${JSON.stringify(generated.body).slice(0, 200)}`,
    );
    return;
  }
  const data = generated.body;
  const prepared = prepareIntent({
    output: data.output,
    catalog: { materials: catalog.materials, assets: data.assets },
    references: { assets: data.assets, datasets: data.datasets },
    mode: data.mode,
  });
  if (prepared.compiled === undefined || prepared.intent === undefined) {
    console.log(`基础屏编译失败：${JSON.stringify(prepared.issues)}`);
    return;
  }
  const session = createIntentSession({
    intent: prepared.intent,
    compiled: prepared.compiled,
    catalog: { materials: catalog.materials, assets: data.assets },
    references: { assets: data.assets, datasets: data.datasets },
    mode: data.mode,
  });
  const live = {
    canvas: session.compiled.document.canvas,
    components: session.compiled.document.components,
  };
  const digest = describeSession(session);
  console.log(
    `基础屏：${digest.title} ｜ 指标：${digest.regions
      .filter((region) => region.kind === 'band')
      .flatMap((region) => region.items.map((item) => item.title))
      .join('、')}`,
  );
  const rows = [];
  for (const item of EDIT_CASES) {
    process.stderr.write(`· edit:${item.id} … `);
    const started = Date.now();
    const answer = await post('/agent/act', {
      text: item.text,
      scope: 'screen',
      catalog,
      session: digest,
    });
    const ms = Date.now() - started;
    const result = answer.body;
    const row = { id: item.id, text: item.text, ms, kind: result?.kind ?? `http-${answer.status}` };
    if (result?.kind === 'edit_screen') {
      row.ops = result.ops.length;
      row.unsupported = result.unsupported ?? null;
      row.failure = result.failure ?? null;
      row.opKinds = result.ops.map((op) => `${op.op}:${op.target ?? op.region}`).join(' ');
      row.opsRaw = result.ops;
      if (result.ops.length > 0) {
        const edited = editIntent(session, result.ops, live);
        row.applied = edited.ok;
        if (edited.ok) {
          row.summary = edited.summary;
          row.commands = edited.commands.map((command) => command.type).join(',');
          row.keptForUser = edited.keptForUser.length;
        } else {
          row.diagnostic = edited.diagnostics
            .map((item) => `${item.code}@${item.path}: ${item.message}`)
            .join(' ');
        }
      }
    }
    rows.push(row);
    process.stderr.write(`${row.kind} ${(ms / 1000).toFixed(1)}s\n`);
  }
  const yes = (value) => (value === true ? '是' : value === false ? '否' : '—');
  console.log(
    '| 用例 | 路由 | 操作数 | 能应用 | 变化（更新/新增/移除） | 做不到的说明 | 耗时 | 操作 |',
  );
  console.log('|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const change = row.summary
      ? `${row.summary.changed}/${row.summary.added}/${row.summary.removed}`
      : (row.diagnostic ?? '—');
    console.log(
      `| ${row.id} | ${row.kind} | ${row.ops ?? '—'} | ${yes(row.applied)} | ${change} | ${row.unsupported ?? row.failure ?? '—'} | ${(row.ms / 1000).toFixed(1)}s | ${row.opKinds ?? '—'} |`,
    );
  }
  if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(rows, null, 2)}\n`);
}

/**
 * 评测目录来自旧导出：补上容器外壳（真实设计器目录里它声明 `children` 但不进物料库，
 * 宿主 `buildAgentCatalog` 现在会把它带上）。已有就不动。
 */
function withShell(shape) {
  if (shape.materials.some((material) => material.children === true)) return shape;
  return {
    ...shape,
    materials: [
      ...shape.materials,
      {
        type: 'base.container',
        name: '容器',
        category: '基础',
        data: 'none',
        asset: false,
        children: true,
        size: { width: 320, height: 180 },
        props: {},
        roles: [],
        defaults: {
          props: {},
          style: {
            fill: 'transparent',
            borderColor: 'transparent',
            borderWidth: 1,
            opacity: 1,
            flipX: false,
            flipY: false,
          },
        },
      },
    ],
  };
}

/** 与宿主 `loadDataContext` + `enrichReferences` 同一口径。 */
async function dataContextOf(item) {
  if (item.datasets === undefined) return undefined;
  const context = await prepareIntentDataContext({
    datasetIds: item.datasets,
    port: datasetPort,
    catalog: { materials: catalog.materials, assets: [] },
    signal: AbortSignal.timeout(10_000),
  });
  const summaries = new Map(
    summarizeIntentDataContext(context).map((entry) => [entry.datasetId, entry]),
  );
  const references = item.datasets.map((datasetId) => {
    const summary = summaries.get(datasetId);
    return {
      kind: 'dataset',
      datasetId,
      ...(summary === undefined
        ? {}
        : { profile: summary.profile, candidates: summary.candidates }),
    };
  });
  return { context, references };
}

function intentCatalogOf(assets, data) {
  return {
    materials: catalog.materials,
    assets,
    ...(data === undefined || data.context.candidates.length === 0
      ? {}
      : { candidates: data.context.candidates }),
  };
}

function datasetsOf(response, data) {
  if (data === undefined) return response.datasets;
  const profiled = new Map(data.context.references.map((entry) => [entry.datasetId, entry]));
  return response.datasets.map((entry) => profiled.get(entry.datasetId) ?? entry);
}

async function runCase(item) {
  const started = Date.now();
  const data = await dataContextOf(item);
  const frames = [];
  let skeletonMs;
  let thinkingMs;
  let writingMs;
  let result;
  let error;
  // 与宿主同一口径：骨架到了装配，之后每个 item 补一帧（素材与数据集引用要等最终结果，先留占位）。
  const streamCatalog = intentCatalogOf([], data);
  const assembler = createIntentStreamAssembler(streamCatalog);
  const compileFrame = () => {
    const frame = assembler.frame();
    if (frame === undefined) return;
    const outcome = compileScreenIntent({
      intent: frame.intent,
      catalog: streamCatalog,
      mode: 'llm',
      stream: frame.stream,
    });
    if (outcome.ok) frames.push(outcome.value.document);
  };
  try {
    const response = await fetch(`${base}/agent/act/stream`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({
        text: item.text,
        scope: 'screen',
        catalog,
        ...(data === undefined ? {} : { references: data.references }),
      }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const payload = await response.json().catch(() => null);
      error = { status: response.status, ...(payload ?? {}) };
    } else {
      for await (const event of readEvents(response.body)) {
        if (event.type === 'status') {
          if (event.data.phase === 'thinking') thinkingMs ??= Date.now() - started;
          else writingMs ??= Date.now() - started;
        } else if (event.type === 'skeleton') {
          if (assembler.skeleton(event.data)) {
            skeletonMs ??= Date.now() - started;
            compileFrame();
          }
        } else if (event.type === 'item') {
          if (assembler.item(event.data.path, event.data.value)) compileFrame();
        } else if (event.type === 'result') {
          result = event.data;
        } else if (event.type === 'error') {
          error = event.data;
        }
      }
    }
  } catch (caught) {
    error = { error: caught instanceof Error ? caught.name : 'unknown' };
  }
  const meta = {
    id: item.id,
    kind: item.kind,
    text: item.text,
    skeletonMs: skeletonMs ?? null,
    thinkingMs: thinkingMs ?? null,
    writingMs: writingMs ?? null,
    frames: frames.length,
  };
  if (result === undefined) {
    return {
      ...meta,
      totalMs: Date.now() - started,
      outcome: 'error',
      error: error?.error ?? 'AGENT_STREAM_INCOMPLETE',
      message: error?.message ?? null,
    };
  }
  if (result.kind !== 'generate_screen') {
    return {
      ...meta,
      totalMs: Date.now() - started,
      outcome: result.kind,
      routedBy: result.routedBy,
      reason: result.reason ?? null,
    };
  }
  const piped = await pipeline(item, result, data);
  return {
    ...meta,
    totalMs: Date.now() - started,
    ...summarize(piped),
    ...streamChecks(frames, piped.document),
    ...(data === undefined ? {} : dataFacts(piped, data)),
    ...(args.behavior === undefined ? {} : behaviorFacts(piped, item)),
  };
}

/** 行为用例的事实：编进文档的联动 / 状态、变量与连线、行为相关告警，以及是否符合用例预期。 */
function behaviorFacts(piped, item) {
  const compiled = piped.prepared?.compiled;
  const behaviors = compiled?.behaviors ?? [];
  const warnings = (piped.prepared?.warnings ?? [])
    .map((entry) => entry.code)
    .filter((code) =>
      /^(AGENT_INTERACTION_|AGENT_STATE_|INTENT_FILTER_|INTENT_STATE_|INTENT_INTERACTION_|INTENT_KEY_)/.test(
        code,
      ),
    );
  const count = (kind) => behaviors.filter((entry) => entry.kind === kind).length;
  const expect = item.expect ?? {};
  const facts = {
    behaviors: behaviors.map(
      (entry) => `${entry.kind}:${entry.from}→${entry.to.join('+')}（${entry.detail}）`,
    ),
    filters: count('filter'),
    shows: count('show'),
    states: count('state'),
    suggested: behaviors.some((entry) => entry.suggested === true),
    variables: piped.document?.variables?.length ?? 0,
    edges: piped.document?.blueprint?.edges?.length ?? 0,
    behaviorWarnings: [...new Set(warnings)],
    // 模型写了什么联动（修复后的最终原文）：看它是否老实不写做不到的联动。
    interactionsWritten: piped.prepared?.intent?.interactions?.length ?? 0,
  };
  const checks = [
    expect.filter === undefined || facts.filters === expect.filter,
    expect.show === undefined || facts.shows === expect.show,
    expect.state === undefined || facts.states === expect.state,
    expect.suggested === undefined || facts.suggested === expect.suggested,
    expect.capabilityMissing === undefined ||
      warnings.includes('AGENT_INTERACTION_CAPABILITY_MISSING') === expect.capabilityMissing ||
      facts.interactionsWritten === 0,
  ];
  return { ...facts, asExpected: checks.every(Boolean) && piped.document !== undefined };
}

/**
 * 宿主前端那条链：原文 → 解析 + 编译 → 文档校验 → 版面审计；有值得修的诊断就带着
 * 「上一轮原文 + 按模型路径整理的诊断」回去要修复，最多 2 轮，同一组诊断连续两轮不变就提前停。
 */
/** 数据用例的额外事实：建了哪些数据源实例（带参数）、绑数据的指标卡、数据相关告警、候选用了几条。 */
function dataFacts(piped, data) {
  const document = piped.document;
  const sources = (document?.dataSources ?? [])
    .filter((entry) => entry.source?.kind === 'dataset')
    .map((entry) => {
      const params = Object.entries(entry.params ?? {})
        .map(([name, value]) => `${name}=${value?.value}`)
        .join(',');
      return `${entry.source.datasetId}(${params})`;
    });
  const bound = (document?.components ?? []).filter(
    (component) => component.dataValue?.kind === 'data-source-field' && component.name === '指标值',
  ).length;
  const warnings = (piped.prepared?.compiled === undefined ? [] : (piped.prepared.warnings ?? []))
    .map((entry) => entry.code)
    .filter((code) => /^AGENT_(DATASET|BINDING|KPI_MULTI|KPI_BIND|CANDIDATE|BIND_)/.test(code));
  return {
    profiled: data.context.profiles.map(
      (entry) => `${entry.datasetId}:${entry.sampled ? 'sampled' : 'bare'}`,
    ),
    candidates: data.context.candidates.length,
    usedCandidates: (piped.prepared?.intent?.regions ?? [])
      .flatMap((region) => [
        ...(region.blocks ?? []),
        ...(region.main ?? []),
        ...(region.rail ?? []),
      ])
      .filter((block) => block.candidate !== undefined).length,
    datasetSources: sources,
    boundKpis: bound,
    dataWarnings: [...new Set(warnings)],
    // 每一轮的样例验证：核对 / 未核对的实例数与诊断码。
    dataChecks: (piped.checks ?? []).map((entry) => ({
      round: entry.round,
      verified: entry.verified.length,
      unverified: entry.unverified.length,
      empty: entry.empty.length,
      issues: entry.issues.map((issue) => `${issue.code}@${issue.path}`),
    })),
  };
}

async function pipeline(item, first, dataContext) {
  let data = first;
  let rounds = 0;
  const checks = [];
  let calls = first.mode === 'llm' ? 1 : 0;
  let previous;
  const capacityRounds = [];
  for (;;) {
    const prepared = prepareIntent({
      output: data.output,
      catalog: intentCatalogOf(data.assets, dataContext),
      references: { assets: data.assets, datasets: datasetsOf(data, dataContext) },
      mode: data.mode,
      // 行为用例按用例给的能力表检查（缺省全部授权），与宿主上送已授权能力同口径（ADR-0115 D7）。
      ...(args.behavior === undefined
        ? {}
        : { capabilities: item.capabilities ?? ALL_CAPABILITIES }),
    });
    const issues = [...prepared.issues];
    let document;
    let audit = [];
    if (prepared.compiled !== undefined) {
      const parsed = parseScreenDocument(prepared.compiled.document);
      if (parsed.ok) {
        document = parsed.value;
        audit = auditScreenLayout(document).filter((issue) => issue.severity === 'error');
        issues.push(
          ...mapDocumentIssues(
            audit,
            document.components.map((component) => component.id),
            prepared.compiled.sources,
          ),
        );
      }
    }
    // 与宿主同一口径（ADR-0114 D6）：版面审计过了、引用了数据集时，提案前做一次样例验证。
    let check;
    if (document !== undefined && audit.length === 0 && dataContext !== undefined) {
      check = await validateIntentData({
        document,
        sources: prepared.compiled.sources,
        port: datasetPort,
        context: dataContext.context,
        signal: AbortSignal.timeout(15_000),
      });
      issues.push(...check.issues);
      checks.push({ round: rounds, ...check });
    }
    if (issues.some((issue) => issue.code === 'LAYOUT_CAPACITY_EXCEEDED'))
      capacityRounds.push(rounds);
    const view = {
      first,
      data,
      prepared,
      document,
      audit,
      rounds,
      calls,
      capacityRounds,
      issues,
      checks,
    };
    if (issues.length === 0 && document !== undefined) return { ...view, verdict: 'clean' };

    const key = repairKey(issues);
    const exhausted = issues.length === 0 || rounds >= MAX_REPAIR_ROUNDS || key === previous;
    if (exhausted) {
      // 只有样例验证没过时内容是完整的，照常交出（与宿主一致）。
      const deliverable =
        document !== undefined &&
        audit.length === 0 &&
        (prepared.issues.length === 0 || prepared.deliverable);
      return { ...view, verdict: deliverable ? 'dropped' : 'failed' };
    }
    previous = key;
    rounds += 1;
    const response = await fetch(`${base}/agent/candidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        topic: item.text,
        ...(hostScreen === undefined ? {} : { screenId: hostScreen }),
        catalog,
        ...(dataContext === undefined ? {} : { references: dataContext.references }),
        repair: { output: data.output, issues },
      }),
      signal: AbortSignal.timeout(240_000),
    });
    calls += 1;
    if (!response.ok) {
      return { ...view, rounds, calls, verdict: 'failed', repairTransport: response.status };
    }
    data = await response.json();
  }
}

function summarize(piped) {
  const { first, data, prepared, document, audit, rounds, calls, capacityRounds, issues } = piped;
  const warnings = [
    ...prepared.warnings.map((warning) => warning.code),
    ...(data.warnings ?? []).map((warning) => warning.code),
  ];
  const dropped = piped.verdict === 'dropped';
  const failed = piped.verdict === 'failed';
  const firstRoundValid =
    first.mode === 'llm' &&
    first.failure === undefined &&
    rounds === 0 &&
    piped.verdict === 'clean';
  return {
    outcome: failed ? 'failed' : first.mode === 'llm' ? 'llm' : 'deterministic',
    routedBy: first.routedBy,
    failure: first.failure ?? null,
    firstRoundValid,
    repairRounds: rounds,
    modelCalls: calls,
    droppedBlocks: dropped,
    failedIssues: failed
      ? [
          ...(piped.repairTransport === undefined ? [] : [`repair-http-${piped.repairTransport}`]),
          ...issues.map((issue) => `${issue.code}@${issue.path}`),
        ]
      : [],
    capacityConflicts: capacityRounds.length,
    warnings: [...new Set(warnings)],
    substituted: warnings.includes('INTENT_BLOCK_SUBSTITUTED'),
    regions: prepared.intent?.regions.map((region) => region.kind).join('+') ?? '—',
    shells:
      document?.components.filter((component) => component.type === 'base.container').length ?? 0,
    components: document?.components.length ?? 0,
    sampleValues: document === undefined ? 0 : listSampleValueRefs(document).length,
    layoutErrors: audit.length,
    layoutCodes: [...new Set(audit.map((issue) => issue.code))],
    parseOk: document !== undefined,
    ...contentFacts(document, prepared.intent),
  };
}

/** 供人工核对的内容事实：标题、用到的物料、增减量的方向与色位、语言（边界用例要看这些）。 */
function contentFacts(document, intent) {
  if (document === undefined) return {};
  const textOf = (component) => {
    const value = component?.dataValue;
    return value?.kind === 'inline' && typeof value.value === 'string' ? value.value : '';
  };
  const byId = (id) => document.components.find((component) => component.id === id);
  const deltas = document.components
    .filter((component) => component.name === '同比')
    .map((component) => `${textOf(component)}@${component.style?.color ?? ''}`);
  const blockTypes = [
    ...new Set(
      document.components
        .filter((component) => /^agent-(block-\d+|r\d+-[bms]\d+)-/.test(component.id))
        .map((component) => component.type)
        .filter((type) => type !== 'base.container'),
    ),
  ];
  const title = textOf(byId('agent-title-0'));
  return {
    title,
    blockTypes,
    deltas,
    // 英文用例要看到英文标题；中文用例不该出现英文标题。
    titleLanguage: /[一-鿿]/.test(title) ? 'zh' : 'en',
    style: intent?.style ?? null,
  };
}

/**
 * 流式帧检查：与宿主 `compileStreamDelta` 同一口径——帧之间共有的组件必须一字不差；
 * 最后一帧与最终候选之间也接得上，宿主才能原地收尾，否则要整屏替换一次。
 */
function streamChecks(frames, final) {
  if (frames.length === 0 || final === undefined) {
    return { stable: null, finishInPlace: false, finishDiff: [] };
  }
  const sequence = [...frames, final];
  let stable = true;
  let finishInPlace = true;
  for (let index = 1; index < sequence.length; index += 1) {
    if (!sharedUnchanged(sequence[index - 1], sequence[index])) {
      if (index < sequence.length - 1) stable = false;
      else finishInPlace = false;
    }
  }
  // 原地收尾失败时记下是哪些共有组件的哪些字段对不上：几何不变与收尾是两件事，要分开查原因。
  const finishDiff = finishInPlace
    ? []
    : changedShared(sequence[sequence.length - 2], final).slice(0, 8);
  return { stable, finishInPlace, finishDiff };
}

function changedShared(previous, next) {
  const rows = [];
  if (JSON.stringify(previous.canvas) !== JSON.stringify(next.canvas)) {
    rows.push({ id: '(canvas)', fields: ['canvas'] });
  }
  const before = new Map(previous.components.map((component) => [component.id, component]));
  for (const component of next.components) {
    const old = before.get(component.id);
    if (old === undefined) continue;
    const fields = [...new Set([...Object.keys(old), ...Object.keys(component)])].filter(
      (key) => JSON.stringify(old[key]) !== JSON.stringify(component[key]),
    );
    if (fields.length > 0) {
      rows.push({
        id: component.id,
        fields,
        before: fields.map((key) => JSON.stringify(old[key])?.slice(0, 80)),
        after: fields.map((key) => JSON.stringify(component[key])?.slice(0, 80)),
      });
    }
  }
  return rows;
}

function sharedUnchanged(previous, next) {
  return changedShared(previous, next).length === 0;
}

async function* readEvents(stream) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let separator = /\r?\n\r?\n/.exec(buffer);
    while (separator !== null) {
      const block = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      const type = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim();
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (type !== undefined && data !== '') yield { type, data: JSON.parse(data) };
      separator = /\r?\n\r?\n/.exec(buffer);
    }
  }
}

function renderTable(rows) {
  const lines = [
    '| 用例 | 类型 | 结果 | 首轮合法 | 修复轮 | 模型调用 | 带问题交出 | 容量冲突 | 版面 | 外壳 | 缺口说明 | 示例数据 | LAYOUT 违规 | 思考 | 首个占位 | 完成 | 帧数 | 几何不变 | 原地收尾 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const seconds = (ms) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`);
    const yes = (value) => (value === true ? '是' : value === false ? '否' : '—');
    const outcome =
      row.outcome === 'error'
        ? `失败 \`${row.error}\``
        : row.outcome === 'failed'
          ? `未交出 \`${(row.failedIssues ?? []).slice(0, 2).join(' ')}\``
          : row.outcome === 'llm' || row.outcome === 'deterministic'
            ? `${row.outcome}${row.failure ? ` \`${row.failure}\`` : ''}`
            : `${row.outcome}${row.reason ? `（${row.reason}）` : ''}`;
    lines.push(
      [
        row.id,
        row.kind,
        outcome,
        yes(row.firstRoundValid),
        row.repairRounds ?? '—',
        row.modelCalls ?? '—',
        yes(row.droppedBlocks),
        row.capacityConflicts ?? '—',
        row.regions ?? '—',
        row.shells ?? '—',
        yes(row.substituted),
        row.sampleValues ?? '—',
        row.layoutErrors === undefined
          ? '—'
          : `${row.layoutErrors}${row.layoutCodes?.length ? ` ${row.layoutCodes.join('/')}` : ''}`,
        seconds(row.writingMs),
        seconds(row.skeletonMs),
        seconds(row.totalMs),
        row.frames,
        yes(row.stable),
        yes(row.finishInPlace),
      ]
        .map(String)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }
  return lines.join('\n');
}

function renderSummary(rows) {
  const generated = rows.filter((row) => row.outcome === 'llm' || row.outcome === 'deterministic');
  const count = (predicate) => rows.filter(predicate).length;
  const median = (values) => {
    const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    return sorted[Math.floor(sorted.length / 2)];
  };
  const seconds = (ms) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
  const layouts = new Map();
  for (const row of generated) layouts.set(row.regions, (layouts.get(row.regions) ?? 0) + 1);
  const unfinished = rows.filter(
    (row) => row.finishInPlace === false && row.finishDiff?.length > 0,
  );
  const diffLines = unfinished.flatMap((row) => [
    `- 未能原地收尾：${row.id}（共有组件里对不上的）：`,
    ...row.finishDiff.map(
      (item) =>
        `  - ${item.id}：${item.fields.join('、')}${item.before ? `（${item.before[0]} → ${item.after[0]}）` : ''}`,
    ),
  ]);
  return [
    '',
    ...diffLines,
    `- 用例 ${rows.length} 条：交出候选 ${generated.length}，未交出 ${count((row) => row.outcome === 'failed')}，传输失败 ${count((row) => row.outcome === 'error')}，其他 ${rows.length - generated.length - count((row) => row.outcome === 'failed') - count((row) => row.outcome === 'error')}`,
    `- 首轮合法 ${count((row) => row.firstRoundValid === true)} / ${rows.length}；修复轮合计 ${generated.reduce((sum, row) => sum + (row.repairRounds ?? 0), 0)}；模型调用合计 ${generated.reduce((sum, row) => sum + (row.modelCalls ?? 0), 0)}`,
    `- 带问题交出（修不好、去掉或保留降级项）${count((row) => row.droppedBlocks === true)} 条；容量冲突 ${generated.reduce((sum, row) => sum + (row.capacityConflicts ?? 0), 0)} 次；LAYOUT 违规 ${generated.reduce((sum, row) => sum + (row.layoutErrors ?? 0), 0)} 处；示例数据合计 ${generated.reduce((sum, row) => sum + (row.sampleValues ?? 0), 0)} 处`,
    `- 版面：${[...layouts].map(([kind, n]) => `${kind} ×${n}`).join('；') || '—'}；外壳合计 ${generated.reduce((sum, row) => sum + (row.shells ?? 0), 0)}；缺口说明 ${count((row) => row.substituted === true)} 条`,
    `- 思考中位数 ${seconds(median(rows.map((row) => row.writingMs)))}，首个占位中位数 ${seconds(median(rows.map((row) => row.skeletonMs)))}，完成中位数 ${seconds(median(rows.map((row) => row.totalMs)))}`,
    `- 几何不变 ${count((row) => row.stable === true)} / ${count((row) => row.stable !== null && row.stable !== undefined)}；原地收尾 ${count((row) => row.finishInPlace === true)} / ${generated.length}`,
  ].join('\n');
}

function readArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key?.startsWith('--')) {
      output[key.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return output;
}
