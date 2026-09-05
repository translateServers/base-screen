import type { ScreenDatasetDefinition, ScreenHostResourceParameter } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDatasetConfigurationOptions } from './designer-dataset-types.js';

export function variableControl(
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
  appendOption(variable, '', DESIGNER_UI_TEXT.dataset.selectVariable, draft.variableId === '');
  for (const item of options.variables) {
    appendOption(variable, item.id, item.name, draft.variableId === item.id);
  }
  return variable;
}

export function configSection(ownerDocument: Document, title: string, step?: string): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.tabIndex = -1;
  section.className = 'designer-dataset-config-section';
  section.dataset.inspectorSearchSection = 'true';
  if (step !== undefined) section.dataset.workbenchSection = step;
  const heading = ownerDocument.createElement('h4');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

export function renderActions(
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

export function parameterControl(
  ownerDocument: Document,
  descriptor: ScreenDatasetDefinition,
  name: string,
  draft: ScreenHostResourceParameter | undefined,
): HTMLInputElement | HTMLTextAreaElement {
  const parameter = descriptor.parameters.find((item) => item.name === name)!;
  const input = ownerDocument.createElement('input');
  input.className = 'designer-control designer-input';
  input.dataset.datasetParameter = parameter.name;
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.parameterValueLabel(parameter.label));
  setParameterControlValue(input, parameter, draft);
  if (input instanceof HTMLInputElement) {
    if (parameter.valueType === 'number') input.type = 'number';
    if (parameter.valueType === 'boolean') input.type = 'checkbox';
    if (parameter.valueType === 'date')
      input.placeholder = DESIGNER_UI_TEXT.dataset.parameterDatePlaceholder;
    input.required = parameter.required;
    if (parameter.minimum !== undefined) input.min = String(parameter.minimum);
    if (parameter.maximum !== undefined) input.max = String(parameter.maximum);
    if (parameter.maxLength !== undefined) input.maxLength = parameter.maxLength;
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

export function appendOption(
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
  parameter: ScreenDatasetDefinition['parameters'][number],
  draft: ScreenHostResourceParameter | undefined,
): void {
  const value = draft?.kind === 'literal' ? draft.value : parameter.defaultValue;
  if (input instanceof HTMLInputElement && parameter.valueType === 'boolean') {
    input.checked = value === true;
    input.value = String(input.checked);
    return;
  }
  input.value = String(value ?? '');
}
