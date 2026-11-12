import type { BaseScreenMaterialCatalogEntry } from '@base-screen/sdk/plugin-core';
import { METRIC_VALUE_MANIFEST } from './metric-value';
import { MetricValueElement, metricValueAdapter } from './metric-value-element';

let cached: readonly BaseScreenMaterialCatalogEntry[] | undefined;

/** 宿主只提供自有物料条目，元素注册与官方物料组合交给标准 runtime。 */
export function registerHostMaterials(): readonly BaseScreenMaterialCatalogEntry[] {
  cached ??= Object.freeze([
    {
      manifest: METRIC_VALUE_MANIFEST,
      constructor: MetricValueElement,
      tabularDataAdapter: metricValueAdapter,
    },
  ]);
  return cached;
}

/** 设计器工具条映射的官方物料类型。 */
export const TOOL_MATERIAL_TYPES = { text: 'base.text', rectangle: 'base.rectangle' } as const;
