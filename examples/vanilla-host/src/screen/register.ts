import {
  defineBaseScreenContainerMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenRuleMaterial,
  defineBaseScreenTextMaterial,
} from '@base-screen/material';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { defineBaseScreenDesigner } from '@base-screen/sdk/designer';
import { defineBaseScreenViewer } from '@base-screen/sdk/viewer';
import { METRIC_VALUE_MANIFEST } from './metric-value';
import { MetricValueElement } from './metric-value-element';

let cached: BaseScreenMaterialCatalog | undefined;

/**
 * 注册入口（幂等）：设计器 / 查看器自定义元素、官方物料、宿主自有指标读数。
 * 全部走公开入口，不触碰私有 API；返回给 configure 使用的 catalog。
 *
 * `base.container` 与 `base.rule` 是组合的组成部分：容器 `libraryVisible: false`，因此不进物料库，
 * 但编组（`groupMaterialType`）与组合分片的 shell 都要求在 catalog 里能解析到它。
 */
export function registerHostMaterials(): BaseScreenMaterialCatalog {
  if (cached !== undefined) return cached;

  const designer = defineBaseScreenDesigner();
  if (!designer.ok)
    throw new Error(`HOST_DESIGNER_DEFINITION_FAILED:${designer.diagnostics[0]?.code}`);
  const viewer = defineBaseScreenViewer();
  if (!viewer.ok) throw new Error(`HOST_VIEWER_DEFINITION_FAILED:${viewer.diagnostics[0]?.code}`);
  const text = defineBaseScreenTextMaterial();
  if (!text.ok) throw new Error(`HOST_TEXT_MATERIAL_FAILED:${text.diagnostics[0]?.code}`);
  const rectangle = defineBaseScreenRectangleMaterial();
  if (!rectangle.ok)
    throw new Error(`HOST_RECTANGLE_MATERIAL_FAILED:${rectangle.diagnostics[0]?.code}`);
  const rule = defineBaseScreenRuleMaterial();
  if (!rule.ok) throw new Error(`HOST_RULE_MATERIAL_FAILED:${rule.diagnostics[0]?.code}`);
  const container = defineBaseScreenContainerMaterial();
  if (!container.ok)
    throw new Error(`HOST_CONTAINER_MATERIAL_FAILED:${container.diagnostics[0]?.code}`);

  const metric = createMaterialDefinition({
    manifest: METRIC_VALUE_MANIFEST,
    element: MetricValueElement as unknown as BaseScreenMaterialConstructor,
  });
  if (!metric.ok) throw new Error(`HOST_METRIC_MATERIAL_FAILED:${metric.diagnostics[0]?.code}`);
  const metricDefined = metric.value.define();
  if (!metricDefined.ok)
    throw new Error(`HOST_METRIC_DEFINE_FAILED:${metricDefined.diagnostics[0]?.code}`);

  cached = createBaseScreenMaterialCatalog([
    text.value,
    rectangle.value,
    rule.value,
    container.value,
    metricDefined.value,
  ]);
  return cached;
}

/** 设计器工具条映射的官方物料类型。 */
export const TOOL_MATERIAL_TYPES = { text: 'base.text', rectangle: 'base.rectangle' } as const;
