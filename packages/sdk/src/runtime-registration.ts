import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import {
  type BaseScreenPluginManager,
  type BaseScreenPluginManagerOptions,
  type BaseScreenPluginManagerSnapshot,
  createBaseScreenPluginContributionCommandPort,
  createBaseScreenPluginManager,
} from '@base-screen/plugin-manager';
import {
  type BaseScreenPluginRegistrationElement,
  type CreatePluginRegistrationOptions,
  createMaterialDefinition,
  createPluginRegistration,
} from '@base-screen/plugin-sdk';
import {
  collectDiagnostics,
  collectFailureDiagnostics,
  runtimeDiagnostic,
  runtimeFailure,
  runtimeSuccess,
} from './runtime-diagnostics.js';

type RuntimeMaterial = NonNullable<CreatePluginRegistrationOptions['materials']>[number];
type RuntimeRegistry = NonNullable<CreatePluginRegistrationOptions['registry']>;
type ManagerMaterialConstructor = ReturnType<BaseScreenPluginManagerOptions['registry']['get']>;

/** Viewer 与完整运行时共用注册、激活和目录校验，不承载 Designer 实现。 */
export interface BaseScreenRuntimeRegistrationOptions {
  readonly instanceId?: string;
  readonly materials?: readonly (RuntimeMaterial | BaseScreenMaterialCatalogEntry)[];
  readonly plugins?: CreatePluginRegistrationOptions['plugins'];
  readonly grantedCapabilities?: BaseScreenPluginManagerOptions['grantedCapabilities'];
  readonly activation?: BaseScreenPluginManagerOptions['activation'];
  readonly createCommandPort?: BaseScreenPluginManagerOptions['createCommandPort'];
  readonly createDesignReadPort?: BaseScreenPluginManagerOptions['createDesignReadPort'];
}

function readHostRegistry(): ScreenParseResult<RuntimeRegistry> {
  const candidate = globalThis.customElements;
  if (candidate === undefined || candidate === null || typeof candidate !== 'object') {
    return runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Custom Elements are unavailable in this runtime.',
      ['customElements'],
    );
  }
  if (typeof candidate.get !== 'function' || typeof candidate.define !== 'function') {
    return runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Custom Elements registry must provide get and define.',
      ['customElements'],
    );
  }
  return runtimeSuccess({
    get: (tagName) => candidate.get(tagName),
    define: (tagName, element) => candidate.define(tagName, element),
  });
}

function normalizeRuntimeMaterials(
  inputs: NonNullable<BaseScreenRuntimeRegistrationOptions['materials']>,
): ScreenParseResult<readonly RuntimeMaterial[]> {
  const definitions: RuntimeMaterial[] = [];
  for (const input of inputs) {
    if (input === null || typeof input !== 'object') {
      return runtimeFailure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        'Host material input must be a definition, package or catalog entry.',
        ['materials', definitions.length],
      );
    }
    if ('element' in input || 'materials' in input) {
      definitions.push(input);
      continue;
    }
    try {
      createBaseScreenMaterialCatalog([input]);
    } catch {
      return runtimeFailure(
        'PLUGIN_CORE_IDENTITY_CONFLICT',
        'Host material entry cannot be registered with its dataset adapter.',
        ['materials', definitions.length],
      );
    }
    const definition = createMaterialDefinition({
      manifest: input.manifest,
      element: input.constructor,
    });
    if (!definition.ok) return definition;
    definitions.push(definition.value);
  }
  return runtimeSuccess(definitions);
}

export interface BaseScreenRuntimeRegistration {
  readonly instanceId: string;
  readonly manager: BaseScreenPluginManager;
  readonly snapshot: BaseScreenPluginManagerSnapshot;
  readonly pluginCommandPort: ReturnType<typeof createBaseScreenPluginContributionCommandPort>;
}

export async function createBaseScreenRuntimeRegistration(
  options: BaseScreenRuntimeRegistrationOptions,
  elements: readonly BaseScreenPluginRegistrationElement[],
): Promise<ScreenParseResult<BaseScreenRuntimeRegistration>> {
  const registryResult = readHostRegistry();
  if (!registryResult.ok) return registryResult;
  const registry = registryResult.value;
  const materials = normalizeRuntimeMaterials(options.materials ?? []);
  if (!materials.ok) return materials;
  const registration = createPluginRegistration({
    registry,
    materials: materials.value,
    plugins: options.plugins ?? [],
    elements,
  });
  if (!registration.ok) return registration;
  const registered = registration.value.define();
  if (!registered.ok) return registered;
  const instanceId = options.instanceId ?? 'base-screen';
  const manager = createBaseScreenPluginManager({
    instanceId,
    standaloneMaterialTagNames: registered.value.standaloneMaterialTagNames,
    plugins: registered.value.plugins,
    grantedCapabilities: options.grantedCapabilities ?? {},
    registry: { get: (tagName) => registry.get(tagName) as ManagerMaterialConstructor },
    ...(options.createCommandPort === undefined
      ? {}
      : { createCommandPort: options.createCommandPort }),
    ...(options.createDesignReadPort === undefined
      ? {}
      : { createDesignReadPort: options.createDesignReadPort }),
    activation: options.activation ?? 'eager',
  });
  const activated = await manager.activate();
  if (!activated.ok) {
    const disposal = await manager.dispose();
    return { ok: false as const, diagnostics: collectDiagnostics([activated, disposal]) };
  }
  const snapshot = activated.value;
  if (snapshot.failures.length > 0) {
    const diagnostics: ScreenDiagnostic[] = snapshot.failures.flatMap((failure) => [
      ...failure.diagnostics,
    ]);
    if (diagnostics.length === 0) {
      diagnostics.push(
        runtimeDiagnostic(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Plugin activation failed without diagnostics.',
          ['plugins'],
        ),
      );
    }
    const disposal = await manager.dispose();
    return {
      ok: false as const,
      diagnostics: [...diagnostics, ...collectFailureDiagnostics([disposal])],
    };
  }
  return runtimeSuccess({
    instanceId,
    manager,
    snapshot,
    pluginCommandPort: createBaseScreenPluginContributionCommandPort(manager),
  });
}
