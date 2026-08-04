import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenPluginActivationContext,
  type BaseScreenPluginContribution,
  type BaseScreenPluginManifest,
  type BaseScreenPluginRuntime,
  type PluginCommandPort,
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import type { BaseScreenPluginManagerOptions, BaseScreenPluginManagerSnapshot } from './types.js';

const SUPPORTED_BLUEPRINT_CAPABILITIES = new Set([
  'blueprint.trigger.material-event',
  'blueprint.value.event-payload',
  'blueprint.value.variable',
  'blueprint.condition.compare',
  'blueprint.action.set-variable',
  'blueprint.action.emit-host-event',
]);

export interface ActivationSession {
  readonly context: BaseScreenPluginActivationContext;
  invalidate(): void;
}

export interface PlannedPlugin {
  readonly index: number;
  readonly runtime: BaseScreenPluginRuntime;
  readonly manifest: BaseScreenPluginManifest;
  readonly grantedCapabilities: readonly string[];
  createSession(): ActivationSession;
}

export interface ActivationPlan {
  readonly materials: readonly BaseScreenMaterialCatalogEntry[];
  readonly plugins: readonly PlannedPlugin[];
}

export function createActivationPlan(
  options: BaseScreenPluginManagerOptions,
): ScreenParseResult<ActivationPlan> {
  const diagnostics: ScreenDiagnostic[] = [];
  const input = readOptions(options, diagnostics);
  if (input === undefined) {
    return failure(diagnostics);
  }
  const candidates = parsePluginCandidates(input.plugins, diagnostics);
  const byId = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (byId.has(candidate.manifest.id)) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          ['plugins', candidate.index, 'manifest', 'id'],
          'Plugin id is duplicated.',
        ),
      );
    } else {
      byId.set(candidate.manifest.id, candidate);
    }
  }
  const ordered = resolveDependencies([...byId.values()], byId, diagnostics);
  validateContributions(candidates, diagnostics);
  validateCapabilities(ordered, input.grantedCapabilities, input.createCommandPort, diagnostics);
  const materials = resolveMaterials(input, candidates, diagnostics);
  if (diagnostics.length > 0) {
    return failure(diagnostics);
  }
  return {
    ok: true,
    value: {
      materials,
      plugins: ordered.map((candidate) => ({
        index: candidate.index,
        runtime: candidate.runtime,
        manifest: candidate.manifest,
        grantedCapabilities: getGrantedCapabilities(candidate.manifest, input.grantedCapabilities),
        createSession: () => createSession(input, candidate),
      })),
    },
    diagnostics: [],
  };
}

type Candidate = {
  readonly index: number;
  readonly runtime: BaseScreenPluginRuntime;
  readonly manifest: BaseScreenPluginManifest;
};

type ValidatedOptions = {
  readonly instanceId: string;
  readonly standaloneMaterialTagNames: readonly string[];
  readonly plugins: readonly BaseScreenPluginRuntime[];
  readonly grantedCapabilities: Readonly<Record<string, readonly string[]>>;
  readonly registry: BaseScreenPluginManagerOptions['registry'];
  readonly createCommandPort: BaseScreenPluginManagerOptions['createCommandPort'];
};

function readOptions(
  options: BaseScreenPluginManagerOptions,
  diagnostics: ScreenDiagnostic[],
): ValidatedOptions | undefined {
  if (!isObject(options)) {
    diagnostics.push(
      diagnostic('PLUGIN_CORE_MANIFEST_NOT_OBJECT', [], 'Manager options must be an object.'),
    );
    return undefined;
  }
  const fields = [
    'instanceId',
    'standaloneMaterialTagNames',
    'plugins',
    'grantedCapabilities',
    'registry',
    'createCommandPort',
  ] as const;
  const values = Object.getOwnPropertyDescriptors(options);
  for (const field of fields) {
    const descriptor = values[field];
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [field],
          'Manager option must be an own data property.',
        ),
      );
    }
  }
  if (diagnostics.length > 0) {
    return undefined;
  }
  const instanceId = values.instanceId?.value;
  const standaloneMaterialTagNames = values.standaloneMaterialTagNames?.value;
  const plugins = values.plugins?.value;
  const grantedCapabilities = values.grantedCapabilities?.value;
  const registry = values.registry?.value;
  const createCommandPort = values.createCommandPort?.value;
  if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
    diagnostics.push(
      diagnostic('PLUGIN_CORE_IDENTITY_INVALID', ['instanceId'], 'Instance id is invalid.'),
    );
  }
  if (!isStringArray(standaloneMaterialTagNames)) {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['standaloneMaterialTagNames'],
        'Standalone material tags must be a string array.',
      ),
    );
  }
  if (!Array.isArray(plugins) || plugins.length > 128) {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_LIMIT_EXCEEDED',
        ['plugins'],
        'Plugin runtime list is invalid or too large.',
      ),
    );
  }
  if (!isObject(grantedCapabilities)) {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['grantedCapabilities'],
        'Granted capabilities must be an object.',
      ),
    );
  }
  if (!isObject(registry) || typeof registry.get !== 'function') {
    diagnostics.push(
      diagnostic('PLUGIN_CORE_MANIFEST_FIELD_INVALID', ['registry'], 'Registry port is invalid.'),
    );
  }
  if (createCommandPort !== undefined && typeof createCommandPort !== 'function') {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['createCommandPort'],
        'Command port factory is invalid.',
      ),
    );
  }
  if (diagnostics.length > 0) {
    return undefined;
  }
  return {
    instanceId: instanceId as string,
    standaloneMaterialTagNames: standaloneMaterialTagNames as readonly string[],
    plugins: plugins as readonly BaseScreenPluginRuntime[],
    grantedCapabilities: grantedCapabilities as Readonly<Record<string, readonly string[]>>,
    registry: registry as BaseScreenPluginManagerOptions['registry'],
    createCommandPort: createCommandPort as BaseScreenPluginManagerOptions['createCommandPort'],
  };
}

