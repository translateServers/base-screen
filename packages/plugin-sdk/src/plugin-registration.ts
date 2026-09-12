import type { ScreenParseResult } from '@base-screen/contracts';
import { type BaseScreenPluginRuntime, isValidCustomElementName } from '@base-screen/plugin-core';
import { failure, prefixFailure } from './diagnostics.js';
import { type BaseScreenMaterialDefinition } from './material-definition.js';
import { type BaseScreenMaterialPackage } from './material-package.js';
import { definePlugin } from './plugin-definition.js';
import { type BaseScreenPluginPackage } from './plugin-package.js';

const MAX_REGISTRATION_PLUGINS = 128;
const MAX_REGISTRATION_ITEMS = 512;

export interface BaseScreenPluginRegistrationElement {
  readonly tagName: string;
  readonly element: CustomElementConstructor;
}

export interface CreatePluginRegistrationOptions {
  /** 插件：包（其物料随包原子注册并经清单贡献授权）或已构造的受信 runtime。 */
  readonly plugins?: readonly (BaseScreenPluginPackage | BaseScreenPluginRuntime)[];
  /** 宿主自营物料：包或单个定义；注册成功后其 tagName 进入 standaloneMaterialTagNames。 */
  readonly materials?: readonly (BaseScreenMaterialPackage | BaseScreenMaterialDefinition)[];
  /** 面板、检查器控件等由宿主持有的 custom element；与物料共用同一套冲突预检。 */
  readonly elements?: readonly BaseScreenPluginRegistrationElement[];
  /** 缺省为 `customElements`；测试或自定义注册表可注入。 */
  readonly registry?: {
    readonly define: (tagName: string, element: CustomElementConstructor) => unknown;
    readonly get: (tagName: string) => CustomElementConstructor | undefined;
  };
}

/** define() 成功后交给 `createBaseScreenPluginManager` 的输入：两处登记收敛为一次调用。 */
export interface BaseScreenPluginRegistration {
  readonly plugins: readonly BaseScreenPluginRuntime[];
  readonly standaloneMaterialTagNames: readonly string[];
}

export interface BaseScreenPluginRegistrationDefinition {
  define(): ScreenParseResult<BaseScreenPluginRegistration>;
}

interface PlannedTag {
  readonly tagName: string;
  readonly path: readonly (string | number)[];
  readonly element: CustomElementConstructor;
}

interface RegistrationPlan {
  readonly registry: {
    readonly define: (tagName: string, element: CustomElementConstructor) => unknown;
    readonly get: (tagName: string) => CustomElementConstructor | undefined;
  };
  readonly plugins: readonly BaseScreenPluginRuntime[];
  readonly pluginPackages: readonly BaseScreenPluginPackage[];
  readonly materialPackages: readonly BaseScreenMaterialPackage[];
  readonly materialDefinitions: readonly BaseScreenMaterialDefinition[];
  readonly elements: readonly BaseScreenPluginRegistrationElement[];
  readonly plannedTags: readonly PlannedTag[];
  readonly standaloneMaterialTagNames: readonly string[];
}

/**
 * 宿主侧注册编排：把「custom element 注册」与「插件/物料输入组装」收敛为一次调用。
 * 创建期完成输入校验、runtime 规范化与计划内 tag 冲突检查（纯数据，不触碰浏览器全局）；
 * `define()` 先对注册表做整体冲突预检——任何冲突都发生在第一个 define 之前（失败关闭），
 * 已注册为同一构造函数的 tag 视为幂等重放——随后统一注册并返回 manager 输入。
 * 物料类型/身份级冲突仍由 plugin-manager preflight 裁决，此处不重复。
 */
