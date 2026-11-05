import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../dom/designer-icons.js';
import {
  createDesignerCheckbox,
  createDesignerInput,
  createDesignerSwitch,
  designerClassNames,
} from './designer-ui-primitives.js';

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
  readonly labelText: HTMLElement;
}

interface DesignerFieldParts {
  readonly field: HTMLElement;
  readonly labelText: HTMLElement;
}

/**
 * 只造字段行的标签列容器：开关 / 勾选框这类控件要直接挂在字段元素上（见模块注释），
 * 因此它们用本函数而不是 `createDesignerFieldRow`。
 */
export function createDesignerFieldElement(
  ownerDocument: Document,
  options: DesignerFieldElementOptions,
): HTMLElement {
  return createDesignerFieldParts(ownerDocument, options).field;
}

function createDesignerFieldParts(
  ownerDocument: Document,
  options: DesignerFieldElementOptions,
): DesignerFieldParts {
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
  return { field, labelText };
}

/** 标签列 + 控件列的完整字段行；返回值里的 `control` 就是控件列。 */
export function createDesignerFieldRow(
  ownerDocument: Document,
  options: DesignerFieldRowOptions,
): DesignerFieldRow {
  const { field, labelText } = createDesignerFieldParts(ownerDocument, options);
  const control = ownerDocument.createElement('span');
  control.className = designerClassNames('designer-field-control', options.controlClassName);
  field.appendChild(control);
  return { field, control, labelText };
}

