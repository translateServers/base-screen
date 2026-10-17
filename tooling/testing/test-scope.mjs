#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PACKAGE_DEFINITIONS } from '../checks/packages.mjs';
import {
  buildEngineFileMap,
  categorizeSkipped,
  collectDiff,
  countPackageTestFiles,
  countRootTestFiles,
  downstreamClosure,
  filterEngineTests,
  getRepoRoot,
  isValidGitRef,
  mapToPackages,
  resolveGovernance,
  reverseDependencyGraph,
  workspaceDependencyGraph,
} from '../lib/scope-graph.mjs';
import {
  appendSelectionHistory,
  createExecutionReport,
  createScopePlan,
  DEFAULT_PLAN_OUT,
  DEFAULT_REPORT_OUT,
  FULL_BASELINE_PATH,
  readJsonFile,
  writeJsonFile,
} from '../lib/scope-report.mjs';

export const EXIT_OK = 0;
export const EXIT_TESTS_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_SCOPE_ERROR = 3;

const CLI_OPTIONS = {
  since: { type: 'string' },
  changed: { type: 'string', multiple: true },
  file: { type: 'string' },
  test: { type: 'string' },
  package: { type: 'string', multiple: true },
  tags: { type: 'string' },
  'exclude-tags': { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
  force: { type: 'boolean', default: false },
  full: { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  'plan-out': { type: 'string' },
  'report-out': { type: 'string' },
  trigger: { type: 'string', default: 'human' },
};

function failUsage(message) {
  return { error: message, exitCode: EXIT_USAGE };
}

function packageNameToDir(name) {
  if (PACKAGE_DEFINITIONS[name]) return name;
  return Object.entries(PACKAGE_DEFINITIONS).find(
    ([, definition]) => definition.name === name,
  )?.[0];
}

/**
 * 解析并校验 CLI 参数（§3.3/§3.4）。返回 { values, packages } 或 { error, exitCode }。
 */
export function parseScopeArgs(argv) {
  let values;
  try {
    values = parseArgs({ options: CLI_OPTIONS, allowPositionals: false, args: argv }).values;
  } catch (error) {
    return failUsage(`参数解析失败：${error.message}`);
  }

  const trigger = values.trigger;
  if (trigger !== 'agent' && trigger !== 'human') {
    return failUsage(`--trigger 只接受 agent 或 human，收到：${trigger}`);
  }

  const hasSince = Boolean(values.since);
  const hasChanged = (values.changed ?? []).length > 0;
  const hasPackage = (values.package ?? []).length > 0;
  if (!values.full && !hasSince && !hasChanged && !hasPackage) {
    return failUsage('需要 --since、--changed、--package 或 --full 之一作为变更来源');
  }
  if (hasSince && (hasChanged || values.full)) {
    return failUsage('--since 与 --changed/--full 互斥');
  }
  if (hasChanged && values.full) {
    return failUsage('--changed 与 --full 互斥');
  }

  const packages = [];
  for (const name of values.package ?? []) {
    const dir = packageNameToDir(name);
    if (!dir) return failUsage(`未知包名：${name}（可用 @base-screen/* 全名或目录名）`);
    packages.push(dir);
  }

  // --changed 是 agent 显式声明改动面的入口：路径写错绝不能静默落入 skipped 造成漏跑假象。
  for (const changed of values.changed ?? []) {
    if (!existsSync(join(getRepoRoot(), changed))) {
      return failUsage(`--changed 路径不存在：${changed}（相对仓库根解析）`);
    }
  }

  return { values, packages };
}

function buildVitestPassthrough(values) {
  const passthrough = [];
  if (values.file) passthrough.push(values.file);
  if (values.test) passthrough.push('-t', values.test);
  if (values.tags) passthrough.push('--tags', values.tags);
  if (values['exclude-tags']) passthrough.push('--exclude-tags', values['exclude-tags']);
  return passthrough;
}

function diffSourceLabel(values) {
  if (values.full) return '--full';
  if ((values.changed ?? []).length > 0) return '--changed';
  if ((values.package ?? []).length > 0) return '--package';
  return values.since;
}

/**
 * 闭包计算 + 计划构造（不执行）。闭包层异常向调用方抛出（main 捕获后退出码 3）。
 */
export function buildScopePlan(values, packages, context) {
  const { root, config } = context;

  let changedFiles = [];
  if (!values.full) {
    changedFiles = values.changed?.length ? [...values.changed].sort() : collectDiff(values.since);
  }

  const { byPackage, other } = mapToPackages(changedFiles);
  const reverse = reverseDependencyGraph(workspaceDependencyGraph(root));
  const affected = values.full
    ? Object.keys(PACKAGE_DEFINITIONS).sort()
    : downstreamClosure([...byPackage.keys(), ...packages], reverse);

  const engineMappingEnabled = config.engineFileMapping?.enabled === true;
  let engineScope = {
    sourceFiles: [],
    testFiles: [],
    precision: 'package',
    fallbackReason: 'ENGINE_NOT_IN_CLOSURE',
  };
  const selectedPackages = [...affected];
  if (!values.full && affected.includes('engine') && engineMappingEnabled) {
    const enginePaths = byPackage.get('engine') ?? [];
    const engineMap = buildEngineFileMap(root);
    const selection = filterEngineTests(enginePaths, engineMap, root);
    engineScope = {
      sourceFiles: selection.sourceFiles,
      testFiles: selection.testFiles,
      precision: selection.precision,
      fallbackReason: selection.fallbackReason,
    };
    // 文件级映射有效时，engine 从 turbo 包级执行中移出，改走文件级 vitest，避免全包 120 个测试。
    if (selection.precision === 'file') {
      const engineIndex = selectedPackages.indexOf('engine');
      selectedPackages.splice(engineIndex, 1);
    }
  }

  const governance = resolveGovernance(other, config, root);
  const governedFiles = new Set(governance.matches.map((match) => match.file));
  const skipped = other
    .filter((file) => !governedFiles.has(file))
    .map((file) => ({ target: file, reason: categorizeSkipped(file, config) }));

  let estimatedFiles = 0;
  for (const packageDir of selectedPackages) {
    estimatedFiles += countPackageTestFiles(root, packageDir);
  }
  estimatedFiles += engineScope.testFiles.length;
  if (governance.runRootTests) {
    estimatedFiles += countRootTestFiles(root);
  }

  return createScopePlan({
    mode: values['dry-run'] ? 'dry-run' : 'execute',
    trigger: values.trigger,
    diff: {
      sinceRef: diffSourceLabel(values),
      changedFiles,
      byPackage: Object.fromEntries(byPackage),
    },
    closure: {
      affectedPackages: affected,
      engineFileScope: engineScope,
    },
    governance: {
      runRootTests: governance.runRootTests,
      reasons: governance.reasons,
    },
    selection: {
      packages: selectedPackages,
      engineTestFiles: engineScope.testFiles,
      rootGovernanceTests: governance.runRootTests ? ['tests/**'] : [],
      vitestArgs: buildVitestPassthrough(values),
      estimatedFiles,
      skipped,
    },
  });
}

// Windows 下 pnpm 是 .cmd 垫片，spawnSync 无法直接执行裸 'pnpm'，需带扩展名。
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function runChild(args, cwd) {
  try {
    return {
      code: 0,
      stdout: execFileSync(args[0], args.slice(1), {
        cwd,
        encoding: 'utf8',
        // Windows 下 .cmd 垫片受 Node 安全策略限制必须经 shell 启动。
        shell: process.platform === 'win32',
      }),
    };
  } catch (error) {
    // status 为 null 表示进程根本没起来（如命令不存在），属环境错误而非测试失败，向上抛。
    if (error.status === null || error.status === undefined) throw error;
    return { code: error.status, stdout: error.stdout ?? '' };
  }
}

/**
 * 解析 turbo 输出为任务摘要。turbo 2.10 的 --json 是 NDJSON 日志事件流（无逐任务条目），
 * 因此在事件流里回退解析聚合摘要行（Tasks/Cached/Time）；两者都取不到时返回空数组。
 */
export function parseTurboTasks(stdout) {
  const documents = [];
  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };
  const whole = tryParse(stdout.trim());
  if (whole !== undefined) {
    documents.push(...(Array.isArray(whole) ? whole : [whole]));
  } else {
    for (const line of stdout.split(/\r?\n/)) {
      const parsed = tryParse(line.trim());
      if (parsed !== undefined) documents.push(parsed);
    }
  }
  const tasks = [];
  for (const document of documents) {
    const entries = Array.isArray(document)
      ? document
      : (document?.tasks ?? (document?.taskId ? [document] : []));
    for (const task of entries) {
      const cached = task.cacheStatus ? task.cacheStatus === 'CACHE_HIT' : Boolean(task.cached);
      tasks.push({
        package: task.package ?? String(task.taskId ?? '').split(':')[0] ?? '',
        cached,
        durationMs: Number(task.duration ?? task.durationMs ?? 0),
      });
    }
  }
  if (tasks.length === 0) {
    // turbo 2.10 事件流只有聚合摘要：从 text 行提取 Cached/Time，作为单条汇总任务记录。
    const text = documents
      .filter((document) => typeof document?.text === 'string')
      .map((document) => document.text)
      .join('\n');
    const cachedMatch = /Cached:\s*(\d+)\s+cached,\s*(\d+)\s+total/.exec(text);
    const durationMatch = /Time:\s*([\d.]+)\s*(ms|s|m)\b/.exec(text);
    if (cachedMatch) {
      const durationMs = durationMatch
        ? Math.round(
            Number(durationMatch[1]) *
              (durationMatch[2] === 'ms' ? 1 : durationMatch[2] === 's' ? 1000 : 60000),
          )
        : 0;
      const cachedCount = Number(cachedMatch[1]);
      const totalCount = Number(cachedMatch[2]);
      tasks.push({
        package: '(turbo summary)',
        cached: totalCount > 0 && cachedCount === totalCount,
        durationMs,
        cachedCount,
        totalCount,
      });
    }
  }
  return tasks;
}

/**
 * 从 vitest 人类可读输出解析汇总计数（解析失败按 0 处理，不影响退出码）。
 */
export function parseVitestSummary(output) {
  const testFiles = /Test Files\s+(\d+)\s+(?:passed|failed)/.exec(output);
  const tests = /Tests\s+(\d+)\s+(?:passed|failed)/.exec(output);
  const failed = /(\d+)\s+failed/.exec(output);
  const duration = /Duration\s+([\d.]+)s/.exec(output);
  return {
    testFiles: testFiles ? Number(testFiles[1]) : 0,
    tests: tests ? Number(tests[1]) : 0,
    failed: failed ? Number(failed[1]) : 0,
    durationMs: duration ? Math.round(Number(duration[1]) * 1000) : 0,
  };
}

async function executePlan(plan, values, context) {
  const { root } = context;
  const startedAt = Date.now();
  let exitCode = EXIT_OK;
  let turboTasks = [];
  let vitest = { testFiles: 0, tests: 0, failed: 0, durationMs: 0 };

  if (plan.selection.packages.length > 0) {
    // 经 `pnpm exec turbo` 调用而非 `pnpm run test`：后者会把过滤参数追加给根 test script 造成全量误跑。
    const args = [
      'exec',
      'turbo',
      'run',
      'test',
      ...plan.selection.packages.map((dir) => `--filter=${PACKAGE_DEFINITIONS[dir].name}`),
      '--output-logs=errors-only',
      '--json',
    ];
    if (values.force) args.push('--force');
    const result = runChild([PNPM, ...args], root);
    turboTasks = parseTurboTasks(result.stdout);
    if (result.code !== 0) exitCode = EXIT_TESTS_FAILED;
  }

  const passthrough = plan.selection.vitestArgs;
  if (
    plan.closure.engineFileScope.precision === 'file' &&
    plan.selection.engineTestFiles.length > 0
  ) {
    const relativeFiles = plan.selection.engineTestFiles.map((file) =>
      file.slice('packages/engine/'.length),
    );
    const result = runChild(
      [
        PNPM,
        '--filter',
        '@base-screen/engine',
        'exec',
        'vitest',
        'run',
        ...relativeFiles,
        ...passthrough,
      ],
      root,
    );
    const summary = parseVitestSummary(result.stdout);
    vitest = {
      testFiles: vitest.testFiles + summary.testFiles,
      tests: vitest.tests + summary.tests,
      failed: vitest.failed + summary.failed,
      durationMs: vitest.durationMs + summary.durationMs,
    };
    if (result.code !== 0) exitCode = EXIT_TESTS_FAILED;
  }

  if (plan.governance.runRootTests) {
    const result = runChild([PNPM, 'exec', 'vitest', 'run', 'tests', ...passthrough], root);
    const summary = parseVitestSummary(result.stdout);
    vitest = {
      testFiles: vitest.testFiles + summary.testFiles,
      tests: vitest.tests + summary.tests,
      failed: vitest.failed + summary.failed,
      durationMs: vitest.durationMs + summary.durationMs,
    };
    if (result.code !== 0) exitCode = EXIT_TESTS_FAILED;
  }

  const wallClockMs = Date.now() - startedAt;
  const summaryTask = turboTasks.find((task) => task.package === '(turbo summary)');
  const cachedCount = summaryTask
    ? summaryTask.cachedCount
    : turboTasks.filter((task) => task.cached).length;
  const totalTaskCount = summaryTask ? summaryTask.totalCount : turboTasks.length;
  const baseline = readJsonFile(join(root, FULL_BASELINE_PATH));
  const metrics = {
    fullBaselineMs: typeof baseline?.wallClockMs === 'number' ? baseline.wallClockMs : null,
    scopedMs: wallClockMs,
    reductionPct:
      typeof baseline?.wallClockMs === 'number' && baseline.wallClockMs > 0
        ? Math.max(0, Math.round((1 - wallClockMs / baseline.wallClockMs) * 100))
        : null,
    cacheHitRate:
      totalTaskCount > 0 ? Math.round((cachedCount / totalTaskCount) * 100) / 100 : null,
  };

  const reportOut = values['report-out']
    ? join(root, values['report-out'])
    : join(root, DEFAULT_REPORT_OUT);
  const executionReport = createExecutionReport({
    planPath: plan.planPath ?? '',
    exitCode,
    wallClockMs,
    turbo: { tasks: turboTasks },
    vitest,
    metrics,
  });
  writeJsonFile(reportOut, executionReport);

  appendSelectionHistory(root, {
    generatedAt: new Date().toISOString(),
    sinceRef: plan.diff.sinceRef,
    packages: plan.selection.packages,
    engineTestFiles: plan.selection.engineTestFiles,
    rootGovernanceTests: plan.governance.runRootTests ? plan.selection.rootGovernanceTests : [],
  });

  return { exitCode, reportOut, executionReport };
}

function printHumanSummary(plan) {
  console.log('test:scope 计划摘要');
  console.log(`  变更来源: ${plan.diff.sinceRef}（变更文件 ${plan.diff.changedFiles.length} 个）`);
  console.log(`  受影响包: ${plan.selection.packages.join(', ') || '（无）'}`);
  console.log(
    `  engine 文件级: ${plan.closure.engineFileScope.testFiles.length} 个测试` +
      `（precision=${plan.closure.engineFileScope.precision}` +
      `${plan.closure.engineFileScope.fallbackReason ? `，原因=${plan.closure.engineFileScope.fallbackReason}` : ''}）`,
  );
  console.log(`  根级治理测试: ${plan.governance.runRootTests ? '执行' : '跳过'}`);
  for (const reason of plan.governance.reasons) {
    console.log(`    - ${reason}`);
  }
  console.log(`  预估测试文件数: ${plan.selection.estimatedFiles}`);
  if (plan.selection.skipped.length > 0) {
    console.log('  跳过清单:');
    for (const entry of plan.selection.skipped) {
      console.log(`    - ${entry.target}: ${entry.reason}`);
    }
  }
}

async function main(argv) {
  const parsed = parseScopeArgs(argv);
  if (parsed.error) {
    console.error(`test:scope 参数错误（退出码 ${parsed.exitCode}）：${parsed.error}`);
    return parsed.exitCode;
  }
  const { values, packages } = parsed;
  const root = getRepoRoot();

  if (values.since && !isValidGitRef(values.since)) {
    console.error(`test:scope 无效 git 引用（退出码 ${EXIT_USAGE}）：${values.since}`);
    return EXIT_USAGE;
  }

  const config = readJsonFile(join(import.meta.dirname, 'test-scope.config.json'));
  if (!config) {
    console.error(
      `test:scope 配置缺失或不合法（退出码 ${EXIT_SCOPE_ERROR}）：tooling/testing/test-scope.config.json`,
    );
    return EXIT_SCOPE_ERROR;
  }

  let plan;
  try {
    plan = buildScopePlan(values, packages, { root, config });
  } catch (error) {
    console.error(`test:scope 闭包计算异常（退出码 ${EXIT_SCOPE_ERROR}）：${error.message}`);
    return EXIT_SCOPE_ERROR;
  }

  const planOut = values['plan-out']
    ? join(root, values['plan-out'])
    : join(root, DEFAULT_PLAN_OUT);
  plan.planPath = planOut;
  writeJsonFile(planOut, plan);

  if (values['dry-run']) {
    if (values.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      printHumanSummary(plan);
      console.log(`  计划已落盘: ${planOut}`);
    }
    return EXIT_OK;
  }

  let outcome;
  try {
    outcome = await executePlan(plan, values, { root });
  } catch (error) {
    console.error(`test:scope 执行环境异常（退出码 ${EXIT_SCOPE_ERROR}）：${error.message}`);
    return EXIT_SCOPE_ERROR;
  }
  const { exitCode, reportOut, executionReport } = outcome;
  if (values.json) {
    console.log(JSON.stringify(executionReport, null, 2));
  } else {
    printHumanSummary(plan);
    console.log(
      `  执行结果: exitCode=${exitCode}，墙钟 ${executionReport.wallClockMs}ms，` +
        `缓存命中率 ${executionReport.metrics.cacheHitRate ?? '（无 turbo 任务）'}`,
    );
    console.log(`  计划已落盘: ${planOut}`);
    console.log(`  报告已落盘: ${reportOut}`);
  }
  return exitCode;
}

if (import.meta.main) {
  const exitCode = await main(process.argv.slice(2));
  process.exitCode = exitCode;
}
