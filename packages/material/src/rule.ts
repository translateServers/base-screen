import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenOfficialMaterialElement } from './base-material.js';

const RULE_AXES = ['horizontal', 'vertical'] as const;
const RULE_DASHES = ['solid', 'dashed', 'dotted'] as const;

export const BASE_SCREEN_RULE_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.rule',
  tagName: 'base-screen-rule',
  name: '分割线',
  category: '基础',
  keywords: ['分割线', '分隔', '线条'],
  defaultSize: { width: 320, height: 2 },
  defaultProps: { axis: 'horizontal' },
  defaultStyle: { color: '#1f2a44', thickness: 2, dash: 'solid', opacity: 1 },
  styleSchema: {
    kind: 'object',
    properties: {
      color: { kind: 'string' },
      thickness: { kind: 'number', minimum: 1, maximum: 24 },
      dash: { kind: 'enum', values: [...RULE_DASHES] },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
    },
    required: ['color', 'thickness', 'dash'],
  },
  stylePanel: [
    { style: 'color', label: '线条颜色', control: 'color' },
    { style: 'thickness', label: '线宽', control: 'number' },
    { style: 'dash', label: '线型', control: 'select' },
    { style: 'opacity', label: '不透明度', control: 'number' },
  ],
  propsSchema: {
    kind: 'object',
    properties: {
      axis: { kind: 'enum', values: [...RULE_AXES] },
    },
    required: ['axis'],
  },
  propertyPanel: [{ prop: 'axis', label: '方向', control: 'select' }],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
};

/**
 * 官方分割线物料：只画一条线。
 *
 * 它是原子的——不填充、不带标题、不画边框盒，因此与 `base.rectangle` 不重叠：
 * 矩形负责"一块面"，本物料负责"一条线"。方向由 `axis` prop 决定，线沿盒子的一边画，
 * 盒子本身的宽高仍由渲染器按 canonical `component.size` 写入。
 */
export class BaseScreenRuleMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_RULE_MATERIAL_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    const color = typeof model.style.color === 'string' ? model.style.color : '';
    const thickness =
      typeof model.style.thickness === 'number' && Number.isFinite(model.style.thickness)
        ? model.style.thickness
        : 2;
    const dash = (RULE_DASHES as readonly string[]).includes(String(model.style.dash))
      ? String(model.style.dash)
      : 'solid';
    const line = `${thickness}px ${dash} ${color}`;
    const vertical = model.props.axis === 'vertical';

    // 渲染盒不变式：只写内部样式，绝不写宿主元素的 width/height。
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = 'transparent';
    this.style.backgroundImage = '';
    this.style.borderTop = '';
    this.style.borderLeft = '';
    if (vertical) this.style.borderLeft = line;
    else this.style.borderTop = line;
    this.style.opacity = typeof model.style.opacity === 'number' ? String(model.style.opacity) : '';
  }
}

export function defineBaseScreenRuleMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_RULE_MATERIAL_MANIFEST,
    element: BaseScreenRuleMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
