import type { BaseScreenPluginInspectorControlElement } from '@base-screen/plugin-core';
import { DatavElementBase } from './element-base.js';
import {
  DATAV_BORDER_STYLE_LABELS,
  DATAV_BORDER_STYLES,
  type DatavBorderStyle,
  isDatavBorderStyle,
} from './identity.js';

/**
 * 装饰边框样式选择器：本插件为自家物料贡献的检查器控件。
 *
 * 契约与内建控件一致——宿主写 `model`，用户改值后派发 `change`，宿主读 `value` 走
 * props 事务。控件拿不到引擎 Store 或事务，因此撤销/dirty/批量编辑语义自动与内建
 * 控件一致，不需要新的写回通道。
 *
 * 每个样式项都画一个真实的缩略图而不是文字标签：选边框是视觉决策，纯文字选择器
 * 让用户无法预期结果。
 */
export class PluginDatavBorderPickerElement
  extends DatavElementBase
  implements BaseScreenPluginInspectorControlElement
{
  #value: DatavBorderStyle | undefined;

  constructor() {
    super();
    // 无 DOM 时（Node 导入）没有 attachShadow；控件只在浏览器里被实例化。
    if (typeof this.attachShadow === 'function') this.attachShadow({ mode: 'open' });
  }

  set model(model: { readonly value?: unknown }) {
    const next = isDatavBorderStyle(model?.value) ? model.value : undefined;
    if (next === this.#value) return;
    this.#value = next;
    this.#render();
  }

  get model(): never {
    return undefined as never;
  }

  get value(): string {
    return this.#value ?? '';
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    const shadow = this.shadowRoot;
    if (shadow === null) return;
    // 骨架是编译期字面量；来自文档的值只参与 aria-pressed 比较，不拼进 markup。
    shadow.innerHTML = `
      <style>
        :host { display: flex; flex-wrap: wrap; gap: 6px; }
        button { display: grid; place-items: center; width: 40px; height: 30px; padding: 0;
          background: #101c2b; border: 1px solid #2a3b50; border-radius: 4px; cursor: pointer; }
        button[aria-pressed="true"] { border-color: #38bdf8; box-shadow: 0 0 0 1px #38bdf8 inset; }
        button:hover { border-color: #4b6584; }
        .label { width: 100%; font: 11px/1.4 sans-serif; color: #8aa4c0; }
      </style>
      <div class="label" data-picker-label></div>
    `;
    const label = shadow.querySelector<HTMLElement>('[data-picker-label]');
    if (label !== null)
      label.textContent =
        this.#value === undefined ? '未设置' : DATAV_BORDER_STYLE_LABELS[this.#value];
    for (const style of DATAV_BORDER_STYLES) {
      const button = this.ownerDocument.createElement('button');
      button.type = 'button';
      button.dataset.borderChoice = style;
      button.title = DATAV_BORDER_STYLE_LABELS[style];
      button.setAttribute('aria-label', DATAV_BORDER_STYLE_LABELS[style]);
      button.setAttribute('aria-pressed', String(this.#value === style));
      button.appendChild(borderSwatch(this.ownerDocument, style));
      button.addEventListener('click', () => this.#commit(style));
      shadow.appendChild(button);
    }
  }

  #commit(style: DatavBorderStyle): void {
    if (style === this.#value) return;
    this.#value = style;
    // 与内建控件一致的提交时机：宿主在 change 上读 value 并走 props 事务。
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    this.#render();
  }
}

/** 每种边框的迷你示意：用内联 SVG 画出形态本身，避免选择器与真实渲染不一致。 */
function borderSwatch(doc: Document, style: DatavBorderStyle): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 22');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  const stroke = '#9dc4ea';
  const add = (name: string, attributes: Record<string, string>): void => {
    const element = doc.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    svg.appendChild(element);
  };
  switch (style) {
    case 'corner-brackets':
      add('path', { d: 'M2 8V2h6', fill: 'none', stroke, 'stroke-width': '1.6' });
      add('path', { d: 'M24 2h6v6', fill: 'none', stroke, 'stroke-width': '1.6' });
      add('path', { d: 'M30 14v6h-6', fill: 'none', stroke, 'stroke-width': '1.6' });
      add('path', { d: 'M8 20H2v-6', fill: 'none', stroke, 'stroke-width': '1.6' });
      break;
    case 'double-line':
      add('rect', {
        x: '2',
        y: '2',
        width: '28',
        height: '18',
        fill: 'none',
        stroke,
        'stroke-width': '2.6',
      });
      break;
    case 'dashed':
      add('rect', {
        x: '2',
        y: '2',
        width: '28',
        height: '18',
        fill: 'none',
        stroke,
        'stroke-width': '1.6',
        'stroke-dasharray': '4 3',
      });
      break;
    case 'notch':
      add('path', {
        d: 'M7 2h23v13l-5 5H2V7z',
        fill: 'none',
        stroke,
        'stroke-width': '1.6',
      });
      break;
    case 'glow-corner':
      add('rect', {
        x: '3',
        y: '3',
        width: '26',
        height: '16',
        fill: 'none',
        stroke,
        'stroke-width': '1.4',
      });
      add('circle', { cx: '3', cy: '3', r: '3', fill: stroke, opacity: '0.5' });
      add('circle', { cx: '29', cy: '19', r: '3', fill: stroke, opacity: '0.5' });
      break;
    default:
      add('rect', {
        x: '2',
        y: '2',
        width: '28',
        height: '18',
        fill: 'none',
        stroke,
        'stroke-width': '1.6',
      });
      break;
  }
  return svg;
}
