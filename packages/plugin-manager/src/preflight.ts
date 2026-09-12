import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenPluginCommandHandler,
  type BaseScreenPluginInspectorControlCatalogEntry,
  type BaseScreenPluginManifest,
  type BaseScreenPluginPanelCatalogEntry,
  type BaseScreenPluginRuntime,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { DiagnosticCollector } from './diagnostics.js';
import { snapshotManagerInput } from './input.js';
import type { ActivationSession, Candidate } from './preflight-types.js';
import {
  inspectInspectorControls,
  inspectMaterialRegistry,
  inspectPluginPanels,
} from './registry.js';
import { resolveCandidates, validateCapabilityPlan } from './resolver.js';
import { createActivationSession } from './session.js';
import type { BaseScreenPluginManagerOptions } from './types.js';

export type { ActivationSession } from './preflight-types.js';

export interface PlannedPlugin {
  readonly index: number;
  readonly runtime: BaseScreenPluginRuntime;
  readonly manifest: BaseScreenPluginManifest;
  readonly grantedCapabilities: readonly string[];
  readonly activate: BaseScreenPluginRuntime['activate'];
  readonly deactivate: BaseScreenPluginRuntime['deactivate'];
  readonly dispose: BaseScreenPluginRuntime['dispose'];
  readonly commands: ReadonlyMap<string, BaseScreenPluginCommandHandler>;
  createSession(): ActivationSession;
}

/** 单个插件的失败记录：pluginId 取自其 canonical manifest；manifest 未能解析时为空串。 */
export interface PlannedPluginFailure {
  readonly index: number;
  readonly pluginId: string;
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export interface ActivationPlan {
  readonly materials: readonly BaseScreenMaterialCatalogEntry[];
  readonly panels: readonly BaseScreenPluginPanelCatalogEntry[];
  readonly inspectorControls: readonly BaseScreenPluginInspectorControlCatalogEntry[];
  readonly plugins: readonly PlannedPlugin[];
  readonly failures: readonly PlannedPluginFailure[];
}

/**
 * 激活计划：全局门（输入快照、宿主自营物料、不可归因的配置错误）失败关闭；
 * 可归因到单个插件的失败只排除该插件——幂等收敛直到幸存集合稳定，
 * 跨插件冲突按稳定顺序 first-wins，后声明方失败，依赖失败级联排除。
 */
export function createActivationPlan(
  options: BaseScreenPluginManagerOptions,
): ScreenParseResult<ActivationPlan> {
  const input = snapshotManagerInput(options);
  if (!input.ok) return input;
  const parseCollector = new DiagnosticCollector();
  const parsed = parsePluginCandidates(input.value.runtimes, parseCollector);
  let survivors = parsed.candidates;
  const failures: PlannedPluginFailure[] = [
    ...withPluginIdentities(attributeByPlugin(parseCollector.items), parsed.identities),
  ];

  // 收敛循环：每一轮只会淘汰插件，淘汰后其依赖方级联失败，直到没有新的排除。
  for (;;) {
    const round = new DiagnosticCollector();
    const ordered = resolveCandidates(survivors, round);
    const grants = validateCapabilityPlan(ordered, input.value, round);
    const materials = inspectMaterialRegistry(input.value, ordered, round);
    const panels = inspectPluginPanels(ordered, input.value.registryGet, round);
    const inspectorControls = inspectInspectorControls(ordered, input.value.registryGet, round);

    const global = attributeGlobal(round.items);
    if (global.length > 0) {
      return {
        ok: false,
        diagnostics: sortAll([...failures.flatMap((item) => item.diagnostics), ...global]),
      };
    }
    const attributed = attributeByPlugin(round.items);
    const excludedIndexes = new Set(attributed.map((failure) => failure.index));
    if (excludedIndexes.size === 0) {
      return {
        ok: true,
        value: {
          materials,
          panels,
          inspectorControls,
          failures: sortFailures(withPluginIdentities(failures, parsed.identities)),
          plugins: ordered.map((candidate) => {
            const grantedCapabilities = grants.get(candidate)!;
            return Object.freeze({
              ...candidate,
              grantedCapabilities,
              createSession: () =>
                createActivationSession(input.value, candidate, grantedCapabilities),
            });
          }),
        },
        diagnostics: [],
      };
    }
    failures.push(...attributed);
    survivors = survivors.filter((candidate) => !excludedIndexes.has(candidate.index));
  }
}

function attributeByPlugin(diagnostics: readonly ScreenDiagnostic[]): PlannedPluginFailure[] {
  const byIndex = new Map<number, ScreenDiagnostic[]>();
  for (const item of diagnostics) {
    const index = pluginIndexAt(item.path);
    if (index === undefined) continue;
    const list = byIndex.get(index) ?? [];
    list.push(item);
    byIndex.set(index, list);
  }
  return [...byIndex.entries()]
    .map(([index, items]) => ({
      index,
      pluginId: '',
      diagnostics: sortAll(items),
    }))
    .sort((first, second) => first.index - second.index);
}

/** 把失败记录的 pluginId 用已知身份回填：清单已解析的插件才拥有身份。 */
function withPluginIdentities(
  failures: readonly PlannedPluginFailure[],
  identities: ReadonlyMap<number, string>,
): readonly PlannedPluginFailure[] {
  return failures.map((failure) => {
    if (failure.pluginId !== '') return failure;
    const pluginId = identities.get(failure.index);
    return pluginId === undefined ? failure : { ...failure, pluginId };
  });
}

function attributeGlobal(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return diagnostics.filter((item) => pluginIndexAt(item.path) === undefined);
}

function pluginIndexAt(path: readonly (string | number)[]): number | undefined {
  if (path[0] !== 'plugins') return undefined;
  const index = path[1];
  return typeof index === 'number' ? index : undefined;
}

function sortFailures(failures: readonly PlannedPluginFailure[]): readonly PlannedPluginFailure[] {
  return [...failures].sort((first, second) => first.index - second.index);
}

function sortAll(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const byPath = comparePathLength(left.path, right.path);
    if (byPath !== 0) return byPath;
    if (left.code !== right.code) return left.code < right.code ? -1 : 1;
    return left.message < right.message ? -1 : 1;
  });
}

