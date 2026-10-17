import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialPropSchema } from '@base-screen/plugin-core';
import type { DesignerInspectorContext } from '../../../common/operations/style/designer-inspector.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  appendDesignerFieldMessage,
  createDesignerButton,
  createDesignerCheckbox,
  createDesignerIconButton,
  createDesignerInput,
  createDesignerSelect,
  createDesignerSwitch,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';

/** 字段行正文 `label` 的文本节点：控件列与标签列分离后，纯文本节点无法参与网格布局。 */
function appendFieldLabelText(label: HTMLElement, text: string): void {
  const span = label.ownerDocument.createElement('span');
  span.className = 'designer-field-label-text';
  span.textContent = text;
  label.appendChild(span);
}

/** 控件列：相对标签独立占第二列，range/自绘下拉等复合控件共享同一落点。 */
function createFieldControl(ownerDocument: Document, className?: string): HTMLElement {
  const control = ownerDocument.createElement('span');
  control.className =
    className === undefined ? 'designer-field-control' : `designer-field-control ${className}`;
  return control;
}

/** 自绘下拉：外壳进控件列，隐藏的原生 select 继续承担取值与 change。 */
function appendSelectControl(control: HTMLElement, select: HTMLSelectElement): void {
  control.appendChild(enhanceDesignerSelect(select).element);
}

function isSelectLike(
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): input is HTMLSelectElement {
  return typeof input.tagName === 'string' && input.tagName.toLowerCase() === 'select';
}

/** 数值区间是否适合双控件（滑杆 + 数字）；无界或超大跨度保持数字输入。 */
function isRangeEligible(
  schema: BaseScreenMaterialPropSchema,
): schema is Extract<BaseScreenMaterialPropSchema, { readonly kind: 'number' }> {
  if (schema.kind !== 'number') return false;
  if (schema.minimum === undefined || schema.maximum === undefined) return false;
  return schema.maximum - schema.minimum <= 1000;
}

export function appendInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
  min?: string,
): HTMLLabelElement {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  appendFieldLabelText(label, labelText);
  const symbol = geometryPropertySymbol(property);
  if (symbol !== undefined) label.dataset.propertySymbol = symbol;
  const input = parent.ownerDocument.createElement('input');
  input.type = type;
  input.className = `designer-control designer-input${type === 'number' ? ' designer-number' : ''}`;
  input.value = String(value);
  input.dataset.property = property;
  if (min !== undefined) input.min = min;
  label.appendChild(input);
  appendDesignerFieldMessage(label, input, `property-${property}`);
  parent.appendChild(label);
  return label;
}

function geometryPropertySymbol(property: string): string | undefined {
  if (property === 'x') return 'X';
  if (property === 'y') return 'Y';
  if (property === 'width') return 'W';
  if (property === 'height') return 'H';
  if (property === 'rotation') return '°';
  if (property === 'zIndex') return 'Z';
  return undefined;
}

/** 批量数值输入（ADR-0053）：带 `data-multi-property` 标记，经独立事务分派。 */
export function appendBatchNumberInput(
  parent: HTMLElement,
  labelText: string,
  multiProperty: string,
  value: number,
  mixed: boolean,
  disabled: boolean,
  hint: string,
): HTMLLabelElement {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  appendFieldLabelText(label, labelText);
  const input = parent.ownerDocument.createElement('input');
  input.type = 'number';
  input.className = 'designer-control designer-input designer-number';
  input.value = mixed ? '' : String(value);
  if (mixed) {
    input.placeholder = DESIGNER_UI_TEXT.inspectorUi.mixed;
    input.dataset.mixed = 'true';
  }
  input.dataset.multiProperty = multiProperty;
  input.disabled = disabled;
  input.setAttribute('data-tip', hint);
  label.appendChild(input);
  appendDesignerFieldMessage(label, input, `multi-property-${multiProperty}`);
  parent.appendChild(label);
  return label;
}

