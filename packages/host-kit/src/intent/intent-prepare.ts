import type { IntentCatalog } from './intent-catalog.js';
import { compileScreenIntent } from './intent-compile.js';
import type { IntentCompileResult, IntentReferences } from './intent-compile-types.js';
import { parseScreenIntent } from './intent-parse.js';
import type { IntentDiagnostic, ScreenIntent } from './intent-types.js';

/**
 * 从模型原文到可提交文档的一站式准备（ADR-0113 §2.7）。
 *
 * 宿主前端做整条链：解析 → 编译（含布局求解）→ 把「值得请模型修的诊断」按模型原文路径整理出来。
 * 后端只管模型调用与重试；修复回环由宿主驱动，最多 2 轮（ADR-0112 §2.1）。
 */

export interface IntentRepairIssue {
  /** 诊断码：解析的 `AGENT_*` / `INTENT_*`，编译的 `LAYOUT_CAPACITY_EXCEEDED`，审计的 `LAYOUT_*`。 */
  readonly code: string;
  /** 模型原文里的路径；空串表示整份输出。 */
  readonly path: string;
}

export interface PrepareIntentInput {
  /** 模型原文（JSON 文本）。 */
  readonly output: string;
  readonly catalog: IntentCatalog;
  readonly references?: IntentReferences;
  readonly mode: 'llm' | 'deterministic';
}

export interface PreparedIntent {
  readonly intent: ScreenIntent | undefined;
  readonly compiled: IntentCompileResult | undefined;
  /** 值得请模型修的诊断（去重）：解析丢弃的项、容量冲突、列满足不了绑定角色的空图。 */
  readonly issues: readonly IntentRepairIssue[];
  /** 解析期收敛 + 编译期降级的告警，宿主在提案理由里如实说明。 */
  readonly warnings: readonly IntentDiagnostic[];
  /**
   * 问题只在单个指标 / 块上、其余内容可用：修不好时可以交出剩余内容并说明。
   * 整份不可用、容量冲突、没有任何可用块都不算。
   */
  readonly deliverable: boolean;
}

/** 单个指标 / 块的路径：这类问题可以「去掉那一项」收尾。 */
const ITEM_PATH =
  /^(?:kpis\[\d+\]|blocks\[\d+\]|regions\[\d+\]\.(?:items|blocks|main|rail)\[\d+\])$/;

/** 编译期降级但值得修的码：块还在、只是退成了空图。 */
const COMPILE_REPAIRABLE = new Set(['AGENT_BLOCK_BINDING_UNSATISFIED']);

export function prepareIntent(input: PrepareIntentInput): PreparedIntent {
  const parsed = parseScreenIntent(input.output, {
    catalog: input.catalog,
    placeholders: input.mode === 'deterministic',
  });
  const warnings: IntentDiagnostic[] = parsed.diagnostics.filter(
    (item) => item.severity === 'warning',
  );
  const issues: IntentRepairIssue[] = parsed.diagnostics
    .filter((item) => item.severity === 'error')
    .map((item) => ({ code: item.code, path: item.path }));

  if (parsed.intent === undefined) {
    return {
      intent: undefined,
      compiled: undefined,
      issues: dedupe(issues),
      warnings,
      deliverable: false,
    };
  }

  const outcome = compileScreenIntent({
    intent: parsed.intent,
    catalog: input.catalog,
    mode: input.mode,
    ...(input.references === undefined ? {} : { references: input.references }),
  });
  if (!outcome.ok) {
    for (const item of outcome.diagnostics) issues.push({ code: item.code, path: item.path });
    return {
      intent: parsed.intent,
      compiled: undefined,
      issues: dedupe(issues),
      warnings,
      deliverable: false,
    };
  }
  for (const item of outcome.value.warnings) {
    warnings.push(item);
    if (COMPILE_REPAIRABLE.has(item.code)) issues.push({ code: item.code, path: item.path });
  }
  const unique = dedupe(issues);
  return {
    intent: parsed.intent,
    compiled: outcome.value,
    issues: unique,
    warnings,
    deliverable: unique.every((issue) => ITEM_PATH.test(issue.path)),
  };
}

/** 同一组诊断（码 + 路径）连续两轮不变就提前停：模型在原地打转，再修也没用。 */
export function repairKey(issues: readonly IntentRepairIssue[]): string {
  return issues
    .map((issue) => `${issue.code}@${issue.path}`)
    .sort()
    .join('|');
}

/**
 * 把文档诊断（版面审计、引擎拒绝）的文档路径翻回模型原文路径。
 *
 * `sources` 是编译器记下的「组件 id → 模型原文路径」；路径不以 `components[i]` 开头、
 * 或那个组件不在来源表里的，一律归到整份输出——宁可让模型整份重看，也不指错地方。
 */
export function mapDocumentIssues(
  diagnostics: readonly {
    readonly severity: string;
    readonly code: string;
    readonly path: readonly (string | number)[];
  }[],
  componentIds: readonly string[],
  sources: Readonly<Record<string, string>>,
): IntentRepairIssue[] {
  const issues: IntentRepairIssue[] = [];
  for (const item of diagnostics) {
    if (item.severity !== 'error' || item.code.startsWith('CHANGE_')) continue;
    const [head, index] = item.path;
    const id = head === 'components' && typeof index === 'number' ? componentIds[index] : undefined;
    issues.push({ code: item.code, path: id === undefined ? '' : (sources[id] ?? '') });
  }
  return dedupe(issues);
}

function dedupe(issues: readonly IntentRepairIssue[]): IntentRepairIssue[] {
  const seen = new Set<string>();
  const output: IntentRepairIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}@${issue.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(issue);
    if (output.length >= 100) break;
  }
  return output;
}
