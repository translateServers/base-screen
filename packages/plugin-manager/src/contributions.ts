import type {
  BaseScreenPluginBlueprintActionContribution,
  BaseScreenPluginCatalog,
  BaseScreenPluginDataProcessorContribution,
  BaseScreenPluginDataResourceTypeContribution,
  BaseScreenPluginFragmentContribution,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { type ContributionIndexBuckets, indexContribution } from './contribution-kind-plan.js';

export function createRuntimeContributionIndex(
  plugins: BaseScreenPluginCatalog,
): BaseScreenRuntimeContributionIndex {
  const buckets: ContributionIndexBuckets = {
    resourceTypes: new Map<string, BaseScreenPluginDataResourceTypeContribution>(),
    blueprintActions: new Map<string, BaseScreenPluginBlueprintActionContribution>(),
    dataProcessors: new Map<string, BaseScreenPluginDataProcessorContribution>(),
    blueprintCapabilities: new Set<string>(),
    fragments: new Map<string, BaseScreenPluginFragmentContribution>(),
  };
  for (const plugin of plugins.list()) {
    for (const contribution of plugin.contributions) {
      // 每个 kind 的投影去向与授权门由 manager 侧计划表决定，见 contribution-kind-plan.ts。
      indexContribution(contribution, plugin.grantedCapabilities, buckets);
    }
  }
  const { resourceTypes, blueprintActions, dataProcessors, blueprintCapabilities } = buckets;
  const { fragments } = buckets;
  const resourceTypeList: readonly BaseScreenPluginDataResourceTypeContribution[] = Object.freeze(
    [...resourceTypes.values()].sort((first, second) => first.id.localeCompare(second.id)),
  );
  const blueprintActionList: readonly BaseScreenPluginBlueprintActionContribution[] = Object.freeze(
    [...blueprintActions.values()].sort((first, second) => first.id.localeCompare(second.id)),
  );
  const dataProcessorList: readonly BaseScreenPluginDataProcessorContribution[] = Object.freeze(
    [...dataProcessors.values()].sort((first, second) => first.id.localeCompare(second.id)),
  );
  // 分片保留插件声明顺序（不按 id 排序）：物料库按插件作者给的顺序展示推荐组合。
  const fragmentList = Object.freeze([...fragments.values()]);
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
    getFragment(fragmentId: string) {
      return fragments.get(fragmentId);
    },
    listFragments() {
      return fragmentList;
    },
  });
}