export interface DesignerToggleFieldOptions {
  readonly label: string;
  readonly labelClassName?: string;
  readonly hint?: string;
  readonly control: 'switch' | 'checkbox';
  readonly checked?: boolean;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

export interface DesignerToggleField {
  readonly field: HTMLElement;
  readonly input: HTMLInputElement;
}

/**
 * 开关 / 勾选字段行：标签与说明在左、控件在右，控件直接挂在字段行上以命中
 * `:has(> .designer-switch)` / `:has(> .designer-checkbox)`。说明放在 copy 容器里，
 * 避免和标签一起被 flex 均分到开关两侧。
 */
export function createDesignerToggleField(
  ownerDocument: Document,
  options: DesignerToggleFieldOptions,
): DesignerToggleField {
  const field = ownerDocument.createElement('label');
  field.className = designerClassNames(
    'designer-field designer-field-label designer-field-toggle',
    options.className,
  );
  const copy = ownerDocument.createElement('span');
  copy.className = 'designer-field-toggle-copy';
  const label = ownerDocument.createElement('span');
  label.className = designerClassNames('designer-field-label-text', options.labelClassName);
  label.textContent = options.label;
  copy.appendChild(label);
  if (options.hint !== undefined) {
    const hint = ownerDocument.createElement('span');
    hint.className = 'designer-field-hint';
    hint.textContent = options.hint;
    copy.appendChild(hint);
  }
  field.appendChild(copy);
  const input =
    options.control === 'switch'
      ? createDesignerSwitch(ownerDocument, {
          ...(options.ariaLabel === undefined ? {} : { ariaLabel: options.ariaLabel }),
          ...(options.checked === undefined ? {} : { checked: options.checked }),
          ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
        })
      : createDesignerCheckbox(ownerDocument, {
          ...(options.ariaLabel === undefined ? {} : { ariaLabel: options.ariaLabel }),
          ...(options.checked === undefined ? {} : { checked: options.checked }),
          ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
        });
  field.appendChild(input);
  return { field, input };
}

/** 字段说明：挂在控件下方，和错误消息分开（说明是常态，错误是校验态）。 */
export function appendDesignerFieldHint(
  field: HTMLElement,
  control: HTMLElement,
  text: string,
): HTMLElement {
  const hint = field.ownerDocument.createElement('span');
  hint.className = 'designer-field-hint';
  hint.textContent = text;
  if (control.id !== '') {
    hint.id = `${control.id}-hint`;
    const describedBy = control.getAttribute('aria-describedby');
    control.setAttribute(
      'aria-describedby',
      describedBy === null ? hint.id : `${describedBy} ${hint.id}`,
    );
  }
  field.appendChild(hint);
  return hint;
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

export interface CreateDesignerStepperOptions {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  /** 字段名：同时用作值输入与两侧按钮的可访问名称（减小<字段>/增大<字段>）。 */
  readonly ariaLabel: string;
  readonly className?: string;
}

export interface DesignerStepperHandle {
  readonly element: HTMLDivElement;
  readonly input: HTMLInputElement;
}

/**
 * 步进器：− / 值 / + 三段式（设计原型 .stepper）。
 *
 * 与原型的一处有意偏离：值位是可直接键入的数字输入，而不是展示用 span —— 原型把步进器
 * 用在字号这类小整数上，键入精确值的通道不能因换控件而消失（引擎能力只增不减）。
 * 变更以 input 的 change 事件向设计器表面路由（与 number 控件同一条值流水线）。
 */
export function createDesignerStepper(
  ownerDocument: Document,
  options: CreateDesignerStepperOptions,
): DesignerStepperHandle {
  const element = ownerDocument.createElement('div');
  element.className = designerClassNames('designer-stepper', options.className);
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', options.ariaLabel);

  const step = Number.isFinite(options.step) && (options.step ?? 0) > 0 ? options.step! : 1;
  const decrement = createStepButton(ownerDocument, -1, options.ariaLabel);
  const increment = createStepButton(ownerDocument, 1, options.ariaLabel);
  const input = createDesignerInput(ownerDocument, {
    appearance: 'number',
    ariaLabel: options.ariaLabel,
    className: 'designer-stepper-value',
    value: String(clampStep(options.value, options.min, options.max)),
  });
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(step);
  input.dataset.flush = 'true';

  const commit = (next: number, dispatch: boolean): void => {
    const clamped = clampStep(next, options.min, options.max);
    input.value = String(clamped);
    syncButtons();
    if (dispatch) dispatchStepperChange(input);
  };
  // shadow 树里 document.activeElement 只回宿主，活动元素必须从所在的根取
  // （ShadowRoot 与 Document 都有 activeElement；DOM 替身缺 getRootNode 时回退宿主文档）。
  const activeInTree = (): Element | null =>
    (element.getRootNode?.() as { readonly activeElement?: Element | null } | null)
      ?.activeElement ??
    ownerDocument.activeElement ??
    null;
  const syncButtons = (): void => {
    const current = Number(input.value);
    const value = Number.isFinite(current) ? current : options.min;
    const wasDecrementDisabled = decrement.disabled;
    const wasIncrementDisabled = increment.disabled;
    decrement.disabled = value <= options.min;
    increment.disabled = value >= options.max;
    // 按钮在边界禁用后焦点会落在它身上消失：把焦点交给对侧按钮（原型同款交接）。
    if (decrement.disabled && !wasDecrementDisabled && activeInTree() === decrement) {
      increment.focus({ preventScroll: true });
    }
    if (increment.disabled && !wasIncrementDisabled && activeInTree() === increment) {
      decrement.focus({ preventScroll: true });
    }
  };

  decrement.addEventListener('click', () => commit(Number(input.value) - step, true));
  increment.addEventListener('click', () => commit(Number(input.value) + step, true));
  input.addEventListener('input', () => {
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) return;
    syncButtons();
  });
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    commit(Number.isFinite(parsed) ? parsed : options.min, false);
  });
  input.addEventListener('blur', () => commit(Number(input.value), false));

  element.append(decrement, input, increment);
  syncButtons();
  return { element, input };
}

function createStepButton(
  ownerDocument: Document,
  direction: -1 | 1,
  label: string,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-stepper-button';
  button.dataset.step = String(direction);
  button.setAttribute(
    'aria-label',
    direction === -1
      ? DESIGNER_UI_TEXT.stepper.decrement(label)
      : DESIGNER_UI_TEXT.stepper.increment(label),
  );
  button.innerHTML = designerIcon(direction === -1 ? 'minus' : 'plus');
  return button;
}

function clampStep(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(finite, min), max);
}

function dispatchStepperChange(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}