function parsePluginCandidates(
  runtimes: readonly BaseScreenPluginRuntime[],
  diagnostics: ScreenDiagnostic[],
): readonly Candidate[] {
  const candidates: Candidate[] = [];
  for (let index = 0; index < runtimes.length; index++) {
    const runtime = runtimes[index];
    if (!isObject(runtime)) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          ['plugins', index],
          'Plugin runtime must be an object.',
        ),
      );
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(runtime, 'manifest');
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          ['plugins', index, 'manifest'],
          'Plugin runtime manifest must be an own data property.',
        ),
      );
      continue;
    }
    const parsed = parseBaseScreenPluginManifest(descriptor.value);
    if (!parsed.ok) {
      diagnostics.push(...prefixDiagnostics(parsed.diagnostics, ['plugins', index, 'manifest']));
      continue;
    }
    if (!areEqual(descriptor.value, parsed.value)) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          ['plugins', index, 'manifest'],
          'Plugin runtime manifest differs from canonical manifest.',
        ),
      );
      continue;
    }
    if (
      !hasOwnFunction(runtime, 'activate') ||
      !hasOwnFunction(runtime, 'deactivate') ||
      !hasOwnFunction(runtime, 'dispose')
    ) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          ['plugins', index],
          'Plugin runtime must provide own lifecycle functions.',
        ),
      );
      continue;
    }
    candidates.push({ index, runtime, manifest: parsed.value });
  }
  return candidates;
}

function resolveDependencies(
  candidates: readonly Candidate[],
  byId: ReadonlyMap<string, Candidate>,
  diagnostics: ScreenDiagnostic[],
): readonly Candidate[] {
  const remaining = new Map(candidates.map((candidate) => [candidate.manifest.id, candidate]));
  const dependencyCount = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const candidate of candidates) {
    let count = 0;
    for (const dependency of candidate.manifest.dependencies) {
      const resolved = byId.get(dependency.id);
      if (resolved === undefined) {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_DEPENDENCY_MISSING',
            ['plugins', candidate.index, 'manifest', 'dependencies'],
            'Plugin dependency is missing from the candidate set.',
          ),
        );
        continue;
      }
      if (!satisfiesCaretRange(resolved.manifest.version, dependency.range)) {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_DEPENDENCY_VERSION_INCOMPATIBLE',
            ['plugins', candidate.index, 'manifest', 'dependencies'],
            'Plugin dependency version is incompatible.',
          ),
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
  if (diagnostics.length > 0) {
    return [];
  }
  const ordered: Candidate[] = [];
  const ready = [...remaining.values()]
    .filter((candidate) => dependencyCount.get(candidate.manifest.id) === 0)
    .sort(compareCandidate);
  while (ready.length > 0) {
    const current = ready.shift()!;
    if (!remaining.delete(current.manifest.id)) {
      continue;
    }
    ordered.push(current);
    for (const dependentId of dependents.get(current.manifest.id) ?? []) {
      const nextCount = dependencyCount.get(dependentId)! - 1;
      dependencyCount.set(dependentId, nextCount);
      const dependent = remaining.get(dependentId);
      if (nextCount === 0 && dependent !== undefined) {
        ready.push(dependent);
        ready.sort(compareCandidate);
      }
    }
  }
  for (const candidate of remaining.values()) {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_DEPENDENCY_CYCLE',
        ['plugins', candidate.index, 'manifest', 'dependencies'],
        'Plugin dependency graph contains a cycle.',
      ),
    );
  }
  return ordered;
}

