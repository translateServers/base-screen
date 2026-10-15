import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SCHEMA_VERSION = 1;

export const LOCAL_ROOT = '.base-screen/local';
export const SCRATCH_ROOT = `${LOCAL_ROOT}/scratch`;
export const METRICS_ROOT = `${LOCAL_ROOT}/metrics`;
export const SCOPE_SCRATCH_DIR = `${SCRATCH_ROOT}/test-scope`;
export const AUDIT_SCRATCH_DIR = `${SCRATCH_ROOT}/test-audit`;
export const TAG_SCRATCH_DIR = `${SCRATCH_ROOT}/test-tag`;

export const DEFAULT_PLAN_OUT = `${SCOPE_SCRATCH_DIR}/plan.json`;
export const DEFAULT_REPORT_OUT = `${SCOPE_SCRATCH_DIR}/report.json`;
export const DEFAULT_AUDIT_OUT = `${AUDIT_SCRATCH_DIR}/report.json`;
export const DEFAULT_TAG_OUT = `${TAG_SCRATCH_DIR}/suggestions.json`;
export const SELECTION_HISTORY_PATH = `${METRICS_ROOT}/selection-history.jsonl`;
export const FULL_BASELINE_PATH = `${METRICS_ROOT}/baseline-full.json`;

/**
 * 把 JSON 数据以 UTF-8 写入绝对路径（自动创建父目录），供所有 CLI 产物落盘复用。
 */
export function writeJsonFile(absolutePath, data) {
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * 把 UTF-8 文本写入绝对路径（自动创建父目录），供 Markdown 摘要等产物落盘复用。
 */
export function writeTextFile(absolutePath, text) {
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, 'utf8');
}

/**
 * 读取一个 JSON 文件；文件不存在或内容非法时返回 undefined。
 */
export function readJsonFile(absolutePath) {
  if (!existsSync(absolutePath)) return undefined;
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * 追加一条选择历史记录（JSONL）到 metrics 沉淀目录，供 NO_SELECTION_90D 审计规则消费。
 */
export function appendSelectionHistory(rootDir, entry) {
  const target = join(rootDir, SELECTION_HISTORY_PATH);
  mkdirSync(dirname(target), { recursive: true });
  appendFileSync(target, `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * 读取选择历史，返回 Map<repo 相对路径（posix），最近一次被选中的 ISO 时间>。
 */
export function loadSelectionHistory(rootDir) {
  const target = join(rootDir, SELECTION_HISTORY_PATH);
  if (!existsSync(target)) return new Map();
  const latest = new Map();
  for (const line of readFileSync(target, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const files = [...(entry.engineTestFiles ?? []), ...(entry.rootGovernanceTests ?? [])];
    for (const file of files) {
      const previous = latest.get(file);
      if (previous === undefined || entry.generatedAt > previous) {
        latest.set(file, entry.generatedAt);
      }
    }
  }
  return latest;
}

function expectArray(value, issues, field) {
  if (!Array.isArray(value)) issues.push(`${field} 应为数组`);
}

function expectObject(value, issues, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${field} 应为对象`);
  }
}

/**
 * 校验计划 JSON 契约（§3.2），返回问题列表；空数组表示合法。
 */
export function validateScopePlan(plan) {
  const issues = [];
  if (plan === null || typeof plan !== 'object') return ['plan 应为对象'];
  if (plan.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`schema 版本号应为 ${SCHEMA_VERSION}`);
  }
  if (typeof plan.generatedAt !== 'string') issues.push('generatedAt 应为字符串');
  if (plan.mode !== 'dry-run' && plan.mode !== 'execute')
    issues.push('mode 应为 dry-run 或 execute');
  if (plan.trigger !== 'agent' && plan.trigger !== 'human')
    issues.push('trigger 应为 agent 或 human');
  expectObject(plan.diff, issues, 'diff');
  if (typeof plan.diff?.sinceRef !== 'string') issues.push('diff.sinceRef 应为字符串');
  expectArray(plan.diff?.changedFiles, issues, 'diff.changedFiles');
  expectObject(plan.diff?.byPackage, issues, 'diff.byPackage');
  expectObject(plan.closure, issues, 'closure');
  expectArray(plan.closure?.affectedPackages, issues, 'closure.affectedPackages');
  expectObject(plan.closure?.engineFileScope, issues, 'closure.engineFileScope');
  const scope = plan.closure?.engineFileScope;
  if (scope && scope.precision !== 'file' && scope.precision !== 'package') {
    issues.push('closure.engineFileScope.precision 应为 file 或 package');
  }
  expectObject(plan.governance, issues, 'governance');
  if (typeof plan.governance?.runRootTests !== 'boolean') {
    issues.push('governance.runRootTests 应为布尔值');
  }
  expectArray(plan.governance?.reasons, issues, 'governance.reasons');
  expectObject(plan.selection, issues, 'selection');
  expectArray(plan.selection?.packages, issues, 'selection.packages');
  expectArray(plan.selection?.engineTestFiles, issues, 'selection.engineTestFiles');
  expectArray(plan.selection?.rootGovernanceTests, issues, 'selection.rootGovernanceTests');
  expectArray(plan.selection?.vitestArgs, issues, 'selection.vitestArgs');
  if (!Number.isInteger(plan.selection?.estimatedFiles)) {
    issues.push('selection.estimatedFiles 应为整数');
  }
  expectArray(plan.selection?.skipped, issues, 'selection.skipped');
  for (const [index, entry] of (plan.selection?.skipped ?? []).entries()) {
    if (typeof entry?.target !== 'string' || typeof entry?.reason !== 'string') {
      issues.push(`selection.skipped[${index}] 应含 target 与 reason 字符串`);
    }
  }
  return issues;
}

