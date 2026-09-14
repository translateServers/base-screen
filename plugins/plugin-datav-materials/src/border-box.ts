import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import {
  DATAV_BORDER_STYLES,
  DATAV_DEFAULT_SURFACE,
  isDatavBorderStyle,
  PLUGIN_DATAV_BORDER_BOX_TAG_NAME,
  PLUGIN_DATAV_BORDER_BOX_TYPE,
  PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
} from './identity.js';
import { readBoolean, readNumber, readString, styleColor } from './json-values.js';

/**
 * 装饰边框：DataV 最具辨识度的一类组件——本身不承载数据，只为容器提供"指挥中心"观感。
 *
 * 它同时是本插件的检查器控件宿主：`borderStyle` 字段用 `control: 'custom'` 指向
 * 插件自己贡献的 `base-screen-datav-border-picker`，用来验证"插件既能贡献物料、
 * 也能为物料贡献已授权的属性面板控件"这条组合路径。
 */
const BORDER_BOX_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    title: { kind: 'string', maxLength: 64 },
    borderStyle: { kind: 'enum', values: [...DATAV_BORDER_STYLES] },
    bracketSize: { kind: 'number', minimum: 4, maximum: 72 },
    lineWidth: { kind: 'number', minimum: 1, maximum: 8 },
    showTitleBar: { kind: 'boolean' },
  },
  required: ['borderStyle', 'bracketSize', 'lineWidth', 'showTitleBar'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_DATAV_BORDER_BOX_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_BORDER_BOX_TYPE,
  tagName: PLUGIN_DATAV_BORDER_BOX_TAG_NAME,
  name: '装饰边框',
  category: '装饰',
  keywords: ['边框', '装饰', '容器', '大屏'],
  defaultSize: { width: 480, height: 300 },
  defaultProps: {
    title: '数据总览',
    borderStyle: 'corner-brackets',
    bracketSize: 22,
    lineWidth: 2,
    showTitleBar: true,
  },
  defaultStyle: {
    backgroundColor: 'rgba(11,26,43,.55)',
    color: DATAV_DEFAULT_SURFACE.color,
    borderColor: DATAV_DEFAULT_SURFACE.accentColor,
    titleColor: DATAV_DEFAULT_SURFACE.color,
    fontSize: 15,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      borderColor: { kind: 'string' },
      titleColor: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 10, maximum: 40 },
    },
    required: ['backgroundColor', 'borderColor', 'fontSize'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'borderColor', label: '边框色', control: 'color' },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'titleColor', label: '标题色', control: 'color' },
    { style: 'fontSize', label: '标题字号', control: 'number' },
  ],
  propsSchema: BORDER_BOX_PROPS_SCHEMA,
  propertyPanel: [
    { prop: 'title', label: '标题', control: 'text' },
    { prop: 'bracketSize', label: '角标大小', control: 'number' },
    { prop: 'lineWidth', label: '线宽', control: 'number' },
    { prop: 'showTitleBar', label: '显示标题栏', control: 'boolean' },
  ],
  events: [],
  // 装饰边框只是容器外观，不接数据：声明 static 会诱导用户在边框上挂数据集。
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
  editorDescriptor: parseBorderBoxEditorDescriptor(),
};

function parseBorderBoxEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        {
          id: 'frame',
          label: '边框',
          fields: [
            {
              id: 'borderStyle',
              target: 'props',
              path: ['borderStyle'],
              label: '边框样式',
              control: 'custom',
              tagName: PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
            },
            {
              id: 'bracketSize',
              target: 'props',
              path: ['bracketSize'],
              label: '角标大小',
              control: 'unit-number',
              unit: 'px',
            },
            {
              id: 'lineWidth',
              target: 'props',
              path: ['lineWidth'],
              label: '线宽',
              control: 'unit-number',
              unit: 'px',
            },
          ],
        },
        {
          id: 'title',
          label: '标题',
          fields: [
            { id: 'title', target: 'props', path: ['title'], label: '标题', control: 'text' },
            {
              id: 'showTitleBar',
              target: 'props',
              path: ['showTitleBar'],
              label: '显示标题栏',
              control: 'boolean',
            },
          ],
        },
      ],
    },
    BORDER_BOX_PROPS_SCHEMA,
    undefined,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-datav-materials border box editor descriptor is invalid.');
  }
  return parsed.value;
}

export class PluginDatavBorderBoxElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_BORDER_BOX_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    // 边框不接数据，但仍可能是 dataset 之类的旧文档：一律按"无数据"渲染外观，
    // 不显示数据态占位，否则一个装饰元素会因为宿主给了数据集而变成错误提示。
    this.style.display = 'block';
    this.style.boxSizing = 'border-box';
    this.style.overflow = 'hidden';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, DATAV_DEFAULT_SURFACE.color);
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', readString(model.props.title, '装饰边框'));

    const style = isDatavBorderStyle(model.props.borderStyle) ? model.props.borderStyle : 'plain';
    this.dataset.datavBorderStyle = style;
    const borderColor = styleColor(model.style.borderColor, DATAV_DEFAULT_SURFACE.accentColor);
    const lineWidth = Math.max(1, Math.round(readNumber(model.props.lineWidth, 2)));
    const bracketSize = Math.max(4, Math.round(readNumber(model.props.bracketSize, 22)));

    const doc = this.ownerDocument;
    const frame = doc.createElement('div');
    frame.dataset.datavBorderFrame = style;
    frame.style.cssText = `position:relative;width:100%;height:100%;box-sizing:border-box;${borderCss(style, borderColor, lineWidth)}`;

    if (readBoolean(model.props.showTitleBar, true)) {
      frame.appendChild(this.#titleBar(model, borderColor));
    }
    for (const corner of cornerGeometry(doc, style, bracketSize, lineWidth, borderColor)) {
      frame.appendChild(corner);
    }
    this.replaceChildren(frame);
  }

  #titleBar(model: DatavMaterialModel, borderColor: string): HTMLElement {
    const doc = this.ownerDocument;
    const bar = doc.createElement('div');
    bar.dataset.datavBorderTitleBar = '';
    const fontSize = readNumber(model.style.fontSize, 15);
    bar.style.cssText = `position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:8px;height:${fontSize + 18}px;padding:0 12px;box-sizing:border-box;font:600 ${fontSize}px/1 sans-serif;color:${styleColor(model.style.titleColor, styleColor(model.style.color, DATAV_DEFAULT_SURFACE.color))};background:linear-gradient(90deg,${hexAlpha(borderColor, 0.22)},transparent);`;
    const marker = doc.createElement('span');
    marker.dataset.datavBorderTitleMarker = '';
    // 标题前的强调块不参与文字排版：绝对尺寸，字号变化不会带着它重排。
    marker.style.cssText = `flex:0 0 auto;width:3px;height:1em;background:${borderColor};border-radius:2px;`;
    const text = doc.createElement('span');
    text.textContent = readString(model.props.title);
    bar.appendChild(marker);
    bar.appendChild(text);
    return bar;
  }
}

/** 六种边框形态各自的内联 CSS。样式与几何一一对应，不做"凑数"的近似变体。 */
function borderCss(style: string, color: string, width: number): string {
  switch (style) {
    case 'double-line':
      return `border:${width}px double ${color};`;
    case 'dashed':
      return `border:${width}px dashed ${color};`;
    case 'notch':
      return `border:${width}px solid ${color};clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px);`;
    case 'glow-corner':
      return `border:${width}px solid ${color};box-shadow:0 0 14px ${hexAlpha(color, 0.45)},inset 0 0 22px ${hexAlpha(color, 0.18)};`;
    // plain 与 corner-brackets 的可见边框由角标承担：corner-brackets 刻意不画整圈，
    // 否则四角括号会与整圈边框叠在一起，看起来像两条线。
    case 'corner-brackets':
      return '';
    default:
      return `border:${width}px solid ${color};`;
  }
}

/** 角标几何：只有 corner-brackets 与 glow-corner 需要四角图元，其余返回空集。 */
function cornerGeometry(
  ownerDocument: Document,
  style: string,
  size: number,
  width: number,
  color: string,
): readonly HTMLElement[] {
  if (style !== 'corner-brackets' && style !== 'glow-corner') return [];
  const corners = [
    { top: true, left: true },
    { top: true, left: false },
    { top: false, left: true },
    { top: false, left: false },
  ];
  return corners.map((corner) => {
    const element = ownerDocument.createElement('span');
    element.dataset.datavBorderCorner = `${corner.top ? 'top' : 'bottom'}-${corner.left ? 'left' : 'right'}`;
    const glow = style === 'glow-corner' ? `box-shadow:0 0 10px ${color};` : '';
    // 两个方向各一条边，用 border 侧边着色，尺寸由 bracketSize 决定。
    element.style.cssText = `position:absolute;width:${size}px;height:${size}px;box-sizing:border-box;${
      corner.top ? 'top:0;' : 'bottom:0;'
    }${corner.left ? 'left:0;' : 'right:0;'}border-top:${corner.top ? `${width}px solid ${color};` : 'none;'}border-bottom:${
      corner.top ? 'none;' : `${width}px solid ${color};`
    }border-left:${corner.left ? `${width}px solid ${color};` : 'none;'}border-right:${
      corner.left ? 'none;' : `${width}px solid ${color};`
    }${glow}`;
    return element;
  });
}

/** 把 #rrggbb / #rgb 转成带 alpha 的 rgba；非十六进制色值（如渐变、rgb()）原样返回。 */
function hexAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (match === null) return color;
  const hex = match[1]!;
  const full = hex.length === 3 ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : hex;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function definePluginDatavBorderBoxMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_BORDER_BOX_MANIFEST,
    element: PluginDatavBorderBoxElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
