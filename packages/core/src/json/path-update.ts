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
  const copy = structuredCloneSafe(root);
  if (copy === undefined) return undefined;
  let current: unknown = copy;
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index]!;
    const next = path[index + 1]!;
    if (current === null || typeof current !== 'object') return undefined;
    const record = current as Record<string, unknown>;
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) return undefined;
      const container = current[segment];
      if (container === null || typeof container !== 'object') return undefined;
      ensureChild(container, next);
      current = container;
    } else {
      if (typeof segment !== 'string') return undefined;
      const container = record[segment];
      if (container === null || typeof container !== 'object') return undefined;
      ensureChild(container, next);
      current = container;
    }
  }
  const final = path[path.length - 1]!;
  if (current === null || typeof current !== 'object') return undefined;
  if (Array.isArray(current)) {
    if (typeof final !== 'number' || final >= current.length) return undefined;
    current[final] = value;
  } else {
    if (typeof final !== 'string') return undefined;
    (current as Record<string, unknown>)[final] = value;
  }
  return copy;
}

export function deleteScreenJsonPath(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
): ScreenJsonObject | undefined {
  if (!isValidPath(path) || path.length === 0) return undefined;
  const copy = structuredCloneSafe(root);
  if (copy === undefined) return undefined;
  let current: unknown = copy;
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index]!;
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) return undefined;
      current = current[segment];
    } else {
      if (typeof segment !== 'string') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  const final = path[path.length - 1]!;
  if (current === null || typeof current !== 'object') return undefined;
  if (Array.isArray(current)) {
    if (typeof final !== 'number' || final >= current.length) return undefined;
    current.splice(final, 1);
  } else {
    if (typeof final !== 'string') return undefined;
    delete (current as Record<string, unknown>)[final];
  }
  return copy;
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
  const copy = structuredCloneSafe(root);
  if (copy === undefined) return undefined;
  const container = resolveContainer(copy, path);
  if (container === undefined || !Array.isArray(container)) return undefined;
  container.splice(Math.min(index, container.length), 0, item);
  return copy;
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
  const copy = structuredCloneSafe(root);
  if (copy === undefined) return undefined;
  const container = resolveContainer(copy, path);
  if (container === undefined || !Array.isArray(container)) return undefined;
  if (from < 0 || from >= container.length || to < 0 || to >= container.length) return undefined;
  const [item] = container.splice(from, 1);
  if (item === undefined) return undefined;
  container.splice(to, 0, item);
  return copy;
}

export function removeScreenJsonArrayItem(
  root: ScreenJsonObject,
  path: readonly (string | number)[],
  index: number,
): ScreenJsonObject | undefined {
  if (!isValidPath(path) || path.length === 0 || !Number.isInteger(index) || index < 0) {
    return undefined;
  }
  const copy = structuredCloneSafe(root);
  if (copy === undefined) return undefined;
  const container = resolveContainer(copy, path);
  if (container === undefined || !Array.isArray(container)) return undefined;
  if (index >= container.length) return undefined;
  container.splice(index, 1);
  return copy;
}

function resolveContainer(root: ScreenJsonObject, path: readonly (string | number)[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) return undefined;
      current = current[segment];
    } else {
      if (typeof segment !== 'string') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
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

function structuredCloneSafe(value: ScreenJsonObject): ScreenJsonObject | undefined {
  try {
    return JSON.parse(JSON.stringify(value)) as ScreenJsonObject;
  } catch {
    return undefined;
  }
}
