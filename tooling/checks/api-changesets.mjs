import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { PACKAGE_DEFINITIONS } from './packages.mjs';

const API_REPORT_PATH = /^packages\/([^/]+)\/etc\/[^/]+\.api\.md$/;
const CHANGESET_FILE = /^\.changeset\/[^/]+\.md$/;
const SDK_REEXPORTED_DIRECTORIES = new Set([
  'contracts',
  'core',
  'engine',
  'material',
  'plugin-core',
  'plugin-manager',
  'plugin-sdk',
  'renderer',
]);

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function splitNullSeparated(value) {
  return value.split('\0').filter(Boolean).map(normalizePath);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

export function parseChangesetPackages(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (match === null) return new Set();
  const packages = new Set();
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^['"]?(@base-screen\/[^'":]+)['"]?\s*:\s*(?:major|minor|patch)\s*$/.exec(
      line.trim(),
    );
    if (entry !== null) packages.add(entry[1]);
  }
  return packages;
}

export function requiredChangesetPackages(reportPaths) {
  const required = new Set();
  let sdkRequired = false;
  for (const filePath of reportPaths) {
    const match = API_REPORT_PATH.exec(normalizePath(filePath));
    if (match === null) continue;
    const directory = match[1];
    const definition = PACKAGE_DEFINITIONS[directory];
    if (definition === undefined) fail('API_REPORT_PACKAGE_UNKNOWN', directory);
    required.add(definition.name);
    if (SDK_REEXPORTED_DIRECTORIES.has(directory)) sdkRequired = true;
  }
  if (sdkRequired) required.add(PACKAGE_DEFINITIONS.sdk.name);
  return required;
}

export function missingChangesetPackages(required, recorded) {
  return [...required].filter((packageName) => !recorded.has(packageName)).sort();
}

function resolveBaseRevision() {
  const argument = process.argv.find((value) => value.startsWith('--base='));
  return argument?.slice('--base='.length) || process.env.BASE_SCREEN_API_BASE;
}

function verifyBaseRevision(baseRevision) {
  if (/^0+$/.test(baseRevision)) return false;
  try {
    git(['cat-file', '-e', `${baseRevision}^{commit}`]);
    return true;
  } catch {
    fail('API_CHANGESET_BASE_INVALID', baseRevision);
  }
}

function changedPaths(baseRevision, pathspec) {
  return splitNullSeparated(
    git(['diff', '--name-only', '-z', `${baseRevision}...HEAD`, '--', pathspec]),
  );
}

export function verifyApiChangesets(baseRevision = resolveBaseRevision()) {
  if (baseRevision === undefined || baseRevision.length === 0) return;
  if (!verifyBaseRevision(baseRevision)) return;

  const baseReports = splitNullSeparated(
    git(['ls-tree', '-r', '--name-only', '-z', baseRevision, '--', 'packages']),
  ).filter((filePath) => API_REPORT_PATH.test(filePath));
  if (baseReports.length === 0) return;

  const reportPaths = changedPaths(baseRevision, 'packages').filter((filePath) =>
    API_REPORT_PATH.test(filePath),
  );
  if (reportPaths.length === 0) return;

  const changesetPaths = changedPaths(baseRevision, '.changeset').filter(
    (filePath) => CHANGESET_FILE.test(filePath) && existsSync(filePath),
  );
  const recorded = new Set();
  for (const filePath of changesetPaths) {
    for (const packageName of parseChangesetPackages(readFileSync(filePath, 'utf8'))) {
      recorded.add(packageName);
    }
  }

  const required = requiredChangesetPackages(reportPaths);
  const missing = missingChangesetPackages(required, recorded);
  if (missing.length > 0) {
    fail('API_CHANGESET_MISSING', missing.join(', '));
  }
}

if (import.meta.main) {
  verifyApiChangesets();
}