/** 批量样式控件（ADR-0053）：复用单选控件渲染，color 字段走统一三段式调色板。 */
export function appendBatchStyleControl(
  parent: HTMLElement,
  labelText: string,
  style: string,
  value: ScreenJsonValue | undefined,
  mixed: boolean,
  schema: BaseScreenMaterialPropSchema,
  control: string,
  allowGradient: boolean,
  disabled: boolean,
  hint: string,
): void {
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className =
    control === 'color'
      ? 'designer-field designer-field-label designer-field-stacked'
      : 'designer-field designer-field-label';
  appendFieldLabelText(label, labelText);
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      `multi:style:${style}`,
      { allowGradient },
    );
    for (const input of palette.controls) {
      input.dataset.multiProperty = `style:${style}`;
      input.disabled = disabled;
      input.setAttribute('data-tip', hint);
      if (mixed) input.dataset.mixed = 'true';
    }
    const fieldControl = createFieldControl(parent.ownerDocument);
    fieldControl.appendChild(palette.element);
    label.appendChild(fieldControl);
    appendDesignerFieldMessage(label, palette.controls[0]!, `multi-style-${style}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control, labelText);
    input.dataset.multiProperty = `style:${style}`;
    input.disabled = disabled;
    input.setAttribute('data-tip', hint);
    if (mixed) {
      input.dataset.mixed = 'true';
      if (control === 'boolean' && input instanceof HTMLInputElement) {
        input.checked = false;
        input.indeterminate = true;
      } else if (control === 'select' && input instanceof HTMLSelectElement) {
        const option = parent.ownerDocument.createElement('option');
        option.value = '';
        option.textContent = DESIGNER_UI_TEXT.inspectorUi.mixed;
        option.selected = true;
        input.prepend(option);
      } else {
        input.value = '';
        (input as HTMLInputElement | HTMLTextAreaElement).placeholder =
          DESIGNER_UI_TEXT.inspectorUi.mixed;
      }
    }
    if (control === 'boolean') {
      label.appendChild(input);
    } else if (isSelectLike(input)) {
      const fieldControl = createFieldControl(parent.ownerDocument);
      appendSelectControl(fieldControl, input);
      label.appendChild(fieldControl);
    } else {
      const fieldControl = createFieldControl(parent.ownerDocument);
      fieldControl.appendChild(input);
      label.appendChild(fieldControl);
    }
    appendDesignerFieldMessage(label, input, `multi-style-${style}`);
  }
  parent.appendChild(label);
}

export function appendCheckbox(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: boolean,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  appendFieldLabelText(label, labelText);
  // 状态段勾选框（原型 .insp-row + `.inspector-pane input[type="checkbox"]`）：原生 checkbox + 强调色，
  // 显式 aria-label 与原型标记一致（锁定 / 隐藏）。
  const input = createDesignerCheckbox(parent.ownerDocument, {
    ariaLabel: labelText,
    checked: value,
    value: String(value),
  });
  input.dataset.property = property;
  input.addEventListener('change', () => {
    input.value = String(input.checked);
  });
  label.appendChild(input);
  appendDesignerFieldMessage(label, input, `property-${property}`);
  parent.appendChild(label);
}

export function appendPropControl(
  parent: HTMLElement,
  labelText: string,
  prop: string,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
  paletteKey: string,
  allowGradient: boolean,
): void {
  const stacked = control === 'color' || control === 'json';
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = stacked
    ? 'designer-field designer-field-label designer-field-stacked'
    : 'designer-field designer-field-label';
  appendFieldLabelText(label, labelText);
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      paletteKey,
      { allowGradient },
    );
    for (const input of palette.controls) input.dataset.prop = prop;
    const fieldControl = createFieldControl(parent.ownerDocument);
    fieldControl.appendChild(palette.element);
    label.appendChild(fieldControl);
    appendDesignerFieldMessage(label, palette.controls[0]!, `prop-${prop}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control, labelText);
    input.dataset.prop = prop;
    if (control === 'boolean') {
      label.appendChild(input);
    } else if (isSelectLike(input)) {
      const fieldControl = createFieldControl(parent.ownerDocument);
      appendSelectControl(fieldControl, input);
      label.appendChild(fieldControl);
    } else {
      const fieldControl = createFieldControl(parent.ownerDocument);
      fieldControl.appendChild(input);
      label.appendChild(fieldControl);
    }
    appendDesignerFieldMessage(label, input, `prop-${prop}`);
  }
  parent.appendChild(label);
}

export function appendStyleControl(
  parent: HTMLElement,
  labelText: string,
  style: string,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
  paletteKey: string,
  allowGradient: boolean,
): void {
  const stacked = control === 'color';
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = stacked
    ? 'designer-field designer-field-label designer-field-stacked'
    : 'designer-field designer-field-label';
  appendFieldLabelText(label, labelText);
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      paletteKey,
      { allowGradient },
    );
    for (const input of palette.controls) input.dataset.style = style;
    const fieldControl = createFieldControl(parent.ownerDocument);
    fieldControl.appendChild(palette.element);
    label.appendChild(fieldControl);
    appendDesignerFieldMessage(label, palette.controls[0]!, `style-${style}`);
  } else if (control === 'number' && isRangeEligible(schema)) {
    appendStyleRangeControl(label, labelText, style, value, schema);
  } else if (control === 'select' && isAlignmentEnum(schema)) {
    appendStyleSegmentedControl(label, labelText, style, value, schema);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control, labelText);
    input.dataset.style = style;
    if (control === 'boolean') {
      label.appendChild(input);
    } else if (isSelectLike(input)) {
      const fieldControl = createFieldControl(parent.ownerDocument);
      appendSelectControl(fieldControl, input);
      label.appendChild(fieldControl);
    } else {
      const fieldControl = createFieldControl(parent.ownerDocument);
      fieldControl.appendChild(input);
      label.appendChild(fieldControl);
    }
    appendDesignerFieldMessage(label, input, `style-${style}`);
  }
  parent.appendChild(label);
}

