import {
  parseScreenTabularDataset,
  type ScreenDataBinding,
  type ScreenJsonValue,
  type ScreenTabularDataset,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialDataBindingRole,
  BaseScreenMaterialStaticDataDescriptor,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export interface DesignerStaticDataView {
  readonly ownerDocument: Document;
  readonly descriptor: BaseScreenMaterialStaticDataDescriptor | undefined;
  readonly value: ScreenJsonValue;
  readonly binding: ScreenDataBinding | undefined;
  readonly jsonDraft: string;
  readonly dialogOpen: boolean;
  readonly tab: 'table' | 'advanced';
  readonly page: number;
  readonly pasteDraft: string;
  readonly firstRowIsHeader: boolean;
  readonly roles: readonly BaseScreenMaterialDataBindingRole[];
}

export function renderDesignerStaticData(view: DesignerStaticDataView): HTMLElement {
  const ownerDocument = view.ownerDocument;
  const section = ownerDocument.createElement('section');
  section.className = 'designer-data-source-editor';
  const heading = ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.staticTitle;
  section.appendChild(heading);
  if (view.descriptor?.kind === 'scalar') {
    section.append(renderScalar(ownerDocument, view), renderApply(ownerDocument));
    return section;
  }
  if (view.descriptor?.kind !== 'tabular') {
    section.append(renderAdvancedInput(ownerDocument, view.jsonDraft), renderApply(ownerDocument));
    return section;
  }
  const parsed = parseScreenTabularDataset(view.value);
  const summary = ownerDocument.createElement('div');
  summary.className = 'designer-static-tabular-summary';
  const text = ownerDocument.createElement('strong');
  text.textContent = parsed.ok
    ? DESIGNER_UI_TEXT.dataSource.staticTabularSummary(
        parsed.value.fields.length,
        parsed.value.rows.length,
      )
    : DESIGNER_UI_TEXT.dataSource.staticInvalid;
  const roles = ownerDocument.createElement('small');
  roles.textContent = bindingSummary(view, parsed.ok ? parsed.value : undefined);
  const edit = ownerDocument.createElement('button');
  edit.type = 'button';
  edit.className = 'designer-control designer-button';
  edit.dataset.staticAction = 'open';
  edit.textContent = DESIGNER_UI_TEXT.dataSource.staticTabularEdit;
  summary.append(text, roles, edit);
  section.append(
    summary,
    renderStaticDialog(ownerDocument, view, parsed.ok ? parsed.value : undefined),
  );
  return section;
}

function renderScalar(ownerDocument: Document, view: DesignerStaticDataView): HTMLElement {
  const label = ownerDocument.createElement('label');
  label.className = 'designer-field';
  const caption = ownerDocument.createElement('span');
  caption.className = 'designer-field-label';
  const descriptor = view.descriptor;
  if (descriptor?.kind !== 'scalar') return label;
  caption.textContent =
    descriptor.valueType === 'string'
      ? DESIGNER_UI_TEXT.dataSource.staticScalarString
      : descriptor.valueType === 'number'
        ? DESIGNER_UI_TEXT.dataSource.staticScalarNumber
        : DESIGNER_UI_TEXT.dataSource.staticScalarBoolean;
  const input =
    descriptor.valueType === 'string' && descriptor.multiline === true
      ? ownerDocument.createElement('textarea')
      : ownerDocument.createElement('input');
  input.className =
    input instanceof HTMLTextAreaElement
      ? 'designer-control designer-textarea'
      : 'designer-control designer-input';
  input.dataset.staticScalar = descriptor.valueType;
  if (input instanceof HTMLInputElement && descriptor.valueType === 'number') input.type = 'number';
  if (input instanceof HTMLInputElement && descriptor.valueType === 'boolean') {
    input.type = 'checkbox';
    input.checked = view.value === true;
  } else {
    input.value = String(view.value ?? '');
  }
  label.append(caption, input);
  return label;
}

function renderStaticDialog(
  ownerDocument: Document,
  view: DesignerStaticDataView,
  dataset: ScreenTabularDataset | undefined,
): HTMLDialogElement {
  const dialog = ownerDocument.createElement('dialog');
  dialog.className = 'designer-static-data-dialog';
  dialog.dataset.staticDialog = 'true';
  dialog.open = view.dialogOpen;
  const header = ownerDocument.createElement('header');
  const title = ownerDocument.createElement('h3');
  title.textContent = DESIGNER_UI_TEXT.dataSource.staticDialogTitle;
  const close = action(ownerDocument, 'cancel', DESIGNER_UI_TEXT.dataSource.staticCancel);
  header.append(title, close);
  const tabs = ownerDocument.createElement('div');
  tabs.className = 'designer-static-data-tabs';
  tabs.append(
    tab(ownerDocument, 'table', DESIGNER_UI_TEXT.dataSource.staticForm, view.tab === 'table'),
    tab(
      ownerDocument,
      'advanced',
      DESIGNER_UI_TEXT.dataSource.staticAdvanced,
      view.tab === 'advanced',
    ),
  );
  const content = ownerDocument.createElement('div');
  content.className = 'designer-static-data-content';
  if (view.tab === 'advanced' || dataset === undefined) {
    content.appendChild(renderAdvancedInput(ownerDocument, view.jsonDraft));
  } else {
    content.append(
      renderPaste(ownerDocument, view),
      renderFields(ownerDocument, dataset),
      renderBindings(ownerDocument, view, dataset),
      renderRows(ownerDocument, dataset, view.page),
    );
  }
  const footer = ownerDocument.createElement('footer');
  footer.append(
    action(ownerDocument, 'restore', DESIGNER_UI_TEXT.dataSource.staticRestore),
    action(ownerDocument, 'cancel', DESIGNER_UI_TEXT.dataSource.staticCancel),
    action(ownerDocument, 'apply', DESIGNER_UI_TEXT.dataSource.apply('static'), 'primary'),
  );
  dialog.append(header, tabs, content, footer);
  return dialog;
}

function renderPaste(ownerDocument: Document, view: DesignerStaticDataView): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-static-paste';
  const heading = ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.staticPaste;
  const textarea = ownerDocument.createElement('textarea');
  textarea.className = 'designer-control designer-textarea';
  textarea.dataset.staticPaste = 'true';
  textarea.placeholder = DESIGNER_UI_TEXT.dataSource.staticPasteHint;
  textarea.value = view.pasteDraft;
  const label = ownerDocument.createElement('label');
  label.className = 'designer-checkbox';
  const checkbox = ownerDocument.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.staticFirstRowHeader = 'true';
  checkbox.checked = view.firstRowIsHeader;
  label.append(checkbox, DESIGNER_UI_TEXT.dataSource.staticFirstRowHeader);
  section.append(
    heading,
    textarea,
    label,
    action(ownerDocument, 'paste', DESIGNER_UI_TEXT.dataSource.staticPastePreview),
  );
  return section;
}

