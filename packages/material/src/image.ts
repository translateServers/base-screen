import { isBoundedScreenImageUrl, type ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenOfficialMaterialElement } from './base-material.js';

export const BASE_SCREEN_IMAGE_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.image',
  tagName: 'base-screen-image',
  name: '图片',
  category: '基础',
  keywords: ['图片', '图像'],
  defaultSize: { width: 240, height: 160 },
  defaultProps: {},
  defaultData: '',
  staticData: { kind: 'scalar', valueType: 'string' },
  defaultStyle: { objectFit: 'contain', opacity: 1 },
  styleSchema: {
    kind: 'object',
    properties: {
      objectFit: { kind: 'enum', values: ['contain', 'cover', 'fill'] },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
    },
    required: ['objectFit', 'opacity'],
  },
  stylePanel: [
    { style: 'objectFit', label: '适应方式', control: 'select' },
    { style: 'opacity', label: '不透明度', control: 'number' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: ['static', 'host-resource'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

export class BaseScreenImageMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_IMAGE_MATERIAL_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.opacity = typeof model.style.opacity === 'number' ? String(model.style.opacity) : '';
    if (model.dataState.status === 'loading') {
      this.textContent = '图片加载中';
      return;
    }
    if (model.dataState.status === 'error') {
      this.textContent = '图片不可用';
      return;
    }
    const source =
      model.dataState.status === 'ready' && typeof model.dataState.value === 'string'
        ? model.dataState.value
        : '';
    if (source.length === 0) {
      this.textContent = '未设置图片';
      return;
    }
    // 有界 URL 校验（ADR-0056 R1，与画布背景/封面同规则）：非法 URL fail-closed，
    // 不设置 img.src（杜绝 data:/javascript: 等注入面）。
    if (!isBoundedScreenImageUrl(source)) {
      this.textContent = '图片地址无效';
      return;
    }
    const image = this.ownerDocument.createElement('img');
    image.src = source;
    image.alt = '';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit =
      typeof model.style.objectFit === 'string' ? model.style.objectFit : 'contain';
    // 加载失败回退（ADR-0056 R2）：移除失效图片并显示占位，重建不残留旧图片。
    image.addEventListener('error', () => {
      if (image.isConnected) {
        image.remove();
        this.textContent = '图片加载失败';
      }
    });
    this.appendChild(image);
  }
}

export function defineBaseScreenImageMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
    element: BaseScreenImageMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
