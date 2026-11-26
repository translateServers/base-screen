#!/usr/bin/env node
/**
 * 智能体整屏生成评测（ADR-0112 §2.7 / S6）。
 *
 * 对运行中的示例后端逐条发 `POST /agent/act/stream`，记录每条用例：
 * - 首轮合法率（没有修复、没有失败码、走了模型）、修复轮数、模型调用次数；
 * - 收尾时去掉的块（`AGENT_BLOCKS_DROPPED`）、示例数据处数、`LAYOUT_*` 违规数；
 * - 首个占位出现时间（skeleton 事件）与完成时间（result 事件）；
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
const { parseScreenDocument } = await import(
  pathToFileURL(resolve(root, 'packages/contracts/dist/index.js')).href
);
const { auditScreenLayout, listSampleValueRefs } = await import(
  pathToFileURL(resolve(root, 'packages/core/dist/index.js')).href
);

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
];

const args = readArgs(process.argv.slice(2));
const base = (args.base ?? 'http://127.0.0.1:3000/api').replace(/\/+$/, '');
const catalog = JSON.parse(readFileSync(resolve(here, 'agent-eval-catalog.json'), 'utf8'));
const only = args.only === undefined ? undefined : new Set(args.only.split(','));
const cases = AGENT_EVAL_CASES.filter((item) => only === undefined || only.has(item.id));

const results = [];
for (const item of cases) {
  process.stderr.write(`· ${item.id} … `);
  const result = await runCase(item);
  results.push(result);
  process.stderr.write(`${result.outcome} ${(result.totalMs / 1000).toFixed(1)}s\n`);
}
console.log(renderTable(results));
console.log(renderSummary(results));
if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(results, null, 2)}\n`);

async function runCase(item) {
  const started = Date.now();
  const frames = [];
  let skeletonMs;
  let result;
  let error;
  try {
    const response = await fetch(`${base}/agent/act/stream`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ text: item.text, scope: 'screen', catalog }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const payload = await response.json().catch(() => null);
      error = { status: response.status, ...(payload ?? {}) };
    } else {
      for await (const event of readEvents(response.body)) {
        if (event.type === 'skeleton' || event.type === 'progress') {
          skeletonMs ??= Date.now() - started;
          frames.push(event.data.document);
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
  const totalMs = Date.now() - started;
  return summarize(item, { frames, skeletonMs, totalMs, result, error });
}

function summarize(item, run) {
  const base = {
    id: item.id,
    kind: item.kind,
    text: item.text,
    totalMs: run.totalMs,
    skeletonMs: run.skeletonMs ?? null,
    frames: run.frames.length,
  };
  if (run.result === undefined) {
    return {
      ...base,
      outcome: 'error',
      error: run.error?.error ?? 'AGENT_STREAM_INCOMPLETE',
      message: run.error?.message ?? null,
      repairRounds: run.error?.repairRounds ?? null,
    };
  }
  const result = run.result;
  if (result.kind !== 'generate_screen') {
    return {
      ...base,
      outcome: result.kind,
      routedBy: result.routedBy,
      reason: result.reason ?? null,
    };
  }
  const parsed = parseScreenDocument(result.document);
  const document = parsed.ok ? parsed.value : undefined;
  const audit =
    document === undefined
      ? []
      : auditScreenLayout(document).filter((issue) => issue.severity === 'error');
  const warnings = (result.warnings ?? []).map((warning) => warning.code);
  const repairRounds = result.repairRounds ?? 0;
  const firstRoundValid =
    result.mode === 'llm' && result.failure === undefined && repairRounds === 0;
  return {
    ...base,
    outcome: result.mode === 'llm' ? 'llm' : 'deterministic',
    routedBy: result.routedBy,
    failure: result.failure ?? null,
    firstRoundValid,
    repairRounds,
    modelCalls: result.mode === 'llm' ? 1 + repairRounds : 0,
    droppedBlocks: warnings.includes('AGENT_BLOCKS_DROPPED'),
    warnings,
    components: document?.components.length ?? 0,
    sampleValues: document === undefined ? 0 : listSampleValueRefs(document).length,
    layoutErrors: audit.length,
    layoutCodes: [...new Set(audit.map((issue) => issue.code))],
    parseOk: parsed.ok,
    ...contentFacts(document),
    ...streamChecks(run.frames, result.document),
  };
}

/** 供人工核对的内容事实：标题、用到的物料、增减量的方向与色位（边界用例要看这些）。 */
function contentFacts(document) {
  if (document === undefined) return {};
  const textOf = (component) => {
    const value = component?.dataValue;
    return value?.kind === 'inline' && typeof value.value === 'string' ? value.value : '';
  };
  const byId = (id) => document.components.find((component) => component.id === id);
  const deltas = document.components
    .filter((component) => /^agent-kpi-\d+-\d+$/.test(component.id) && component.name === '同比')
    .map((component) => `${textOf(component)}@${component.style?.color ?? ''}`);
  return {
    title: textOf(byId('agent-title-0')),
    blockTypes: [
      ...new Set(
        document.components
          .filter((component) => /^agent-block-\d+-/.test(component.id))
          .map((component) => component.type),
      ),
    ],
    deltas,
  };
}

/**
 * 流式帧检查：与宿主 `compileStreamDelta` 同一口径——帧之间共有的组件必须一字不差；
 * 最后一帧与最终候选之间也接得上，宿主才能原地收尾，否则要整屏替换一次。
 */
function streamChecks(frames, final) {
  if (frames.length === 0) return { stable: null, finishInPlace: false };
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
    '| 用例 | 类型 | 结果 | 首轮合法 | 修复轮 | 模型调用 | 去块 | 示例数据 | LAYOUT 违规 | 首个占位 | 完成 | 帧数 | 几何不变 | 原地收尾 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const seconds = (ms) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`);
    const yes = (value) => (value === true ? '是' : value === false ? '否' : '—');
    const outcome =
      row.outcome === 'error'
        ? `失败 \`${row.error}\``
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
        row.sampleValues ?? '—',
        row.layoutErrors === undefined
          ? '—'
          : `${row.layoutErrors}${row.layoutCodes?.length ? ` ${row.layoutCodes.join('/')}` : ''}`,
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
  return [
    '',
    `- 用例 ${rows.length} 条：产出候选 ${generated.length}，失败 ${count((row) => row.outcome === 'error')}，其他 ${rows.length - generated.length - count((row) => row.outcome === 'error')}`,
    `- 首轮合法 ${count((row) => row.firstRoundValid === true)} / ${rows.length}；修复轮合计 ${generated.reduce((sum, row) => sum + (row.repairRounds ?? 0), 0)}；模型调用合计 ${generated.reduce((sum, row) => sum + (row.modelCalls ?? 0), 0)}`,
    `- 去块 ${count((row) => row.droppedBlocks === true)} 条；LAYOUT 违规 ${generated.reduce((sum, row) => sum + (row.layoutErrors ?? 0), 0)} 处；示例数据合计 ${generated.reduce((sum, row) => sum + (row.sampleValues ?? 0), 0)} 处`,
    `- 首个占位中位数 ${seconds(median(rows.map((row) => row.skeletonMs)))}，完成中位数 ${seconds(median(rows.map((row) => row.totalMs)))}`,
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
