import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BaseScreenOfficialMaterialElement, isGradientColorValue } from './base-material.js';

export const BASE_SCREEN_TEXT_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.text',
  tagName: 'base-screen-text',
  name: '文本',
  category: '基础',
  keywords: ['文本', '标签'],
  defaultSize: { width: 320, height: 72 },
  defaultProps: {},
  defaultData: '文本',
  defaultStyle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '400',
    textAlign: 'left',
    verticalAlign: 'top',
    letterSpacing: 0,
    lineSpacing: 0,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      color: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 1, maximum: 512 },
      fontWeight: { kind: 'enum', values: ['400', '700'] },
      textAlign: { kind: 'enum', values: ['left', 'center', 'right'] },
      verticalAlign: { kind: 'enum', values: ['top', 'middle', 'bottom'] },
      letterSpacing: { kind: 'number', minimum: 0, maximum: 100 },
      lineSpacing: { kind: 'number', minimum: 0, maximum: 512 },
    },
    required: ['color', 'fontSize', 'fontWeight', 'textAlign'],
  },
  stylePanel: [
    { style: 'color', label: '颜色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
    { style: 'fontWeight', label: '字重', control: 'select' },
    { style: 'textAlign', label: '水平对齐', control: 'select' },
    { style: 'verticalAlign', label: '垂直对齐', control: 'select' },
    { style: 'letterSpacing', label: '字间距', control: 'number' },
    { style: 'lineSpacing', label: '行间距', control: 'number' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: ['valueClick'],
  dataCapabilities: ['static', 'host-resource'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

export class BaseScreenTextMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_TEXT_MATERIAL_MANIFEST;

  #textWrapper: HTMLDivElement | undefined;

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
    const text =
      model.dataState.status === 'loading'
        ? '加载中'
        : model.dataState.status === 'error'
          ? '数据不可用'
          : model.dataState.status === 'ready' && typeof model.dataState.value === 'string'
            ? model.dataState.value
            : '';
    const color = typeof style.color === 'string' ? style.color : '';
    applyTextColorStyle(this, color);
    this.style.fontSize = typeof style.fontSize === 'number' ? `${style.fontSize}px` : '';
    this.style.fontWeight = typeof style.fontWeight === 'string' ? style.fontWeight : '';
    this.style.textAlign = typeof style.textAlign === 'string' ? style.textAlign : '';
    // 垂直对齐经内层 flex wrapper 实现：元素自身保持 display: block（renderer 可见性契约
    // 会按组件 hidden 状态强制 none/block，不能承载物料的布局 display），wrapper 不与其冲突。
    const verticalAlign = typeof style.verticalAlign === 'string' ? style.verticalAlign : 'top';
    if (verticalAlign === 'middle' || verticalAlign === 'bottom') {
      const wrapper = this.ensureTextWrapper();
      wrapper.style.alignItems = verticalAlign === 'middle' ? 'center' : 'flex-end';
      wrapper.textContent = text;
    } else {
      this.removeTextWrapper();
      this.textContent = text;
    }
    this.style.letterSpacing =
      typeof style.letterSpacing === 'number' ? `${style.letterSpacing}px` : '';
    const fontSize = typeof style.fontSize === 'number' ? style.fontSize : undefined;
    const lineSpacing = typeof style.lineSpacing === 'number' ? style.lineSpacing : undefined;
    this.style.lineHeight =
      fontSize !== undefined && lineSpacing !== undefined ? `${fontSize + lineSpacing}px` : '';
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.whiteSpace = 'pre-wrap';
  }

  private ensureTextWrapper(): HTMLDivElement {
    if (this.#textWrapper === undefined) {
      // 首次进入 wrapper 路径：清掉直接文本节点（top 路径的 textContent）与可能的
      // 残留子节点，避免文本节点把 wrapper 挤到行高之后导致垂直偏移。
      this.replaceChildren();
      const wrapper = this.ownerDocument.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      wrapper.style.display = 'flex';
      this.appendChild(wrapper);
      this.#textWrapper = wrapper;
    }
    return this.#textWrapper;
  }

  private removeTextWrapper(): void {
    if (this.#textWrapper !== undefined) {
      this.#textWrapper.remove();
      this.#textWrapper = undefined;
    }
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

/** 文本颜色：CSS `color` 不接受 `<image>`，渐变文字经 background-clip: text 实现。 */
function applyTextColorStyle(element: HTMLElement, color: string): void {
  if (isGradientColorValue(color)) {
    element.style.color = 'transparent';
    element.style.backgroundImage = color;
    element.style.backgroundClip = 'text';
    element.style.webkitBackgroundClip = 'text';
  } else {
    element.style.color = color;
    element.style.backgroundImage = '';
    element.style.backgroundClip = '';
    element.style.webkitBackgroundClip = '';
  }
}

export function defineBaseScreenTextMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
    element: BaseScreenTextMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
