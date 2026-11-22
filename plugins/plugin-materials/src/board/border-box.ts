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
 *
 * props / style 分界（ADR-0099 §2.2）：边框形态与角标尺寸是结构（props）；线宽、颜色是纯视觉量，
 * 应能被告警条件样式改写（style）。线宽因此是 style 的 `strokeWidth`。
 *
 * 没有文字色：本物料不渲染文字，边框与角标都用 `borderColor` 显式着色
 * （ADR-0099 第六批移除了无效的 `color`）。
 *
 * 2026-11-22（ADR-0101）：
 * - **可以当卡片外壳**（`children: true`）：标题、读数作为子组件放进来，整张卡一起拖动；
 *   组合分片也能用它做外壳。它不是组壳（`groupMaterialType`），几何不随子项派生。
 * - **双色**：`accentColor` 给角标与发光，`borderColor` 给边线——大屏边框「四角亮、边线暗」的
 *   常见做法。`accentColor` 不进 required：存量文档没有这个键，角标仍用 `borderColor`，
 *   「四角括号」也仍然只画四角，渲染与改动前一致。
 * - 新插入时角标色跟随文档主题的主体色（`themeStyle`）。
 */
const BORDER_BOX_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    borderStyle: { kind: 'enum', values: [...BOARD_BORDER_STYLES] },
    bracketSize: { kind: 'number', minimum: 4, maximum: 72 },
  },
  required: ['borderStyle', 'bracketSize'],
} satisfies BaseScreenMaterialObjectSchema;

const BORDER_BOX_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    borderColor: { kind: 'string' },
    accentColor: { kind: 'string' },
    // 不进 required：缺省按 2px 绘制，未写线宽的文档无需改写。
    strokeWidth: { kind: 'number', minimum: 1, maximum: 8 },
  },
  required: ['backgroundColor', 'borderColor'],
} satisfies BaseScreenMaterialObjectSchema;

const DEFAULT_STROKE_WIDTH = 2;

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
  },
  defaultStyle: {
    backgroundColor: 'rgba(11,26,43,.55)',
    borderColor: BOARD_DEFAULT_SURFACE.borderColor,
    accentColor: BOARD_DEFAULT_SURFACE.accentColor,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  },
  themeStyle: { accentColor: 'primary' },
  styleSchema: BORDER_BOX_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: BORDER_BOX_PROPS_SCHEMA,
  propertyPanel: [],
  events: [],
  // 装饰边框只是容器外观，不接数据：声明 static 会诱导用户在边框上挂数据集。
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: true },
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
              unit: 'px',
            },
            {
              id: 'strokeWidth',
              target: 'style',
              path: ['strokeWidth'],
              label: '线宽',
              unit: 'px',
              min: 1,
              max: 8,
            },
            {
              id: 'borderColor',
              target: 'style',
              path: ['borderColor'],
              label: '边框色',
              control: 'color',
            },
            {
              id: 'accentColor',
              target: 'style',
              path: ['accentColor'],
              label: '角标色',
              control: 'color',
            },
          ],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            {
              id: 'backgroundColor',
              target: 'style',
              path: ['backgroundColor'],
              label: '背景色',
              control: 'color',
              allowGradient: true,
            },
          ],
        },
      ],
    },
    BORDER_BOX_PROPS_SCHEMA,
    BORDER_BOX_STYLE_SCHEMA,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials border box editor descriptor is invalid.');
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
    this.setAttribute('role', 'group');
    // a11y 名称取物料清单名，不来自文档：物料不再有标题字段。
    this.setAttribute('aria-label', PluginBoardBorderBoxElement.manifest.name);

    const style = isBoardBorderStyle(model.props.borderStyle) ? model.props.borderStyle : 'plain';
    this.dataset.boardBorderStyle = style;
    const borderColor = styleColor(model.style.borderColor, BOARD_DEFAULT_SURFACE.accentColor);
    // 存量文档没有 accentColor：角标与边线同色，与改动前一致。
    const accent =
      typeof model.style.accentColor === 'string' ? model.style.accentColor : undefined;
    const accentColor = styleColor(accent, borderColor);
    const strokeWidth = readNumber(model.style.strokeWidth, DEFAULT_STROKE_WIDTH);
    const lineWidth = Math.max(1, Math.round(strokeWidth));
    const bracketSize = Math.max(4, Math.round(readNumber(model.props.bracketSize, 22)));

    const doc = this.ownerDocument;
    const frame = doc.createElement('div');
    frame.dataset.boardBorderFrame = style;
    frame.style.cssText = `position:relative;width:100%;height:100%;box-sizing:border-box;${borderCss(style, borderColor, lineWidth, accent === undefined ? undefined : accentColor)}`;

    for (const corner of cornerGeometry(doc, style, bracketSize, lineWidth, accentColor)) {
      frame.appendChild(corner);
    }
    this.replaceChildren(frame);
  }
}

/**
 * 六种边框形态各自的内联 CSS。样式与几何一一对应，不做"凑数"的近似变体。
 *
 * `accent` 只在文档写了 `accentColor` 时传入：发光用强调色；「四角括号」在边线色之外补一圈
 * 1 px 暗边线（双色），没有强调色时仍只画四角。
 */
function borderCss(style: string, color: string, width: number, accent?: string): string {
  switch (style) {
    case 'double-line':
      return `border:${width}px double ${color};`;
    case 'dashed':
      return `border:${width}px dashed ${color};`;
    case 'notch':
      return `border:${width}px solid ${color};clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px);`;
    case 'glow-corner': {
      const glow = accent ?? color;
      return `border:${width}px solid ${color};box-shadow:0 0 14px ${hexAlpha(glow, 0.45)},inset 0 0 22px ${hexAlpha(glow, 0.18)};`;
    }
    // plain 与 corner-brackets 的可见边框由角标承担：corner-brackets 刻意不画整圈，
    // 否则四角括号会与整圈边框叠在一起，看起来像两条线。
    case 'corner-brackets':
      return accent === undefined ? '' : `border:1px solid ${color};`;
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
