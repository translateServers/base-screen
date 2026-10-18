import type { ScreenDatasetDefinition, ScreenHostResourceParameter } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { attachDesignerDateField } from '../designer-date-field-dom.js';
import { createDesignerInput, createDesignerSelect } from '../designer-ui-primitives.js';
import type { DesignerDatasetConfigurationOptions } from './designer-dataset-types.js';

export function variableControl(
  ownerDocument: Document,
  parameterName: string,
  parameterLabel: string,
  draft: Extract<ScreenHostResourceParameter, { readonly kind: 'variable' }>,
  options: DesignerDatasetConfigurationOptions,
): HTMLSelectElement {
  const variable = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataset.parameterVariableLabel(parameterLabel),
    options: [
      {
        label: DESIGNER_UI_TEXT.dataset.selectVariable,
        selected: draft.variableId === '',
        value: '',
      },
      ...options.variables.map((item) => ({
        label: item.name,
        selected: draft.variableId === item.id,
        value: item.id,
      })),
    ],
    value: draft.variableId,
  });
  variable.dataset.datasetParameter = parameterName;
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
): HTMLElement {
  const parameter = descriptor.parameters.find((item) => item.name === name)!;
  const input = createDesignerInput(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataset.parameterValueLabel(parameter.label),
    appearance: parameter.valueType === 'number' ? 'number' : 'text',
    ...(parameter.valueType === 'boolean' ? { type: 'checkbox' } : {}),
    ...(parameter.valueType === 'date'
      ? { placeholder: DESIGNER_UI_TEXT.dataset.parameterDatePlaceholder }
      : {}),
    ...(parameter.minimum === undefined ? {} : { min: parameter.minimum }),
    ...(parameter.maximum === undefined ? {} : { max: parameter.maximum }),
  });
  input.dataset.datasetParameter = parameter.name;
  setParameterControlValue(input, parameter, draft);
  input.required = parameter.required;
  if (parameter.maxLength !== undefined) input.maxLength = parameter.maxLength;
  // 日期参数原样保留输入框为值载体，只把「输入 + 触发器 + 自绘日历」装进同一外壳。
  if (parameter.valueType === 'date') {
    return attachDesignerDateField(input, { label: parameter.label }).element;
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
