import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Extractor, ExtractorConfig, ExtractorMessageCategory } from '@microsoft/api-extractor';
import { PACKAGE_DEFINITIONS } from './check-packages.mjs';

const API_REPORT_EXTENSION = '.api.md';

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
        skipLibCheck: entry.directory === 'vue',
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

export function verifyApiReports({ update = false } = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'base-screen-api-reports-'));
  try {
    for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
      const { manifest, packageJsonPath } = readManifest(directory);
      const entries = collectApiEntrypoints(directory, manifest);
      if (entries.length === 0) fail('API_ENTRY_MISSING', directory);

      const expectedFileNames = new Set(
        entries.map((entry) => `${entry.reportBaseName}${API_REPORT_EXTENSION}`),
      );
      const reportFolder = resolve('packages', directory, 'etc');
      if (update) mkdirSync(reportFolder, { recursive: true });

      for (const entry of entries) {
        if (!existsSync(entry.entryPointFilePath)) {
          fail('API_ENTRY_MISSING', `${entry.packageName}${entry.exportPath}`);
        }
        const extractorConfig = createExtractorConfig(
          entry,
          packageJsonPath,
          join(temporaryRoot, directory),
        );
        const result = Extractor.invoke(extractorConfig, {
          localBuild: update,
          messageCallback: (message) => {
            if (message.category === ExtractorMessageCategory.Console) message.handled = true;
          },
          printApiReportDiff: !update,
          showVerboseMessages: false,
        });
        if (!result.succeeded) {
          const reason =
            result.errorCount === 0 && result.apiReportChanged
              ? 'API_REPORT_CHANGED'
              : 'API_EXTRACTOR_FAILED';
          fail(reason, `${entry.packageName}${entry.exportPath}`);
        }
      }

      reconcileReportFiles(directory, expectedFileNames, update);
    }
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  verifyApiReports({ update: process.argv.includes('--update') });
}
