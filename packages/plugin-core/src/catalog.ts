import { parseScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenPluginCatalog,
  BaseScreenPluginCatalogEntry,
  BaseScreenPluginPanelCatalog,
  BaseScreenPluginPanelCatalogEntry,
} from './contracts.js';

export function createBaseScreenMaterialCatalog(
  entries: readonly BaseScreenMaterialCatalogEntry[],
): BaseScreenMaterialCatalog {
  assertUnique(entries, (entry) => entry.manifest.type, 'material type');
  const sorted = entries
    .map((entry) => {
      // The Plugin Manager reconstructs catalog entries from the registered
      // custom-element constructor. Keep trusted runtime adapters discoverable
      // across that boundary while leaving the serialized manifest unchanged.
      attachTabularDataAdapter(entry);
      return freeze({
        manifest: cloneJson(entry.manifest),
        constructor: entry.constructor,
        ...(entry.tabularDataAdapter === undefined
          ? {}
          : { tabularDataAdapter: entry.tabularDataAdapter }),
      });
    })
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

function attachTabularDataAdapter(entry: BaseScreenMaterialCatalogEntry): void {
  const adapter = entry.tabularDataAdapter;
  if (adapter === undefined) return;
  const constructor = entry.constructor as BaseScreenMaterialConstructor;
  const existing = Object.getOwnPropertyDescriptor(constructor, 'tabularDataAdapter');
  if (existing !== undefined) {
    if (existing.value !== adapter) {
      throw new RangeError('Material constructor contains a different dataset adapter.');
    }
    return;
  }
  try {
    Object.defineProperty(constructor, 'tabularDataAdapter', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: adapter,
    });
  } catch {
    throw new RangeError('Material constructor cannot host a dataset adapter.');
  }
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

export function createBaseScreenPluginPanelCatalog(
  entries: readonly BaseScreenPluginPanelCatalogEntry[],
): BaseScreenPluginPanelCatalog {
  assertUnique(entries, (entry) => entry.contribution.id, 'panel id');
  const sorted = entries
    .map((entry) =>
      freeze({
        pluginId: entry.pluginId,
        contribution: cloneJson(entry.contribution),
        // 构造函数是运行时实体，与物料 catalog 同理按引用保留，不参与 JSON 克隆。
        constructor: entry.constructor,
      }),
    )
    .sort((left, right) => compareStrings(left.contribution.id, right.contribution.id));
  const byId = new Map(sorted.map((entry) => [entry.contribution.id, entry]));
  return {
    get(panelId) {
      return byId.get(panelId);
    },
    has(panelId) {
      return byId.has(panelId);
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