function renderFields(ownerDocument: Document, dataset: ScreenTabularDataset): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-static-fields';
  const heading = ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.staticFields;
  section.appendChild(heading);
  dataset.fields.forEach((field, index) => {
    const row = ownerDocument.createElement('div');
    row.className = 'designer-static-field-row';
    row.append(
      fieldInput(ownerDocument, index, 'id', field.id, DESIGNER_UI_TEXT.dataSource.staticFieldId),
      fieldInput(
        ownerDocument,
        index,
        'label',
        field.label,
        DESIGNER_UI_TEXT.dataSource.staticFieldLabel,
      ),
      fieldType(ownerDocument, index, field.valueType),
      fieldNullable(ownerDocument, index, field.nullable === true),
      indexedAction(ownerDocument, 'field-up', index, DESIGNER_UI_TEXT.descriptor.moveUp),
      indexedAction(ownerDocument, 'field-down', index, DESIGNER_UI_TEXT.descriptor.moveDown),
      indexedAction(
        ownerDocument,
        'field-remove',
        index,
        DESIGNER_UI_TEXT.dataSource.staticRemoveField,
      ),
    );
    section.appendChild(row);
  });
  section.appendChild(
    action(ownerDocument, 'field-add', DESIGNER_UI_TEXT.dataSource.staticAddField),
  );
  return section;
}

function renderBindings(
  ownerDocument: Document,
  view: DesignerStaticDataView,
  dataset: ScreenTabularDataset,
): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-static-bindings';
  const heading = ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataset.binding;
  section.appendChild(heading);
  for (const role of view.roles) {
    const roleSection = ownerDocument.createElement('div');
    roleSection.className = 'designer-dataset-binding-role';
    const title = ownerDocument.createElement('strong');
    title.textContent = DESIGNER_UI_TEXT.dataset.bindingRole(role.id);
    const selected = view.binding?.fields[role.id] ?? [];
    const compatible = dataset.fields.filter((field) => role.valueTypes.includes(field.valueType));
    const select = ownerDocument.createElement('select');
    select.className = 'designer-control designer-select';
    select.dataset.staticBindingRole = role.id;
    select.multiple = role.maxFields > 1;
    if (role.maxFields === 1) appendOption(select, '', DESIGNER_UI_TEXT.dataset.selectField, false);
    for (const field of compatible) {
      appendOption(
        select,
        field.id,
        `${field.label} · ${field.valueType}`,
        selected.includes(field.id),
      );
    }
    if (role.maxFields > 1) {
      const actions = ownerDocument.createElement('span');
      actions.append(
        roleAction(ownerDocument, role.id, 'select-all', DESIGNER_UI_TEXT.dataset.bindingSelectAll),
        roleAction(ownerDocument, role.id, 'clear', DESIGNER_UI_TEXT.dataset.bindingClear),
      );
      roleSection.append(title, actions, select);
    } else {
      roleSection.append(title, select);
    }
    section.appendChild(roleSection);
  }
  return section;
}