function validateContributions(
  candidates: readonly Candidate[],
  diagnostics: ScreenDiagnostic[],
): void {
  const identities = new Set<string>();
  for (const candidate of candidates) {
    for (let index = 0; index < candidate.manifest.contributions.length; index++) {
      const contribution = candidate.manifest.contributions[index]!;
      const identity = contributionIdentity(contribution);
      if (identities.has(identity)) {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_CONTRIBUTION_CONFLICT',
            ['plugins', candidate.index, 'manifest', 'contributions', index],
            'Contribution identity conflicts with another plugin.',
          ),
        );
      }
      identities.add(identity);
      if (
        contribution.kind === 'command' &&
        !candidate.manifest.capabilities.includes(contribution.requiredCapability)
      ) {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_CAPABILITY_UNDECLARED',
            ['plugins', candidate.index, 'manifest', 'contributions', index],
            'Command contribution requires an undeclared capability.',
          ),
        );
      }
      if (contribution.kind === 'blueprintCapability') {
        if (!SUPPORTED_BLUEPRINT_CAPABILITIES.has(contribution.id)) {
          diagnostics.push(
            diagnostic(
              'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
              ['plugins', candidate.index, 'manifest', 'contributions', index],
              'Blueprint contribution is not supported by this host.',
            ),
          );
        }
        if (!candidate.manifest.capabilities.includes(contribution.id)) {
          diagnostics.push(
            diagnostic(
              'PLUGIN_CORE_CAPABILITY_UNDECLARED',
              ['plugins', candidate.index, 'manifest', 'contributions', index],
              'Blueprint contribution requires a declared capability.',
            ),
          );
        }
      }
    }
  }
}

function validateCapabilities(
  candidates: readonly Candidate[],
  granted: Readonly<Record<string, readonly string[]>>,
  createCommandPort: BaseScreenPluginManagerOptions['createCommandPort'],
  diagnostics: ScreenDiagnostic[],
): void {
  for (const candidate of candidates) {
    const grantedSet = new Set(granted[candidate.manifest.id] ?? []);
    for (const capability of candidate.manifest.capabilities) {
      if (!grantedSet.has(capability)) {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_CAPABILITY_UNAUTHORIZED',
            ['plugins', candidate.index, 'manifest', 'capabilities'],
            'Plugin capability is not approved by the host.',
          ),
        );
      } else if (capability === 'command.execute' && createCommandPort === undefined) {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
            ['plugins', candidate.index, 'manifest', 'capabilities'],
            'Plugin command capability has no compatible port factory.',
          ),
        );
      } else if (
        capability !== 'command.execute' &&
        !SUPPORTED_BLUEPRINT_CAPABILITIES.has(capability)
      ) {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
            ['plugins', candidate.index, 'manifest', 'capabilities'],
            'Plugin capability is not supported by this host.',
          ),
        );
      }
    }
  }
}

