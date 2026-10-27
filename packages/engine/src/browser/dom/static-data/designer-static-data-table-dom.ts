import type { ScreenTabularDataset } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import { createDesignerInput, createDesignerSelect } from '../designer-ui-primitives.js';
import {
  action,
  indexedAction,
  paginationAction,
  roleAction,
} from './designer-static-data-controls.js';
import {
  DESIGNER_STATIC_PAGE_SIZE_OPTIONS,
  resolveDesignerStaticDataPagination,
} from './designer-static-data-pagination.js';
import type { DesignerStaticDataView } from './designer-static-data-view.js';

export function renderBindings(
  ownerDocument: Document,
  view: DesignerStaticDataView,
  dataset: ScreenTabularDataset,
): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-static-bindings';
  for (const role of view.roles) {
    const roleSection = ownerDocument.createElement('div');
    roleSection.className = 'designer-dataset-binding-role';
    roleSection.dataset.staticBindingRoleContainer = role.id;
    const roleHeading = ownerDocument.createElement('div');
    roleHeading.className = 'designer-dataset-binding-heading';
    const title = ownerDocument.createElement('strong');
    title.textContent = DESIGNER_UI_TEXT.dataset.bindingRole(role.id);
    const selected = view.binding?.fields[role.id] ?? [];
    const selectedCount = ownerDocument.createElement('span');
    selectedCount.textContent = DESIGNER_UI_TEXT.dataset.selectedFields(selected.length);
    roleHeading.append(title, selectedCount);
    const compatible = dataset.fields.filter((field) => role.valueTypes.includes(field.valueType));
    const hint = ownerDocument.createElement('p');
    hint.className = 'designer-dataset-binding-hint';
    hint.textContent = DESIGNER_UI_TEXT.dataset.bindingHint(role.minFields, role.maxFields);
    const fieldList = ownerDocument.createElement('div');
    fieldList.className = 'designer-dataset-field-list';
    fieldList.setAttribute('role', 'group');
    fieldList.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.bindingRole(role.id));
    if (role.maxFields === 1) {
      const select = createDesignerSelect(ownerDocument, {
        ariaLabel: DESIGNER_UI_TEXT.dataset.bindingRole(role.id),
        className: 'designer-dataset-binding-select',
        options: [
          {
            label: DESIGNER_UI_TEXT.dataset.selectField,
            selected: selected.length === 0,
            value: '',
          },
          ...compatible.map((field) => ({
            label: `${field.label} · ${field.valueType}`,
            selected: selected.includes(field.id),
            value: field.id,
          })),
        ],
        value: selected[0] ?? '',
      });
      select.dataset.staticBindingRole = role.id;
      fieldList.appendChild(enhanceDesignerSelect(select).element);
    } else {
      const actions = ownerDocument.createElement('div');
      actions.className = 'designer-dataset-binding-role-actions';
      actions.append(
        roleAction(
          ownerDocument,
          role.id,
          'select-all',
          compatible.length > role.maxFields
            ? DESIGNER_UI_TEXT.dataset.bindingSelectMaximum
            : DESIGNER_UI_TEXT.dataset.bindingSelectAll,
          selected.length === Math.min(compatible.length, role.maxFields),
        ),
        roleAction(
          ownerDocument,
          role.id,
          'clear',
          DESIGNER_UI_TEXT.dataset.bindingClear,
          selected.length === 0,
        ),
      );
      roleHeading.appendChild(actions);
      for (const field of compatible) {
        fieldList.appendChild(
          staticBindingField(ownerDocument, role.id, field, selected, role.maxFields),
        );
      }
    }
    if (compatible.length === 0) {
      const empty = ownerDocument.createElement('p');
      empty.className = 'designer-empty-state';
      empty.textContent = DESIGNER_UI_TEXT.dataset.noCompatibleFields;
      fieldList.appendChild(empty);
    }
    roleSection.append(roleHeading, hint, fieldList);
    section.appendChild(roleSection);
  }
  return section;
}

function staticBindingField(
  ownerDocument: Document,
  roleId: string,
  field: ScreenTabularDataset['fields'][number],
  selected: readonly string[],
  maxFields: number,
): HTMLButtonElement {
  const isSelected = selected.includes(field.id);
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-dataset-field-option';
  button.dataset.staticBindingRole = roleId;
  button.dataset.staticBindingField = field.id;
  button.setAttribute('aria-pressed', String(isSelected));
  button.disabled = !isSelected && selected.length >= maxFields;
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field-label-text';
  label.textContent = field.label;
  const type = ownerDocument.createElement('small');
  type.textContent = field.valueType;
  button.append(label, type);
  return button;
}

export function renderRows(
  ownerDocument: Document,
  dataset: ScreenTabularDataset,
  page: number,
  pageSize: number,
  scrollScope?: string,
): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-static-rows';
  if (scrollScope !== undefined) {
    section.dataset.designerScrollScope = `static-rows:${scrollScope}`;
  }
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
  const paginationState = resolveDesignerStaticDataPagination(dataset.rows.length, page, pageSize);
  dataset.rows.slice(paginationState.start, paginationState.end).forEach((row, offset) => {
    const rowIndex = paginationState.start + offset;
    const tr = ownerDocument.createElement('tr');
    dataset.fields.forEach((field) => {
      const td = ownerDocument.createElement('td');
      const input = createDesignerInput(ownerDocument, {
        value: row[field.id] === null || row[field.id] === undefined ? '' : String(row[field.id]),
      });
      input.dataset.staticCellRow = String(rowIndex);
      input.dataset.staticCellField = field.id;
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
  const footer = ownerDocument.createElement('footer');
  footer.className = 'designer-static-rows-footer';
  const pagination = ownerDocument.createElement('nav');
  pagination.className = 'designer-static-pagination';
  pagination.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.staticPagination);
  // 行数选择器是分页条里的紧凑控件：保持原生外观（自绘触发器会占满整格），
  // 但仍走统一原语产出的 class 与选项构造。
  const pageSizeSelect = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataSource.staticRowsPerPage,
    options: DESIGNER_STATIC_PAGE_SIZE_OPTIONS.map((option) => ({
      label: DESIGNER_UI_TEXT.dataSource.staticRowsPerPageOption(option),
      selected: option === paginationState.pageSize,
      value: String(option),
    })),
    value: String(paginationState.pageSize),
  });
  pageSizeSelect.dataset.staticPageSize = 'true';
  const pageText = ownerDocument.createElement('span');
  pageText.className = 'designer-static-page-status';
  pageText.textContent = DESIGNER_UI_TEXT.dataSource.staticPage(
    paginationState.page + 1,
    paginationState.pages,
  );
  const previous = paginationAction(
    ownerDocument,
    'page-previous',
    DESIGNER_UI_TEXT.dataSource.staticPreviousPage,
    'chevron-left',
  );
  previous.toggleAttribute('disabled', paginationState.page === 0);
  const next = paginationAction(
    ownerDocument,
    'page-next',
    DESIGNER_UI_TEXT.dataSource.staticNextPage,
    'chevron-right',
  );
  next.toggleAttribute('disabled', paginationState.page >= paginationState.pages - 1);
  pagination.append(pageSizeSelect, previous, pageText, next);
  footer.append(
    action(ownerDocument, 'row-add', DESIGNER_UI_TEXT.dataSource.staticAddRow),
    pagination,
  );
  section.append(heading, table, footer);
  return section;
}
