import type { BaseScreenPluginInspectorControlElement } from '@base-screen/plugin-core';
import { BoardElementBase } from './element-base.js';
import {
  BOARD_TITLE_DECOR_STYLE_LABELS,
  BOARD_TITLE_DECOR_STYLES,
  type BoardTitleDecorStyle,
  isBoardTitleDecorStyle,
} from './identity.js';

/**
 * 标题装饰形态选择器：与装饰边框样式选择器同一契约——宿主写 `model`，用户改值后派发
 * `change`，宿主读 `value` 走 props 事务，撤销与批量语义因此与内建控件一致。
 *
 * 每个选项画缩略图并给出中文名：内建的枚举下拉只能显示取值本身（`bar`、`chevron`），
 * 对作者没有意义。
 */
export class PluginBoardTitleDecorPickerElement
  extends BoardElementBase
  implements BaseScreenPluginInspectorControlElement
{
  #value: BoardTitleDecorStyle | undefined;

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') this.attachShadow({ mode: 'open' });
  }

  set model(model: { readonly value?: unknown }) {
    const next = isBoardTitleDecorStyle(model?.value) ? model.value : undefined;
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
        button { display: grid; place-items: center; width: 52px; height: 30px; padding: 0;
          background: #101c2b; border: 1px solid #2a3b50; border-radius: 4px; cursor: pointer; }
        button[aria-pressed="true"] { border-color: #38bdf8; box-shadow: 0 0 0 1px #38bdf8 inset; }
        button:hover { border-color: #4b6584; }
        .label { width: 100%; font: 11px/1.4 sans-serif; color: #8aa4c0; }
      </style>
      <div class="label" data-picker-label></div>
    `;
    const label = shadow.querySelector<HTMLElement>('[data-picker-label]');
    if (label !== null) {
      label.textContent =
        this.#value === undefined ? '未设置' : BOARD_TITLE_DECOR_STYLE_LABELS[this.#value];
    }
    for (const style of BOARD_TITLE_DECOR_STYLES) {
      const button = this.ownerDocument.createElement('button');
      button.type = 'button';
      button.dataset.decorChoice = style;
      button.title = BOARD_TITLE_DECOR_STYLE_LABELS[style];
      button.setAttribute('aria-label', BOARD_TITLE_DECOR_STYLE_LABELS[style]);
      button.setAttribute('aria-pressed', String(this.#value === style));
      button.appendChild(decorSwatch(this.ownerDocument, style));
      button.addEventListener('click', () => this.#commit(style));
      shadow.appendChild(button);
    }
  }

  #commit(style: BoardTitleDecorStyle): void {
    if (style === this.#value) return;
    this.#value = style;
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    this.#render();
  }
}

/** 每种形态的迷你示意（内联 SVG）；灰色短条代表标题文字的位置。 */
function decorSwatch(doc: Document, style: BoardTitleDecorStyle): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 44 22');
  svg.setAttribute('width', '44');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  const accent = '#9dc4ea';
  const muted = '#4b6584';
  const add = (name: string, attributes: Record<string, string>): void => {
    const element = doc.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    svg.appendChild(element);
  };
  const text = (x: number) =>
    add('rect', { x: String(x), y: '9', width: '18', height: '4', rx: '1', fill: muted });
  switch (style) {
    case 'underline':
      text(4);
      add('rect', { x: '2', y: '17', width: '40', height: '2', fill: accent, opacity: '0.8' });
      break;
    case 'brackets':
      text(13);
      add('path', { d: 'M8 4H4v14h4', fill: 'none', stroke: accent, 'stroke-width': '1.6' });
      add('path', { d: 'M36 4h4v14h-4', fill: 'none', stroke: accent, 'stroke-width': '1.6' });
      break;
    case 'chevron':
      add('path', {
        d: 'M3 7l4 4-4 4M8 7l4 4-4 4',
        fill: 'none',
        stroke: accent,
        'stroke-width': '1.6',
      });
      text(16);
      add('rect', { x: '2', y: '19', width: '40', height: '1', fill: muted });
      break;
    default:
      add('rect', { x: '3', y: '5', width: '3', height: '12', fill: accent });
      text(10);
      add('rect', { x: '2', y: '19', width: '40', height: '1', fill: muted });
      break;
  }
  return svg;
}
