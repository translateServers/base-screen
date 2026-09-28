import {
  defineBaseScreenRectangleMaterial,
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
import { KPI_CARD_MANIFEST } from './kpi-card';
import { KpiCardElement } from './kpi-card-element';

let cached: BaseScreenMaterialCatalog | undefined;

/**
 * 注册入口（幂等）：设计器 / 查看器自定义元素、官方物料、宿主自有 KPI 卡。
 * 全部走公开入口，不触碰私有 API；返回给 configure 使用的 catalog。
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

  const kpi = createMaterialDefinition({
    manifest: KPI_CARD_MANIFEST,
    element: KpiCardElement as unknown as BaseScreenMaterialConstructor,
  });
  if (!kpi.ok) throw new Error(`HOST_KPI_MATERIAL_FAILED:${kpi.diagnostics[0]?.code}`);
  const kpiDefined = kpi.value.define();
  if (!kpiDefined.ok) throw new Error(`HOST_KPI_DEFINE_FAILED:${kpiDefined.diagnostics[0]?.code}`);

  cached = createBaseScreenMaterialCatalog([text.value, rectangle.value, kpiDefined.value]);
  return cached;
}

/** 设计器工具条映射的官方物料类型。 */
export const TOOL_MATERIAL_TYPES = { text: 'base.text', rectangle: 'base.rectangle' } as const;
