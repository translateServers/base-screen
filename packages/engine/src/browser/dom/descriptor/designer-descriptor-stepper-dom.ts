import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';

/**
 * 步进器：− / 值 / + 三段式（设计原型 .stepper）。
 *
 * 与原型的一处有意偏离：值位是可直接键入的数字输入，而不是展示用 span —— 原型把步进器
 * 用在字号这类小整数上，键入精确值的通道不能因换控件而消失（引擎能力只增不减）。
 * 变更以 input 的 change 事件向设计器表面路由（与 number 控件同一条值流水线）。
 */
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

export function createDesignerStepper(
  ownerDocument: Document,
  options: CreateDesignerStepperOptions,
): DesignerStepperHandle {
  const element = ownerDocument.createElement('div');
  element.className = 'designer-stepper';
  if (options.className !== undefined)
    element.className = `${element.className} ${options.className}`;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', options.ariaLabel);

  const step = Number.isFinite(options.step) && (options.step ?? 0) > 0 ? options.step! : 1;
  const decrement = createStepButton(ownerDocument, -1, options.ariaLabel);
  const increment = createStepButton(ownerDocument, 1, options.ariaLabel);
  const input = ownerDocument.createElement('input');
  input.type = 'number';
  input.className = 'designer-stepper-value';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(step);
  input.value = String(clamp(options.value, options.min, options.max));
  input.setAttribute('aria-label', options.ariaLabel);

  const commit = (next: number, dispatch: boolean): void => {
    const clamped = clamp(next, options.min, options.max);
    input.value = String(clamped);
    syncButtons();
    if (dispatch) dispatchChange(input);
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

function clamp(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(finite, min), max);
}

function dispatchChange(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}
