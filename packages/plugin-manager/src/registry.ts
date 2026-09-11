import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenPluginInspectorControlCatalogEntry,
  BaseScreenPluginInspectorControlConstructor,
  BaseScreenPluginPanelCatalogEntry,
  BaseScreenPluginPanelConstructor,
} from '@base-screen/plugin-core';
import { parseBaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { DiagnosticCollector } from './diagnostics.js';
import type { Candidate, ManagerInput } from './preflight-types.js';

type Requirement = {
  readonly tagName: string;
  readonly type: string | undefined;
  readonly path: readonly (string | number)[];
};

export function inspectMaterialRegistry(
  input: ManagerInput,
  candidates: readonly Candidate[],
  diagnostics: DiagnosticCollector,
): readonly BaseScreenMaterialCatalogEntry[] {
  const requirements = createRequirements(input, candidates);
  const byTag = new Map<string, BaseScreenMaterialConstructor>();
  const byType = new Map<string, BaseScreenMaterialCatalogEntry>();
  for (const requirement of requirements) {
    const constructor = queryConstructor(input, requirement, diagnostics);
    if (constructor === undefined) continue;
    const priorConstructor = byTag.get(requirement.tagName);
    if (priorConstructor !== undefined && priorConstructor !== constructor) {
      diagnostics.add(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        requirement.path,
        'Material tag resolves to different constructors.',
      );
      continue;
    }
    byTag.set(requirement.tagName, constructor);
    const manifest = readManifest(constructor, requirement, diagnostics);
    if (manifest === undefined) continue;
    if (
      manifest.tagName !== requirement.tagName ||
      (requirement.type !== undefined && manifest.type !== requirement.type)
    ) {
      diagnostics.add(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        requirement.path,
        'Material contribution does not match constructor manifest.',
      );
      continue;
    }
    const adapter = readTabularDataAdapter(constructor, requirement, diagnostics);
    if (adapter === null) continue;
    const entry = {
      manifest,
      constructor,
      ...(adapter === undefined ? {} : { tabularDataAdapter: adapter }),
    };
    const priorEntry = byType.get(manifest.type);
    if (
      priorEntry !== undefined &&
      (priorEntry.constructor !== constructor || priorEntry.manifest.tagName !== manifest.tagName)
    ) {
      diagnostics.add(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        requirement.path,
        'Material type conflicts with another candidate.',
      );
      continue;
    }
    byType.set(manifest.type, entry);
  }
  return [...byType.values()];
}

export function inspectPluginPanels(
  candidates: readonly Candidate[],
  registryGet: (tagName: string) => unknown,
  diagnostics: DiagnosticCollector,
): readonly BaseScreenPluginPanelCatalogEntry[] {
  const byId = new Map<string, BaseScreenPluginPanelCatalogEntry>();
  const tagOwners = new Map<string, string>();
  for (const candidate of candidates) {
    for (let index = 0; index < candidate.manifest.contributions.length; index++) {
      const contribution = candidate.manifest.contributions[index]!;
      if (contribution.kind !== 'panel') continue;
      const path = ['plugins', candidate.index, 'manifest', 'contributions', index];
      const constructor = queryAuthorizedConstructor(
        registryGet,
        contribution.tagName,
        path,
        diagnostics,
        'Panel tag is not registered.',
      );
      if (constructor === undefined) continue;
      const priorOwner = tagOwners.get(contribution.tagName);
      if (priorOwner !== undefined && priorOwner !== contribution.id) {
        diagnostics.add(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          path,
          'Panel tag resolves to a different panel.',
        );
        continue;
      }
      tagOwners.set(contribution.tagName, contribution.id);
      byId.set(contribution.id, {
        pluginId: candidate.manifest.id,
        contribution,
        constructor: constructor as BaseScreenPluginPanelConstructor,
      });
    }
  }
  return [...byId.values()];
}

export function inspectInspectorControls(
  candidates: readonly Candidate[],
  registryGet: (tagName: string) => unknown,
  diagnostics: DiagnosticCollector,
): readonly BaseScreenPluginInspectorControlCatalogEntry[] {
  const byId = new Map<string, BaseScreenPluginInspectorControlCatalogEntry>();
  const tagOwners = new Map<string, string>();
  for (const candidate of candidates) {
    for (let index = 0; index < candidate.manifest.contributions.length; index++) {
      const contribution = candidate.manifest.contributions[index]!;
      if (contribution.kind !== 'inspectorControl') continue;
      const path = ['plugins', candidate.index, 'manifest', 'contributions', index];
      const constructor = queryAuthorizedConstructor(
        registryGet,
        contribution.tagName,
        path,
        diagnostics,
        'Inspector control tag is not registered.',
      );
      if (constructor === undefined) continue;
      const priorOwner = tagOwners.get(contribution.tagName);
      if (priorOwner !== undefined && priorOwner !== contribution.id) {
        diagnostics.add(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          path,
          'Inspector control tag resolves to a different control.',
        );
        continue;
      }
      tagOwners.set(contribution.tagName, contribution.id);
      byId.set(contribution.id, {
        pluginId: candidate.manifest.id,
        contribution,
        constructor: constructor as BaseScreenPluginInspectorControlConstructor,
      });
    }
  }
  return [...byId.values()];
}

/**
 * 宿主 registry 是唯一来源：描述里出现的 tagName 若未被某个 inspectorControl 贡献声明并
 * 解析成功，就永远不会进入目录，Engine 也就拿不到它的构造函数。
 */
function queryAuthorizedConstructor(
  registryGet: (tagName: string) => unknown,
  tagName: string,
  path: readonly (string | number)[],
  diagnostics: DiagnosticCollector,
  notRegisteredMessage: string,
): CustomElementConstructor | undefined {
  let value: unknown;
  try {
    value = registryGet(tagName);
  } catch {
    diagnostics.add('PLUGIN_CORE_IDENTITY_INVALID', path, 'Registry query failed.');
    return undefined;
  }
  if (typeof value !== 'function') {
    diagnostics.add('PLUGIN_CORE_IDENTITY_INVALID', path, notRegisteredMessage);
    return undefined;
  }
  return value as CustomElementConstructor;
}

function readTabularDataAdapter(
  constructor: BaseScreenMaterialConstructor,
  requirement: Requirement,
  diagnostics: DiagnosticCollector,
): NonNullable<BaseScreenMaterialConstructor['tabularDataAdapter']> | undefined | null {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(constructor, 'tabularDataAdapter');
    if (descriptor === undefined) return undefined;
    if (
      !Object.hasOwn(descriptor, 'value') ||
      descriptor.value === null ||
      typeof descriptor.value !== 'object' ||
      typeof (descriptor.value as { readonly adapt?: unknown }).adapt !== 'function'
    ) {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        requirement.path,
        'Material dataset adapter is invalid.',
      );
      return null;
    }
    return descriptor.value as NonNullable<BaseScreenMaterialConstructor['tabularDataAdapter']>;
  } catch {
    diagnostics.add(
      'PLUGIN_CORE_IDENTITY_INVALID',
      requirement.path,
      'Material dataset adapter cannot be safely read.',
    );
    return null;
  }
}

