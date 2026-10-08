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
  defaultStyle: { objectFit: 'contain', opacity: 1, flipX: false, flipY: false },
  styleSchema: {
    kind: 'object',
    properties: {
      objectFit: { kind: 'enum', values: ['contain', 'cover', 'fill'] },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
      flipX: { kind: 'boolean' },
      flipY: { kind: 'boolean' },
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
  dataCapabilities: ['static', 'host-resource', 'variable'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

export class BaseScreenImageMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_IMAGE_MATERIAL_MANIFEST;

  #renderGeneration = 0;

  protected renderMaterial(): void {
    const renderGeneration = ++this.#renderGeneration;
    this.#clearNaturalSize();
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.opacity = typeof model.style.opacity === 'number' ? String(model.style.opacity) : '';
    if (model.dataState.status !== 'ready') {
      this.renderDataState(model.dataState, { label: '图片加载中' });
      return;
    }
    const source = typeof model.dataState.value === 'string' ? model.dataState.value : '';
    // 未设置与非法 URL 走同一套错误 chrome，并携带 canonical code。
    if (source.length === 0) {
      this.renderInvalidData('HOST_RESOURCE_INVALID', '未设置图片');
      return;
    }
    // 有界 URL 校验（ADR-0056 R1，与画布背景/封面同规则）：非法 URL fail-closed，
    // 不设置 img.src（杜绝 data:/javascript: 等注入面）。
    if (!isBoundedScreenImageUrl(source)) {
      this.renderInvalidData('HOST_RESOURCE_INVALID', '图片地址无效');
      return;
    }
    const image = this.ownerDocument.createElement('img');
    image.alt = '';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit =
      typeof model.style.objectFit === 'string' ? model.style.objectFit : 'contain';
    // 自然尺寸仅投影到当前物料宿主，供 Designer 的一次性倍图操作读取；不进入
    // Material Model 或公共 ABI。generation guard 防止换源后的过期事件恢复旧尺寸。
    image.addEventListener('load', () => {
      if (renderGeneration !== this.#renderGeneration || !image.isConnected) return;
      if (
        !Number.isFinite(image.naturalWidth) ||
        !Number.isFinite(image.naturalHeight) ||
        image.naturalWidth <= 0 ||
        image.naturalHeight <= 0
      ) {
        this.#clearNaturalSize();
        return;
      }
      this.dataset.baseScreenImageNaturalWidth = String(image.naturalWidth);
      this.dataset.baseScreenImageNaturalHeight = String(image.naturalHeight);
    });
    // 加载失败回退（ADR-0056 R2）：移除失效图片并显示占位，重建不残留旧图片。
    image.addEventListener('error', () => {
      if (renderGeneration !== this.#renderGeneration || !image.isConnected) return;
      this.#clearNaturalSize();
      image.remove();
      this.renderInvalidData('HOST_RESOURCE_FAILED', '图片加载失败');
    });
    image.src = source;
    this.appendChild(image);
  }

  #clearNaturalSize(): void {
    delete this.dataset.baseScreenImageNaturalWidth;
    delete this.dataset.baseScreenImageNaturalHeight;
  }
}

export function defineBaseScreenImageMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
    element: BaseScreenImageMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
