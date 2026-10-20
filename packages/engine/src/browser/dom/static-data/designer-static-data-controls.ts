import type { ScreenTabularDataset } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import {
  createDesignerFieldElement,
  createDesignerFieldRow,
} from '../designer-field-primitives.js';
import {
  createDesignerCheckbox,
  createDesignerInput,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';
import type { DesignerStaticDataView } from './designer-static-data-view.js';

export function renderScalar(ownerDocument: Document, view: DesignerStaticDataView): HTMLElement {
  const descriptor = view.descriptor;
  if (descriptor?.kind !== 'scalar') {
    return createDesignerFieldRow(ownerDocument, { label: '' }).field;
  }
  const caption =
    descriptor.valueType === 'string'
      ? DESIGNER_UI_TEXT.dataSource.staticScalarString
      : descriptor.valueType === 'number'
        ? DESIGNER_UI_TEXT.dataSource.staticScalarNumber
        : DESIGNER_UI_TEXT.dataSource.staticScalarBoolean;
  // 勾选框按检查器约定直接挂在字段行上（命中 :has(> .designer-checkbox) 的行式布局）；
  // 文本域走「标签在上、控件整行」，与检查器里的多行文本同一形态。
  if (descriptor.valueType === 'boolean') {
    const field = createDesignerFieldElement(ownerDocument, { label: caption });
    const checkbox = createDesignerCheckbox(ownerDocument, {
      ariaLabel: caption,
      checked: view.value === true,
    });
    checkbox.dataset.staticScalar = descriptor.valueType;
    field.appendChild(checkbox);
    return field;
  }
  const multiline = descriptor.valueType === 'string' && descriptor.multiline === true;
  const row = createDesignerFieldRow(ownerDocument, {
    label: caption,
    ...(multiline ? { tagName: 'span' as const, stacked: true } : {}),
  });
  const input = multiline
    ? createDesignerTextarea(ownerDocument, { ariaLabel: caption, value: String(view.value ?? '') })
    : createDesignerInput(ownerDocument, {
        ariaLabel: caption,
        type: descriptor.valueType === 'number' ? 'number' : 'text',
        value: String(view.value ?? ''),
      });
  input.dataset.staticScalar = descriptor.valueType;
  row.control.appendChild(input);
  return row.field;
}

export function renderAdvancedInput(ownerDocument: Document, value: string): HTMLElement {
  const row = createDesignerFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.dataSource.staticValue,
    tagName: 'span',
    stacked: true,
    className: 'designer-data-source-static',
  });
  const textarea = createDesignerTextarea(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataSource.staticValue,
    value,
  });
  textarea.dataset.dataSourceStatic = 'true';
  row.control.appendChild(textarea);
  return row.field;
}

export function tab(
  ownerDocument: Document,
  value: string,
  label: string,
  selected: boolean,
): HTMLButtonElement {
  const button = action(ownerDocument, `tab-${value}`, label);
  button.setAttribute('aria-pressed', String(selected));
  return button;
}

export function action(
  ownerDocument: Document,
  value: string,
  label: string,
  variant?: 'primary',
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.staticAction = value;
  if (variant !== undefined) button.dataset.variant = variant;
  button.textContent = label;
  return button;
}

export function paginationAction(
  ownerDocument: Document,
  value: string,
  label: string,
  icon: 'chevron-left' | 'chevron-right',
): HTMLButtonElement {
  const button = action(ownerDocument, value, label);
  button.classList.add('designer-icon-button', 'designer-static-page-button');
  button.setAttribute('aria-label', label);
  button.setAttribute('data-tip', label);
  button.innerHTML = designerIcon(icon);
  return button;
}

export function indexedAction(
  ownerDocument: Document,
  value: string,
  index: number,
  label: string,
): HTMLButtonElement {
  const button = action(ownerDocument, value, label);
  button.dataset.staticIndex = String(index);
  return button;
}

export function roleAction(
  ownerDocument: Document,
  role: string,
  value: string,
  label: string,
  disabled = false,
): HTMLButtonElement {
  const button = action(ownerDocument, `binding-${value}`, label);
  button.dataset.staticBindingRole = role;
  button.disabled = disabled;
  return button;
}

export function appendOption(
  select: HTMLSelectElement,
  value: string,
  label: string,
  selected: boolean,
): void {
  const option = select.ownerDocument.createElement('option');
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  select.appendChild(option);
}

export function bindingSummary(
  view: DesignerStaticDataView,
  dataset: ScreenTabularDataset | undefined,
): string {
  if (dataset === undefined) return DESIGNER_UI_TEXT.dataset.bindingNone;
  const summaries = view.roles.flatMap((role) => {
    const ids = view.binding?.fields[role.id] ?? [];
    return ids.length === 0
      ? []
      : [
          `${DESIGNER_UI_TEXT.dataset.bindingRole(role.id)}：${ids.map((id) => dataset.fields.find((field) => field.id === id)?.label ?? id).join('、')}`,
        ];
  });
  return summaries.length === 0 ? DESIGNER_UI_TEXT.dataset.bindingNone : summaries.join('；');
}
