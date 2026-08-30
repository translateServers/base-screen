import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenEChartsMaterialElement } from './echarts-element.js';
import { BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST } from './echarts-manifest.js';

export function defineBaseScreenEChartsMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST,
    element: BaseScreenEChartsMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
