import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const SKILL = '.agents/skills/base-screen-integration-workflow';
export const LOCAL = '.base-screen/local/integration';
export const CONFIG = '.base-screen/integration.json';
export const INDEX = '.base-screen/integration-capabilities.json';
export const CONSUMER = '.base-screen/integration-consumer.json';
export const SNAPSHOT = '.base-screen/integration-upstream.json';
export const TOOLING = '.base-screen/integration-tooling.json';
export const SOURCE = 'frontend/vendor/base-screen/SOURCE.json';
export const ENTRY = 'node ' + SKILL + '/scripts/workflow.mjs';

export function fail(code, detail) {
  throw new Error(code + ': ' + detail);
}

export function safePath(root, name) {
  if (typeof name !== 'string' || isAbsolute(name) || name.includes('\\')) {
    fail('PATH_INVALID', String(name));
  }
  const parts = name.split('/');
  if (parts.some((part) => part === '..' || part === '.')) fail('PATH_INVALID', name);
  const target = resolve(root, name);
  if (relative(root, target).startsWith('..')) fail('PATH_OUTSIDE_ROOT', name);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) fail('PATH_SYMLINK', name);
  }
  return target;
}

export const hash = (data) => createHash('sha256').update(data).digest('hex');
export const json = (value) => JSON.stringify(value, null, 2) + '\n';
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const optionalJson = (path) => (existsSync(path) ? readJson(path) : undefined);
export const fileHash = (path) => (existsSync(path) ? hash(readFileSync(path)) : null);

export function writeChanged(path, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (existsSync(path) && readFileSync(path).equals(bytes)) return false;
  mkdirSync(dirname(path), { recursive: true });
  const stage = path + '.integration-' + process.pid;
  writeFileSync(stage, bytes);
  renameSync(stage, path);
  return true;
}

export function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  }).trimEnd();
}

export function inventory(root) {
  return [...new Set(git(root, ['ls-files', '-co', '--exclude-standard', '-z']).split('\0'))]
    .filter((name) => name && !name.startsWith('.base-screen/local/'))
    .sort();
}

export function walk(root, prefix) {
  const target = safePath(root, prefix);
  if (!existsSync(target)) return [];
  if (lstatSync(target).isFile()) return [prefix];
  return readdirSync(target)
    .sort()
    .flatMap((name) => walk(root, prefix ? prefix + '/' + name : name));
}

export function digestPaths(root, paths) {
  return hash(
    json([...new Set(paths)].sort().map((name) => [name, fileHash(safePath(root, name))])),
  );
}

export function packageInput(name) {
  return (
    /^packages\/[^/]+\/(?:src\/|package\.json$|tsconfig.*\.json$|vite.*\.[cm]?[jt]s$)/.test(name) ||
    /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|biome\.json|LICENSE|NOTICE(?:\.md)?|\.npmrc|\.node-version|tsconfig[^/]*\.json)$/.test(
      name,
    ) ||
    /^packages\/[^/]+\/(?:README\.md|NOTICE(?:\.md)?)$/.test(name) ||
    (name.startsWith('scripts/') && !name.includes('integration'))
  );
}

export function fingerprints(root) {
  const names = inventory(root);
  const verification = names.filter(
    (name) => !name.startsWith('frontend/vendor/') && !name.endsWith('/SOURCE.json'),
  );
  return {
    packages: digestPaths(root, names.filter(packageInput)),
    knowledge: digestPaths(
      root,
      names.filter(
        (name) =>
          name === INDEX ||
          name === 'AGENTS.md' ||
          (name.startsWith('docs/') && !name.includes('/archive/')) ||
          name.startsWith(SKILL + '/'),
      ),
    ),
    verification: digestPaths(root, verification),
    tree: digestPaths(root, names),
  };
}

export function revision(root) {
  return {
    commit: git(root, ['rev-parse', 'HEAD']),
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: git(root, ['status', '--porcelain']).length > 0,
  };
}

