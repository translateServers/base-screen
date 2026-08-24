import type { ScreenDatasetDescriptor, ScreenHostResourceParameter } from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { isDesignerDatasetBindingValid } from './designer-dataset-binding.js';
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
  const header = ownerDocument.createElement('div');
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
  const bindingTitle = ownerDocument.createElement('strong');
  bindingTitle.textContent = DESIGNER_UI_TEXT.dataset.bindingSummaryTitle;
  const bindingText = ownerDocument.createElement('p');
  const labels = roles.flatMap((role) => {
    const selected = draft?.fields[role.id] ?? [];
    return selected.length === 0
      ? []
      : [
          `${DESIGNER_UI_TEXT.dataset.bindingRole(role.id)}：${selected
            .map((id) => descriptor.fields.find((field) => field.id === id)?.label ?? id)
            .join('、')}`,
        ];
  });
  bindingText.textContent =
    labels.length === 0 ? DESIGNER_UI_TEXT.dataset.bindingNone : labels.join('；');
  bindingSummary.append(bindingTitle, bindingText);
  summary.appendChild(bindingSummary);
  const schema = ownerDocument.createElement('ul');
  schema.className = 'designer-dataset-schema';
  for (const field of descriptor.fields) {
    const item = ownerDocument.createElement('li');
    item.textContent = field.label;
    schema.appendChild(item);
  }
  summary.appendChild(schema);
  return summary;
}

function renderParameters(
  ownerDocument: Document,
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const section = configSection(ownerDocument, DESIGNER_UI_TEXT.dataset.parameters);
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

function variableControl(
  ownerDocument: Document,
  parameterName: string,
  parameterLabel: string,
  draft: Extract<ScreenHostResourceParameter, { readonly kind: 'variable' }>,
  options: DesignerDatasetConfigurationOptions,
): HTMLSelectElement {
  const variable = ownerDocument.createElement('select');
  variable.className = 'designer-control designer-select';
  variable.dataset.datasetParameter = parameterName;
  variable.setAttribute(
    'aria-label',
    DESIGNER_UI_TEXT.dataset.parameterVariableLabel(parameterLabel),
  );
  appendOption(variable, '', DESIGNER_UI_TEXT.dataset.selectVariable, draft.name === '');
  for (const name of options.variableNames) {
    appendOption(variable, name, name, draft.name === name);
  }
  return variable;
}

function renderBindings(
  ownerDocument: Document,
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const section = configSection(ownerDocument, DESIGNER_UI_TEXT.dataset.binding);
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
        DESIGNER_UI_TEXT.dataset.bindingSelectAll,
      ),
      bindingRoleAction(ownerDocument, role.id, 'clear', DESIGNER_UI_TEXT.dataset.bindingClear),
    );
    roleHeading.appendChild(actions);
    for (const field of compatibleFields) {
      fieldList.appendChild(bindingField(ownerDocument, role.id, field, selected));
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
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button designer-dataset-binding-role-action';
  button.dataset.datasetBindingRoleAction = action;
  button.dataset.datasetBindingRoleId = roleId;
  button.textContent = label;
  return button;
}

function bindingField(
  ownerDocument: Document,
  roleId: string,
  field: ScreenDatasetDescriptor['fields'][number],
  selected: readonly string[],
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-dataset-field-option';
  button.dataset.datasetBindingRoleId = roleId;
  button.dataset.datasetBindingField = field.id;
  button.setAttribute('aria-pressed', String(selected.includes(field.id)));
  const label = ownerDocument.createElement('span');
  label.textContent = field.label;
  button.appendChild(label);
  return button;
}

function configSection(ownerDocument: Document, title: string): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-dataset-config-section';
  const heading = ownerDocument.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function renderActions(
  ownerDocument: Document,
  resourceUnavailable: boolean,
  bindingValid: boolean,
): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-dataset-actions';
  actions.append(
    actionButton(
      ownerDocument,
      'apply',
      DESIGNER_UI_TEXT.dataSource.apply('dataset'),
      resourceUnavailable || !bindingValid,
      'primary',
    ),
    actionButton(
      ownerDocument,
      'refresh',
      DESIGNER_UI_TEXT.dataset.refresh,
      resourceUnavailable,
      'ghost',
    ),
  );
  return actions;
}

function parameterControl(
  ownerDocument: Document,
  descriptor: ScreenDatasetDescriptor,
  name: string,
  draft: ScreenHostResourceParameter | undefined,
): HTMLInputElement | HTMLTextAreaElement {
  const parameter = descriptor.parameters.find((item) => item.name === name)!;
  const input =
    parameter.editor === 'json'
      ? ownerDocument.createElement('textarea')
      : ownerDocument.createElement('input');
  input.className =
    parameter.editor === 'json'
      ? 'designer-control designer-textarea'
      : 'designer-control designer-input';
  input.dataset.datasetParameter = parameter.name;
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.parameterValueLabel(parameter.label));
  setParameterControlValue(input, parameter, draft);
  if (input instanceof HTMLInputElement) {
    if (parameter.editor === 'number') input.type = 'number';
    if (parameter.editor === 'boolean') input.type = 'checkbox';
    if (parameter.editor === 'date') input.type = 'date';
  }
  return input;
}

function actionButton(
  ownerDocument: Document,
  action: string,
  text: string,
  disabled: boolean,
  variant: 'primary' | 'ghost',
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = action;
  button.dataset.variant = variant;
  button.textContent = text;
  button.disabled = disabled;
  return button;
}

function appendOption(
  select: HTMLSelectElement,
  value: string,
  text: string,
  selected: boolean,
): void {
  const option = select.ownerDocument.createElement('option');
  option.value = value;
  option.textContent = text;
  option.selected = selected;
  select.appendChild(option);
}

function setParameterControlValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  parameter: ScreenDatasetDescriptor['parameters'][number],
  draft: ScreenHostResourceParameter | undefined,
): void {
  const value = draft?.kind === 'literal' ? draft.value : parameter.defaultValue;
  if (input instanceof HTMLInputElement && parameter.editor === 'boolean') {
    input.checked = value === true;
    input.value = String(input.checked);
    return;
  }
  input.value = parameter.editor === 'json' ? JSON.stringify(value ?? null) : String(value ?? '');
}
