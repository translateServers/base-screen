import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenPluginRuntime,
} from '@base-screen/plugin-core';
import { failure, prefixFailure } from './diagnostics.js';
import {
  type BaseScreenMaterialDefinition,
  type CreateMaterialDefinitionOptions,
} from './material-definition.js';
import { type BaseScreenMaterialPackage, createMaterialPackage } from './material-package.js';
import { definePlugin } from './plugin-definition.js';

export interface CreatePluginPackageOptions {
  readonly id: string;
  readonly plugin: BaseScreenPluginRuntime;
  readonly materials?: readonly CreateMaterialDefinitionOptions[];
}

export interface BaseScreenPluginPackage {
  readonly id: string;
  readonly plugin: BaseScreenPluginRuntime;
  readonly materials: readonly BaseScreenMaterialDefinition[];
  define(): ScreenParseResult<{
    readonly runtime: BaseScreenPluginRuntime;
    readonly materials: readonly BaseScreenMaterialCatalogEntry[];
  }>;
}

export function createPluginPackage(
  options: CreatePluginPackageOptions,
): ScreenParseResult<BaseScreenPluginPackage> {
  const input = options as unknown;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_NOT_OBJECT',
      [],
      'Plugin package options must be an object.',
    );
  }
  let id: unknown;
  let plugin: unknown;
  let materials: unknown;
  try {
    id = (input as CreatePluginPackageOptions).id;
    plugin = (input as CreatePluginPackageOptions).plugin;
    materials = (input as CreatePluginPackageOptions).materials;
  } catch {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [],
      'Plugin package options cannot be safely read.',
    );
  }
  if (!isPackageId(id)) {
    return failure(
      'PLUGIN_CORE_IDENTITY_INVALID',
      ['id'],
      'Plugin package id must be an ASCII identifier.',
    );
  }
  if (plugin === null || typeof plugin !== 'object' || Array.isArray(plugin)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_NOT_OBJECT',
      ['plugin'],
      'Plugin package runtime must be an object.',
    );
  }
  const defined = definePlugin(plugin as BaseScreenPluginRuntime);
  if (!defined.ok) return prefixFailure(defined.diagnostics, ['plugin']);
  let materialPackage: BaseScreenMaterialPackage | undefined;
  if (materials !== undefined) {
    if (!Array.isArray(materials)) {
      return failure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['materials'],
        'Plugin package materials must be an array.',
      );
    }
    if (materials.length > 0) {
      const packed = createMaterialPackage({
        id,
        materials: materials as readonly CreateMaterialDefinitionOptions[],
      });
      if (!packed.ok) return packed;
      materialPackage = packed.value;
    }
  }
  const definitions = materialPackage?.materials ?? Object.freeze([]);
  return {
    ok: true,
    value: {
      id,
      plugin: defined.value,
      materials: definitions,
      define: () => definePluginPackage(defined.value, materialPackage),
    },
    diagnostics: [],
  };
}

function definePluginPackage(
  runtime: BaseScreenPluginRuntime,
  materialPackage: BaseScreenMaterialPackage | undefined,
): ScreenParseResult<{
  readonly runtime: BaseScreenPluginRuntime;
  readonly materials: readonly BaseScreenMaterialCatalogEntry[];
}> {
  if (materialPackage === undefined) {
    return {
      ok: true,
      value: { runtime, materials: Object.freeze([]) },
      diagnostics: [],
    };
  }
  const defined = materialPackage.define();
  if (!defined.ok) return defined;
  return {
    ok: true,
    value: { runtime, materials: defined.value },
    diagnostics: [],
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