export function changedFiles(root) {
  return [
    ...new Set([
      ...git(root, ['diff', '--name-only', 'HEAD', '-z']).split('\0'),
      ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
    ]),
  ]
    .filter(Boolean)
    .sort();
}

export function resolveRoots(cwd, options = {}) {
  const origin = realpathSync(cwd);
  const config = optionalJson(join(origin, CONFIG));
  const name = readJson(join(origin, 'package.json')).name;
  const supplier = name === 'base-screen-monorepo';
  if (!supplier && config?.role !== 'consumer') fail('WORKSPACE_UNKNOWN', origin);
  const base = resolve(
    options.base ||
      process.env.XJ_BASE_SCREEN_DIR ||
      (supplier ? origin : join(origin, config?.peer || '../base-screen')),
  );
  const host = resolve(
    options.host ||
      process.env.BASE_SCREEN_HOST_DIR ||
      (supplier ? join(origin, config?.peer || '../xjdatahub') : origin),
  );
  if (existsSync(base) && readJson(join(base, 'package.json')).name !== 'base-screen-monorepo') {
    fail('SUPPLIER_INVALID', base);
  }
  if (existsSync(host) && host === base) fail('WORKSPACE_SAME_ROOT', host);
  return { origin, base, host, supplier };
}

export function validateIndex(root, index) {
  if (!Array.isArray(index?.capabilities)) fail('CAPABILITIES_INVALID', INDEX);
  const ids = new Set();
  for (const item of index.capabilities) {
    if (!/^[a-z][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) {
      fail('CAPABILITY_ID_INVALID', String(item.id));
    }
    ids.add(item.id);
    for (const key of ['title', 'owner', 'boundary', 'availability']) {
      if (typeof item[key] !== 'string' || !item[key])
        fail('CAPABILITY_FIELD_INVALID', item.id + '.' + key);
    }
    if (!Array.isArray(item.references) || !Array.isArray(item.checks))
      fail('CAPABILITY_REFERENCES_INVALID', item.id);
    for (const ref of item.references) {
      if (!existsSync(safePath(root, ref))) fail('REFERENCE_MISSING', ref);
    }
  }
  return index;
}

// npm tar files use ustar headers and may include POSIX long-path metadata.
export function tarFiles(path) {
  const data = gunzipSync(readFileSync(path));
  const files = new Map();
  let paxPath;
  let longPath;
  for (let offset = 0; offset + 512 <= data.length; ) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const string = (from, length) =>
      header
        .subarray(from, from + length)
        .toString()
        .split('\0')[0];
    const size = Number.parseInt(string(124, 12).trim() || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > data.length)
      fail('TARBALL_INVALID', path);
    const content = data.subarray(offset + 512, offset + 512 + size);
    const type = string(156, 1);
    const prefix = string(345, 155);
    const name = paxPath || longPath || (prefix ? prefix + '/' : '') + string(0, 100);
    if (type === 'x') {
      const match = content.toString().match(/(?:^|\n)\d+ path=([^\n]+)\n/);
      paxPath = match?.[1];
    } else if (type === 'L') {
      longPath = content.toString().replace(/\0.*$/s, '');
    } else {
      if (type === '0' || type === '') {
        if (!name.startsWith('package/') || name.split('/').includes('..'))
          fail('TARBALL_PATH_INVALID', name);
        files.set(name.slice(8), content);
      } else if (type !== '5' && type !== 'g') {
        fail('TARBALL_ENTRY_INVALID', name);
      }
      paxPath = undefined;
      longPath = undefined;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!files.has('package.json')) fail('TARBALL_MANIFEST_MISSING', path);
  return files;
}

export function managedFiles(root, prefixes) {
  return [...new Set(prefixes.flatMap((prefix) => walk(root, prefix)))].sort();
}

export function removeFile(root, name) {
  const target = safePath(root, name);
  if (existsSync(target)) {
    if (!lstatSync(target).isFile()) fail('REMOVE_NOT_FILE', name);
    rmSync(target);
  }
}
