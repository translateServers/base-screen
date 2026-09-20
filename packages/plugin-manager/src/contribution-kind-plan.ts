import type {
  BaseScreenPluginBlueprintActionContribution,
  BaseScreenPluginContribution,
  BaseScreenPluginContributionKind,
  BaseScreenPluginDataProcessorContribution,
  BaseScreenPluginDataResourceTypeContribution,
} from '@base-screen/plugin-core';

/**
 * 贡献类型的 manager 侧解释表。
 *
 * plugin-core 的贡献类型描述符声明「这个 kind 是什么」（字段白名单、身份、handler 字段）；
 * 本表声明「这个 kind 往哪去」——是否进入运行时贡献索引、进入哪个桶、进索引前是否必须先过授权。
 *
 * 键是 plugin-core 导出的 kind 联合类型，所以这张表是**穷尽式**的：新增一种贡献类型而漏了表项，
 * 这里会直接编译失败，而不是在运行期静默漏掉投影。
 */
export type ContributionOfKind<K extends BaseScreenPluginContributionKind> = Extract<
  BaseScreenPluginContribution,
  { readonly kind: K }
>;

export interface ContributionIndexBuckets {
  readonly resourceTypes: Map<string, BaseScreenPluginDataResourceTypeContribution>;
  readonly blueprintActions: Map<string, BaseScreenPluginBlueprintActionContribution>;
  readonly dataProcessors: Map<string, BaseScreenPluginDataProcessorContribution>;
  readonly blueprintCapabilities: Set<string>;
}

export interface ContributionKindPlanEntry<K extends BaseScreenPluginContributionKind> {
  /**
   * 该 kind 的贡献必须以声明的能力已获授权为前提才可见（声明 ∩ 批准 ∩ 支持）。
   * blueprintAction 与 blueprintCapability 适用；dataResourceType / dataProcessor 不适用。
   */
  readonly requiresGrant?: boolean;
  /** 写入运行时贡献索引的哪个桶；缺省表示该 kind 不进入索引。 */
  readonly index?: (contribution: ContributionOfKind<K>, buckets: ContributionIndexBuckets) => void;
}

export type ContributionKindPlan = {
  readonly [K in BaseScreenPluginContributionKind]: ContributionKindPlanEntry<K>;
};

export const CONTRIBUTION_KIND_PLAN: ContributionKindPlan = {
  material: {},
  command: {},
  dataResourceType: {
    index(contribution, buckets) {
      buckets.resourceTypes.set(contribution.id, contribution);
    },
  },
  blueprintAction: {
    requiresGrant: true,
    index(contribution, buckets) {
      buckets.blueprintActions.set(contribution.id, contribution);
    },
  },
  dataProcessor: {
    index(contribution, buckets) {
      buckets.dataProcessors.set(contribution.id, contribution);
    },
  },
  blueprintCapability: {
    requiresGrant: true,
    index(contribution, buckets) {
      buckets.blueprintCapabilities.add(contribution.id);
    },
  },
  panel: {},
  inspectorControl: {},
};

/**
 * 分发到对应 kind 的表项。
 *
 * 唯一的类型断言点：per-kind 的 `index` 回调按各自的贡献类型收窄，而这里的调用方只有联合类型，
 * TypeScript 无法自行关联 `contribution.kind` 与 `CONTRIBUTION_KIND_PLAN[contribution.kind]`。
 * 表本身是穷尽的，所以运行期只可能命中已声明的 kind。
 */
export function planForContribution(
  contribution: BaseScreenPluginContribution,
): ContributionKindPlanEntry<BaseScreenPluginContributionKind> {
  return CONTRIBUTION_KIND_PLAN[
    contribution.kind
  ] as ContributionKindPlanEntry<BaseScreenPluginContributionKind>;
}

/** 按计划表把一项贡献写入索引桶；未配置 `index` 的 kind 静默跳过（不参与投影）。 */
export function indexContribution(
  contribution: BaseScreenPluginContribution,
  grantedCapabilities: readonly string[],
  buckets: ContributionIndexBuckets,
): void {
  const plan = planForContribution(contribution);
  if (plan.index === undefined) return;
  if (plan.requiresGrant === true && !hasGrantedCapability(contribution, grantedCapabilities)) {
    return;
  }
  (plan.index as (c: BaseScreenPluginContribution, b: ContributionIndexBuckets) => void)(
    contribution,
    buckets,
  );
}

/** 该贡献的授权门：只有声明了 `requiredCapability` 的 kind 需要命中授权集合。 */
function hasGrantedCapability(
  contribution: BaseScreenPluginContribution,
  grantedCapabilities: readonly string[],
): boolean {
  const required = (contribution as { readonly requiredCapability?: unknown }).requiredCapability;
  if (typeof required === 'string') {
    return grantedCapabilities.includes(required);
  }
  // blueprintCapability 以自身 id 作为能力：授权集合里出现该 id 才可见。
  return grantedCapabilities.includes(contributionIdentityId(contribution));
}

function contributionIdentityId(contribution: BaseScreenPluginContribution): string {
  const identity = contribution as { readonly id?: unknown; readonly type?: unknown };
  return typeof identity.id === 'string' ? identity.id : '';
}
