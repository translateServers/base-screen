import type { ScreenTabularDataset } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import type { DesignerStaticDataView } from './designer-static-data-view.js';

export function renderAdvancedInput(ownerDocument: Document, value: string): HTMLElement {
  const label = ownerDocument.createElement('label');
  label.className = 'designer-field designer-data-source-static';
  const caption = ownerDocument.createElement('span');
  caption.className = 'designer-field-label';
  caption.textContent = DESIGNER_UI_TEXT.dataSource.staticValue;
  const textarea = ownerDocument.createElement('textarea');
  textarea.className = 'designer-control designer-textarea';
  textarea.dataset.dataSourceStatic = 'true';
  textarea.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.staticValue);
  textarea.value = value;
  label.append(caption, textarea);
  return label;
}

export function renderApply(ownerDocument: Document): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-dataset-actions';
  actions.appendChild(
    action(ownerDocument, 'apply', DESIGNER_UI_TEXT.dataSource.apply('static'), 'primary'),
  );
  return actions;
}

export function fieldInput(
  ownerDocument: Document,
  index: number,
  property: 'id' | 'label',
  value: string,
  label: string,
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.className = 'designer-control designer-input';
  input.dataset.staticFieldIndex = String(index);
  input.dataset.staticFieldProperty = property;
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

export function fieldType(
  ownerDocument: Document,
  index: number,
  value: string,
): HTMLSelectElement {
  const select = ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.staticFieldIndex = String(index);
  select.dataset.staticFieldProperty = 'valueType';
  select.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.staticFieldType);
  for (const type of ['string', 'number', 'boolean', 'date'])
    appendOption(select, type, type, value === type);
  return select;
}

export function fieldNullable(
  ownerDocument: Document,
  index: number,
  checked: boolean,
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.dataset.staticFieldIndex = String(index);
  input.dataset.staticFieldProperty = 'nullable';
  input.checked = checked;
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.staticFieldNullable);
  return input;
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
  button.title = label;
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