function createRequirements(
  input: ManagerInput,
  candidates: readonly Candidate[],
): readonly Requirement[] {
  const standalone = input.standaloneMaterialTagNames.map((tagName, index) => ({
    tagName,
    type: undefined,
    path: ['standaloneMaterialTagNames', index],
  }));
  const contributions = candidates.flatMap((candidate) =>
    candidate.manifest.contributions.flatMap((contribution, index) =>
      contribution.kind === 'material'
        ? [
            {
              tagName: contribution.tagName,
              type: contribution.type,
              path: ['plugins', candidate.index, 'manifest', 'contributions', index],
            },
          ]
        : [],
    ),
  );
  return [...standalone, ...contributions].sort((left, right) => {
    const byTag = compareStrings(left.tagName, right.tagName);
    if (byTag !== 0) return byTag;
    return compareStrings(left.type ?? '', right.type ?? '');
  });
}

function queryConstructor(
  input: ManagerInput,
  requirement: Requirement,
  diagnostics: DiagnosticCollector,
): BaseScreenMaterialConstructor | undefined {
  try {
    const value = input.registryGet(requirement.tagName);
    if (typeof value !== 'function') {
      diagnostics.add(
        'PLUGIN_CORE_IDENTITY_INVALID',
        requirement.path,
        'Material tag is not registered.',
      );
      return undefined;
    }
    return value as BaseScreenMaterialConstructor;
  } catch {
    diagnostics.add('PLUGIN_CORE_IDENTITY_INVALID', requirement.path, 'Registry query failed.');
    return undefined;
  }
}

function readManifest(
  constructor: BaseScreenMaterialConstructor,
  requirement: Requirement,
  diagnostics: DiagnosticCollector,
) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(constructor, 'manifest');
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        requirement.path,
        'Material constructor manifest is invalid.',
      );
      return undefined;
    }
    const parsed = parseBaseScreenMaterialManifest(descriptor.value);
    if (!parsed.ok) {
      for (const item of parsed.diagnostics) {
        diagnostics.add(item.code, [...requirement.path, ...item.path], item.message);
      }
      return undefined;
    }
    return parsed.value;
  } catch {
    diagnostics.add(
      'PLUGIN_CORE_IDENTITY_INVALID',
      requirement.path,
      'Material constructor cannot be safely read.',
    );
    return undefined;
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
