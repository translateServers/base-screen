import type {
  BaseScreenPluginCatalog,
  BaseScreenPluginContribution,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';

export function createRuntimeContributionIndex(
  plugins: BaseScreenPluginCatalog,
): BaseScreenRuntimeContributionIndex {
  const resourceTypes = new Map<
    string,
    BaseScreenPluginContribution & { readonly kind: 'dataResourceType' }
  >();
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
  return Object.freeze({
    getResourceType(resourceType: string) {
      return resourceTypes.get(resourceType);
    },
    hasBlueprintCapability(capability: string) {
      return blueprintCapabilities.has(capability);
    },
  });
}
