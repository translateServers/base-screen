import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenOfficialMaterialElement } from './base-material.js';

const shapeStyleSchema = {
  kind: 'object' as const,
  properties: {
    fill: { kind: 'string' as const },
    borderColor: { kind: 'string' as const },
    borderWidth: { kind: 'number' as const, minimum: 0, maximum: 100 },
    opacity: { kind: 'number' as const, minimum: 0, maximum: 1 },
  },
  required: ['fill', 'borderColor', 'borderWidth', 'opacity'],
};

const shapeStylePanel = [
  { style: 'fill', label: '填充', control: 'color' as const },
  { style: 'borderColor', label: '边框颜色', control: 'color' as const },
  { style: 'borderWidth', label: '边框宽度', control: 'number' as const },
  { style: 'opacity', label: '不透明度', control: 'number' as const },
];

export const BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.rectangle',
  tagName: 'base-screen-rectangle',
  name: '矩形',
  category: '基础',
  keywords: ['矩形', '形状'],
  defaultSize: { width: 240, height: 120 },
  defaultProps: {},
  defaultStyle: { fill: '#2563eb', borderColor: '#1d4ed8', borderWidth: 0, opacity: 1 },
  styleSchema: shapeStyleSchema,
  stylePanel: shapeStylePanel,
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
};

export const BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  ...BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  type: 'base.ellipse',
  tagName: 'base-screen-ellipse',
  name: '椭圆',
  keywords: ['椭圆', '形状'],
};

class BaseScreenShapeMaterialElement extends BaseScreenOfficialMaterialElement {
  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    const { style } = model;
    this.style.backgroundColor = typeof style.fill === 'string' ? style.fill : '';
    this.style.borderColor = typeof style.borderColor === 'string' ? style.borderColor : '';
    this.style.borderStyle = 'solid';
    this.style.borderWidth = typeof style.borderWidth === 'number' ? `${style.borderWidth}px` : '';
    this.style.opacity = typeof style.opacity === 'number' ? String(style.opacity) : '';
  }
}

export class BaseScreenRectangleMaterialElement extends BaseScreenShapeMaterialElement {
  static readonly manifest = BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST;
}

export class BaseScreenEllipseMaterialElement extends BaseScreenShapeMaterialElement {
  static readonly manifest = BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST;

  protected override renderMaterial(): void {
    super.renderMaterial();
    this.style.borderRadius = '50%';
  }
}

export function defineBaseScreenRectangleMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  return defineShape(BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST, BaseScreenRectangleMaterialElement);
}

export function defineBaseScreenEllipseMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  return defineShape(BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST, BaseScreenEllipseMaterialElement);
}

function defineShape(
  manifest: BaseScreenMaterialManifest,
  element: BaseScreenMaterialConstructor,
): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({ manifest, element });
  return definition.ok ? definition.value.define() : definition;
}
