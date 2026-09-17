import { type ScreenParseResult, screenJsonEquals } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  parseBaseScreenMaterialEditorDescriptor,
  parseBaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { failure } from './diagnostics.js';

export interface BaseScreenMaterialDefinition {
  readonly manifest: BaseScreenMaterialManifest;
  readonly element: BaseScreenMaterialConstructor;
  define(): ScreenParseResult<BaseScreenMaterialCatalogEntry>;
}

export interface CreateMaterialDefinitionOptions {
  readonly manifest: BaseScreenMaterialManifest;
  readonly element: BaseScreenMaterialConstructor;
}

/** 纯数据 builder：把 JSON-safe 的 Descriptor 输入解析为规范形态，不渲染任何 UI。 */
export function createBaseScreenMaterialEditorDescriptor(
  input: unknown,
  options: {
    readonly propsSchema?: BaseScreenMaterialManifest['propsSchema'];
    readonly styleSchema?: BaseScreenMaterialManifest['styleSchema'];
    readonly manifestEvents?: readonly string[];
    readonly dataBindingRoles?: readonly { readonly id: string }[];
  } = {},
): ScreenParseResult<BaseScreenMaterialEditorDescriptor> {
  return parseBaseScreenMaterialEditorDescriptor(
    input,
    options.propsSchema,
    options.styleSchema,
    options.manifestEvents,
    options.dataBindingRoles,
  );
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
  if (!screenJsonEquals(parsedManifest.value, staticManifest.value)) {
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
