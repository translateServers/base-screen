import type { ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';

const MAX_PATH_DEPTH = 16;

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function getScreenJsonPath(
  root: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
): ScreenJsonValue | undefined {
  if (!isValidPath(path)) return undefined;
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    const record = current as Record<string, unknown>;
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) return undefined;
      current = current[segment];
    } else {
      if (typeof segment !== 'string' || !Object.hasOwn(record, segment)) return undefined;
      current = record[segment];
    }
  }
  return current as ScreenJsonValue | undefined;
}

export function setScreenJsonPath(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
  value: ScreenJsonValue,
): ScreenJsonObject | undefined {
  if (!isValidPath(path) || path.length === 0) return undefined;
  const walk = copyPathContainers(root, path, path.length - 1, true);
  if (walk === undefined) return undefined;
  const parent = walk.container;
  const final = path[path.length - 1]!;
  if (Array.isArray(parent)) {
    if (typeof final !== 'number' || final >= parent.length) return undefined;
    parent[final] = value;
  } else {
    if (typeof final !== 'string') return undefined;
    parent[final] = value;
  }
  return walk.root;
}

export function deleteScreenJsonPath(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
): ScreenJsonObject | undefined {
  if (!isValidPath(path) || path.length === 0) return undefined;
  const walk = copyPathContainers(root, path, path.length - 1, false);
  if (walk === undefined) return undefined;
  const parent = walk.container;
  const final = path[path.length - 1]!;
  if (Array.isArray(parent)) {
    if (typeof final !== 'number' || final >= parent.length) return undefined;
    parent.splice(final, 1);
  } else {
    if (typeof final !== 'string') return undefined;
    delete parent[final];
  }
  return walk.root;
}

export function setScreenJsonArrayItem(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
  index: number,
  item: ScreenJsonValue,
): ScreenJsonObject | undefined {
  return setScreenJsonPath(root, [...path, index], item);
}

export function insertScreenJsonArrayItem(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
  index: number,
  item: ScreenJsonValue,
): ScreenJsonObject | undefined {
  if (!isValidPath(path) || path.length === 0 || !Number.isInteger(index) || index < 0) {
    return undefined;
  }
  const walk = copyPathContainers(root, path, path.length, false);
  if (walk === undefined) return undefined;
  const container = walk.container;
  if (!Array.isArray(container)) return undefined;
  container.splice(Math.min(index, container.length), 0, item);
  return walk.root;
}

export function moveScreenJsonArrayItem(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
  from: number,
  to: number,
): ScreenJsonObject | undefined {
  if (!isValidPath(path) || path.length === 0 || !Number.isInteger(from) || !Number.isInteger(to)) {
    return undefined;
  }
  const walk = copyPathContainers(root, path, path.length, false);
  if (walk === undefined) return undefined;
  const container = walk.container;
  if (!Array.isArray(container)) return undefined;
  if (from < 0 || from >= container.length || to < 0 || to >= container.length) return undefined;
  const [item] = container.splice(from, 1);
  if (item === undefined) return undefined;
  container.splice(to, 0, item);
  return walk.root;
}

export function removeScreenJsonArrayItem(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
  index: number,
): ScreenJsonObject | undefined {
  if (!isValidPath(path) || path.length === 0 || !Number.isInteger(index) || index < 0) {
    return undefined;
  }
  const walk = copyPathContainers(root, path, path.length, false);
  if (walk === undefined) return undefined;
  const container = walk.container;
  if (!Array.isArray(container)) return undefined;
  if (index >= container.length) return undefined;
  container.splice(index, 1);
  return walk.root;
}

interface ScreenJsonPathCopy {
  readonly root: ScreenJsonObject;
  readonly container: Record<string, unknown> | unknown[];
}

/**
 * 结构共享路径拷贝：沿 path 前 depth 个段浅拷贝容器并挂接到新 root，
 * 兄弟子树保持引用共享。createMissingKeys 为 true 时按原语义补建缺失的
 * 对象键（仅对象容器、仅字符串段）。
 */
function copyPathContainers(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
  depth: number,
  createMissingKeys: boolean,
): ScreenJsonPathCopy | undefined {
  let current: Record<string, unknown> | unknown[] = { ...(root as Record<string, unknown>) };
  const nextRoot = current;
  for (let index = 0; index < depth; index++) {
    const segment = path[index]!;
    let child: unknown;
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) return undefined;
      child = current[segment];
    } else {
      if (typeof segment !== 'string') return undefined;
      child = current[segment];
    }
    if (child === null || typeof child !== 'object') return undefined;
    const copy = Array.isArray(child)
      ? [...(child as unknown[])]
      : { ...(child as Record<string, unknown>) };
    if (createMissingKeys) {
      ensureChild(copy, path[index + 1]!);
    }
    if (Array.isArray(current)) {
      (current as unknown[])[segment as number] = copy;
    } else {
      (current as Record<string, unknown>)[segment as string] = copy;
    }
    current = copy;
  }
  return { root: nextRoot as ScreenJsonObject, container: current };
}

function ensureChild(container: unknown, next: string | number): void {
  if (container === null || typeof container !== 'object') return;
  if (Array.isArray(container)) return;
  if (typeof next === 'string' && !Object.hasOwn(container, next)) {
    (container as Record<string, unknown>)[next] = {};
  }
}

function isValidPath(path: readonly (string | number)[]): boolean {
  if (path.length === 0 || path.length > MAX_PATH_DEPTH) return false;
  for (let index = 0; index < path.length; index++) {
    const segment = path[index]!;
    if (typeof segment === 'number') {
      if (!Number.isInteger(segment) || segment < 0) return false;
      continue;
    }
    if (
      segment.length === 0 ||
      segment.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(segment) ||
      DANGEROUS_KEYS.has(segment)
    ) {
      return false;
    }
  }
  return true;
}
