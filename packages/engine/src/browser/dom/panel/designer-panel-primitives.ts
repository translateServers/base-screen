import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialPropSchema } from '@base-screen/plugin-core';
import type { DesignerInspectorContext } from '../../../common/operations/style/designer-inspector.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import {
  appendDesignerFieldMessage,
  createDesignerCheckbox,
  createDesignerIconButton,
  createDesignerInput,
  createDesignerSelect,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';

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
  label.textContent = labelText;
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
  label.textContent = labelText;
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
  input.title = hint;
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
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
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
      input.title = hint;
      if (mixed) input.dataset.mixed = 'true';
    }
    label.appendChild(palette.element);
    appendDesignerFieldMessage(label, palette.controls[0]!, `multi-style-${style}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.multiProperty = `style:${style}`;
    input.disabled = disabled;
    input.title = hint;
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
    label.appendChild(input);
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
  label.textContent = labelText;
  const input = createDesignerCheckbox(parent.ownerDocument, {
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
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      paletteKey,
      { allowGradient },
    );
    for (const input of palette.controls) input.dataset.prop = prop;
    label.appendChild(palette.element);
    appendDesignerFieldMessage(label, palette.controls[0]!, `prop-${prop}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.prop = prop;
    label.appendChild(input);
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
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      paletteKey,
      { allowGradient },
    );
    for (const input of palette.controls) input.dataset.style = style;
    label.appendChild(palette.element);
    appendDesignerFieldMessage(label, palette.controls[0]!, `style-${style}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.style = style;
    label.appendChild(input);
    appendDesignerFieldMessage(label, input, `style-${style}`);
  }
  parent.appendChild(label);
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
    button.title = unavailableReason;
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
    title,
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
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (control === 'boolean') {
    return createDesignerCheckbox(ownerDocument, { checked: value === true });
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
