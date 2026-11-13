import type { BaseScreenMaterialCatalogEntry } from 'base-screen/plugin-core';
import { createMetricValueMaterial } from './metric-value-material';

let cached: readonly BaseScreenMaterialCatalogEntry[] | undefined;

/** 框架桥产物直接交给标准 runtime，注册、适配器与授权不再由宿主重复装配。 */
export function registerHostMaterials(): readonly BaseScreenMaterialCatalogEntry[] {
  cached ??= Object.freeze([createMetricValueMaterial()]);
  return cached;
}

/** 设计器工具条映射的官方物料类型。 */
export const TOOL_MATERIAL_TYPES = { text: 'base.text', rectangle: 'base.rectangle' } as const;
