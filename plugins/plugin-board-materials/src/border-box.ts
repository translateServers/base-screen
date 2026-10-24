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
import { BoardMaterialElement } from './board-element.js';
import {
  BOARD_BORDER_STYLES,
  BOARD_DEFAULT_SURFACE,
  isBoardBorderStyle,
  PLUGIN_BOARD_BORDER_BOX_TAG_NAME,
  PLUGIN_BOARD_BORDER_BOX_TYPE,
  PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
} from './identity.js';
import { readNumber, styleColor } from './json-values.js';

/**
 * 装饰边框：指挥中心大屏最具辨识度的一类组件——本身不承载数据，只为容器提供"指挥中心"观感。
 *
 * 它同时是本插件的检查器控件宿主：`borderStyle` 字段用 `control: 'custom'` 指向
 * 插件自己贡献的 `base-screen-board-border-picker`，用来验证"插件既能贡献物料、
 * 也能为物料贡献已授权的属性面板控件"这条组合路径。
 */
const BORDER_BOX_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    borderStyle: { kind: 'enum', values: [...BOARD_BORDER_STYLES] },
    bracketSize: { kind: 'number', minimum: 4, maximum: 72 },
    lineWidth: { kind: 'number', minimum: 1, maximum: 8 },
  },
  required: ['borderStyle', 'bracketSize', 'lineWidth'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_BOARD_BORDER_BOX_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_BORDER_BOX_TYPE,
  tagName: PLUGIN_BOARD_BORDER_BOX_TAG_NAME,
  name: '装饰边框',
  category: '装饰',
  keywords: ['边框', '装饰', '容器', '大屏'],
  defaultSize: { width: 480, height: 300 },
  // 原子化：只画边框与角标，没有标题栏。它原本最像"容器"（要容纳标题），但
  // 大屏的标题应由文档层的 `base.text` 组合；边框自己带标题栏会锁死内边距，
  // 也让它无法当作纯装饰复用。
  defaultProps: {
    borderStyle: 'corner-brackets',
    bracketSize: 22,
    lineWidth: 2,
  },
  defaultStyle: {
    backgroundColor: 'rgba(11,26,43,.55)',
    color: BOARD_DEFAULT_SURFACE.color,
    borderColor: BOARD_DEFAULT_SURFACE.accentColor,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      borderColor: { kind: 'string' },
    },
    required: ['backgroundColor', 'borderColor'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'borderColor', label: '边框色', control: 'color' },
    { style: 'color', label: '文字色', control: 'color' },
  ],
  propsSchema: BORDER_BOX_PROPS_SCHEMA,
  propertyPanel: [
    { prop: 'bracketSize', label: '角标大小', control: 'number' },
    { prop: 'lineWidth', label: '线宽', control: 'number' },
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
              tagName: PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
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
      ],
    },
    BORDER_BOX_PROPS_SCHEMA,
    undefined,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-board-materials border box editor descriptor is invalid.');
  }
  return parsed.value;
}

export class PluginBoardBorderBoxElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_BORDER_BOX_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    // 边框不接数据，但仍可能是 dataset 之类的旧文档：一律按"无数据"渲染外观，
    // 不显示数据态占位，否则一个装饰元素会因为宿主给了数据集而变成错误提示。
    this.style.display = 'block';
    this.style.boxSizing = 'border-box';
    this.style.overflow = 'hidden';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, BOARD_DEFAULT_SURFACE.color);
    this.setAttribute('role', 'group');
    // a11y 名称取物料清单名，不来自文档：物料不再有标题字段。
    this.setAttribute('aria-label', PluginBoardBorderBoxElement.manifest.name);

    const style = isBoardBorderStyle(model.props.borderStyle) ? model.props.borderStyle : 'plain';
    this.dataset.boardBorderStyle = style;
    const borderColor = styleColor(model.style.borderColor, BOARD_DEFAULT_SURFACE.accentColor);
    const lineWidth = Math.max(1, Math.round(readNumber(model.props.lineWidth, 2)));
    const bracketSize = Math.max(4, Math.round(readNumber(model.props.bracketSize, 22)));

    const doc = this.ownerDocument;
    const frame = doc.createElement('div');
    frame.dataset.boardBorderFrame = style;
    frame.style.cssText = `position:relative;width:100%;height:100%;box-sizing:border-box;${borderCss(style, borderColor, lineWidth)}`;

    for (const corner of cornerGeometry(doc, style, bracketSize, lineWidth, borderColor)) {
      frame.appendChild(corner);
    }
    this.replaceChildren(frame);
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
    element.dataset.boardBorderCorner = `${corner.top ? 'top' : 'bottom'}-${corner.left ? 'left' : 'right'}`;
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

export function definePluginBoardBorderBoxMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_BORDER_BOX_MANIFEST,
    element: PluginBoardBorderBoxElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
