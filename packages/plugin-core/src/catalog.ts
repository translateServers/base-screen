import { parseScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenPluginCatalog,
  BaseScreenPluginCatalogEntry,
} from './contracts.js';

export function createBaseScreenMaterialCatalog(
  entries: readonly BaseScreenMaterialCatalogEntry[],
): BaseScreenMaterialCatalog {
  assertUnique(entries, (entry) => entry.manifest.type, 'material type');
  const sorted = entries
    .map((entry) =>
      freeze({
        manifest: cloneJson(entry.manifest),
        constructor: entry.constructor,
        ...(entry.tabularDataAdapter === undefined
          ? {}
          : { tabularDataAdapter: entry.tabularDataAdapter }),
      }),
    )
    .sort((left, right) => compareStrings(left.manifest.type, right.manifest.type));
  const byType = new Map(sorted.map((entry) => [entry.manifest.type, entry]));
  return {
    get(type) {
      return byType.get(type);
    },
    has(type) {
      return byType.has(type);
    },
    list() {
      return [...sorted];
    },
  };
}

export function createBaseScreenPluginCatalog(
  entries: readonly BaseScreenPluginCatalogEntry[],
): BaseScreenPluginCatalog {
  assertUnique(entries, (entry) => entry.manifest.id, 'plugin id');
  const sorted = entries
    .map((entry) =>
      freeze({
        manifest: cloneJson(entry.manifest),
        grantedCapabilities: freeze([...entry.grantedCapabilities].sort(compareStrings)),
        contributions: freeze(entry.contributions.map(cloneJson)),
      }),
    )
    .sort((left, right) => compareStrings(left.manifest.id, right.manifest.id));
  const byId = new Map(sorted.map((entry) => [entry.manifest.id, entry]));
  return {
    get(pluginId) {
      return byId.get(pluginId);
    },
    has(pluginId) {
      return byId.has(pluginId);
    },
    list() {
      return [...sorted];
    },
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUnique<T>(entries: readonly T[], key: (entry: T) => string, label: string): void {
  const identities = new Set<string>();
  for (const entry of entries) {
    const identity = key(entry);
    if (identities.has(identity)) {
      throw new RangeError(`Catalog contains a duplicate ${label}.`);
    }
    identities.add(identity);
  }
}

function cloneJson<T>(value: T): T {
  const parsed = parseScreenJsonValue(value);
  if (!parsed.ok) {
    throw new RangeError('Catalog entries must contain valid JSON data.');
  }
  return freeze(parsed.value as T);
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
