import type { ScreenDiagnostic } from '@base-screen/contracts';
import type { BaseScreenPluginContribution } from '@base-screen/plugin-core';
import { DiagnosticCollector } from './diagnostics.js';
import type { Candidate, ManagerInput } from './preflight-types.js';

const MAX_DEPENDENCY_EDGES = 16_384;
const SUPPORTED_BLUEPRINT_CAPABILITIES = new Set([
  'blueprint.trigger.material-event',
  'blueprint.value.event-payload',
  'blueprint.value.variable',
  'blueprint.condition.compare',
  'blueprint.action.set-variable',
  'blueprint.action.emit-host-event',
]);

export function resolveCandidates(
  candidates: readonly Candidate[],
  diagnostics: DiagnosticCollector,
): readonly Candidate[] {
  const ordered = [...candidates].sort(compareCandidates);
  const byId = new Map<string, Candidate>();
  for (const candidate of ordered) {
    if (byId.has(candidate.manifest.id)) {
      diagnostics.add(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        ['plugins', candidate.index, 'manifest', 'id'],
        'Plugin id is duplicated.',
      );
    } else {
      byId.set(candidate.manifest.id, candidate);
    }
  }
  validateContributions(ordered, diagnostics);
  if (diagnostics.hasErrors) return [];

  let edgeCount = 0;
  const remaining = new Map(byId);
  const dependencyCount = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const candidate of ordered) {
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
  if (diagnostics.hasErrors) return [];

  const resolved: Candidate[] = [];
  const ready = ordered.filter((candidate) => dependencyCount.get(candidate.manifest.id) === 0);
  while (ready.length > 0) {
    const current = ready.shift()!;
    if (!remaining.delete(current.manifest.id)) continue;
    resolved.push(current);
    for (const dependentId of dependents.get(current.manifest.id) ?? []) {
      const nextCount = dependencyCount.get(dependentId)! - 1;
      dependencyCount.set(dependentId, nextCount);
      const dependent = remaining.get(dependentId);
      if (nextCount === 0 && dependent !== undefined) {
        ready.push(dependent);
        ready.sort(compareCandidates);
      }
    }
  }
  for (const candidate of [...remaining.values()].sort(compareCandidates)) {
    diagnostics.add(
      'PLUGIN_CORE_DEPENDENCY_CYCLE',
      ['plugins', candidate.index, 'manifest', 'dependencies'],
      'Plugin dependency graph contains a cycle.',
    );
  }
  return diagnostics.hasErrors ? [] : resolved;
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
      if (!hostGrants.has(capability)) {
        diagnostics.add(
          'PLUGIN_CORE_CAPABILITY_UNAUTHORIZED',
          ['plugins', candidate.index, 'manifest', 'capabilities'],
          'Plugin capability is not approved by the host.',
        );
      } else if (capability === 'command.execute' && input.createCommandPort === undefined) {
        diagnostics.add(
          'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
          ['plugins', candidate.index, 'manifest', 'capabilities'],
          'Plugin command capability has no compatible port factory.',
        );
      } else if (
        capability !== 'command.execute' &&
        !SUPPORTED_BLUEPRINT_CAPABILITIES.has(capability)
      ) {
        diagnostics.add(
          'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
          ['plugins', candidate.index, 'manifest', 'capabilities'],
          'Plugin capability is not supported by this host.',
        );
      } else {
        granted.push(capability);
      }
    }
    grants.set(candidate, Object.freeze(granted.sort(compareStrings)));
  }
  return grants;
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
        if (!SUPPORTED_BLUEPRINT_CAPABILITIES.has(contribution.id)) {
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
