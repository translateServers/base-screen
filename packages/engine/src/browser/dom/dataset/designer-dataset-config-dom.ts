import type { ScreenDatasetDescriptor } from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { isDesignerDatasetBindingValid } from './designer-dataset-binding.js';
import {
  appendOption,
  configSection,
  parameterControl,
  renderActions,
  variableControl,
} from './designer-dataset-config-controls.js';
import type {
  DesignerDatasetConfigurationOptions,
  DesignerDatasetDraftView,
} from './designer-dataset-types.js';

export function renderDesignerDatasetConfiguration(
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const details = options.panel.ownerDocument.createElement('div');
  details.dataset.datasetDescriptor = 'true';
  details.className = 'designer-dataset-descriptor';
  details.appendChild(
    renderDatasetSummary(details.ownerDocument, options.descriptor, options.roles, options.draft),
  );
  details.appendChild(renderParameters(details.ownerDocument, options));
  details.appendChild(renderBindings(details.ownerDocument, options));
  details.appendChild(
    renderActions(
      details.ownerDocument,
      !options.resourceAvailable,
      isDesignerDatasetBindingValid(options.descriptor, options.draft, options.roles),
    ),
  );
  return details;
}

function renderDatasetSummary(
  ownerDocument: Document,
  descriptor: ScreenDatasetDescriptor,
  roles: readonly ScreenDataBindingRole[],
  draft: DesignerDatasetDraftView | undefined,
): HTMLElement {
  const summary = ownerDocument.createElement('section');
  summary.className = 'designer-dataset-summary';
  summary.dataset.workbenchSection = 'source';
  summary.dataset.inspectorSearchSection = 'true';
  summary.tabIndex = -1;
  const header = ownerDocument.createElement('div');
  header.className = 'designer-dataset-summary-header';
  const title = ownerDocument.createElement('span');
  title.className = 'designer-dataset-summary-title';
  const eyebrow = ownerDocument.createElement('small');
  eyebrow.textContent = DESIGNER_UI_TEXT.dataset.currentDataset;
  const name = ownerDocument.createElement('strong');
  name.textContent = descriptor.name;
  title.append(eyebrow, name);
  const change = ownerDocument.createElement('button');
  change.type = 'button';
  change.className = 'designer-control designer-button';
  change.dataset.datasetChange = 'true';
  change.textContent = DESIGNER_UI_TEXT.dataset.change;
  header.append(title, change);
  summary.appendChild(header);
  if (descriptor.description !== null && descriptor.description.length > 0) {
    const description = ownerDocument.createElement('p');
    description.className = 'designer-dataset-description';
    description.textContent = descriptor.description;
    summary.appendChild(description);
  }
  const shape = ownerDocument.createElement('span');
  shape.className = 'designer-dataset-shape';
  shape.textContent = DESIGNER_UI_TEXT.dataset.tabularShape;
  summary.appendChild(shape);
  const bindingSummary = ownerDocument.createElement('div');
  bindingSummary.className = 'designer-dataset-binding-summary';
  const bindingHeader = ownerDocument.createElement('div');
  bindingHeader.className = 'designer-dataset-binding-summary-header';
  const bindingTitle = ownerDocument.createElement('strong');
  bindingTitle.textContent = DESIGNER_UI_TEXT.dataset.bindingSummaryTitle;
  const bindings = roles.flatMap((role) => {
    const selected = draft?.fields[role.id] ?? [];
    if (selected.length === 0) return [];
    return [
      {
        role: DESIGNER_UI_TEXT.dataset.bindingRole(role.id),
        fields: selected.map(
          (id) => descriptor.fields.find((field) => field.id === id)?.label ?? id,
        ),
      },
    ];
  });
  const bindingCount = ownerDocument.createElement('span');
  bindingCount.textContent = DESIGNER_UI_TEXT.dataset.selectedFields(
    bindings.reduce((count, binding) => count + binding.fields.length, 0),
  );
  bindingHeader.append(bindingTitle, bindingCount);
  bindingSummary.appendChild(bindingHeader);
  if (bindings.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-dataset-binding-summary-empty';
    empty.textContent = DESIGNER_UI_TEXT.dataset.bindingNone;
    bindingSummary.appendChild(empty);
  }
  for (const binding of bindings) {
    bindingSummary.appendChild(renderBindingSummaryItem(ownerDocument, binding));
  }
  summary.appendChild(bindingSummary);
  const schema = ownerDocument.createElement('ul');
  schema.className = 'designer-dataset-schema';
  for (const field of descriptor.fields) {
    const item = ownerDocument.createElement('li');
    item.className = 'designer-field-label';
    item.textContent = field.label;
    schema.appendChild(item);
  }
  summary.appendChild(schema);
  return summary;
}

