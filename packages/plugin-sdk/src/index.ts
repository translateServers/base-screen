import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  type BaseScreenPluginRuntime,
  parseBaseScreenMaterialEditorDescriptor,
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

export interface CreateMaterialPackageOptions {
  readonly id: string;
  readonly materials: readonly CreateMaterialDefinitionOptions[];
}

export interface BaseScreenMaterialPackage {
  readonly id: string;
  readonly materials: readonly BaseScreenMaterialDefinition[];
  define(): ScreenParseResult<readonly BaseScreenMaterialCatalogEntry[]>;
}

const MAX_PACKAGE_MATERIALS = 512;

/**
 * 宿主托管物料包：把一组已由宿主加载并审核的可信物料组合为一个包。
 * 创建期完成全部 manifest / 静态 manifest / 适配器校验与包内身份冲突检查，
 * 不触碰浏览器全局；`define()` 显式注册包内所有 Custom Element 并返回
 * Catalog 条目，供宿主一次性构建不可变目录（ADR-0029 R1/R2）。
 */
export function createMaterialPackage(
  options: CreateMaterialPackageOptions,
): ScreenParseResult<BaseScreenMaterialPackage> {
  const input = options as unknown;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_NOT_OBJECT',
      [],
      'Material package options must be an object.',
    );
  }
  const record = input as CreateMaterialPackageOptions;
  let id: unknown;
  let materials: unknown;
  try {
    id = record.id;
    materials = record.materials;
  } catch {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [],
      'Material package options cannot be safely read.',
    );
  }
  if (!isPackageId(id)) {
    return failure(
      'PLUGIN_CORE_IDENTITY_INVALID',
      ['id'],
      'Material package id must be an ASCII identifier.',
    );
  }
  if (!Array.isArray(materials) || materials.length === 0) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['materials'],
      'Material package must declare at least one material.',
    );
  }
  if (materials.length > MAX_PACKAGE_MATERIALS) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['materials'],
      'Material package exceeds the material count limit.',
    );
  }
  const definitions: BaseScreenMaterialDefinition[] = [];
  const types = new Set<string>();
  const tagNames = new Set<string>();
  for (let index = 0; index < materials.length; index++) {
    let parsed: ScreenParseResult<BaseScreenMaterialDefinition>;
    try {
      const material: unknown = materials[index];
      if (material === null || typeof material !== 'object' || Array.isArray(material)) {
        return failure(
          'PLUGIN_CORE_MANIFEST_NOT_OBJECT',
          ['materials', index],
          'Material package entry must be an object.',
        );
      }
      parsed = createMaterialDefinition(material as CreateMaterialDefinitionOptions);
    } catch {
      return failure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['materials', index],
        'Material package entry cannot be safely read.',
      );
    }
    if (!parsed.ok) {
      return prefixFailure(parsed.diagnostics, ['materials', index]);
    }
    const manifest = parsed.value.manifest;
    if (types.has(manifest.type)) {
      return failure(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        ['materials', index, 'type'],
        'Material package contains a duplicate material type.',
      );
    }
    if (tagNames.has(manifest.tagName)) {
      return failure(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        ['materials', index, 'tagName'],
        'Material package contains a duplicate tag name.',
      );
    }
    types.add(manifest.type);
    tagNames.add(manifest.tagName);
    definitions.push(parsed.value);
  }
  const materialsFreeze = Object.freeze(definitions);
  return {
    ok: true,
    value: {
      id: record.id,
      materials: materialsFreeze,
      define: () => defineMaterialPackage(materialsFreeze),
    },
    diagnostics: [],
  };
}

function defineMaterialPackage(
  definitions: readonly BaseScreenMaterialDefinition[],
): ScreenParseResult<readonly BaseScreenMaterialCatalogEntry[]> {
  // 注册前对全部 tagName 做冲突预检：任一冲突即整体失败，不产生部分注册副作用。
  const diagnostics: ScreenDiagnostic[] = [];
  for (let index = 0; index < definitions.length; index++) {
    const conflict = findTagConflict(definitions[index]!);
    if (conflict !== undefined) {
      diagnostics.push({ ...conflict, path: ['materials', index, 'tagName'] });
    }
  }
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }
  const entries: BaseScreenMaterialCatalogEntry[] = [];
  for (let index = 0; index < definitions.length; index++) {
    const defined = definitions[index]!.define();
    if (!defined.ok) {
      // 预检通过后注册仍失败（如浏览器拒绝定义）：不进入结果，已注册条目仍留在浏览器全局。
      return {
        ok: false,
        diagnostics: sortDiagnostics(
          defined.diagnostics.map((item) => ({
            ...item,
            path: ['materials', index, ...item.path],
          })),
        ),
      };
    }
    entries.push(defined.value);
  }
  return { ok: true, value: Object.freeze(entries), diagnostics: [] };
}

function findTagConflict(definition: BaseScreenMaterialDefinition): ScreenDiagnostic | undefined {
  const registry = globalThis.customElements;
  if (registry === undefined) {
    return undefined;
  }
  let existing: CustomElementConstructor | undefined;
  try {
    existing = registry.get(definition.manifest.tagName);
  } catch {
    return undefined;
  }
  if (existing === undefined || existing === definition.element) {
    return undefined;
  }
  return {
    severity: 'error',
    code: 'PLUGIN_CORE_IDENTITY_CONFLICT',
    path: [],
    message: 'Tag name is already bound to a different constructor.',
  };
}

function isPackageId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
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

function prefixFailure<T>(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: readonly (string | number)[],
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: sortDiagnostics(
      diagnostics.map((item) => ({ ...item, path: [...prefix, ...item.path] })),
    ),
  };
}

function sortDiagnostics(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const byPath = comparePaths(left.path, right.path);
    if (byPath !== 0) {
      return byPath;
    }
    if (left.code !== right.code) {
      return left.code < right.code ? -1 : 1;
    }
    return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
  });
}

function comparePaths(left: ScreenDiagnostic['path'], right: ScreenDiagnostic['path']): number {
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
