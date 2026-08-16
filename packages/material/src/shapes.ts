import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import {
  applyBackgroundColorOrGradient,
  BaseScreenOfficialMaterialElement,
  isGradientColorValue,
} from './base-material.js';

const shapeStyleSchema = {
  kind: 'object' as const,
  properties: {
    fill: { kind: 'string' as const },
    borderColor: { kind: 'string' as const },
    borderWidth: { kind: 'number' as const, minimum: 0, maximum: 100 },
    opacity: { kind: 'number' as const, minimum: 0, maximum: 1 },
    borderRadius: { kind: 'number' as const, minimum: 0, maximum: 512 },
    shadowColor: { kind: 'string' as const },
    shadowBlur: { kind: 'number' as const, minimum: 0, maximum: 100 },
    shadowOffsetX: { kind: 'number' as const, minimum: -100, maximum: 100 },
    shadowOffsetY: { kind: 'number' as const, minimum: -100, maximum: 100 },
  },
  required: ['fill', 'borderColor', 'borderWidth', 'opacity'],
};

const shapeStylePanel = [
  { style: 'fill', label: '填充', control: 'color' as const },
  { style: 'borderColor', label: '边框颜色', control: 'color' as const },
  { style: 'borderWidth', label: '边框宽度', control: 'number' as const },
  { style: 'borderRadius', label: '圆角', control: 'number' as const },
  { style: 'shadowColor', label: '阴影颜色', control: 'color' as const },
  { style: 'shadowBlur', label: '阴影模糊', control: 'number' as const },
  { style: 'shadowOffsetX', label: '阴影偏移 X', control: 'number' as const },
  { style: 'shadowOffsetY', label: '阴影偏移 Y', control: 'number' as const },
  { style: 'opacity', label: '不透明度', control: 'number' as const },
];

const shapeDefaultStyle = {
  fill: '#2563eb',
  borderColor: '#1d4ed8',
  borderWidth: 0,
  opacity: 1,
  borderRadius: 0,
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

export const BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.rectangle',
  tagName: 'base-screen-rectangle',
  name: '矩形',
  category: '基础',
  keywords: ['矩形', '形状'],
  defaultSize: { width: 240, height: 120 },
  defaultProps: {},
  defaultStyle: shapeDefaultStyle,
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
  // 椭圆圆角由形状固定为 50%，面板不暴露 borderRadius（ADR-0055 R2）。
  stylePanel: shapeStylePanel.filter((field) => field.style !== 'borderRadius'),
};

class BaseScreenShapeMaterialElement extends BaseScreenOfficialMaterialElement {
  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    const { style } = model;
    applyBackgroundColorOrGradient(this, typeof style.fill === 'string' ? style.fill : '');
    this.style.borderColor = typeof style.borderColor === 'string' ? style.borderColor : '';
    this.style.borderStyle = 'solid';
    this.style.borderWidth = typeof style.borderWidth === 'number' ? `${style.borderWidth}px` : '';
    this.style.opacity = typeof style.opacity === 'number' ? String(style.opacity) : '';
    this.style.borderRadius =
      typeof style.borderRadius === 'number' && Number.isFinite(style.borderRadius)
        ? `${style.borderRadius}px`
        : '0px';
    this.style.boxShadow = this.shadowStyle(style);
  }

  private shadowStyle(style: Readonly<Record<string, unknown>>): string {
    const color = typeof style.shadowColor === 'string' ? style.shadowColor : '';
    const blur = typeof style.shadowBlur === 'number' ? style.shadowBlur : 0;
    const offsetX = typeof style.shadowOffsetX === 'number' ? style.shadowOffsetX : 0;
    const offsetY = typeof style.shadowOffsetY === 'number' ? style.shadowOffsetY : 0;
    // 阴影不支持渐变（box-shadow 不接受 <image>）：渐变值跳过阴影（ADR-0055 R4）。
    if (color === '' || !(blur > 0) || isGradientColorValue(color)) return '';
    return `${offsetX}px ${offsetY}px ${blur}px ${color}`;
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
