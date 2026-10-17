#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PACKAGE_DEFINITIONS } from '../checks/packages.mjs';
import { countRootTestFiles, getRepoRoot, listPackageTestFiles } from '../lib/scope-graph.mjs';
import {
  FULL_BASELINE_PATH,
  METRICS_ROOT,
  readJsonFile,
  writeJsonFile,
} from '../lib/scope-report.mjs';

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_SCOPE_ERROR = 3;

// Windows 下 pnpm 是 .cmd 垫片，spawnSync 无法直接执行裸 'pnpm'，需带扩展名。
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

/**
 * 静态基线：各包/根级测试文件计数与环境信息（不执行测试，秒级完成）。
 */
export function collectStaticBaseline(rootDir) {
  const packages = {};
  let total = 0;
  for (const packageDir of Object.keys(PACKAGE_DEFINITIONS)) {
    const count = listPackageTestFiles(rootDir, packageDir).length;
    packages[packageDir] = count;
    total += count;
  }
  const rootTestCount = countRootTestFiles(rootDir);
  return {
    generatedAt: new Date().toISOString(),
    mode: 'static',
    node: process.version,
    packageTestFiles: packages,
    rootTestFiles: rootTestCount,
    totalTestFiles: total + rootTestCount,
  };
}

/**
 * 全量墙钟基线：执行 pnpm test（turbo 全量 + 根级 vitest），记录墙钟与退出码。
 */
function collectFullBaseline(rootDir) {
  const startedAt = Date.now();
  let exitCode = 0;
  try {
    execFileSync(PNPM, ['test'], {
      cwd: rootDir,
      stdio: 'inherit',
      // Windows 下 .cmd 垫片受 Node 安全策略限制必须经 shell 启动。
      shell: process.platform === 'win32',
    });
  } catch (error) {
    exitCode = error.status ?? 1;
  }
  const wallClockMs = Date.now() - startedAt;
  const baseline = {
    ...collectStaticBaseline(rootDir),
    mode: 'full',
    wallClockMs,
    exitCode,
  };
  writeJsonFile(join(rootDir, FULL_BASELINE_PATH), baseline);
  return baseline;
}

/**
 * 按需执行对账：读取 test:scope 的执行报告，对比全量基线得出缩减比例与缓存命中率，
 * 并沉淀一条 scoped-run 记录供趋势看数。
 */
function collectScopedRun(rootDir, reportPath) {
  const executionReport = readJsonFile(reportPath);
  if (!executionReport) {
    console.error(`test:baseline 无法读取执行报告：${reportPath}`);
    return { exitCode: EXIT_USAGE, baseline: undefined };
  }
  const baseline = readJsonFile(join(rootDir, FULL_BASELINE_PATH));
  const scopedMs = executionReport.wallClockMs ?? 0;
  const fullBaselineMs = baseline?.wallClockMs ?? null;
  const record = {
    generatedAt: new Date().toISOString(),
    sinceRef: executionReport.planPath,
    scopedMs,
    fullBaselineMs,
    reductionPct:
      fullBaselineMs && fullBaselineMs > 0
        ? Math.max(0, Math.round((1 - scopedMs / fullBaselineMs) * 100))
        : null,
    cacheHitRate: executionReport.metrics?.cacheHitRate ?? null,
    vitest: executionReport.vitest,
  };
  appendScopedRunRecord(rootDir, record);
  return { exitCode: EXIT_OK, baseline: record };
}

