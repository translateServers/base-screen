import type { ScreenParseResult } from '@base-screen/contracts';
import {
  defineBaseScreenChartMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenRuleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from '@base-screen/material';
import { registerPluginBoardMaterials } from '@base-screen/plugin-board-materials';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
} from '@base-screen/plugin-core';
import { registerPluginEcharts } from '@base-screen/plugin-echarts';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { defineBaseScreenDesigner } from '@base-screen/sdk/designer';
import { defineBaseScreenViewer } from '@base-screen/sdk/viewer';
import { METRIC_VALUE_MANIFEST } from './metric-value';
import { MetricValueElement } from './metric-value-element';

let cached: readonly BaseScreenMaterialCatalogEntry[] | undefined;

/**
 * 同步注册入口（幂等）：设计器 / 查看器自定义元素、官方全量物料、宿主自有指标读数、
 * 两个外围插件物料。必须先于 `loadHostRuntime()`：manager preflight 会按 tagName
 * 从 `customElements` 反查构造函数。
 */
export function registerHostMaterials(): readonly BaseScreenMaterialCatalogEntry[] {
  if (cached !== undefined) return cached;

  requireDefinition('HOST_DESIGNER_DEFINITION_FAILED', defineBaseScreenDesigner());
  requireDefinition('HOST_VIEWER_DEFINITION_FAILED', defineBaseScreenViewer());

  const official = [
    defineBaseScreenTextMaterial(),
    defineBaseScreenRectangleMaterial(),
    defineBaseScreenEllipseMaterial(),
    defineBaseScreenImageMaterial(),
    defineBaseScreenRuleMaterial(),
    defineBaseScreenContainerMaterial(),
    defineBaseScreenChartMaterial(),
    defineBaseScreenTableMaterial(),
  ].map((definition, index) =>
    requireDefinition(`HOST_OFFICIAL_MATERIAL_${index}_FAILED`, definition),
  );

  const metric = createMaterialDefinition({
    manifest: METRIC_VALUE_MANIFEST,
    element: MetricValueElement as unknown as BaseScreenMaterialConstructor,
  });
  if (!metric.ok) {
    throw new Error(`HOST_METRIC_MATERIAL_FAILED:${metric.diagnostics[0]?.code}`);
  }
  const metricDefined = metric.value.define();
  if (!metricDefined.ok) {
    throw new Error(`HOST_METRIC_DEFINE_FAILED:${metricDefined.diagnostics[0]?.code}`);
  }

  registerPluginBoardMaterials();
  registerPluginEcharts();

  cached = Object.freeze([...official, metricDefined.value]);
  return cached;
}

function requireDefinition<T>(code: string, result: ScreenParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`${code}:${result.diagnostics[0]?.code ?? 'UNKNOWN'}`);
  }
  return result.value;
}

/** 设计器工具条映射的官方物料类型。 */
export const TOOL_MATERIAL_TYPES = { text: 'base.text', rectangle: 'base.rectangle' } as const;