function resolveMaterials(
  input: ValidatedOptions,
  candidates: readonly Candidate[],
  diagnostics: ScreenDiagnostic[],
): readonly BaseScreenMaterialCatalogEntry[] {
  const required = new Map<
    string,
    { readonly type: string | undefined; readonly path: readonly (string | number)[] }
  >();
  for (let index = 0; index < input.standaloneMaterialTagNames.length; index++) {
    required.set(input.standaloneMaterialTagNames[index]!, {
      type: undefined,
      path: ['standaloneMaterialTagNames', index],
    });
  }
  for (const candidate of candidates) {
    for (let index = 0; index < candidate.manifest.contributions.length; index++) {
      const contribution = candidate.manifest.contributions[index]!;
      if (contribution.kind === 'material') {
        const existing = required.get(contribution.tagName);
        if (existing?.type !== undefined && existing.type !== contribution.type) {
          diagnostics.push(
            diagnostic(
              'PLUGIN_CORE_IDENTITY_CONFLICT',
              ['plugins', candidate.index, 'manifest', 'contributions', index],
              'Material tag name conflicts with another material type.',
            ),
          );
        }
        required.set(contribution.tagName, {
          type: contribution.type,
          path: ['plugins', candidate.index, 'manifest', 'contributions', index],
        });
      }
    }
  }
  const entries: BaseScreenMaterialCatalogEntry[] = [];
  const types = new Map<string, BaseScreenMaterialCatalogEntry>();
  for (const [tagName, expected] of required) {
    let constructor;
    try {
      constructor = input.registry.get(tagName);
    } catch {
      diagnostics.push(
        diagnostic('PLUGIN_CORE_IDENTITY_INVALID', expected.path, 'Registry query failed.'),
      );
      continue;
    }
    if (constructor === undefined) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_INVALID',
          expected.path,
          'Material tag is not registered.',
        ),
      );
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(constructor, 'manifest');
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          expected.path,
          'Material constructor manifest is invalid.',
        ),
      );
      continue;
    }
    const parsed = parseBaseScreenMaterialManifest(descriptor.value);
    if (!parsed.ok) {
      diagnostics.push(...prefixDiagnostics(parsed.diagnostics, expected.path));
      continue;
    }
    if (
      parsed.value.tagName !== tagName ||
      (expected.type !== undefined && parsed.value.type !== expected.type)
    ) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          expected.path,
          'Material contribution does not match constructor manifest.',
        ),
      );
      continue;
    }
    const entry = { manifest: parsed.value, constructor };
    const existing = types.get(entry.manifest.type);
    if (
      existing !== undefined &&
      (existing.constructor !== entry.constructor || existing.manifest.tagName !== tagName)
    ) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          expected.path,
          'Material type conflicts with another candidate.',
        ),
      );
      continue;
    }
    types.set(entry.manifest.type, entry);
    if (
      !entries.some(
        (item) =>
          item.constructor === entry.constructor && item.manifest.type === entry.manifest.type,
      )
    ) {
      entries.push(entry);
    }
  }
  return entries;
}

function createSession(input: ValidatedOptions, candidate: Candidate): ActivationSession {
  let valid = true;
  const requestedCommandPort = candidate.manifest.capabilities.includes('command.execute');
  const commandPort = requestedCommandPort
    ? createSessionCommandPort(
        input.createCommandPort!({ instanceId: input.instanceId, pluginId: candidate.manifest.id }),
        () => valid,
      )
    : undefined;
  return {
    context: {
      instanceId: input.instanceId,
      pluginId: candidate.manifest.id,
      grantedCapabilities: getGrantedCapabilities(candidate.manifest, input.grantedCapabilities),
      commandPort,
    },
    invalidate() {
      valid = false;
    },
  };
}

function createSessionCommandPort(
  port: PluginCommandPort,
  isValid: () => boolean,
): PluginCommandPort {
  return {
    async execute(request) {
      if (!isValid()) {
        return failureResult(
          'PLUGIN_CORE_SESSION_INVALID',
          'Plugin activation session is no longer valid.',
        );
      }
      return port.execute(request);
    },
  };
}

function getGrantedCapabilities(
  manifest: BaseScreenPluginManifest,
  granted: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  const host = new Set(granted[manifest.id] ?? []);
  return manifest.capabilities.filter((capability) => host.has(capability)).sort(compareStrings);
}

function contributionIdentity(contribution: BaseScreenPluginContribution): string {
  switch (contribution.kind) {
    case 'material':
      return `material:${contribution.type}`;
    default:
      return `${contribution.kind}:${contribution.id}`;
  }
}

function satisfiesCaretRange(version: string, range: string): boolean {
  const actual = version.split('.').map(Number);
  const minimum = range.slice(1).split('.').map(Number);
  return actual[0] === minimum[0] && compareVersion(actual, minimum) >= 0;
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index++) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function compareCandidate(left: Candidate, right: Candidate): number {
  return compareStrings(left.manifest.id, right.manifest.id);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasOwnFunction(value: object, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && typeof descriptor.value === 'function';
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function areEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => areEqual(item, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && areEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function prefixDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: readonly (string | number)[],
): readonly ScreenDiagnostic[] {
  return diagnostics.map((item) => ({ ...item, path: [...prefix, ...item.path] }));
}

function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

function failure<T>(diagnostics: readonly ScreenDiagnostic[]): ScreenParseResult<T> {
  return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

function failureResult(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return { ok: false, diagnostics: [diagnostic(code, [], message)] };
}

function sortDiagnostics(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const byPath = comparePaths(left.path, right.path);
    if (byPath !== 0) {
      return byPath;
    }
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  });
}

function comparePaths(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const leftSegment = left[index]!;
    const rightSegment = right[index]!;
    if (typeof leftSegment !== typeof rightSegment) {
      return typeof leftSegment === 'number' ? -1 : 1;
    }
    if (leftSegment !== rightSegment) {
      return leftSegment < rightSegment ? -1 : 1;
    }
  }
  return left.length - right.length;
}