function renderRows(
  ownerDocument: Document,
  dataset: ScreenTabularDataset,
  page: number,
): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-static-rows';
  const heading = ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.staticRows;
  const table = ownerDocument.createElement('table');
  const head = ownerDocument.createElement('thead');
  const headRow = ownerDocument.createElement('tr');
  dataset.fields.forEach((field) => {
    const cell = ownerDocument.createElement('th');
    cell.textContent = field.label;
    headRow.appendChild(cell);
  });
  headRow.appendChild(ownerDocument.createElement('th'));
  head.appendChild(headRow);
  const body = ownerDocument.createElement('tbody');
  const pages = Math.max(1, Math.ceil(dataset.rows.length / 100));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  dataset.rows.slice(safePage * 100, safePage * 100 + 100).forEach((row, offset) => {
    const rowIndex = safePage * 100 + offset;
    const tr = ownerDocument.createElement('tr');
    dataset.fields.forEach((field) => {
      const td = ownerDocument.createElement('td');
      const input = ownerDocument.createElement('input');
      input.className = 'designer-control designer-input';
      input.dataset.staticCellRow = String(rowIndex);
      input.dataset.staticCellField = field.id;
      input.value =
        row[field.id] === null || row[field.id] === undefined ? '' : String(row[field.id]);
      td.appendChild(input);
      tr.appendChild(td);
    });
    const actions = ownerDocument.createElement('td');
    actions.appendChild(
      indexedAction(
        ownerDocument,
        'row-remove',
        rowIndex,
        DESIGNER_UI_TEXT.dataSource.staticRemoveRow,
      ),
    );
    tr.appendChild(actions);
    body.appendChild(tr);
  });
  table.append(head, body);
  const pagination = ownerDocument.createElement('div');
  pagination.className = 'designer-static-pagination';
  const pageText = ownerDocument.createElement('span');
  pageText.textContent = DESIGNER_UI_TEXT.dataSource.staticPage(safePage + 1, pages);
  const previous = action(
    ownerDocument,
    'page-previous',
    DESIGNER_UI_TEXT.dataSource.staticPreviousPage,
  );
  previous.toggleAttribute('disabled', safePage === 0);
  const next = action(ownerDocument, 'page-next', DESIGNER_UI_TEXT.dataSource.staticNextPage);
  next.toggleAttribute('disabled', safePage >= pages - 1);
  pagination.append(previous, pageText, next);
  section.append(
    heading,
    table,
    action(ownerDocument, 'row-add', DESIGNER_UI_TEXT.dataSource.staticAddRow),
    pagination,
  );
  return section;
}

function renderAdvancedInput(ownerDocument: Document, value: string): HTMLElement {
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

function renderApply(ownerDocument: Document): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-dataset-actions';
  actions.appendChild(
    action(ownerDocument, 'apply', DESIGNER_UI_TEXT.dataSource.apply('static'), 'primary'),
  );
  return actions;
}

function fieldInput(
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

function fieldType(ownerDocument: Document, index: number, value: string): HTMLSelectElement {
  const select = ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.staticFieldIndex = String(index);
  select.dataset.staticFieldProperty = 'valueType';
  select.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.staticFieldType);
  for (const type of ['string', 'number', 'boolean', 'date'])
    appendOption(select, type, type, value === type);
  return select;
}

function fieldNullable(ownerDocument: Document, index: number, checked: boolean): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.dataset.staticFieldIndex = String(index);
  input.dataset.staticFieldProperty = 'nullable';
  input.checked = checked;
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.staticFieldNullable);
  return input;
}

function tab(
  ownerDocument: Document,
  value: string,
  label: string,
  selected: boolean,
): HTMLButtonElement {
  const button = action(ownerDocument, `tab-${value}`, label);
  button.setAttribute('aria-pressed', String(selected));
  return button;
}

function action(
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

function indexedAction(
  ownerDocument: Document,
  value: string,
  index: number,
  label: string,
): HTMLButtonElement {
  const button = action(ownerDocument, value, label);
  button.dataset.staticIndex = String(index);
  return button;
}

function roleAction(
  ownerDocument: Document,
  role: string,
  value: string,
  label: string,
): HTMLButtonElement {
  const button = action(ownerDocument, `binding-${value}`, label);
  button.dataset.staticBindingRole = role;
  return button;
}

function appendOption(
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

function bindingSummary(
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
