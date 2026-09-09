import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenPluginCommandHandler,
  type BaseScreenPluginRuntime,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { areEqual, failure } from './diagnostics.js';

export function definePlugin(
  runtime: BaseScreenPluginRuntime,
): ScreenParseResult<BaseScreenPluginRuntime> {
  if (runtime === null || typeof runtime !== 'object' || Array.isArray(runtime)) {
    return failure('PLUGIN_CORE_MANIFEST_NOT_OBJECT', [], 'Plugin runtime must be an object.');
  }
  const manifest = readOwnValue(runtime, 'manifest');
  const activate = readOwnValue(runtime, 'activate');
  const deactivate = readOwnValue(runtime, 'deactivate');
  const dispose = readOwnValue(runtime, 'dispose');
  if (
    manifest === undefined ||
    activate === undefined ||
    deactivate === undefined ||
    dispose === undefined
  ) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [],
      'Plugin runtime must use own data properties.',
    );
  }
  if (
    typeof activate !== 'function' ||
    typeof deactivate !== 'function' ||
    typeof dispose !== 'function'
  ) {
    return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Plugin runtime lifecycle is invalid.');
  }
  const parsedManifest = parseBaseScreenPluginManifest(manifest);
  if (!parsedManifest.ok) {
    return parsedManifest;
  }
  if (!areEqual(parsedManifest.value, runtime.manifest)) {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      ['manifest'],
      'Plugin runtime manifest does not match its canonical manifest.',
    );
  }
  const commands = readCommandHandlers(readOwnValue(runtime, 'commands'), parsedManifest.value);
  if (!commands.ok) return commands;
  return { ok: true, value: runtime, diagnostics: [] };
}

function readCommandHandlers(
  value: unknown,
  manifest: BaseScreenPluginRuntime['manifest'],
): ScreenParseResult<ReadonlyMap<string, BaseScreenPluginCommandHandler>> {
  const declared = manifest.contributions
    .filter((contribution) => contribution.kind === 'command')
    .map((contribution) => contribution.id);
  if (value === undefined) {
    if (declared.length === 0) return { ok: true, value: new Map(), diagnostics: [] };
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['commands'],
      'Plugin command contributions require matching command handlers.',
    );
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['commands'],
      'Plugin command handlers must be an object.',
    );
  }
  const handlers = new Map<string, BaseScreenPluginCommandHandler>();
  for (const key of Object.getOwnPropertyNames(value)) {
    const handler = readOwnValue(value, key);
    if (typeof handler !== 'function') {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['commands', key],
        'Plugin command handler is invalid.',
      );
    }
    handlers.set(key, handler as BaseScreenPluginCommandHandler);
  }
  const declaredSet = new Set(declared);
  for (const id of declared) {
    if (!handlers.has(id)) {
      return failure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['commands', id],
        'Plugin command contribution is missing a handler.',
      );
    }
  }
  for (const id of handlers.keys()) {
    if (!declaredSet.has(id)) {
      return failure(
        'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
        ['commands', id],
        'Plugin command handler is not declared as a contribution.',
      );
    }
  }
  return { ok: true, value: handlers, diagnostics: [] };
}

function readOwnValue(value: object, key: string): unknown | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}
