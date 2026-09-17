import {
  type ScreenDiagnostic,
  type ScreenParseResult,
  sortScreenDiagnostics,
} from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenPluginBlueprintActionHandler,
  type BaseScreenPluginCommandHandler,
  type BaseScreenPluginContributionKind,
  type BaseScreenPluginDataProcessorHandler,
  type BaseScreenPluginInspectorControlCatalogEntry,
  type BaseScreenPluginManifest,
  type BaseScreenPluginPanelCatalogEntry,
  type BaseScreenPluginRuntime,
  parseBaseScreenPluginManifest,
  readContributionHandlerRecord,
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
  readonly blueprintActions: ReadonlyMap<string, BaseScreenPluginBlueprintActionHandler>;
  readonly dataProcessors: ReadonlyMap<string, BaseScreenPluginDataProcessorHandler>;
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
  readonly activation: 'eager' | 'lazy';
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
          activation: input.value.activation,
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
  return sortScreenDiagnostics(diagnostics);
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
      const blueprintActionsValue = readOwnValue(runtime, 'blueprintActions');
      const dataProcessorsValue = readOwnValue(runtime, 'dataProcessors');
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
      const blueprintActions = readBlueprintActionHandlers(
        blueprintActionsValue,
        parsed.value,
        index,
        diagnostics,
      );
      if (blueprintActions === undefined) continue;
      const dataProcessors = readDataProcessorHandlers(
        dataProcessorsValue,
        parsed.value,
        index,
        diagnostics,
      );
      if (dataProcessors === undefined) continue;
      candidates.push({
        index,
        runtime: runtime as BaseScreenPluginRuntime,
        manifest: parsed.value,
        activate: activate as BaseScreenPluginRuntime['activate'],
        deactivate: deactivate as BaseScreenPluginRuntime['deactivate'],
        dispose: dispose as BaseScreenPluginRuntime['dispose'],
        commands,
        blueprintActions,
        dataProcessors,
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

/**
 * 校验"声明 ↔ handler"一一对应并把 handler 收进 Map。
 *
 * command / blueprintAction / dataProcessor 三者规则完全相同（缺 handler、多 handler 都失败
 * 关闭），因此共用一份实现：`kind` 决定从清单里取哪类声明的 id，`field` 是诊断路径用的
 * runtime 字段名。
 */
function readContributionHandlers<K extends string>(
  value: unknown,
  manifest: BaseScreenPluginManifest,
  pluginIndex: number,
  diagnostics: DiagnosticCollector,
  kind: BaseScreenPluginContributionKind,
  field: K,
): ReadonlyMap<string, (...args: never[]) => unknown> | undefined {
  const result = readContributionHandlerRecord({
    kind,
    manifest,
    field,
    value,
    pathPrefix: ['plugins', pluginIndex],
  });
  for (const item of result.diagnostics) {
    diagnostics.add(item.code, item.path, item.message);
  }
  return result.handlers;
}

function readCommandHandlers(
  value: unknown,
  manifest: BaseScreenPluginManifest,
  pluginIndex: number,
  diagnostics: DiagnosticCollector,
): ReadonlyMap<string, BaseScreenPluginCommandHandler> | undefined {
  return readContributionHandlers(
    value,
    manifest,
    pluginIndex,
    diagnostics,
    'command',
    'commands',
  ) as ReadonlyMap<string, BaseScreenPluginCommandHandler> | undefined;
}

function readBlueprintActionHandlers(
  value: unknown,
  manifest: BaseScreenPluginManifest,
  pluginIndex: number,
  diagnostics: DiagnosticCollector,
): ReadonlyMap<string, BaseScreenPluginBlueprintActionHandler> | undefined {
  return readContributionHandlers(
    value,
    manifest,
    pluginIndex,
    diagnostics,
    'blueprintAction',
    'blueprintActions',
  ) as ReadonlyMap<string, BaseScreenPluginBlueprintActionHandler> | undefined;
}

function readDataProcessorHandlers(
  value: unknown,
  manifest: BaseScreenPluginManifest,
  pluginIndex: number,
  diagnostics: DiagnosticCollector,
): ReadonlyMap<string, BaseScreenPluginDataProcessorHandler> | undefined {
  return readContributionHandlers(
    value,
    manifest,
    pluginIndex,
    diagnostics,
    'dataProcessor',
    'dataProcessors',
  ) as ReadonlyMap<string, BaseScreenPluginDataProcessorHandler> | undefined;
}

/**
 * 运行时清单与其规范化结果的自有数据属性相等。
 *
 * 有意不复用 contracts 的 `screenJsonEquals`：那条是 JSON 结构相等（读 `Object.keys` 可枚举键、
 * 取值经属性访问会触发 getter），而这里要回答的是"作者写的运行时对象是否逐属性等于规范化结果"。
 * 因此只读自有**数据**属性（getter 视为不存在）并纳入不可枚举键——getter 或不可枚举成员
 * 不能冒充匹配。
 */
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
