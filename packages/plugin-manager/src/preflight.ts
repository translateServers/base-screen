import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenPluginCommandHandler,
  type BaseScreenPluginManifest,
  type BaseScreenPluginPanelCatalogEntry,
  type BaseScreenPluginRuntime,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { DiagnosticCollector } from './diagnostics.js';
import { snapshotManagerInput } from './input.js';
import type { ActivationSession, Candidate } from './preflight-types.js';
import { inspectMaterialRegistry, inspectPluginPanels } from './registry.js';
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

export interface ActivationPlan {
  readonly materials: readonly BaseScreenMaterialCatalogEntry[];
  readonly panels: readonly BaseScreenPluginPanelCatalogEntry[];
  readonly plugins: readonly PlannedPlugin[];
}

export function createActivationPlan(
  options: BaseScreenPluginManagerOptions,
): ScreenParseResult<ActivationPlan> {
  const input = snapshotManagerInput(options);
  if (!input.ok) return input;
  const diagnostics = new DiagnosticCollector();
  const candidates = parsePluginCandidates(input.value.runtimes, diagnostics);
  if (diagnostics.hasErrors) return diagnostics.failure();
  const ordered = resolveCandidates(candidates, diagnostics);
  if (diagnostics.hasErrors) return diagnostics.failure();
  const grants = validateCapabilityPlan(ordered, input.value, diagnostics);
  if (diagnostics.hasErrors) return diagnostics.failure();
  const materials = inspectMaterialRegistry(input.value, ordered, diagnostics);
  if (diagnostics.hasErrors) return diagnostics.failure();
  const panels = inspectPluginPanels(ordered, input.value.registryGet, diagnostics);
  if (diagnostics.hasErrors) return diagnostics.failure();
  return {
    ok: true,
    value: {
      materials,
      panels,
      plugins: ordered.map((candidate) => {
        const grantedCapabilities = grants.get(candidate)!;
        return Object.freeze({
          ...candidate,
          grantedCapabilities,
          createSession: () => createActivationSession(input.value, candidate, grantedCapabilities),
        });
      }),
    },
    diagnostics: [],
  };
}

function parsePluginCandidates(
  runtimes: readonly unknown[],
  diagnostics: DiagnosticCollector,
): readonly Candidate[] {
  const candidates: Candidate[] = [];
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
  return candidates;
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
