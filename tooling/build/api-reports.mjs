import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { Extractor, ExtractorConfig, ExtractorMessageCategory } from '@microsoft/api-extractor';
import { PACKAGE_DEFINITIONS } from '../checks/packages.mjs';

const API_REPORT_EXTENSION = '.api.md';

/**
 * 每次 Extractor.invoke 都要独立建一遍 TypeScript program（实测约 2s），入口串行时 31 个入口就是 60 多秒。
 * 这些入口彼此独立，因此在 worker 线程池里并行执行。上限同时受核数与内存约束——每个 worker 都会加载
 * TypeScript 与 API Extractor，开太多会换来换页而不是吞吐。
 */
const MAX_EXTRACTION_WORKERS = 6;

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function resolveTypesTarget(target) {
  if (typeof target === 'string') {
    return target.endsWith('.d.ts') ? target : undefined;
  }
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    return undefined;
  }
  if (typeof target.types === 'string') {
    return target.types;
  }
  for (const value of Object.values(target)) {
    const resolved = resolveTypesTarget(value);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

export function apiReportBaseName(directory, exportPath) {
  if (exportPath === '.') return directory;
  const subpath = exportPath.replace(/^\.\//, '').replaceAll('/', '-');
  return `${directory}--${subpath}`;
}

export function collectApiEntrypoints(directory, manifest) {
  const packageFolder = resolve('packages', directory);
  const entries = [];
  for (const [exportPath, target] of Object.entries(manifest.exports ?? {})) {
    const typesTarget = resolveTypesTarget(target);
    if (typesTarget === undefined) continue;
    entries.push({
      directory,
      entryPointFilePath: resolve(packageFolder, typesTarget),
      exportPath,
      packageFolder,
      packageName: manifest.name,
      reportBaseName: apiReportBaseName(directory, exportPath),
    });
  }
  return entries;
}

function readManifest(directory) {
  const packageJsonPath = resolve('packages', directory, 'package.json');
  return {
    manifest: JSON.parse(readFileSync(packageJsonPath, 'utf8')),
    packageJsonPath,
  };
}

function createExtractorConfig(entry, packageJsonPath, reportTempFolder) {
  return ExtractorConfig.prepare({
    configObject: {
      projectFolder: entry.packageFolder,
      mainEntryPointFilePath: entry.entryPointFilePath,
      compiler: {
        tsconfigFilePath: join(entry.packageFolder, 'tsconfig.build.json'),
        // The regular package typecheck remains strict; Vue's peer types require newer TS than AE bundles.
        skipLibCheck: entry.directory === 'vue' || entry.exportPath === './vue',
      },
      apiReport: {
        enabled: true,
        includeForgottenExports: true,
        reportFileName: entry.reportBaseName,
        reportFolder: join(entry.packageFolder, 'etc'),
        reportTempFolder,
      },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      newlineKind: 'lf',
      messages: {
        compilerMessageReporting: {
          default: { logLevel: 'error' },
        },
        extractorMessageReporting: {
          default: { logLevel: 'warning' },
          'ae-forgotten-export': { logLevel: 'none' },
          'ae-missing-getter': { logLevel: 'none' },
          'ae-missing-release-tag': { logLevel: 'none' },
          'ae-setter-with-docs': { logLevel: 'none' },
          'ae-undocumented': { logLevel: 'none' },
        },
        tsdocMessageReporting: {
          default: { logLevel: 'none' },
        },
      },
    },
    configObjectFullPath: undefined,
    packageJsonFullPath: packageJsonPath,
  });
}

function reconcileReportFiles(directory, expectedFileNames, update) {
  const reportFolder = resolve('packages', directory, 'etc');
  if (!existsSync(reportFolder)) {
    if (!update) fail('API_REPORT_FOLDER_MISSING', directory);
    return;
  }
  const stale = readdirSync(reportFolder)
    .filter((fileName) => fileName.endsWith(API_REPORT_EXTENSION))
    .filter((fileName) => !expectedFileNames.has(fileName));
  if (stale.length === 0) return;
  if (!update) fail('API_REPORT_STALE', `${directory} -> ${stale.join(', ')}`);
  for (const fileName of stale) {
    rmSync(join(reportFolder, fileName));
  }
}

export function extractApiReport({ entry, packageJsonPath, reportTempFolder, update }) {
  const extractorConfig = createExtractorConfig(entry, packageJsonPath, reportTempFolder);
  const result = Extractor.invoke(extractorConfig, {
    localBuild: update,
    messageCallback: (message) => {
      if (message.category === ExtractorMessageCategory.Console) message.handled = true;
    },
    printApiReportDiff: !update,
    showVerboseMessages: false,
  });
  return {
    apiReportChanged: result.apiReportChanged === true,
    errorCount: result.errorCount,
    succeeded: result.succeeded,
  };
}

function runWorker(shard) {
  return new Promise((settle) => {
    const worker = new Worker(new URL('./api-report-worker.mjs', import.meta.url), {
      workerData: { shard },
    });
    const outcomes = new Map();
    const finish = () => {
      worker.terminate();
      settle(outcomes);
    };
    worker.on('message', (message) => {
      if (message?.done === true) return finish();
      outcomes.set(message.index, message.outcome);
    });
    worker.once('error', (error) => {
      for (const { index } of shard) {
        if (!outcomes.has(index)) {
          outcomes.set(index, {
            detail: error instanceof Error ? error.message : String(error),
            failed: true,
          });
        }
      }
      finish();
    });
  });
}

export async function verifyApiReports({ update = false } = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'base-screen-api-reports-'));
  try {
    const tasks = [];
    const packages = [];
    for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
      const { manifest, packageJsonPath } = readManifest(directory);
      const entries = collectApiEntrypoints(directory, manifest);
      if (entries.length === 0) fail('API_ENTRY_MISSING', directory);
      const reportFolder = resolve('packages', directory, 'etc');
      if (update) mkdirSync(reportFolder, { recursive: true });
      for (const entry of entries) {
        if (!existsSync(entry.entryPointFilePath)) {
          fail('API_ENTRY_MISSING', `${entry.packageName}${entry.exportPath}`);
        }
        tasks.push({
          entry,
          index: tasks.length,
          packageJsonPath,
          // 按入口而非按包分配临时目录：同包的多个入口并发时不能共享同一个临时报告路径
          reportTempFolder: join(temporaryRoot, directory, entry.reportBaseName),
          update,
        });
      }
      packages.push({ directory, entries });
    }

    const workerCount = Math.max(
      1,
      Math.min(tasks.length, MAX_EXTRACTION_WORKERS, availableParallelism() - 1),
    );
    // 轮转分配：每个入口的成本相近（都是一次 program 构建），因此分片天然均衡，
    // 且每个 worker 只加载一次 TypeScript 与 API Extractor。
    const shards = Array.from({ length: workerCount }, () => []);
    for (const task of tasks) shards[task.index % workerCount].push(task);

    const outcomes = new Map();
    for (const collected of await Promise.all(shards.map(runWorker))) {
      for (const [index, outcome] of collected) outcomes.set(index, outcome);
    }

    // 不中断其余任务，全部结束后按入口顺序报出第一个失败：错误码与报告内容保持确定性
    for (const task of tasks) {
      const outcome = outcomes.get(task.index);
      if (outcome?.failed === true) fail('API_EXTRACTOR_FAILED', outcome.detail);
      if (outcome?.succeeded === true) continue;
      const reason =
        outcome?.errorCount === 0 && outcome?.apiReportChanged
          ? 'API_REPORT_CHANGED'
          : 'API_EXTRACTOR_FAILED';
      fail(reason, `${task.entry.packageName}${task.entry.exportPath}`);
    }

    for (const { directory, entries } of packages) {
      const expectedFileNames = new Set(
        entries.map((entry) => `${entry.reportBaseName}${API_REPORT_EXTENSION}`),
      );
      reconcileReportFiles(directory, expectedFileNames, update);
    }
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  await verifyApiReports({ update: process.argv.includes('--update') });
}
