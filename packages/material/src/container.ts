import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenOfficialMaterialElement } from './base-material.js';

export const BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.container',
  tagName: 'base-screen-container',
  name: '容器',
  category: '基础',
  keywords: ['容器', '分组'],
  defaultSize: { width: 320, height: 180 },
  defaultProps: {},
  defaultStyle: {
    fill: 'transparent',
    borderColor: 'transparent',
    borderWidth: 1,
    opacity: 1,
    flipX: false,
    flipY: false,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      fill: { kind: 'string' },
      borderColor: { kind: 'string' },
      borderWidth: { kind: 'number', minimum: 0, maximum: 100 },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
      flipX: { kind: 'boolean' },
      flipY: { kind: 'boolean' },
    },
    required: ['fill', 'borderColor', 'borderWidth', 'opacity'],
  },
  stylePanel: [
    { style: 'fill', label: '填充', control: 'color', allowGradient: true },
    { style: 'borderColor', label: '边框颜色', control: 'color' },
    { style: 'borderWidth', label: '边框宽度', control: 'number' },
    { style: 'opacity', label: '不透明度', control: 'number' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: true },
  libraryVisible: false,
};

export class BaseScreenContainerMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    // 与形状物料共用盒面实现（border-box、渐变填充、渐变边框叠加层）。
    this.drawBoxSurface(model.style);
  }
}

export function defineBaseScreenContainerMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
    element: BaseScreenContainerMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
