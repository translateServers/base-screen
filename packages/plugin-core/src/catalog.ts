import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenPluginCatalog,
  BaseScreenPluginCatalogEntry,
} from './contracts.js';

export function createBaseScreenMaterialCatalog(
  entries: readonly BaseScreenMaterialCatalogEntry[],
): BaseScreenMaterialCatalog {
  const sorted = [...entries]
    .map((entry) => ({ manifest: entry.manifest, constructor: entry.constructor }))
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
  const sorted = [...entries]
    .map((entry) => ({
      manifest: entry.manifest,
      grantedCapabilities: [...entry.grantedCapabilities].sort(compareStrings),
      contributions: [...entry.contributions],
    }))
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
