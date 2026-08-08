import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  type BaseScreenPluginRuntime,
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';

export interface BaseScreenMaterialDefinition {
  readonly manifest: BaseScreenMaterialManifest;
  readonly element: BaseScreenMaterialConstructor;
  define(): ScreenParseResult<BaseScreenMaterialCatalogEntry>;
}

export interface CreateMaterialDefinitionOptions {
  readonly manifest: BaseScreenMaterialManifest;
  readonly element: BaseScreenMaterialConstructor;
}

export function createMaterialDefinition(
  options: CreateMaterialDefinitionOptions,
): ScreenParseResult<BaseScreenMaterialDefinition> {
  const parsedManifest = parseBaseScreenMaterialManifest(options.manifest);
  if (!parsedManifest.ok) {
    return parsedManifest;
  }
  const staticManifest = readStaticManifest(options.element);
  if (!staticManifest.ok) {
    return staticManifest;
  }
  if (!areEqual(parsedManifest.value, staticManifest.value)) {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      ['element', 'manifest'],
      'Element static manifest does not match the definition manifest.',
    );
  }
  const adapter = readStaticTabularDataAdapter(options.element);
  if (!adapter.ok) return adapter;
  const entry = {
    manifest: parsedManifest.value,
    constructor: options.element,
    ...(adapter.value === undefined ? {} : { tabularDataAdapter: adapter.value }),
  };
  return {
    ok: true,
    value: {
      manifest: parsedManifest.value,
      element: options.element,
      define: () => defineMaterial(entry),
    },
    diagnostics: [],
  };
}

function readStaticTabularDataAdapter(
  element: BaseScreenMaterialConstructor,
): ScreenParseResult<BaseScreenMaterialTabularDataAdapter | undefined> {
  const descriptor = Object.getOwnPropertyDescriptor(element, 'tabularDataAdapter');
  if (descriptor === undefined) return { ok: true, value: undefined, diagnostics: [] };
  if (!Object.hasOwn(descriptor, 'value')) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['element', 'tabularDataAdapter'],
      'Material dataset adapter must be a static data property.',
    );
  }
  const value = descriptor.value;
  if (value === undefined) return { ok: true, value: undefined, diagnostics: [] };
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { readonly adapt?: unknown }).adapt !== 'function'
  ) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['element', 'tabularDataAdapter'],
      'Material dataset adapter is invalid.',
    );
  }
  return {
    ok: true,
    value: value as BaseScreenMaterialTabularDataAdapter,
    diagnostics: [],
  };
}

export function definePlugin(
  runtime: BaseScreenPluginRuntime,
): ScreenParseResult<BaseScreenPluginRuntime> {
  const parsedManifest = parseBaseScreenPluginManifest(runtime.manifest);
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
  return { ok: true, value: runtime, diagnostics: [] };
}

function defineMaterial(
  entry: BaseScreenMaterialCatalogEntry,
): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const registry = globalThis.customElements;
  if (registry === undefined) {
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      [],
      'Custom Elements are unavailable in this runtime.',
    );
  }
  const existing = registry.get(entry.manifest.tagName);
  if (existing === entry.constructor) {
    return { ok: true, value: entry, diagnostics: [] };
  }
  if (existing !== undefined) {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      ['tagName'],
      'Tag name is already bound to a different constructor.',
    );
  }
  try {
    registry.define(entry.manifest.tagName, entry.constructor);
  } catch {
    return failure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      ['tagName'],
      'Material constructor cannot be registered for this tag name.',
    );
  }
  return { ok: true, value: entry, diagnostics: [] };
}

function readStaticManifest(
  element: BaseScreenMaterialConstructor,
): ScreenParseResult<BaseScreenMaterialManifest> {
  const descriptor = Object.getOwnPropertyDescriptor(element, 'manifest');
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['element', 'manifest'],
      'Element constructor must expose a static manifest data property.',
    );
  }
  return parseBaseScreenMaterialManifest(descriptor.value);
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
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
