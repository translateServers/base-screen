import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
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
    const entry = { manifest, constructor };
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