/**
 * 连续数值样式（字号 / 字间距 / 行高…）：滑杆 + 数字双控件，几何与原型 `.range-row` 一致。
 * 只有数字输入携带 `data-style`（唯一值载体）；滑杆在 change 时把值转发给它，避免同一字段
 * 出现两个同属性控件，也让查询/自动化始终命中同一个值载体。
 */
function appendStyleRangeControl(
  label: HTMLElement,
  labelText: string,
  style: string,
  value: ScreenJsonValue | undefined,
  schema: Extract<BaseScreenMaterialPropSchema, { readonly kind: 'number' }>,
): void {
  const minimum = schema.minimum ?? 0;
  const maximum = schema.maximum ?? 100;
  const current = typeof value === 'number' && Number.isFinite(value) ? value : minimum;
  const step = Number.isInteger(minimum) && Number.isInteger(maximum) ? 1 : 0.01;
  const fieldControl = createFieldControl(label.ownerDocument, 'designer-field-range-control');
  const range = createDesignerInput(label.ownerDocument, {
    appearance: 'range',
    ariaLabel: labelText,
    max: maximum,
    min: minimum,
    step,
    value: String(current),
  });
  range.dataset.styleRange = style;
  const number = createDesignerInput(label.ownerDocument, {
    appearance: 'number',
    ariaLabel: labelText,
    className: 'designer-field-range-value',
    max: maximum,
    min: minimum,
    step,
    // 可选数值未设置时保持空输入（与普通 number 控件一致），滑杆停在最小值；
    // 一旦用户拖动滑杆，数字读数立即补上并成为提交值。
    value: value === undefined ? '' : String(current),
  });
  number.dataset.style = style;
  if (value === undefined) {
    number.placeholder = DESIGNER_UI_TEXT.inspectorUi.autoValue;
    range.dataset.empty = 'true';
  }
  // 滑杆拖动时先同步数字读数（可见值实时跟随），松手（change）再走一次统一的值提交。
  range.addEventListener('input', () => {
    number.value = range.value;
    delete range.dataset.empty;
  });
  range.addEventListener('change', () => {
    number.value = range.value;
    number.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  number.addEventListener('input', () => {
    range.value = number.value;
  });
  fieldControl.append(range, number);
  label.appendChild(fieldControl);
  appendDesignerFieldMessage(label, number, `style-${style}`);
}

/** 三档水平对齐（left / center / right）在原型里是图标分段控件。 */
function isAlignmentEnum(
  schema: BaseScreenMaterialPropSchema,
): schema is Extract<BaseScreenMaterialPropSchema, { readonly kind: 'enum' }> {
  if (schema.kind !== 'enum' || schema.values.length !== 3) return false;
  if (!schema.values.every((option) => typeof option === 'string')) return false;
  return schema.values.join('|') === 'left|center|right';
}

/**
 * 对齐分段控件：原生 select 仍是唯一值载体与 change 源（`data-style` 只挂它），
 * 可见按钮只负责改值并派发 change，键盘与既有事务管线保持不变。
 */
function appendStyleSegmentedControl(
  label: HTMLElement,
  labelText: string,
  style: string,
  value: ScreenJsonValue | undefined,
  schema: Extract<BaseScreenMaterialPropSchema, { readonly kind: 'enum' }>,
): void {
  const ownerDocument = label.ownerDocument;
  const current = typeof value === 'string' ? value : String(schema.values[0]);
  const segmented = ownerDocument.createElement('span');
  segmented.className = 'designer-segmented';
  segmented.setAttribute('role', 'group');
  segmented.setAttribute('aria-label', labelText);
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: labelText,
    options: schema.values.map((option) => ({
      label: String(option),
      selected: String(option) === current,
      value: String(option),
    })),
    value: current,
  });
  select.className += ' designer-segmented-native';
  select.dataset.style = style;
  const icons: Readonly<Record<string, DesignerIconName>> = {
    left: 'align-left',
    center: 'align-center',
    right: 'align-right',
  };
  for (const optionValue of schema.values.map(String)) {
    const option = createDesignerButton(ownerDocument, {
      ariaLabel: optionValue,
      className: 'designer-segmented-option',
      pressed: optionValue === current,
      variant: 'ghost',
    });
    option.dataset.segmentedValue = optionValue;
    option.innerHTML = designerIcon(icons[optionValue] ?? 'align-left');
    option.addEventListener('click', () => {
      if (select.value === optionValue) return;
      select.value = optionValue;
      for (const candidate of segmented.querySelectorAll<HTMLButtonElement>(
        '.designer-segmented-option',
      )) {
        candidate.ariaPressed = String(candidate.dataset.segmentedValue === optionValue);
      }
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    });
    segmented.appendChild(option);
  }
  const fieldControl = createFieldControl(ownerDocument);
  fieldControl.append(segmented, select);
  label.appendChild(fieldControl);
  appendDesignerFieldMessage(label, select, `style-${style}`);
}

