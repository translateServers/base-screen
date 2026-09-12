import type {
  BaseScreenPluginCatalog,
  BaseScreenPluginDataResourceTypeContribution,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';

export function createRuntimeContributionIndex(
  plugins: BaseScreenPluginCatalog,
): BaseScreenRuntimeContributionIndex {
  const resourceTypes = new Map<string, BaseScreenPluginDataResourceTypeContribution>();
  const blueprintCapabilities = new Set<string>();
  for (const plugin of plugins.list()) {
    for (const contribution of plugin.contributions) {
      if (contribution.kind === 'dataResourceType') {
        resourceTypes.set(contribution.id, contribution);
      } else if (
        contribution.kind === 'blueprintCapability' &&
        plugin.grantedCapabilities.includes(contribution.id)
      ) {
        blueprintCapabilities.add(contribution.id);
      }
    }
  }
  const resourceTypeList: readonly BaseScreenPluginDataResourceTypeContribution[] = Object.freeze(
    [...resourceTypes.values()].sort((first, second) => first.id.localeCompare(second.id)),
  );
  return Object.freeze({
    getResourceType(resourceType: string) {
      return resourceTypes.get(resourceType);
    },
    hasBlueprintCapability(capability: string) {
      return blueprintCapabilities.has(capability);
    },
    listResourceTypes() {
      return resourceTypeList;
    },
  });
}
