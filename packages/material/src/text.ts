import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenOfficialMaterialElement } from './base-material.js';

export const BASE_SCREEN_TEXT_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.text',
  tagName: 'base-screen-text',
  name: '文本',
  category: '基础',
  keywords: ['文本', '标签'],
  defaultSize: { width: 320, height: 72 },
  defaultProps: {},
  defaultData: '文本',
  defaultStyle: { color: '#ffffff', fontSize: 32, fontWeight: '400', textAlign: 'left' },
  styleSchema: {
    kind: 'object',
    properties: {
      color: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 1, maximum: 512 },
      fontWeight: { kind: 'enum', values: ['400', '700'] },
      textAlign: { kind: 'enum', values: ['left', 'center', 'right'] },
    },
    required: ['color', 'fontSize', 'fontWeight', 'textAlign'],
  },
  stylePanel: [
    { style: 'color', label: '颜色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
    { style: 'fontWeight', label: '字重', control: 'select' },
    { style: 'textAlign', label: '对齐', control: 'select' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: ['valueClick'],
  dataCapabilities: ['static', 'host-resource'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

export class BaseScreenTextMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_TEXT_MATERIAL_MANIFEST;

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('click', this.handleClick);
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
  }

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    const { style } = model;
    this.textContent =
      model.dataState.status === 'loading'
        ? '加载中'
        : model.dataState.status === 'error'
          ? '数据不可用'
          : model.dataState.status === 'ready' && typeof model.dataState.value === 'string'
            ? model.dataState.value
            : '';
    this.style.color = typeof style.color === 'string' ? style.color : '';
    this.style.fontSize = typeof style.fontSize === 'number' ? `${style.fontSize}px` : '';
    this.style.fontWeight = typeof style.fontWeight === 'string' ? style.fontWeight : '';
    this.style.textAlign = typeof style.textAlign === 'string' ? style.textAlign : '';
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.whiteSpace = 'pre-wrap';
  }

  private readonly handleClick = (): void => {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: { name: 'valueClick', payload: model.props },
      }),
    );
  };
}

export function defineBaseScreenTextMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
    element: BaseScreenTextMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