function comparePathLength(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  return left.length - right.length;
}

function parsePluginCandidates(
  runtimes: readonly unknown[],
  diagnostics: DiagnosticCollector,
): {
  readonly candidates: readonly Candidate[];
  readonly identities: ReadonlyMap<number, string>;
} {
  const candidates: Candidate[] = [];
  const identities = new Map<number, string>();
  for (let index = 0; index < runtimes.length; index++) {
    try {
      const runtime = runtimes[index];
      if (runtime === null || typeof runtime !== 'object' || Array.isArray(runtime)) {
        diagnostics.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          ['plugins', index],
          'Plugin runtime must be an object.',
        );
        continue;
      }
      const manifest = readOwnValue(runtime, 'manifest');
      const activate = readOwnValue(runtime, 'activate');
      const deactivate = readOwnValue(runtime, 'deactivate');
      const dispose = readOwnValue(runtime, 'dispose');
      const commandsValue = readOwnValue(runtime, 'commands');
      if (
        manifest === undefined ||
        activate === undefined ||
        deactivate === undefined ||
        dispose === undefined
      ) {
        diagnostics.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          ['plugins', index],
          'Plugin runtime must use own data properties.',
        );
        continue;
      }
      if (
        typeof activate !== 'function' ||
        typeof deactivate !== 'function' ||
        typeof dispose !== 'function'
      ) {
        diagnostics.add(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          ['plugins', index],
          'Plugin runtime lifecycle is invalid.',
        );
        continue;
      }
      const parsed = parseBaseScreenPluginManifest(manifest);
      if (!parsed.ok) {
        for (const item of parsed.diagnostics) {
          diagnostics.add(item.code, ['plugins', index, 'manifest', ...item.path], item.message);
        }
        continue;
      }
      if (!areEqual(manifest, parsed.value)) {
        diagnostics.add(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          ['plugins', index, 'manifest'],
          'Plugin runtime manifest differs from canonical manifest.',
        );
        continue;
      }
      identities.set(index, parsed.value.id);
      const commands = readCommandHandlers(commandsValue, parsed.value, index, diagnostics);
      if (commands === undefined) continue;
      candidates.push({
        index,
        runtime: runtime as BaseScreenPluginRuntime,
        manifest: parsed.value,
        activate: activate as BaseScreenPluginRuntime['activate'],
        deactivate: deactivate as BaseScreenPluginRuntime['deactivate'],
        dispose: dispose as BaseScreenPluginRuntime['dispose'],
        commands,
      });
    } catch {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['plugins', index],
        'Plugin runtime cannot be safely read.',
      );
    }
  }
  return { candidates, identities };
}

function readOwnValue(value: object, key: string): unknown | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function readCommandHandlers(
  value: unknown,
  manifest: BaseScreenPluginManifest,
  pluginIndex: number,
  diagnostics: DiagnosticCollector,
): ReadonlyMap<string, BaseScreenPluginCommandHandler> | undefined {
  const declared = manifest.contributions
    .filter((contribution) => contribution.kind === 'command')
    .map((contribution) => contribution.id);
  if (value === undefined) {
    if (declared.length === 0) return new Map();
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['plugins', pluginIndex, 'commands'],
      'Plugin command contributions require matching command handlers.',
    );
    return undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['plugins', pluginIndex, 'commands'],
      'Plugin command handlers must be an object.',
    );
    return undefined;
  }
  const handlers = new Map<string, BaseScreenPluginCommandHandler>();
  let invalid = false;
  for (const key of Object.getOwnPropertyNames(value)) {
    const handler = readOwnValue(value, key);
    if (typeof handler !== 'function') {
      diagnostics.add(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['plugins', pluginIndex, 'commands', key],
        'Plugin command handler is invalid.',
      );
      invalid = true;
      continue;
    }
    handlers.set(key, handler as BaseScreenPluginCommandHandler);
  }
  const declaredSet = new Set(declared);
  for (const id of declared) {
    if (!handlers.has(id)) {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['plugins', pluginIndex, 'commands', id],
        'Plugin command contribution is missing a handler.',
      );
      invalid = true;
    }
  }
  for (const id of handlers.keys()) {
    if (!declaredSet.has(id)) {
      diagnostics.add(
        'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
        ['plugins', pluginIndex, 'commands', id],
        'Plugin command handler is not declared as a contribution.',
      );
      invalid = true;
    }
  }
  return invalid ? undefined : handlers;
}

function areEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false;
  try {
    const leftKeys = Object.getOwnPropertyNames(left).sort();
    const rightKeys = Object.getOwnPropertyNames(right).sort();
    if (
      leftKeys.length !== rightKeys.length ||
      leftKeys.some((key, index) => key !== rightKeys[index])
    ) {
      return false;
    }
    return leftKeys.every((key) => {
      const leftValue = readOwnValue(left, key);
      const rightValue = readOwnValue(right, key);
      return leftValue !== undefined && rightValue !== undefined && areEqual(leftValue, rightValue);
    });
  } catch {
    return false;
  }
}
