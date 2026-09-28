import {
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTextMaterial,
} from '@base-screen/material';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { defineBaseScreenDesigner } from '@base-screen/sdk/designer';
import { defineBaseScreenViewer } from '@base-screen/sdk/viewer';
import { KPI_CARD_TAG } from './kpi-card';
import { createKpiCardMaterial } from './kpi-card-material';

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

  const kpi: BaseScreenMaterialCatalogEntry = createKpiCardMaterial();
  if (customElements.get(KPI_CARD_TAG) === undefined) {
    customElements.define(KPI_CARD_TAG, kpi.constructor);
  }

  cached = createBaseScreenMaterialCatalog([text.value, rectangle.value, kpi]);
  return cached;
}

/** 设计器工具条映射的官方物料类型。 */
export const TOOL_MATERIAL_TYPES = { text: 'base.text', rectangle: 'base.rectangle' } as const;
