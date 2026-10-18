import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import { PLUGIN_DATAV_MARQUEE_TAG_NAME, PLUGIN_DATAV_MARQUEE_TYPE } from './identity.js';
import { readNumber, readString, styleColor } from './json-values.js';
import { DATAV_TEXT_VALUE_ADAPTER } from './scalar-adapter.js';

/**
 * 滚动字幕：单行文本从右向左匀速滚动，用于大屏底部的实时播报。
 *
 * 无缝循环靠「同一段文本复制两份 + 轨道位移 -50%」实现，因此轨道宽度必须恰好是
 * 一份文本宽度的两倍：两份 copy 的 padding-right 必须一致。设计态不播放动画，
 * 只显示第一份文本，避免画布上出现半截字。
 */
const MARQUEE_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    speedSeconds: { kind: 'number', minimum: 3, maximum: 120 },
    gap: { kind: 'number', minimum: 0, maximum: 240 },
  },
  required: ['speedSeconds', 'gap'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_DATAV_MARQUEE_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_MARQUEE_TYPE,
  tagName: PLUGIN_DATAV_MARQUEE_TAG_NAME,
  name: '滚动字幕',
  category: '文本',
  keywords: ['字幕', '跑马灯', '播报', '大屏'],
  defaultSize: { width: 900, height: 40 },
  defaultProps: {
    speedSeconds: 20,
    gap: 64,
  },
  defaultData: '华东区域领跑 · 今日销售额突破 386.4 万元 · 订单量同比增长 12.4%',
  staticData: { kind: 'scalar', valueType: 'string' },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: '#8fd6ff',
    fontSize: 14,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 10, maximum: 48 },
    },
    required: ['backgroundColor', 'color', 'fontSize'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
  ],
  propsSchema: MARQUEE_PROPS_SCHEMA,
  propertyPanel: [
    { prop: 'speedSeconds', label: '滚动周期(秒)', control: 'number' },
    { prop: 'gap', label: '接缝间距(px)', control: 'number' },
  ],
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

export class PluginDatavMarqueeElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_MARQUEE_MANIFEST;

  #animation: Animation | undefined;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.#stopAnimation();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.whiteSpace = 'nowrap';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, '#8fd6ff');
    this.style.fontSize = `${readNumber(model.style.fontSize, 14)}px`;
    this.setAttribute('role', 'marquee');
    this.setAttribute('aria-label', PluginDatavMarqueeElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.removeAttribute('aria-label');
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }

    const text = readString(model.dataState.value);
    this.setAttribute('aria-label', text === '' ? PluginDatavMarqueeElement.manifest.name : text);
    this.#paint(text, model);
  }

  #paint(text: string, model: DatavMaterialModel): void {
    const doc = this.ownerDocument;
    const gap = Math.max(0, Math.round(readNumber(model.props.gap, 64)));
    const duration = Math.max(3, readNumber(model.props.speedSeconds, 20)) * 1000;
    const reduceMotion =
      doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;

    const track = doc.createElement('div');
    track.dataset.datavMarquee = '';
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

    this.replaceChildren(track);
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

Object.defineProperty(PluginDatavMarqueeElement, 'tabularDataAdapter', {
  value: DATAV_TEXT_VALUE_ADAPTER,
});

export function definePluginDatavMarqueeMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_MARQUEE_MANIFEST,
    element: PluginDatavMarqueeElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
