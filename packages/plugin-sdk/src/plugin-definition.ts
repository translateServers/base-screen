import { type ScreenParseResult, screenJsonEquals } from '@base-screen/contracts';
import {
  type BaseScreenPluginRuntime,
  parseBaseScreenPluginManifest,
  readContributionHandlerRecord,
} from '@base-screen/plugin-core';
import { failure } from './diagnostics.js';

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
  if (!screenJsonEquals(parsedManifest.value, runtime.manifest)) {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      ['manifest'],
      'Plugin runtime manifest does not match its canonical manifest.',
    );
  }
  // 三类 handler 记录规则一致（声明 ↔ handler 一一对应）：command / blueprintAction / dataProcessor。
  const commands = readHandlerRecord(
    readOwnValue(runtime, 'commands'),
    parsedManifest.value,
    'command',
    'commands',
  );
  if (!commands.ok) return commands;
  const blueprintActions = readHandlerRecord(
    readOwnValue(runtime, 'blueprintActions'),
    parsedManifest.value,
    'blueprintAction',
    'blueprintActions',
  );
  if (!blueprintActions.ok) return blueprintActions;
  const dataProcessors = readHandlerRecord(
    readOwnValue(runtime, 'dataProcessors'),
    parsedManifest.value,
    'dataProcessor',
    'dataProcessors',
  );
  if (!dataProcessors.ok) return dataProcessors;
  return { ok: true, value: runtime, diagnostics: [] };
}

function readHandlerRecord(
  value: unknown,
  manifest: BaseScreenPluginRuntime['manifest'],
  kind: 'command' | 'blueprintAction' | 'dataProcessor',
  field: string,
): ScreenParseResult<ReadonlyMap<string, (...args: never[]) => unknown>> {
  const result = readContributionHandlerRecord({ kind, manifest, field, value });
  const first = result.diagnostics[0];
  if (first !== undefined) {
    return { ok: false, diagnostics: [first] };
  }
  return { ok: true, value: result.handlers ?? new Map(), diagnostics: [] };
}

function readOwnValue(value: object, key: string): unknown | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}