export function createPluginRegistration(
  options: CreatePluginRegistrationOptions,
): ScreenParseResult<BaseScreenPluginRegistrationDefinition> {
  const input = options as unknown;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_NOT_OBJECT',
      [],
      'Registration options must be an object.',
    );
  }
  let plugins: unknown;
  let materials: unknown;
  let elements: unknown;
  let registry: unknown;
  try {
    plugins = (input as CreatePluginRegistrationOptions).plugins;
    materials = (input as CreatePluginRegistrationOptions).materials;
    elements = (input as CreatePluginRegistrationOptions).elements;
    registry = (input as CreatePluginRegistrationOptions).registry;
  } catch {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [],
      'Registration options cannot be safely read.',
    );
  }
  if (plugins !== undefined && !Array.isArray(plugins)) {
    return failure('PLUGIN_CORE_MANIFEST_FIELD_INVALID', ['plugins'], 'Plugins must be an array.');
  }
  if (materials !== undefined && !Array.isArray(materials)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['materials'],
      'Materials must be an array.',
    );
  }
  if (elements !== undefined && !Array.isArray(elements)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['elements'],
      'Elements must be an array.',
    );
  }
  const pluginItems = (plugins ?? []) as readonly (
    | BaseScreenPluginPackage
    | BaseScreenPluginRuntime
  )[];
  const materialItems = (materials ?? []) as readonly (
    | BaseScreenMaterialPackage
    | BaseScreenMaterialDefinition
  )[];
  const elementItems = (elements ?? []) as readonly BaseScreenPluginRegistrationElement[];
  if (pluginItems.length > MAX_REGISTRATION_PLUGINS) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['plugins'],
      'Registration exceeds the plugin count limit.',
    );
  }
  if (
    materialItems.length > MAX_REGISTRATION_ITEMS ||
    elementItems.length > MAX_REGISTRATION_ITEMS
  ) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [],
      'Registration exceeds the item count limit.',
    );
  }
  const resolvedRegistry = resolveRegistry(registry);
  if (resolvedRegistry === undefined) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['registry'],
      'Registration registry must provide define and get.',
    );
  }

  const runtimes: BaseScreenPluginRuntime[] = [];
  const pluginPackages: BaseScreenPluginPackage[] = [];
  for (let index = 0; index < pluginItems.length; index++) {
    const item = pluginItems[index]!;
    if (item !== null && typeof item === 'object' && 'plugin' in item) {
      const resolved = resolvePlugin(item, ['plugins', index]);
      if (!resolved.ok) return resolved;
      runtimes.push(resolved.value);
      pluginPackages.push(item as BaseScreenPluginPackage);
      continue;
    }
    const resolved = resolvePlugin(item, ['plugins', index]);
    if (!resolved.ok) return resolved;
    runtimes.push(resolved.value);
  }

  const materialPackages: BaseScreenMaterialPackage[] = [];
  const materialDefinitions: BaseScreenMaterialDefinition[] = [];
  const standaloneMaterialTagNames: string[] = [];
  for (let index = 0; index < materialItems.length; index++) {
    const item = materialItems[index]!;
    if (isMaterialPackage(item)) {
      materialPackages.push(item);
      for (const definition of item.materials) {
        standaloneMaterialTagNames.push(definition.manifest.tagName);
      }
    } else if (isMaterialDefinition(item)) {
      materialDefinitions.push(item);
      standaloneMaterialTagNames.push(item.manifest.tagName);
    } else {
      return failure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['materials', index],
        'Material entry must be a material package or a material definition.',
      );
    }
  }

  for (let index = 0; index < elementItems.length; index++) {
    const item = elementItems[index];
    let tagName: unknown;
    try {
      tagName = (item as BaseScreenPluginRegistrationElement).tagName;
    } catch {
      tagName = undefined;
    }
    if (
      item === null ||
      typeof item !== 'object' ||
      typeof tagName !== 'string' ||
      !isValidCustomElementName(tagName) ||
      typeof item.element !== 'function'
    ) {
      return failure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['elements', index],
        'Element entry must declare a valid custom element tag name and constructor.',
      );
    }
  }

  const plannedTags: PlannedTag[] = [];
  const seenTags = new Set<string>();
  const trackTag = (
    tagName: string,
    element: CustomElementConstructor,
    path: readonly (string | number)[],
  ): ScreenParseResult<never> | undefined => {
    if (seenTags.has(tagName)) {
      return failure<never>(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        [...path, 'tagName'],
        'Registration plan contains a duplicate tag name.',
      );
    }
    seenTags.add(tagName);
    plannedTags.push({ tagName, path, element });
    return undefined;
  };
  for (let index = 0; index < pluginPackages.length; index++) {
    for (const definition of pluginPackages[index]!.materials) {
      const failed = trackTag(definition.manifest.tagName, definition.element, ['plugins', index]);
      if (failed !== undefined) return failed;
    }
  }
  for (const materialPackage of materialPackages) {
    for (const definition of materialPackage.materials) {
      const failed = trackTag(definition.manifest.tagName, definition.element, [
        'materials',
        materialPackages.indexOf(materialPackage),
      ]);
      if (failed !== undefined) return failed;
    }
  }
  for (let index = 0; index < materialDefinitions.length; index++) {
    const definition = materialDefinitions[index]!;
    const failed = trackTag(definition.manifest.tagName, definition.element, [
      'materials',
      materialPackages.length + index,
    ]);
    if (failed !== undefined) return failed;
  }
  for (let index = 0; index < elementItems.length; index++) {
    const failed = trackTag(elementItems[index]!.tagName, elementItems[index]!.element, [
      'elements',
      index,
    ]);
    if (failed !== undefined) return failed;
  }

  return {
    ok: true,
    value: {
      define: () =>
        defineRegistration({
          registry: resolvedRegistry,
          plugins: runtimes,
          pluginPackages,
          materialPackages,
          materialDefinitions,
          elements: elementItems,
          plannedTags,
          standaloneMaterialTagNames,
        }),
    },
    diagnostics: [],
  };
}