function appendScopedRunRecord(rootDir, record) {
  const target = join(rootDir, METRICS_ROOT, 'scoped-runs.jsonl');
  mkdirSync(join(rootDir, METRICS_ROOT), { recursive: true });
  appendFileSync(target, `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * 覆盖率对账：对一个包跑 vitest --coverage，从文本报告解析行覆盖率并落盘 metrics。
 */
function reconcileCoverage(rootDir, packageDir) {
  if (!PACKAGE_DEFINITIONS[packageDir]) {
    console.error(`test:baseline 未知包名：${packageDir}`);
    return { exitCode: EXIT_USAGE, baseline: undefined };
  }
  const startedAt = Date.now();
  let output = '';
  let exitCode = 0;
  try {
    output = execFileSync(
      PNPM,
      ['--filter', PACKAGE_DEFINITIONS[packageDir].name, 'exec', 'vitest', 'run', '--coverage'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // Windows 下 .cmd 垫片受 Node 安全策略限制必须经 shell 启动。
        shell: process.platform === 'win32',
      },
    );
  } catch (error) {
    exitCode = error.status ?? 1;
    output = error.stdout ?? '';
  }
  const linePct = /All files\s*\|\s*([\d.]+)/.exec(output);
  const coverage = {
    generatedAt: new Date().toISOString(),
    package: packageDir,
    linePct: linePct ? Number(linePct[1]) : null,
    wallClockMs: Date.now() - startedAt,
    exitCode,
  };
  writeJsonFile(join(rootDir, METRICS_ROOT, `coverage-${packageDir}.json`), coverage);
  return { exitCode: EXIT_OK, baseline: coverage };
}

function printUsage() {
  console.log(
    '用法：node tooling/testing/test-baseline.mjs [--full | --report <execution-report.json> | --coverage <package-dir>]',
  );
  console.log(
    '  （无参数）          静态基线：测试文件计数与环境信息，落盘 metrics/baseline-static.json',
  );
  console.log(
    '  --full              全量墙钟基线：执行 pnpm test 计时，落盘 metrics/baseline-full.json',
  );
  console.log(
    '  --report <path>     按需执行对账：读取 test:scope 报告对比基线，沉淀 metrics/scoped-runs.jsonl',
  );
  console.log(
    '  --coverage <pkg>    覆盖率对账：对指定包运行 vitest --coverage，落盘 metrics/coverage-<pkg>.json',
  );
}

async function main(argv) {
  let values;
  try {
    values = parseArgs({
      options: {
        full: { type: 'boolean', default: false },
        report: { type: 'string' },
        coverage: { type: 'string' },
      },
      allowPositionals: false,
    }).values;
  } catch (error) {
    console.error(`test:baseline 参数解析失败（退出码 ${EXIT_USAGE}）：${error.message}`);
    return EXIT_USAGE;
  }

  const root = getRepoRoot();
  const modes = [values.full, Boolean(values.report), Boolean(values.coverage)].filter(Boolean);
  if (modes.length > 1) {
    console.error(`test:baseline --full/--report/--coverage 互斥（退出码 ${EXIT_USAGE}）`);
    return EXIT_USAGE;
  }

  if (values.full) {
    const baseline = collectFullBaseline(root);
    console.log(
      `全量墙钟基线已落盘: wallClockMs=${baseline.wallClockMs}, exitCode=${baseline.exitCode}`,
    );
    return baseline.exitCode;
  }

  if (values.report) {
    const { exitCode, baseline } = collectScopedRun(root, join(root, values.report));
    if (baseline) {
      console.log('按需执行对账:');
      console.log(`  按需墙钟: ${baseline.scopedMs}ms`);
      console.log(`  全量基线: ${baseline.fullBaselineMs ?? '（尚未采集，先运行 --full）'}`);
      console.log(
        `  墙钟缩减: ${baseline.reductionPct === null ? '（无基线）' : `${baseline.reductionPct}%`}`,
      );
      console.log(`  缓存命中率: ${baseline.cacheHitRate ?? '（无 turbo 任务）'}`);
    }
    return exitCode;
  }

  if (values.coverage) {
    const { exitCode, baseline } = reconcileCoverage(root, values.coverage);
    console.log(
      `覆盖率对账已落盘: linePct=${baseline?.linePct ?? '（解析失败）'}, exitCode=${exitCode}`,
    );
    return exitCode;
  }

  const staticBaseline = collectStaticBaseline(root);
  writeJsonFile(join(root, METRICS_ROOT, 'baseline-static.json'), staticBaseline);
  console.log('静态基线（测试资产盘点）:');
  for (const [packageDir, count] of Object.entries(staticBaseline.packageTestFiles)) {
    console.log(`  ${packageDir}: ${count}`);
  }
  console.log(`  根级 tests: ${staticBaseline.rootTestFiles}`);
  console.log(`  总计: ${staticBaseline.totalTestFiles}`);
  console.log('  已落盘: .base-screen/local/metrics/baseline-static.json');
  return EXIT_OK;
}

if (import.meta.main) {
  const exitCode = await main(process.argv.slice(2));
  process.exitCode = exitCode;
}
