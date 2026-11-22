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
  BOARD_DEFAULT_SURFACE,
  BOARD_TITLE_DECOR_STYLES,
  type BoardTitleDecorStyle,
  isBoardTitleDecorStyle,
  PLUGIN_BOARD_TITLE_DECOR_PICKER_TAG_NAME,
  PLUGIN_BOARD_TITLE_DECOR_TAG_NAME,
  PLUGIN_BOARD_TITLE_DECOR_TYPE,
} from './identity.js';
import { readNumber, styleColor } from './json-values.js';

/**
 * 标题装饰：卡片标题栏的图元部分——竖条、渐隐下划线、两端括号、双箭头（ADR-0101）。
 *
 * 为什么不是「带标题文字的标题栏」：物料不内建标题文案（AGENTS.md「物料原子化」、
 * ADR-0099、门禁 R2）。装饰边框当初正是按这条删掉了标题栏——自带文字会锁死内边距，也让它
 * 不能当纯装饰复用。所以这里只画图元，文字由放在它里面的 `base.text` 承担；成套的
 * 「标题栏」由组合分片提供（`fragments.ts`）。
 *
 * 它可以容纳子组件（`children: true`）：标题文本放进来后随它一起拖动、对齐。
 *
 * props / style 分界（ADR-0099 §2.2）：形态是结构（props）；强调色、辅线色、线宽、背景是
 * 纯视觉量（style），可被条件样式改写。强调色新插入时跟随文档主题的主体色（`themeStyle`）。
 */
const TITLE_DECOR_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    decorStyle: { kind: 'enum', values: [...BOARD_TITLE_DECOR_STYLES] },
  },
  required: ['decorStyle'],
} satisfies BaseScreenMaterialObjectSchema;

const TITLE_DECOR_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    accentColor: { kind: 'string' },
    borderColor: { kind: 'string' },
    strokeWidth: { kind: 'number', minimum: 1, maximum: 8 },
  },
  required: ['backgroundColor', 'accentColor', 'borderColor'],
} satisfies BaseScreenMaterialObjectSchema;

const DEFAULT_STROKE_WIDTH = 2;

export const PLUGIN_BOARD_TITLE_DECOR_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_TITLE_DECOR_TYPE,
  tagName: PLUGIN_BOARD_TITLE_DECOR_TAG_NAME,
  name: '标题装饰',
  category: '装饰',
  keywords: ['标题', '标题栏', '装饰', '竖条', '下划线', '大屏'],
  defaultSize: { width: 288, height: 32 },
  defaultProps: { decorStyle: 'bar' },
  defaultStyle: {
    backgroundColor: 'transparent',
    accentColor: BOARD_DEFAULT_SURFACE.accentColor,
    borderColor: BOARD_DEFAULT_SURFACE.borderColor,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  },
  themeStyle: { accentColor: 'primary' },
  styleSchema: TITLE_DECOR_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: TITLE_DECOR_PROPS_SCHEMA,
  propertyPanel: [],
  events: [],
  // 纯装饰：不接数据，声明 static 会诱导作者在装饰上挂数据集。
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: true },
  editorDescriptor: parseTitleDecorEditorDescriptor(),
};

function parseTitleDecorEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        {
          id: 'structure',
          label: '结构',
          fields: [
            {
              id: 'decorStyle',
              target: 'props',
              path: ['decorStyle'],
              label: '装饰形态',
              control: 'custom',
              tagName: PLUGIN_BOARD_TITLE_DECOR_PICKER_TAG_NAME,
            },
          ],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            {
              id: 'accentColor',
              target: 'style',
              path: ['accentColor'],
              label: '强调色',
              control: 'color',
            },
            {
              id: 'borderColor',
              target: 'style',
              path: ['borderColor'],
              label: '辅线色',
              control: 'color',
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
    TITLE_DECOR_PROPS_SCHEMA,
    TITLE_DECOR_STYLE_SCHEMA,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials title decor editor descriptor is invalid.');
  }
  return parsed.value;
}

export class PluginBoardTitleDecorElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_TITLE_DECOR_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.boxSizing = 'border-box';
    this.style.overflow = 'hidden';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    // 纯装饰：对辅助技术隐藏，标题语义由里面的文本承担。
    this.setAttribute('aria-hidden', 'true');

    const style = isBoardTitleDecorStyle(model.props.decorStyle) ? model.props.decorStyle : 'bar';
    this.dataset.boardTitleDecor = style;
    const accent = styleColor(model.style.accentColor, BOARD_DEFAULT_SURFACE.accentColor);
    const line = styleColor(model.style.borderColor, BOARD_DEFAULT_SURFACE.borderColor);
    const stroke = readNumber(model.style.strokeWidth, DEFAULT_STROKE_WIDTH);
    const width = Math.max(1, Math.round(stroke));

    const doc = this.ownerDocument;
    const frame = doc.createElement('div');
    frame.dataset.boardTitleDecorFrame = style;
    frame.style.cssText = 'position:relative;width:100%;height:100%;';
    for (const part of decorParts(doc, style, { accent, line, width })) frame.appendChild(part);
    this.replaceChildren(frame);
  }
}

/** 每种形态的图元：都是绝对定位的块，按盒子尺寸用百分比与固定像素自适应，不测 DOM。 */
function decorParts(
  doc: Document,
  style: BoardTitleDecorStyle,
  colors: { readonly accent: string; readonly line: string; readonly width: number },
): readonly HTMLElement[] {
  const { accent, line, width } = colors;
  const part = (name: string, css: string): HTMLElement => {
    const element = doc.createElement('span');
    element.dataset.boardTitleDecorPart = name;
    element.style.cssText = `position:absolute;box-sizing:border-box;${css}`;
    return element;
  };
  const baseline = part('baseline', `left:0;right:0;bottom:0;height:1px;background:${line};`);
  switch (style) {
    case 'underline': {
      const gradient = `linear-gradient(90deg,${accent},transparent)`;
      const underline = `left:0;bottom:0;width:100%;height:${width}px;background:${gradient};`;
      return [part('underline', underline)];
    }
    case 'brackets': {
      const edge = `${width}px solid ${accent}`;
      const arm = `top:0;bottom:0;width:8px;border-top:${edge};border-bottom:${edge};`;
      return [
        part('bracket-left', `left:0;${arm}border-left:${edge};`),
        part('bracket-right', `right:0;${arm}border-right:${edge};`),
      ];
    }
    case 'chevron': {
      const edge = `${width}px solid ${accent}`;
      const chevron = (index: number) => {
        const box = `left:${2 + index * 7}px;top:50%;width:8px;height:8px;margin-top:-4px;`;
        const stroke = `border-top:${edge};border-right:${edge};transform:rotate(45deg);`;
        return part(`chevron-${index}`, `${box}${stroke}opacity:${index === 0 ? 1 : 0.55};`);
      };
      return [chevron(0), chevron(1), baseline];
    }
    default: {
      const barWidth = Math.max(3, width * 2);
      const bar = `left:0;top:20%;bottom:20%;width:${barWidth}px;background:${accent};`;
      return [part('bar', bar), baseline];
    }
  }
}

export function definePluginBoardTitleDecorMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_TITLE_DECOR_MANIFEST,
    element: PluginBoardTitleDecorElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
