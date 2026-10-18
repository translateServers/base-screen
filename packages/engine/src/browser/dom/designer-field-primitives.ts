import { createDesignerInput, designerClassNames } from './designer-ui-primitives.js';

/**
 * 字段行骨架与复合控件组合原语。
 *
 * 分层：`designer-ui-primitives` 产出单个控件（input / select / switch…），本模块把它们组合成
 * 检查器认可的一行字段。`.designer-field` 是「标签列 74px + 控件列 1fr」的两列网格，标签文案必须
 * 是 `.designer-field-label-text` 的 span（纯文本节点无法参与网格），控件必须落在 `.designer-field-control`
 * 里；开关 / 勾选框是例外，它们直接挂在 `.designer-field` 上以命中 `:has(> .designer-switch)` 的行式布局。
 *
 * 这些结构约束此前在检查器、页面配置、描述符三处各写一遍，类名与层级靠人工对齐；集中到本模块后，
 * 新增字段只声明「标签 + 控件」，不再复制行结构。
 */

export type DesignerFieldTagName = 'label' | 'span' | 'div';

export interface DesignerFieldElementOptions {
  readonly label: string;
  /** 默认 `label`。取色器 / 文本域用 `span`，避免点击标签激活原生取色器或输入焦点。 */
  readonly tagName?: DesignerFieldTagName;
  /** 标签在上、控件在下（`.designer-field-stacked`）。 */
  readonly stacked?: boolean;
  readonly className?: string;
}

export interface DesignerFieldRowOptions extends DesignerFieldElementOptions {
  readonly controlClassName?: string;
}

export interface DesignerFieldRow {
  readonly field: HTMLElement;
  readonly control: HTMLElement;
}

/**
 * 只造字段行的标签列容器：开关 / 勾选框这类控件要直接挂在字段元素上（见模块注释），
 * 因此它们用本函数而不是 `createDesignerFieldRow`。
 */
export function createDesignerFieldElement(
  ownerDocument: Document,
  options: DesignerFieldElementOptions,
): HTMLElement {
  const field = ownerDocument.createElement(options.tagName ?? 'label');
  field.className = designerClassNames(
    options.stacked === true
      ? 'designer-field designer-field-label designer-field-stacked'
      : 'designer-field designer-field-label',
    options.className,
  );
  const labelText = ownerDocument.createElement('span');
  labelText.className = 'designer-field-label-text';
  labelText.textContent = options.label;
  field.appendChild(labelText);
  return field;
}

/** 标签列 + 控件列的完整字段行；返回值里的 `control` 就是控件列。 */
export function createDesignerFieldRow(
  ownerDocument: Document,
  options: DesignerFieldRowOptions,
): DesignerFieldRow {
  const field = createDesignerFieldElement(ownerDocument, options);
  const control = ownerDocument.createElement('span');
  control.className = designerClassNames('designer-field-control', options.controlClassName);
  field.appendChild(control);
  return { field, control };
}

export interface DesignerRangeFieldOptions {
  readonly ariaLabel: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** 数字读数；`''` 表示未设置，配合 `placeholder` 显示自动值。 */
  readonly value: string;
  /** 滑杆读数，默认沿用 `value`；`value` 为空时回落到 `min`。 */
  readonly rangeValue?: string;
  readonly placeholder?: string;
  readonly numberClassName?: string;
  /** 数字读数外层的单位符号（`.designer-geo-field`），如 `%`。 */
  readonly numberSymbol?: string;
  /** 空值标记：滑杆带 `data-empty`，首次拖动后清除。 */
  readonly empty?: boolean;
  /**
   * 滑杆松手后是否把数字读数再当作提交源派发一次 `change`。
   * 样式字段靠它进入统一事务管线；页面配置由面板监听滑杆自身的 `change`，因此保持 false。
   */
  readonly forwardRangeChange?: boolean;
}

export interface DesignerRangeField {
  readonly range: HTMLInputElement;
  readonly number: HTMLInputElement;
}

/**
 * 连续数值复合控件（原型 `.range-row`）：滑杆 + 数字读数。
 *
 * 只有数字读数携带值提交语义（调用方给它挂 `data-style` / `data-canvas-setting` 等标记）；
 * 滑杆在 `change` 时把值转发给数字读数，避免同一字段出现两个值载体。
 */
export function appendDesignerRangeField(
  control: HTMLElement,
  options: DesignerRangeFieldOptions,
): DesignerRangeField {
  const ownerDocument = control.ownerDocument;
  const rangeValue =
    options.rangeValue ?? (options.value === '' ? String(options.min) : options.value);
  const range = createDesignerInput(ownerDocument, {
    appearance: 'range',
    ariaLabel: options.ariaLabel,
    max: options.max,
    min: options.min,
    step: options.step,
    value: rangeValue,
  });
  if (options.empty === true) range.dataset.empty = 'true';
  const number = createDesignerInput(ownerDocument, {
    appearance: 'number',
    ariaLabel: options.ariaLabel,
    ...(options.numberClassName === undefined ? {} : { className: options.numberClassName }),
    max: options.max,
    min: options.min,
    step: options.step,
    value: options.value,
  });
  if (options.placeholder !== undefined) number.placeholder = options.placeholder;
  // 滑杆拖动时先同步数字读数（可见值实时跟随），松手（change）再走一次统一的值提交。
  range.addEventListener('input', () => {
    number.value = range.value;
    delete range.dataset.empty;
  });
  range.addEventListener('change', () => {
    number.value = range.value;
    if (options.forwardRangeChange === true) {
      number.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
  });
  number.addEventListener('input', () => {
    range.value = number.value;
  });
  control.appendChild(range);
  if (options.numberSymbol === undefined) {
    control.appendChild(number);
  } else {
    const symbolField = ownerDocument.createElement('label');
    symbolField.className = 'designer-geo-field';
    symbolField.dataset.symbol = options.numberSymbol;
    symbolField.appendChild(number);
    control.appendChild(symbolField);
  }
  return { range, number };
}