/**
 * 校验执行报告 JSON 契约（§3.2），返回问题列表。
 */
export function validateExecutionReport(report) {
  const issues = [];
  if (report === null || typeof report !== 'object') return ['report 应为对象'];
  if (report.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`schema 版本号应为 ${SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(report.exitCode)) issues.push('exitCode 应为整数');
  if (!Number.isInteger(report.wallClockMs)) issues.push('wallClockMs 应为整数');
  expectObject(report.turbo, issues, 'turbo');
  expectArray(report.turbo?.tasks, issues, 'turbo.tasks');
  expectObject(report.vitest, issues, 'vitest');
  for (const field of ['testFiles', 'tests', 'failed', 'durationMs']) {
    if (!Number.isInteger(report.vitest?.[field])) issues.push(`vitest.${field} 应为整数`);
  }
  expectObject(report.metrics, issues, 'metrics');
  return issues;
}

/**
 * 校验审计报告 JSON 契约（§3.2），返回问题列表。
 */
export function validateAuditReport(report) {
  const issues = [];
  if (report === null || typeof report !== 'object') return ['report 应为对象'];
  if (report.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`schema 版本号应为 ${SCHEMA_VERSION}`);
  }
  expectObject(report.summary, issues, 'summary');
  for (const field of ['totalTestFiles', 'unusedCount', 'duplicateGroupCount', 'staleCount']) {
    if (!Number.isInteger(report.summary?.[field])) issues.push(`summary.${field} 应为整数`);
  }
  const UNUSED_RULES = new Set(['SOURCE_DELETED', 'NO_SELECTION_90D', 'API_UNRESOLVED']);
  expectArray(report.unused, issues, 'unused');
  for (const [index, entry] of (report.unused ?? []).entries()) {
    if (typeof entry?.file !== 'string' || !UNUSED_RULES.has(entry?.rule)) {
      issues.push(`unused[${index}] 的 file/rule 不合法`);
    }
  }
  expectArray(report.duplicates, issues, 'duplicates');
  for (const [index, entry] of (report.duplicates ?? []).entries()) {
    if (!Array.isArray(entry?.files) || entry.files.length < 2) {
      issues.push(`duplicates[${index}] 应含至少两个文件`);
    }
  }
  const STALE_RULES = new Set(['LONG_SKIP', 'TODO_ONLY', 'EMPTY_ASSERT']);
  expectArray(report.stale, issues, 'stale');
  for (const [index, entry] of (report.stale ?? []).entries()) {
    if (typeof entry?.file !== 'string' || !STALE_RULES.has(entry?.rule)) {
      issues.push(`stale[${index}] 的 file/rule 不合法`);
    }
  }
  return issues;
}

/**
 * 计划文件构造（§3.1 ScopePlan）。
 */
export function createScopePlan({ mode, trigger, diff, closure, governance, selection }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    trigger,
    diff,
    closure,
    governance,
    selection,
  };
}

/**
 * 执行报告构造（§3.1 ExecutionReport）。
 */
export function createExecutionReport({ planPath, exitCode, wallClockMs, turbo, vitest, metrics }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    planPath,
    exitCode,
    wallClockMs,
    turbo,
    vitest,
    metrics,
  };
}

/**
 * 审计报告构造（§3.1 AuditReport）。
 */
export function createAuditReport({ summary, unused, duplicates, stale }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    summary,
    unused,
    duplicates,
    stale,
  };
}
