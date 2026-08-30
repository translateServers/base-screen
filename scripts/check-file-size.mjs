import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE_PATH = resolve('scripts/file-size-baseline.json');
const TRACKED_EXTENSION = /\.(?:css|mjs|ts|tsx)$/;
const VENDORED_SOURCE = 'packages/engine/src/common/vendor/';

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

export function countLogicalLines(source) {
  if (source.length === 0) return 0;
  const lines = source.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(source) ? lines - 1 : lines;
}

export function fileSizePolicy(filePath) {
  const normalized = normalizePath(filePath);
  if (!TRACKED_EXTENSION.test(normalized) || normalized.startsWith(VENDORED_SOURCE)) {
    return undefined;
  }
  if (/^scripts\/verify-.*\.mjs$/.test(normalized)) {
    return { category: 'verification', limit: 800 };
  }
  if (normalized.startsWith('tests/') || normalized.includes('/tests/')) {
    return { category: 'test', limit: 800 };
  }
  if (/^packages\/[^/]+\/src\/.*\.css$/.test(normalized)) {
    return { category: 'ui-style', limit: 800 };
  }
  if (/^packages\/[^/]+\/src\/browser\/controllers\//.test(normalized)) {
    return { category: 'ui-controller', limit: 400 };
  }
  if (normalized.startsWith('packages/contracts/src/')) {
    return { category: 'contract', limit: 600 };
  }
  if (/^packages\/[^/]+\/src\//.test(normalized)) {
    return { category: 'source', limit: 500 };
  }
  return undefined;
}

export function evaluateFileSizes(fileLines, baseline) {
  const issues = [];
  const inspected = new Set();
  for (const { lines, path: inputPath } of fileLines) {
    const path = normalizePath(inputPath);
    const policy = fileSizePolicy(path);
    if (policy === undefined) continue;
    inspected.add(path);
    const baselineLines = baseline[path];
    if (lines > policy.limit && baselineLines === undefined) {
      issues.push({ code: 'FILE_SIZE_LIMIT_EXCEEDED', lines, path, ...policy });
      continue;
    }
    if (lines > policy.limit && lines > baselineLines) {
      issues.push({
        baseline: baselineLines,
        code: 'FILE_SIZE_REGRESSION',
        lines,
        path,
        ...policy,
      });
      continue;
    }
    if (baselineLines !== undefined && lines !== baselineLines) {
      issues.push({
        baseline: baselineLines,
        code: 'FILE_SIZE_BASELINE_STALE',
        lines,
        path,
        ...policy,
      });
    }
  }

  for (const [path, baselineLines] of Object.entries(baseline)) {
    if (!inspected.has(path)) {
      issues.push({
        baseline: baselineLines,
        category: 'unknown',
        code: 'FILE_SIZE_BASELINE_STALE',
        lines: undefined,
        limit: undefined,
        path,
      });
    }
  }
  return issues.sort((first, second) => first.path.localeCompare(second.path));
}

function discoverFiles() {
  return execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'packages',
      'scripts',
      'tests',
    ],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .map(normalizePath)
    .filter((path) => existsSync(path));
}

function collectFileLines() {
  return discoverFiles().map((path) => ({
    lines: countLogicalLines(readFileSync(path, 'utf8')),
    path,
  }));
}

function currentExceptions(fileLines) {
  return Object.fromEntries(
    fileLines
      .map(({ lines, path }) => ({ lines, path, policy: fileSizePolicy(path) }))
      .filter(({ lines, policy }) => policy !== undefined && lines > policy.limit)
      .sort((first, second) => first.path.localeCompare(second.path))
      .map(({ lines, path }) => [path, lines]),
  );
}

function readBaseline() {
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.exceptions === null ||
    typeof parsed.exceptions !== 'object' ||
    Array.isArray(parsed.exceptions) ||
    Object.values(parsed.exceptions).some((value) => !Number.isSafeInteger(value) || value < 1)
  ) {
    throw new Error('FILE_SIZE_BASELINE_INVALID');
  }
  return parsed.exceptions;
}

function formatIssue(issue) {
  if (issue.code === 'FILE_SIZE_LIMIT_EXCEEDED') {
    return `${issue.code}: ${issue.path} has ${issue.lines} lines; ${issue.category} limit is ${issue.limit}`;
  }
  if (issue.code === 'FILE_SIZE_REGRESSION') {
    return `${issue.code}: ${issue.path} has ${issue.lines} lines; baseline is ${issue.baseline}`;
  }
  const current = issue.lines === undefined ? 'missing' : `${issue.lines} lines`;
  return `${issue.code}: ${issue.path} is ${current}; baseline is ${issue.baseline}; run pnpm file-size:baseline`;
}

export function verifyFileSizes({ update = false } = {}) {
  const fileLines = collectFileLines();
  const baseline = readBaseline();
  if (update) {
    const blockingIssues = evaluateFileSizes(fileLines, baseline).filter(
      ({ code }) => code !== 'FILE_SIZE_BASELINE_STALE',
    );
    if (blockingIssues.length > 0) {
      throw new Error(
        `FILE_SIZE_BASELINE_UPDATE_BLOCKED:\n${blockingIssues.map(formatIssue).join('\n')}`,
      );
    }
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          description:
            'Exact line-count ceilings for files that predate the repository size limits.',
          exceptions: currentExceptions(fileLines),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const issues = evaluateFileSizes(fileLines, baseline);
  if (issues.length > 0) {
    throw new Error(`FILE_SIZE_CHECK_FAILED:\n${issues.map(formatIssue).join('\n')}`);
  }
}

if (import.meta.main) {
  verifyFileSizes({ update: process.argv.includes('--update') });
}
