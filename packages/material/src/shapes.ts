import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialEditorSection,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenOfficialMaterialElement } from './base-material.js';
import { styleField, withOfficialEditorDescriptor } from './editor-descriptor.js';

const shapeStyleSchema = {
  kind: 'object' as const,
  properties: {
    fill: { kind: 'string' as const },
    borderColor: { kind: 'string' as const },
    borderWidth: { kind: 'number' as const, minimum: 0, maximum: 100 },
    opacity: { kind: 'number' as const, minimum: 0, maximum: 1 },
    flipX: { kind: 'boolean' as const },
    flipY: { kind: 'boolean' as const },
    borderRadius: { kind: 'number' as const, minimum: 0, maximum: 512 },
    shadowColor: { kind: 'string' as const },
    shadowBlur: { kind: 'number' as const, minimum: 0, maximum: 100 },
    shadowOffsetX: { kind: 'number' as const, minimum: -100, maximum: 100 },
    shadowOffsetY: { kind: 'number' as const, minimum: -100, maximum: 100 },
  },
  required: ['fill', 'borderColor', 'borderWidth', 'opacity'],
};

/** 阴影四项默认收起：大多数形状不用阴影，展开即全部可见。 */
const shapeShadowSection: BaseScreenMaterialEditorSection = {
  id: 'shadow',
  label: '阴影',
  collapsed: true,
  fields: [
    styleField('shadowColor', '阴影颜色', 'color'),
    styleField('shadowBlur', '阴影模糊', 'number'),
    styleField('shadowOffsetX', '阴影偏移 X', 'number'),
    styleField('shadowOffsetY', '阴影偏移 Y', 'number'),
  ],
};

const shapeDefaultStyle = {
  fill: '#2563eb',
  borderColor: '#1d4ed8',
  borderWidth: 0,
  opacity: 1,
  flipX: false,
  flipY: false,
  borderRadius: 0,
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

export const BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST: BaseScreenMaterialManifest =
  withOfficialEditorDescriptor(
    {
      type: 'base.rectangle',
      tagName: 'base-screen-rectangle',
      name: '矩形',
      category: '基础',
      keywords: ['矩形', '形状'],
      defaultSize: { width: 240, height: 120 },
      defaultProps: {},
      defaultStyle: shapeDefaultStyle,
      styleSchema: shapeStyleSchema,
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: [],
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: false },
    },
    {
      appearance: [
        {
          id: 'structure',
          label: '结构',
          fields: [styleField('borderRadius', '圆角', 'number')],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            styleField('fill', '填充色', 'color', { allowGradient: true }),
            styleField('borderColor', '边框颜色', 'color', { allowGradient: true }),
            styleField('borderWidth', '边框宽度', 'number'),
          ],
        },
        shapeShadowSection,
      ],
    },
  );

export const BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST: BaseScreenMaterialManifest =
  withOfficialEditorDescriptor(
    {
      ...BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
      type: 'base.ellipse',
      tagName: 'base-screen-ellipse',
      name: '椭圆',
      keywords: ['椭圆', '形状'],
      // 椭圆圆角由形状固定为 50%，面板不暴露 borderRadius（ADR-0055 R2）。
    },
    {
      // 椭圆没有「结构」：唯一的结构项圆角由形状固定；边框也不开放渐变。
      appearance: [
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            styleField('fill', '填充色', 'color', { allowGradient: true }),
            styleField('borderColor', '边框颜色', 'color'),
            styleField('borderWidth', '边框宽度', 'number'),
          ],
        },
        shapeShadowSection,
      ],
    },
  );

class BaseScreenShapeMaterialElement extends BaseScreenOfficialMaterialElement {
  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.drawBoxSurface(model.style);
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
