import type { ScreenParseResult } from '@base-screen/contracts';
import {
  BASE_SCREEN_MATERIAL_EVENT,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import { PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME, PLUGIN_DATAV_DIGITAL_FLOP_TYPE } from './identity.js';
import { readBoolean, readNumber, readString, styleColor } from './json-values.js';

/**
 * 数字翻牌器：大屏上最典型的"指标读数"组件。
 *
 * 形态对标 DataV 的数字翻牌器——按位拆成独立数字格、支持千分位与小数、数值变化时
 * 翻动。这里刻意只依赖原生 DOM 与 Web Animations，不打包任何动画库：这类组件的
 * 视觉差异来自排版与动效细节，不需要第三方运行时。
 */
export const PLUGIN_DATAV_DIGITAL_FLOP_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_DIGITAL_FLOP_TYPE,
  tagName: PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME,
  name: '数字翻牌器',
  category: '指标',
  keywords: ['数字', '指标', '翻牌', '大屏'],
  defaultSize: { width: 320, height: 120 },
  // 原子化：这个物料只负责「把一个数按位翻牌显示」。标题属于说明文字，应由文档层
  // 另放 `base.text` 组合，组件内建会让它无法独立排版、也无法在无标题场景复用。
  // `prefix`/`suffix` 不是说明文字而是读数本身的构成（货币符号、单位），故保留。
  defaultProps: {
    prefix: '',
    suffix: '',
    decimals: 0,
    thousandsSeparator: true,
    flipAnimation: true,
  },
  defaultData: 128_430,
  staticData: { kind: 'scalar', valueType: 'number' },
  defaultStyle: {
    backgroundColor: '#0b1a2b',
    color: '#e6f1ff',
    accentColor: '#38bdf8',
    fontSize: 48,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      accentColor: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 12, maximum: 200 },
    },
    required: ['backgroundColor', 'color', 'accentColor', 'fontSize'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'color', label: '数字色', control: 'color' },
    { style: 'accentColor', label: '格底色', control: 'color' },
    { style: 'fontSize', label: '数字字号', control: 'number' },
  ],
  propsSchema: {
    kind: 'object',
    properties: {
      prefix: { kind: 'string', maxLength: 16 },
      suffix: { kind: 'string', maxLength: 16 },
      decimals: { kind: 'number', minimum: 0, maximum: 6 },
      thousandsSeparator: { kind: 'boolean' },
      flipAnimation: { kind: 'boolean' },
    },
    required: ['decimals', 'thousandsSeparator'],
  },
  propertyPanel: [
    { prop: 'prefix', label: '前缀', control: 'text' },
    { prop: 'suffix', label: '后缀', control: 'text' },
    { prop: 'decimals', label: '小数位', control: 'number' },
    { prop: 'thousandsSeparator', label: '千分位', control: 'boolean' },
    { prop: 'flipAnimation', label: '翻牌动画', control: 'boolean' },
  ],
  events: ['valueClick'],
  dataCapabilities: ['static', 'dataset', 'variable'],
  dataBinding: {
    roles: [
      {
        id: 'value',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['number', 'string'],
      },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

export class PluginDatavDigitalFlopElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_DIGITAL_FLOP_MANIFEST;

  #lastText: string | undefined;

  constructor() {
    super();
    this.addEventListener('click', this.#handleClick);
  }

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, '#0b1a2b');
    this.style.color = styleColor(model.style.color, '#e6f1ff');
    this.setAttribute('role', 'group');
    // a11y 名称取物料清单名，不来自文档：物料不再有标题字段。
    this.setAttribute('aria-label', PluginDatavDigitalFlopElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.#lastText = undefined;
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }

    const text = formatNumericText(model);
    const animated = this.#lastText !== undefined && this.#lastText !== text;
    this.#lastText = text;
    this.#paint(text, model, animated);
  }

  #paint(text: string, model: DatavMaterialModel, animated: boolean): void {
    const doc = this.ownerDocument;
    const container = doc.createElement('div');
    container.dataset.datavDigitalFlop = '';
    // 只有一排数字格：没有标题行，读数占满整个组件盒。
    container.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;padding:8px;';

    const row = doc.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;justify-content:center;gap:.06em;font-variant-numeric:tabular-nums;';

    const prefix = readString(model.props.prefix);
    if (prefix !== '') row.appendChild(this.#affix(prefix, model));
    for (const [index, character] of [...text].entries()) {
      row.appendChild(this.#cell(character, index, model, animated));
    }
    const suffix = readString(model.props.suffix);
    if (suffix !== '') row.appendChild(this.#affix(suffix, model));

    container.appendChild(row);
    this.replaceChildren(container);
  }

  /** 非数字字符（千分位、小数点、负号）不入格：它们不需要翻牌，也不该占格底。 */
  #cell(
    character: string,
    index: number,
    model: DatavMaterialModel,
    animated: boolean,
  ): HTMLElement {
    const doc = this.ownerDocument;
    const fontSize = readNumber(model.style.fontSize, 48);
    if (!/\d/.test(character)) {
      const separator = doc.createElement('span');
      separator.dataset.datavFlopSeparator = '';
      separator.textContent = character;
      separator.style.cssText = `font-size:${fontSize}px;line-height:1.1;opacity:.78;`;
      return separator;
    }
    const cell = doc.createElement('span');
    cell.dataset.datavFlopDigit = character;
    cell.dataset.datavFlopIndex = String(index);
    cell.textContent = character;
    // 格宽用 em 固定，字号变化时整排一起缩放；transform/opacity 之外的属性不参与动画，
    // 因此翻牌不会触发相邻格重排（样式稳定性：不得抖动）。
    cell.style.cssText = `display:flex;align-items:center;justify-content:center;width:.74em;height:1.24em;font-size:${fontSize}px;line-height:1;border-radius:.08em;background:${styleColor(model.style.accentColor, '#38bdf8')};color:${styleColor(model.style.color, '#e6f1ff')};box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);`;
    if (animated && readBoolean(model.props.flipAnimation, true) && model.interactive) {
      cell.animate(
        [
          { transform: 'translateY(-38%)', opacity: 0.25 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: 260, easing: 'cubic-bezier(.2,.8,.25,1)' },
      );
    }
    return cell;
  }

  #affix(text: string, model: DatavMaterialModel): HTMLElement {
    const node = this.ownerDocument.createElement('span');
    node.dataset.datavFlopAffix = '';
    node.textContent = text;
    node.style.cssText = `font-size:${Math.round(readNumber(model.style.fontSize, 48) * 0.55)}px;line-height:1;opacity:.86;`;
    return node;
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.#handleClick);
  }

  readonly #handleClick = (): void => {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
        bubbles: true,
        composed: true,
        detail: { name: 'valueClick', payload: { value: formatNumericText(model) } },
      }),
    );
  };
}

/** 数值 → 展示文本：接受数字或数字字符串，非法值显示为 `--` 而不是拼出 `NaN`。 */
export function formatNumericText(model: {
  readonly props: Readonly<Record<string, unknown>>;
  readonly dataState: { readonly status: string; readonly value?: unknown };
}): string {
  const raw = model.dataState.value;
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(value)) return '--';
  const decimals = Math.max(0, Math.min(6, Math.round(readNumber(model.props.decimals, 0))));
  const fixed = value.toFixed(decimals);
  if (!readBoolean(model.props.thousandsSeparator, true)) return fixed;
  const [integer = '0', fraction] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function definePluginDatavDigitalFlopMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_DIGITAL_FLOP_MANIFEST,
    element: PluginDatavDigitalFlopElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
