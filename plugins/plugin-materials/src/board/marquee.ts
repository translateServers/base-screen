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
import { BoardMaterialElement, type BoardMaterialModel } from './board-element.js';
import { PLUGIN_BOARD_MARQUEE_TAG_NAME, PLUGIN_BOARD_MARQUEE_TYPE } from './identity.js';
import { readNumber, readString, styleColor } from './json-values.js';
import { BOARD_TEXT_VALUE_ADAPTER } from './scalar-adapter.js';

/**
 * 滚动字幕：单行文本从右向左匀速滚动，用于大屏底部的实时播报。
 *
 * 无缝循环靠「同一段文本复制两份 + 轨道位移 -50%」实现，因此轨道宽度必须恰好是
 * 一份文本宽度的两倍：两份 copy 的 padding-right 必须一致。设计态不播放动画，
 * 只显示第一份文本，避免画布上出现半截字。
 *
 * 时间统一用毫秒（ADR-0099 §2.5）：滚动周期是 `periodMs`，与轮播列表的 `intervalMs` 同单位。
 */
const MARQUEE_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    periodMs: { kind: 'number', minimum: 3000, maximum: 120000 },
    gap: { kind: 'number', minimum: 0, maximum: 240 },
  },
  required: ['periodMs', 'gap'],
} satisfies BaseScreenMaterialObjectSchema;

const MARQUEE_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    fontSize: { kind: 'number', minimum: 10, maximum: 48 },
  },
  required: ['backgroundColor', 'color', 'fontSize'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_BOARD_MARQUEE_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_MARQUEE_TYPE,
  tagName: PLUGIN_BOARD_MARQUEE_TAG_NAME,
  name: '滚动字幕',
  category: '文本',
  keywords: ['字幕', '跑马灯', '播报', '大屏'],
  defaultSize: { width: 900, height: 40 },
  defaultProps: {
    periodMs: 20000,
    gap: 64,
  },
  defaultData: '华东区域领跑 · 今日销售额突破 386.4 万元 · 订单量同比增长 12.4%',
  staticData: { kind: 'scalar', valueType: 'string' },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: '#8fd6ff',
    fontSize: 14,
  },
  styleSchema: MARQUEE_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: MARQUEE_PROPS_SCHEMA,
  propertyPanel: [],
  editorDescriptor: parseMarqueeEditorDescriptor(),
  events: [],
  dataCapabilities: ['static', 'dataset', 'variable', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'value',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['string', 'number', 'boolean'],
      },
    ],
  },
  designCapabilities: { resize: true, rotate: false, children: false },
};

/**
 * 检查器编排（ADR-0099 §2.4）：结构 → 文字 → 填充 → 动效。单位经 `unit` 声明，不写进 label。
 * 描述符是唯一的表单来源（ADR-0102 D1）；未写 control 的字段按语义推导。
 */
function parseMarqueeEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        {
          id: 'structure',
          label: '结构',
          fields: [
            {
              id: 'gap',
              target: 'props',
              path: ['gap'],
              label: '接缝间距',
              unit: 'px',
              min: 0,
              max: 240,
            },
          ],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
            {
              id: 'fontSize',
              target: 'style',
              path: ['fontSize'],
              label: '字号',
              control: 'number',
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
        {
          id: 'motion',
          label: '动效',
          advanced: true,
          fields: [
            {
              id: 'periodMs',
              target: 'props',
              path: ['periodMs'],
              label: '滚动周期',
              control: 'unit-number',
              unit: 'ms',
              min: 3000,
              max: 120000,
              step: 500,
            },
          ],
        },
      ],
    },
    MARQUEE_PROPS_SCHEMA,
    MARQUEE_STYLE_SCHEMA,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials marquee editor descriptor is invalid.');
  }
  return parsed.value;
}

export class PluginBoardMarqueeElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_MARQUEE_MANIFEST;

  #animation: Animation | undefined;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.#stopAnimation();
    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。
    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.whiteSpace = 'nowrap';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, '#8fd6ff');
    this.style.fontSize = `${readNumber(model.style.fontSize, 14)}px`;
    this.setAttribute('role', 'marquee');
    this.setAttribute('aria-label', PluginBoardMarqueeElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.removeAttribute('aria-label');
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }

    const text = readString(model.dataState.value);
    this.setAttribute('aria-label', text === '' ? PluginBoardMarqueeElement.manifest.name : text);
    this.#paint(text, model);
  }

  #paint(text: string, model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const gap = Math.max(0, Math.round(readNumber(model.props.gap, 64)));
    const duration = Math.max(3000, readNumber(model.props.periodMs, 20000));
    const reduceMotion =
      doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;

    const track = doc.createElement('div');
    track.dataset.boardMarquee = '';
    track.style.cssText =
      'display:flex;align-items:center;width:max-content;height:100%;will-change:transform;';
    track.append(this.#copy(text, gap));

    // 设计态与 reduced-motion 下不复制第二份：静止时多出来的副本会露出半个字。
    if (model.interactive && !reduceMotion) {
      track.append(this.#copy(text, gap));
      this.#animation = track.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
        { duration, iterations: Number.POSITIVE_INFINITY, easing: 'linear' },
      );
    }

    // 收尾统一走 `commit()`：它就位画面、标记「已成功渲染过」，并清掉降级角标。
    this.commit(track);
  }

  #copy(text: string, gap: number): HTMLElement {
    const span = this.ownerDocument.createElement('span');
    span.textContent = text;
    span.style.cssText = `display:inline-block;padding-right:${gap}px;`;
    return span;
  }

  #stopAnimation(): void {
    this.#animation?.cancel();
    this.#animation = undefined;
  }

  disconnectedCallback(): void {
    this.#stopAnimation();
  }
}

Object.defineProperty(PluginBoardMarqueeElement, 'tabularDataAdapter', {
  value: BOARD_TEXT_VALUE_ADAPTER,
});

export function definePluginBoardMarqueeMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_MARQUEE_MANIFEST,
    element: PluginBoardMarqueeElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
