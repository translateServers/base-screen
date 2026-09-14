import type {
  BaseScreenPluginBlueprintActionContribution,
  BaseScreenPluginCatalog,
  BaseScreenPluginDataProcessorContribution,
  BaseScreenPluginDataResourceTypeContribution,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';

export function createRuntimeContributionIndex(
  plugins: BaseScreenPluginCatalog,
): BaseScreenRuntimeContributionIndex {
  const resourceTypes = new Map<string, BaseScreenPluginDataResourceTypeContribution>();
  const blueprintActions = new Map<string, BaseScreenPluginBlueprintActionContribution>();
  const dataProcessors = new Map<string, BaseScreenPluginDataProcessorContribution>();
  const blueprintCapabilities = new Set<string>();
  for (const plugin of plugins.list()) {
    for (const contribution of plugin.contributions) {
      if (contribution.kind === 'dataResourceType') {
        resourceTypes.set(contribution.id, contribution);
      } else if (contribution.kind === 'blueprintAction') {
        // ADR-0076：动作只在其 requiredCapability 被授权时进入索引——与 command 的
        // "声明 ∩ 授权"一致，未授权动作对作者面与执行面都不可见。
        if (plugin.grantedCapabilities.includes(contribution.requiredCapability)) {
          blueprintActions.set(contribution.id, contribution);
        }
      } else if (contribution.kind === 'dataProcessor') {
        dataProcessors.set(contribution.id, contribution);
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
  const blueprintActionList: readonly BaseScreenPluginBlueprintActionContribution[] = Object.freeze(
    [...blueprintActions.values()].sort((first, second) => first.id.localeCompare(second.id)),
  );
  const dataProcessorList: readonly BaseScreenPluginDataProcessorContribution[] = Object.freeze(
    [...dataProcessors.values()].sort((first, second) => first.id.localeCompare(second.id)),
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
    getBlueprintAction(actionId: string) {
      return blueprintActions.get(actionId);
    },
    listBlueprintActions() {
      return blueprintActionList;
    },
    getDataProcessor(processorId: string) {
      return dataProcessors.get(processorId);
    },
    listDataProcessors() {
      return dataProcessorList;
    },
  });
}