function defineRegistration(
  plan: RegistrationPlan,
): ScreenParseResult<BaseScreenPluginRegistration> {
  // 整体冲突预检先于第一个 define：目标 tag 已被其它构造函数占用即失败关闭，
  // 已注册为同一构造函数的 tag 视为幂等重放，跳过注册。
  for (const tag of plan.plannedTags) {
    let existing: CustomElementConstructor | undefined;
    try {
      existing = plan.registry.get(tag.tagName);
    } catch {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [...tag.path],
        'Custom element registry lookup failed.',
      );
    }
    if (existing !== undefined && existing !== tag.element) {
      return failure(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        [...tag.path, 'tagName'],
        'Tag name is already bound to a different constructor.',
      );
    }
  }
  for (const pluginPackage of plan.pluginPackages) {
    const defined = pluginPackage.define();
    if (!defined.ok) return defined;
  }
  for (const materialPackage of plan.materialPackages) {
    const defined = materialPackage.define();
    if (!defined.ok) return defined;
  }
  for (const definition of plan.materialDefinitions) {
    const defined = definition.define();
    if (!defined.ok) return defined;
  }
  for (const tag of plan.plannedTags) {
    if (!plan.elements.some((item) => item.tagName === tag.tagName)) continue;
    let existing: CustomElementConstructor | undefined;
    try {
      existing = plan.registry.get(tag.tagName);
    } catch {
      existing = undefined;
    }
    if (existing === tag.element) continue;
    try {
      plan.registry.define(tag.tagName, tag.element);
    } catch {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['elements'],
        'Custom element registration failed.',
      );
    }
  }
  return {
    ok: true,
    value: Object.freeze({
      plugins: Object.freeze([...plan.plugins]),
      standaloneMaterialTagNames: Object.freeze([...plan.standaloneMaterialTagNames]),
    }),
    diagnostics: [],
  };
}

function resolveRegistry(registry: unknown) {
  if (registry === undefined) {
    const fallback = (globalThis as { readonly customElements?: unknown }).customElements;
    return normalizeRegistry(fallback);
  }
  return normalizeRegistry(registry);
}

function normalizeRegistry(registry: unknown) {
  if (registry === null || typeof registry !== 'object') return undefined;
  const candidate = registry as { define?: unknown; get?: unknown };
  if (typeof candidate.define !== 'function' || typeof candidate.get !== 'function') {
    return undefined;
  }
  return candidate as RegistrationPlan['registry'];
}

function resolvePlugin(
  item: BaseScreenPluginPackage | BaseScreenPluginRuntime,
  path: readonly (string | number)[],
): ScreenParseResult<BaseScreenPluginRuntime> {
  if (item === null || typeof item !== 'object') {
    return failure('PLUGIN_CORE_MANIFEST_NOT_OBJECT', [...path], 'Plugin entry must be an object.');
  }
  if ('plugin' in item) {
    const runtime = (item as BaseScreenPluginPackage).plugin;
    if (runtime === null || typeof runtime !== 'object') {
      return failure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'plugin'],
        'Plugin package runtime must be an object.',
      );
    }
    return { ok: true, value: runtime, diagnostics: [] };
  }
  const defined = definePlugin(item as BaseScreenPluginRuntime);
  if (!defined.ok) return prefixFailure(defined.diagnostics, [...path]);
  return defined;
}

function isMaterialPackage(
  item: BaseScreenMaterialPackage | BaseScreenMaterialDefinition,
): item is BaseScreenMaterialPackage {
  return 'materials' in item && Array.isArray((item as BaseScreenMaterialPackage).materials);
}

function isMaterialDefinition(
  item: BaseScreenMaterialPackage | BaseScreenMaterialDefinition,
): item is BaseScreenMaterialDefinition {
  const candidate = item as Partial<BaseScreenMaterialDefinition>;
  return (
    candidate.manifest !== undefined &&
    (candidate as { element?: unknown }).element !== undefined &&
    typeof candidate.define === 'function'
  );
}
