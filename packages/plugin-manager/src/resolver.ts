import { SCREEN_BLUEPRINT_CAPABILITY_IDS } from '@base-screen/contracts';
import type { BaseScreenPluginContribution } from '@base-screen/plugin-core';
import { DiagnosticCollector } from './diagnostics.js';
import type { Candidate, ManagerInput } from './preflight-types.js';

const MAX_DEPENDENCY_EDGES = 16_384;

/**
 * 能力判定表：宿主与插件可引入的能力集合在此一处声明。
 * `port` 指明该能力需要宿主提供的端口工厂（无 factory 即 CAPABILITY_INCOMPATIBLE）；
 * `blueprint` 标记可作为 blueprintCapability 贡献被引用的能力 id。
 * 新增能力只需在表里加一行，管线不再堆积条件分支。
 */
export interface PluginCapabilityDescriptor {
  readonly id: string;
  readonly port?: 'command' | 'design';
  readonly blueprint?: boolean;
}

export const PLUGIN_CAPABILITY_DESCRIPTORS: readonly PluginCapabilityDescriptor[] = Object.freeze([
  { id: 'command.execute', port: 'command' },
  { id: 'design.read', port: 'design' },
  // ADR-0076：插件参与文档的运行时语义。这两项都是**宿主→插件**方向（宿主/引擎发起请求，
  // manager 路由到插件自己的 handler），不要求宿主为插件提供任何端口，因此无工厂——
  // 它们只标记"该插件声明的处理器/动作可被执行"。
  { id: 'data.process' },
  { id: 'blueprint.action.execute' },
  // 蓝图能力 id 的唯一来源在 contracts：engine 需据同一词汇归一化规则能力，
  // 两侧各自硬编码会在漂移时静默授权失败。
  ...SCREEN_BLUEPRINT_CAPABILITY_IDS.map((id) => ({ id, blueprint: true })),
]);

const CAPABILITY_TABLE = new Map(PLUGIN_CAPABILITY_DESCRIPTORS.map((item) => [item.id, item]));

/**
 * 解析幸存候选：重复 id 按稳定顺序 first-wins（后声明方获得诊断并被排除出图），
 * 依赖缺失/成环只标记对应候选，不再整体熔断——调用方按诊断归属淘汰插件后重入，
 * 直到幸存集合稳定。返回值是当前幸存集的拓扑序（可能只包含一部分候选）。
 */
export function resolveCandidates(
  candidates: readonly Candidate[],
  diagnostics: DiagnosticCollector,
): readonly Candidate[] {
  const ordered = [...candidates].sort(compareCandidates);
  const byId = new Map<string, Candidate>();
  const deduped: Candidate[] = [];
  for (const candidate of ordered) {
    if (byId.has(candidate.manifest.id)) {
      diagnostics.add(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        ['plugins', candidate.index, 'manifest', 'id'],
        'Plugin id is duplicated.',
      );
      continue;
    }
    byId.set(candidate.manifest.id, candidate);
    deduped.push(candidate);
  }
  validateContributions(deduped, diagnostics);

  let edgeCount = 0;
  const remaining = new Map<string, Candidate>();
  const dependencyCount = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const unresolvedDeps = new Set<string>();
  for (const candidate of deduped) {
    remaining.set(candidate.manifest.id, candidate);
    let count = 0;
    for (const dependency of candidate.manifest.dependencies) {
      edgeCount++;
      const resolved = byId.get(dependency.id);
      if (resolved === undefined) {
        diagnostics.add(
          'PLUGIN_CORE_DEPENDENCY_MISSING',
          ['plugins', candidate.index, 'manifest', 'dependencies'],
          'Plugin dependency is missing from the candidate set.',
        );
        unresolvedDeps.add(candidate.manifest.id);
        continue;
      }
      count++;
      const list = dependents.get(dependency.id) ?? [];
      list.push(candidate.manifest.id);
      dependents.set(dependency.id, list);
    }
    dependencyCount.set(candidate.manifest.id, count);
  }
  if (edgeCount > MAX_DEPENDENCY_EDGES) {
    diagnostics.add('PLUGIN_CORE_LIMIT_EXCEEDED', ['plugins'], 'Dependency edge limit exceeded.');
  }

  const resolved: Candidate[] = [];
  const ready = deduped.filter(
    (candidate) =>
      dependencyCount.get(candidate.manifest.id) === 0 &&
      !unresolvedDeps.has(candidate.manifest.id),
  );
  while (ready.length > 0) {
    const current = ready.shift()!;
    if (!remaining.delete(current.manifest.id)) continue;
    resolved.push(current);
    for (const dependentId of dependents.get(current.manifest.id) ?? []) {
      const nextCount = dependencyCount.get(dependentId)! - 1;
      dependencyCount.set(dependentId, nextCount);
      const dependent = remaining.get(dependentId);
      if (nextCount === 0 && dependent !== undefined && !unresolvedDeps.has(dependentId)) {
        ready.push(dependent);
        ready.sort(compareCandidates);
      }
    }
  }
  for (const candidate of [...remaining.values()].sort(compareCandidates)) {
    if (unresolvedDeps.has(candidate.manifest.id)) continue;
    diagnostics.add(
      'PLUGIN_CORE_DEPENDENCY_CYCLE',
      ['plugins', candidate.index, 'manifest', 'dependencies'],
      'Plugin dependency graph contains a cycle.',
    );
  }
  return resolved;
}

