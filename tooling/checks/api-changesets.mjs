import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    // 产品包 `base-screen` 不带作用域，另有一批私有 `@base-screen/*` 包，两种写法都要认。
    const entry =
      /^['"]?(@base-screen\/[^'":]+|base-screen)['"]?\s*:\s*(?:major|minor|patch)\s*$/.exec(
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
    // 已退役包的 API 报告以删除路径出现在 diff 中，此时没有可标记的包名。
    if (definition === undefined) {
      if (existsSync(join('packages', directory, 'package.json'))) {
        fail('API_REPORT_PACKAGE_UNKNOWN', directory);
      }
      continue;
    }
    required.add(definition.name);
    if (SDK_REEXPORTED_DIRECTORIES.has(directory)) sdkRequired = true;
  }
  if (sdkRequired) required.add(PACKAGE_DEFINITIONS.sdk.name);
  return required;
}

export function missingChangesetPackages(required, recorded) {
  return [...required].filter((packageName) => !recorded.has(packageName)).sort();
}

/**
 * 被本次 diff 消费掉的 changeset 仍算作声明——但**必须伴随包版本提升**。
 *
 * `changeset version` 会把 changeset 文件删掉并把声明折进版本号；如果只认「当前仍存在的
 * changeset」，发布提交本身必然报 `API_CHANGESET_MISSING`（API 报告是随发布一起进 diff 的）。
 * 反过来，若只要「删掉的 changeset」就算数，任何 PR 都能靠删文件绕过门禁。判据因此是
 * 「文件在 base 里存在 + 它声明的包在 HEAD 的版本与 base 不同」。
 */
export function consumedChangesetPackages(source, versionBumped) {
  const declared = parseChangesetPackages(source);
  const consumed = new Set();
  for (const packageName of declared) {
    if (versionBumped(packageName)) consumed.add(packageName);
  }
  return consumed;
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

/** 读某个 revision 里的文件；路径不存在（或不是 blob）时返回 undefined。 */
function readFileAtRevision(revision, filePath) {
  try {
    return git(['show', `${revision}:${filePath}`]);
  } catch {
    return undefined;
  }
}

function packageDirectoryIndex() {
  const index = new Map();
  for (const [directory, definition] of Object.entries(PACKAGE_DEFINITIONS)) {
    index.set(definition.name, directory);
  }
  return index;
}

/** 包在指定 revision 的版本；`undefined` 表示该 revision 里没有这个包。 */
function packageVersionAt(directory, revision) {
  const source =
    revision === undefined
      ? existsSync(join('packages', directory, 'package.json'))
        ? readFileSync(join('packages', directory, 'package.json'), 'utf8')
        : undefined
      : readFileAtRevision(revision, `packages/${directory}/package.json`);
  if (source === undefined) return undefined;
  return JSON.parse(source).version;
}

/**
 * 判断本次 diff 里指定包是否带有 `changeset version` 的发布痕迹：版本与 CHANGELOG 同批变化。
 *
 * CHANGELOG 是必要的第二信号：只改 `package.json` 版本号（手写发版脚本、或误改版本）
 * 不能被当成「changeset 已被消费」的证据。
 */
function releasedByChangesetVersion(directory, baseRevision) {
  const before = packageVersionAt(directory, baseRevision);
  const after = packageVersionAt(directory);
  if (before === undefined || after === undefined || before === after) return false;
  return changedPaths(baseRevision, `packages/${directory}/CHANGELOG.md`).length > 0;
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

  const directories = packageDirectoryIndex();
  const versionBumped = (packageName) => {
    const directory = directories.get(packageName);
    if (directory === undefined) return false;
    const before = packageVersionAt(directory, baseRevision);
    const after = packageVersionAt(directory);
    return before !== undefined && after !== undefined && before !== after;
  };
  const changesetPaths = changedPaths(baseRevision, '.changeset').filter((filePath) =>
    CHANGESET_FILE.test(filePath),
  );
  const recorded = new Set();
  let releaseDiff = false;
  for (const filePath of changesetPaths) {
    if (existsSync(filePath)) {
      for (const packageName of parseChangesetPackages(readFileSync(filePath, 'utf8'))) {
        recorded.add(packageName);
      }
      continue;
    }
    releaseDiff = true;
    // 发布提交：changeset 已被 `changeset version` 消费，内容只能从 base 里读。
    const source = readFileAtRevision(baseRevision, filePath);
    if (source === undefined) continue;
    for (const packageName of consumedChangesetPackages(source, versionBumped)) {
      recorded.add(packageName);
    }
  }

  const required = requiredChangesetPackages(reportPaths);
  // 区间内新建又被消费的 changeset 在 diff 里不留痕迹（文件在 base 与 HEAD 都不存在）。
  // 这种情形只能以发布痕迹判定：diff 里确有 changeset 删除，且该包的版本与 CHANGELOG
  // 同批变化。两者同时成立才视为「声明已折进版本号」，普通 PR 删文件仍会失败。
  if (releaseDiff) {
    for (const packageName of required) {
      const directory = directories.get(packageName);
      if (directory !== undefined && releasedByChangesetVersion(directory, baseRevision)) {
        recorded.add(packageName);
      }
    }
  }
  const missing = missingChangesetPackages(required, recorded);
  if (missing.length > 0) {
    fail('API_CHANGESET_MISSING', missing.join(', '));
  }
}

if (import.meta.main) {
  verifyApiChangesets();
}
