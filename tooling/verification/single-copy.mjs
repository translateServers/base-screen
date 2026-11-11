import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 宿主与插件共享 peer 依赖时，消费者 node_modules 里只允许一份该依赖（ADR-0097）。
 * 统计顶层副本与 pnpm 虚拟存储副本，并校验版本落在宿主声明的范围内。
 */
export function assertSingleCopy(consumer, name, expectedRange) {
  const code = name.toUpperCase();
  const copies = findPackageCopies(consumer, name);
  if (copies.length !== 1) {
    throw new Error(
      `${code}_TARBALL_DUPLICATE_COPIES: expected 1 copy, found ${copies.length} (${copies.join(', ')})`,
    );
  }
  const version = JSON.parse(readFileSync(copies[0], 'utf8')).version;
  if (!satisfiesCaret(version, expectedRange)) {
    throw new Error(`${code}_TARBALL_VERSION_OUT_OF_RANGE: ${version} not in ${expectedRange}`);
  }
}

export function readConsumerRange(consumer, name) {
  const manifest = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
  const range = manifest.dependencies?.[name];
  if (range === undefined) throw new Error(`CONSUMER_DEPENDENCY_MISSING: ${name}`);
  return range;
}

// 只实现本仓库实际使用的 `^x.y.z` 形式：主版本号相同且不低于下界。
export function satisfiesCaret(version, range) {
  const match = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  const actual = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null || actual === null) {
    throw new Error(`UNSUPPORTED_RANGE_OR_VERSION: ${range} / ${version}`);
  }
  const min = match.slice(1).map(Number);
  const got = actual.slice(1).map(Number);
  if (got[0] !== min[0]) return false;
  if (got[1] !== min[1]) return got[1] > min[1];
  return got[2] >= min[2];
}

// 顶层目录与 pnpm 虚拟存储 `.pnpm/<id>/node_modules/<name>` 都是候选；
// realpath 去重，避免同一份文件因符号链接被计两次。
export function findPackageCopies(consumer, name) {
  const nodeModules = join(consumer, 'node_modules');
  const candidates = [join(nodeModules, name, 'package.json')];
  const virtualStore = join(nodeModules, '.pnpm');
  if (existsSync(virtualStore)) {
    for (const entry of readdirSync(virtualStore, { withFileTypes: true })) {
      candidates.push(join(virtualStore, entry.name, 'node_modules', name, 'package.json'));
    }
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (existsSync(candidate)) seen.add(realpathSync(candidate));
  }
  return [...seen];
}