export function validateCapabilityPlan(
  candidates: readonly Candidate[],
  input: ManagerInput,
  diagnostics: DiagnosticCollector,
): ReadonlyMap<Candidate, readonly string[]> {
  const grants = new Map<Candidate, readonly string[]>();
  for (const candidate of candidates) {
    const hostGrants = new Set(input.grantedCapabilities.get(candidate.manifest.id) ?? []);
    const granted: string[] = [];
    for (const capability of candidate.manifest.capabilities) {
      const descriptor = CAPABILITY_TABLE.get(capability);
      if (!hostGrants.has(capability)) {
        diagnostics.add(
          'PLUGIN_CORE_CAPABILITY_UNAUTHORIZED',
          ['plugins', candidate.index, 'manifest', 'capabilities'],
          'Plugin capability is not approved by the host.',
        );
      } else if (descriptor === undefined) {
        diagnostics.add(
          'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
          ['plugins', candidate.index, 'manifest', 'capabilities'],
          'Plugin capability is not supported by this host.',
        );
      } else if (descriptor.port !== undefined && !hasPortFactory(input, descriptor.port)) {
        diagnostics.add(
          'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
          ['plugins', candidate.index, 'manifest', 'capabilities'],
          'Plugin capability has no compatible port factory.',
        );
      } else {
        granted.push(capability);
      }
    }
    grants.set(candidate, Object.freeze(granted.sort(compareStrings)));
  }
  return grants;
}

function hasPortFactory(
  input: ManagerInput,
  port: NonNullable<PluginCapabilityDescriptor['port']>,
): boolean {
  switch (port) {
    case 'command':
      return input.createCommandPort !== undefined;
    case 'design':
      return input.createDesignReadPort !== undefined;
  }
}

function validateContributions(
  candidates: readonly Candidate[],
  diagnostics: DiagnosticCollector,
): void {
  const identities = new Set<string>();
  for (const candidate of candidates) {
    for (let index = 0; index < candidate.manifest.contributions.length; index++) {
      const contribution = candidate.manifest.contributions[index]!;
      const identity = contributionIdentity(contribution);
      if (identities.has(identity)) {
        diagnostics.add(
          contribution.kind === 'material'
            ? 'PLUGIN_CORE_IDENTITY_CONFLICT'
            : 'PLUGIN_CORE_CONTRIBUTION_CONFLICT',
          ['plugins', candidate.index, 'manifest', 'contributions', index],
          'Contribution identity conflicts with another plugin.',
        );
      }
      identities.add(identity);
      if (
        contribution.kind === 'command' &&
        !candidate.manifest.capabilities.includes(contribution.requiredCapability)
      ) {
        diagnostics.add(
          'PLUGIN_CORE_CAPABILITY_UNDECLARED',
          ['plugins', candidate.index, 'manifest', 'contributions', index],
          'Command contribution requires an undeclared capability.',
        );
      }
      if (contribution.kind === 'blueprintCapability') {
        if (CAPABILITY_TABLE.get(contribution.id)?.blueprint !== true) {
          diagnostics.add(
            'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
            ['plugins', candidate.index, 'manifest', 'contributions', index],
            'Blueprint contribution is not supported by this host.',
          );
        }
        if (!candidate.manifest.capabilities.includes(contribution.id)) {
          diagnostics.add(
            'PLUGIN_CORE_CAPABILITY_UNDECLARED',
            ['plugins', candidate.index, 'manifest', 'contributions', index],
            'Blueprint contribution requires a declared capability.',
          );
        }
      }
    }
  }
}

function contributionIdentity(contribution: BaseScreenPluginContribution): string {
  return contribution.kind === 'material'
    ? `material:${contribution.type}`
    : `${contribution.kind}:${contribution.id}`;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return compareStrings(left.manifest.id, right.manifest.id) || left.index - right.index;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