function renderBindingSummaryItem(
  ownerDocument: Document,
  binding: { readonly role: string; readonly fields: readonly string[] },
): HTMLDetailsElement {
  const details = ownerDocument.createElement('details');
  details.className = 'designer-dataset-binding-summary-item';
  const disclosure = ownerDocument.createElement('summary');
  disclosure.className = 'designer-dataset-binding-summary-disclosure';
  const preview = ownerDocument.createElement('span');
  preview.className = 'designer-dataset-binding-summary-preview';
  const role = ownerDocument.createElement('span');
  role.className = 'designer-dataset-binding-summary-role';
  role.textContent = binding.role;
  role.title = binding.role;
  const fields = ownerDocument.createElement('span');
  fields.className = 'designer-dataset-binding-summary-value';
  fields.textContent = binding.fields.join('、');
  fields.title = binding.fields.join('、');
  preview.append(role, fields);
  disclosure.appendChild(preview);
  disclosure.setAttribute('aria-label', `${binding.role}：${binding.fields.join('、')}`);

  const expanded = ownerDocument.createElement('div');
  expanded.className = 'designer-dataset-binding-summary-expanded';
  const fieldList = ownerDocument.createElement('ul');
  fieldList.className = 'designer-dataset-binding-summary-fields';
  for (const field of binding.fields) {
    const label = ownerDocument.createElement('li');
    label.textContent = field;
    fieldList.appendChild(label);
  }
  expanded.appendChild(fieldList);
  details.append(disclosure, expanded);
  return details;
}

function renderParameters(
  ownerDocument: Document,
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const section = configSection(
    ownerDocument,
    DESIGNER_UI_TEXT.dataSource.requestTitle,
    'parameters',
  );
  if (options.descriptor.parameters.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataset.noParameters;
    section.appendChild(empty);
  }
  for (const parameter of options.descriptor.parameters) {
    const draft = options.draft?.params[parameter.name];
    const label = ownerDocument.createElement('label');
    label.className = 'designer-field designer-dataset-parameter';
    const labelText = ownerDocument.createElement('span');
    labelText.className = 'designer-field-label';
    labelText.textContent = parameter.label;
    const controls = ownerDocument.createElement('span');
    controls.className = 'designer-dataset-parameter-controls';
    const mode = ownerDocument.createElement('select');
    mode.className = 'designer-control designer-select';
    mode.dataset.datasetParameterMode = parameter.name;
    mode.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.parameterModeLabel(parameter.label));
    appendOption(mode, 'literal', DESIGNER_UI_TEXT.dataset.literal, draft?.kind !== 'variable');
    appendOption(mode, 'variable', DESIGNER_UI_TEXT.dataset.variable, draft?.kind === 'variable');
    controls.appendChild(mode);
    if (draft?.kind === 'variable') {
      controls.appendChild(
        variableControl(ownerDocument, parameter.name, parameter.label, draft, options),
      );
    } else {
      controls.appendChild(
        parameterControl(ownerDocument, options.descriptor, parameter.name, draft),
      );
    }
    label.append(labelText, controls);
    section.appendChild(label);
  }
  return section;
}

function renderBindings(
  ownerDocument: Document,
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const section = configSection(ownerDocument, DESIGNER_UI_TEXT.dataset.binding, 'mapping');
  if (options.roles.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataset.noBinding;
    section.appendChild(empty);
  }
  for (const role of options.roles) {
    section.appendChild(renderBindingRole(ownerDocument, options.descriptor, role, options.draft));
  }
  return section;
}

