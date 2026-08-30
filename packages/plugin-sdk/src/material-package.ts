import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { failure, prefixFailure, sortDiagnostics } from './diagnostics.js';
import {
  type BaseScreenMaterialDefinition,
  type CreateMaterialDefinitionOptions,
  createMaterialDefinition,
} from './material-definition.js';

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
