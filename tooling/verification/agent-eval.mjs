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
  createIntentStreamAssembler,
  mapDocumentIssues,
  prepareIntent,
  repairKey,
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

const args = readArgs(process.argv.slice(2));
const base = (args.base ?? 'http://127.0.0.1:3000/api').replace(/\/+$/, '');
const catalog = withShell(
  JSON.parse(readFileSync(resolve(here, 'agent-eval-catalog.json'), 'utf8')),
);
const only = args.only === undefined ? undefined : new Set(args.only.split(','));
const cases = AGENT_EVAL_CASES.filter((item) => only === undefined || only.has(item.id));

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
if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(results, null, 2)}\n`);

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

async function runCase(item) {
  const started = Date.now();
  const frames = [];
  let skeletonMs;
  let thinkingMs;
  let writingMs;
  let result;
  let error;
  // 与宿主同一口径：骨架到了装配，之后每个 item 补一帧（素材与数据集引用要等最终结果，先留占位）。
  const streamCatalog = { materials: catalog.materials, assets: [] };
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
      body: JSON.stringify({ text: item.text, scope: 'screen', catalog }),
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
  const piped = await pipeline(item, result);
  return {
    ...meta,
    totalMs: Date.now() - started,
    ...summarize(piped),
    ...streamChecks(frames, piped.document),
  };
}

/**
 * 宿主前端那条链：原文 → 解析 + 编译 → 文档校验 → 版面审计；有值得修的诊断就带着
 * 「上一轮原文 + 按模型路径整理的诊断」回去要修复，最多 2 轮，同一组诊断连续两轮不变就提前停。
 */
async function pipeline(item, first) {
  let data = first;
  let rounds = 0;
  let calls = first.mode === 'llm' ? 1 : 0;
  let previous;
  const capacityRounds = [];
  for (;;) {
    const prepared = prepareIntent({
      output: data.output,
      catalog: { materials: catalog.materials, assets: data.assets },
      references: { assets: data.assets, datasets: data.datasets },
      mode: data.mode,
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
    if (issues.some((issue) => issue.code === 'LAYOUT_CAPACITY_EXCEEDED'))
      capacityRounds.push(rounds);
    const view = { first, data, prepared, document, audit, rounds, calls, capacityRounds, issues };
    if (issues.length === 0 && document !== undefined) return { ...view, verdict: 'clean' };

    const key = repairKey(issues);
    const exhausted = issues.length === 0 || rounds >= MAX_REPAIR_ROUNDS || key === previous;
    if (exhausted) {
      const deliverable = document !== undefined && audit.length === 0 && prepared.deliverable;
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
  if (frames.length === 0 || final === undefined) return { stable: null, finishInPlace: false };
  const sequence = [...frames, final];
  let stable = true;
  for (let index = 1; index < sequence.length; index += 1) {
    if (!sharedUnchanged(sequence[index - 1], sequence[index])) {
      if (index < sequence.length - 1) stable = false;
      else return { stable, finishInPlace: false };
    }
  }
  return { stable, finishInPlace: true };
}

function sharedUnchanged(previous, next) {
  if (JSON.stringify(previous.canvas) !== JSON.stringify(next.canvas)) return false;
  const before = new Map(previous.components.map((component) => [component.id, component]));
  return next.components.every((component) => {
    const old = before.get(component.id);
    return old === undefined || JSON.stringify(old) === JSON.stringify(component);
  });
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
  return [
    '',
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