function renderBindingRole(
  ownerDocument: Document,
  descriptor: ScreenDatasetDescriptor,
  role: ScreenDataBindingRole,
  draft: DesignerDatasetDraftView | undefined,
): HTMLElement {
  const roleSection = ownerDocument.createElement('div');
  roleSection.className = 'designer-dataset-binding-role';
  roleSection.dataset.datasetBindingRole = role.id;
  const roleHeading = ownerDocument.createElement('div');
  roleHeading.className = 'designer-dataset-binding-heading';
  const roleName = ownerDocument.createElement('strong');
  roleName.textContent = DESIGNER_UI_TEXT.dataset.bindingRole(role.id);
  const selected = draft?.fields[role.id] ?? [];
  const roleCount = ownerDocument.createElement('span');
  roleCount.textContent = DESIGNER_UI_TEXT.dataset.selectedFields(selected.length);
  roleHeading.append(roleName, roleCount);
  const hint = ownerDocument.createElement('p');
  hint.className = 'designer-dataset-binding-hint';
  hint.textContent = DESIGNER_UI_TEXT.dataset.bindingHint(role.minFields, role.maxFields);
  const fieldList = ownerDocument.createElement('div');
  fieldList.className = 'designer-dataset-field-list';
  fieldList.setAttribute('role', 'group');
  fieldList.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.bindingRole(role.id));
  const compatibleFields = descriptor.fields.filter((field) =>
    role.valueTypes.includes(field.valueType),
  );
  if (role.maxFields === 1) {
    const select = ownerDocument.createElement('select');
    select.className = 'designer-control designer-select designer-dataset-binding-select';
    select.dataset.datasetBindingRole = role.id;
    select.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.bindingRole(role.id));
    appendOption(select, '', DESIGNER_UI_TEXT.dataset.selectField, selected.length === 0);
    for (const field of compatibleFields) {
      appendOption(
        select,
        field.id,
        `${field.label} · ${field.valueType}`,
        selected.includes(field.id),
      );
    }
    fieldList.appendChild(select);
  } else {
    const actions = ownerDocument.createElement('div');
    actions.className = 'designer-dataset-binding-role-actions';
    actions.append(
      bindingRoleAction(
        ownerDocument,
        role.id,
        'select-all',
        compatibleFields.length > role.maxFields
          ? DESIGNER_UI_TEXT.dataset.bindingSelectMaximum
          : DESIGNER_UI_TEXT.dataset.bindingSelectAll,
        selected.length === Math.min(compatibleFields.length, role.maxFields),
      ),
      bindingRoleAction(
        ownerDocument,
        role.id,
        'clear',
        DESIGNER_UI_TEXT.dataset.bindingClear,
        selected.length === 0,
      ),
    );
    roleHeading.appendChild(actions);
    for (const field of compatibleFields) {
      fieldList.appendChild(bindingField(ownerDocument, role.id, field, selected, role.maxFields));
    }
  }
  if (compatibleFields.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataset.noCompatibleFields;
    fieldList.appendChild(empty);
  }
  roleSection.append(roleHeading, hint, fieldList);
  return roleSection;
}

function bindingRoleAction(
  ownerDocument: Document,
  roleId: string,
  action: 'select-all' | 'clear',
  label: string,
  disabled = false,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button designer-dataset-binding-role-action';
  button.dataset.datasetBindingRoleAction = action;
  button.dataset.datasetBindingRoleId = roleId;
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

function bindingField(
  ownerDocument: Document,
  roleId: string,
  field: ScreenDatasetDescriptor['fields'][number],
  selected: readonly string[],
  maxFields: number,
): HTMLButtonElement {
  const isSelected = selected.includes(field.id);
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-dataset-field-option';
  button.dataset.datasetBindingRoleId = roleId;
  button.dataset.datasetBindingField = field.id;
  button.setAttribute('aria-pressed', String(isSelected));
  button.disabled = !isSelected && selected.length >= maxFields;
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field-label';
  label.textContent = field.label;
  const type = ownerDocument.createElement('small');
  type.textContent = field.valueType;
  button.append(label, type);
  return button;
}
