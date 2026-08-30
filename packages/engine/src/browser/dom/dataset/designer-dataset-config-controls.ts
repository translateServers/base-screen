import type { ScreenDatasetDescriptor, ScreenHostResourceParameter } from '@base-screen/contracts';
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
  appendOption(variable, '', DESIGNER_UI_TEXT.dataset.selectVariable, draft.name === '');
  for (const name of options.variableNames) {
    appendOption(variable, name, name, draft.name === name);
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
