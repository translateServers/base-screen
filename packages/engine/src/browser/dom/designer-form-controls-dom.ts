import { enhanceDesignerSelect } from './designer-select-dom.js';
import {
  createDesignerInput,
  createDesignerSelect,
  createDesignerTextarea,
} from './designer-ui-primitives.js';

const FORM_CONTROL_SELECTOR = [
  'input.designer-input',
  'select.designer-select',
  'textarea.designer-textarea',
  'input.designer-checkbox',
  'input.designer-switch',
  'button.designer-button',
].join(', ');

/**
 * 把模板字符串里手写的表单控件收口到共享原语。
 *
 * 蓝图检查器等面板仍以 HTML 字符串渲染外壳；渲染完成后调用本函数，用一个由
 * `createDesigner*` 产出的等价节点替换手写节点，保证类名、默认属性与控件组件只有一份来源。
 * 值、`data-*`/`aria-*` 属性原样搬运，事件仍走既有的冒泡/委托管线。
 *
 * 勾选/开关/按钮采用原地归一（补类与 ARIA，不替换节点），因为模板渲染后可能已经挂了监听；
 * 文本类控件仍替换节点，以统一原语的默认属性。
 */
export function adoptDesignerFormControls(root: ParentNode): void {
  for (const control of Array.from(root.querySelectorAll<HTMLElement>(FORM_CONTROL_SELECTOR))) {
    // 已增强的下拉：原生 select 已被收进外壳，不再二次处理。
    if (control.closest('.designer-select-control') !== null) continue;
    const tagName = control.tagName.toLowerCase();
    if (tagName === 'input') {
      const input = control as HTMLInputElement;
      if (hasClass(input, 'designer-switch') || hasClass(input, 'designer-checkbox')) {
        normalizeToggleInput(input);
      } else {
        adoptInput(input);
      }
    } else if (tagName === 'select') {
      adoptSelect(control as HTMLSelectElement);
    } else if (tagName === 'textarea') {
      adoptTextarea(control as HTMLTextAreaElement);
    } else if (tagName === 'button') {
      normalizeButton(control as HTMLButtonElement);
    }
  }
}

function normalizeToggleInput(input: HTMLInputElement): void {
  const isSwitch = hasClass(input, 'designer-switch');
  addClass(input, isSwitch ? 'designer-switch' : 'designer-checkbox');
  if (input.type !== 'checkbox') input.type = 'checkbox';
  if (isSwitch && input.getAttribute('role') === null) {
    input.setAttribute('role', 'switch');
  }
  if (input.getAttribute('aria-checked') === null) {
    input.setAttribute('aria-checked', String(input.checked));
  }
  if (isSwitch) {
    input.addEventListener('change', () => {
      input.setAttribute('aria-checked', String(input.checked));
    });
  }
}

function normalizeButton(button: HTMLButtonElement): void {
  addClass(button, 'designer-control');
  addClass(button, 'designer-button');
  if (button.type !== 'button') button.type = 'button';
}

function hasClass(element: Element, token: string): boolean {
  return element.className.split(/\s+/).includes(token);
}

function addClass(element: Element, token: string): void {
  if (hasClass(element, token)) return;
  element.className = `${element.className} ${token}`.trim();
}

function adoptInput(input: HTMLInputElement): void {
  const next = createDesignerInput(input.ownerDocument, {
    appearance: inputAppearance(input.type),
    type: input.type,
    value: input.value,
  });
  copyControlAttributes(input, next);
  input.replaceWith(next);
}

function adoptTextarea(textarea: HTMLTextAreaElement): void {
  const next = createDesignerTextarea(textarea.ownerDocument, { value: textarea.value });
  copyControlAttributes(textarea, next);
  textarea.replaceWith(next);
}

function adoptSelect(select: HTMLSelectElement): void {
  const parent = select.parentNode;
  if (parent === null) return;
  const marker = select.nextSibling;
  const next = createDesignerSelect(select.ownerDocument, {
    options: Array.from(select.options).map((option) => ({
      disabled: option.disabled,
      label: option.textContent ?? '',
      selected: option.selected,
      value: option.value,
    })),
  });
  copyControlAttributes(select, next);
  next.value = select.value;
  const enhanced = enhanceDesignerSelect(next);
  // 增强会把原生 select 移进新外壳：先记住原位置，再把外壳插回去。
  parent.insertBefore(enhanced.element, marker);
}

/** 搬运除 class/type/value 之外的全部属性：值由原语构造时写入，class 单独合并。 */
function copyControlAttributes(source: HTMLElement, target: HTMLElement): void {
  for (const attribute of Array.from(source.attributes)) {
    if (
      attribute.name === 'class' ||
      attribute.name === 'style' ||
      attribute.name === 'type' ||
      attribute.name === 'value'
    ) {
      continue;
    }
    target.setAttribute(attribute.name, attribute.value);
  }
  for (const token of source.className.split(/\s+/)) {
    if (token !== '' && !target.classList.contains(token)) target.classList.add(token);
  }
}

function inputAppearance(type: string): 'text' | 'number' | 'range' | 'color' {
  if (type === 'number') return 'number';
  if (type === 'range') return 'range';
  if (type === 'color') return 'color';
  return 'text';
}