export function appendSection(parent: HTMLElement, title: string, advanced = false): HTMLElement {
  // Sections render as native disclosures so every region can be collapsed with
  // pointer or keyboard; open state is persisted by the inspector group
  // preferences machinery in DesignerPanelController.
  const section = parent.ownerDocument.createElement('details');
  section.className = 'designer-inspector-section designer-inspector-disclosure';
  section.open = true;
  if (advanced) section.dataset.inspectorAdvanced = 'true';
  const summary = parent.ownerDocument.createElement('summary');
  summary.className = 'designer-inspector-section-title designer-datav-section-summary';
  summary.textContent = title;
  const disclosure = parent.ownerDocument.createElement('span');
  disclosure.className = 'designer-datav-section-disclosure';
  disclosure.innerHTML = designerIcon('chevron-down');
  summary.appendChild(disclosure);
  section.appendChild(summary);
  parent.appendChild(section);
  return section;
}

export function appendFieldGrid(parent: HTMLElement): HTMLElement {
  const grid = parent.ownerDocument.createElement('div');
  grid.className = 'designer-field-grid';
  parent.appendChild(grid);
  return grid;
}

export function appendListItem(parent: HTMLElement, text: string): void {
  const item = parent.ownerDocument.createElement('li');
  item.textContent = text;
  parent.appendChild(item);
}

export function appendActionButton(
  parent: HTMLElement,
  label: string,
  action: string,
  disabled: boolean,
  unavailableReason: string,
): void {
  const button = parent.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-button';
  button.dataset.action = action;
  button.textContent = label;
  button.disabled = disabled;
  if (disabled) {
    button.setAttribute('data-tip', unavailableReason);
    button.ariaLabel = `${label}：${unavailableReason}`;
  }
  parent.appendChild(button);
}

export function appendBatchArrangeButton(
  parent: HTMLElement,
  label: string,
  action: string,
  icon: DesignerIconName,
  disabled: boolean,
  unavailableReason: string,
): void {
  const title = disabled ? `${label}：${unavailableReason}` : label;
  const button = createDesignerIconButton(parent.ownerDocument, {
    ariaLabel: title,
    className: 'designer-datav-batch-arrange-button',
    disabled,
    icon,
    label,
    tip: title,
  });
  button.dataset.action = action;
  parent.appendChild(button);
}

export function multiSelectionGroupUnavailableReason(
  summary: Extract<DesignerInspectorContext, { readonly kind: 'multi-selection' }>['summary'],
): string {
  if (summary.count < 2) return DESIGNER_UI_TEXT.propertiesPanel.groupUnavailableCount;
  if (!summary.sameParent) return DESIGNER_UI_TEXT.propertiesPanel.groupUnavailableDifferentParents;
  if (summary.hasLocked) return DESIGNER_UI_TEXT.propertiesPanel.groupUnavailableLocked;
  return '';
}

export function createControl(
  ownerDocument: Document,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
  ariaLabel?: string,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (control === 'boolean') {
    // 元素 boolean 属性（自适应宽度 / 提示框 / 波纹动画…）：原型检查器没有对应行（引擎独有面），
    // 按设计体系推导为布尔「设置项」——与描述符 boolean 字段、页面配置开关同一形态（.switch），
    // 而不是状态段勾选框（锁定 / 隐藏）。
    return createDesignerSwitch(ownerDocument, {
      ...(ariaLabel === undefined ? {} : { ariaLabel }),
      checked: value === true,
    });
  }
  if (control === 'select' && schema.kind === 'enum') {
    return createDesignerSelect(ownerDocument, {
      options: schema.values.map((optionValue) => ({
        label: String(optionValue),
        selected: value === optionValue,
        value: String(optionValue),
      })),
    });
  }
  if (control === 'json') {
    const input = createDesignerTextarea(ownerDocument);
    input.value = JSON.stringify(value);
    return input;
  }
  const appearance = control === 'number' || control === 'color' ? control : 'text';
  return createDesignerInput(ownerDocument, {
    appearance,
    value: String(value ?? ''),
  });
}
