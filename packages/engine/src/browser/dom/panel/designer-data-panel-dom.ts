import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  type DesignerDescriptorDatasetFields,
  renderDesignerDescriptorZone,
} from '../descriptor/designer-descriptor-dom.js';
import { appendDesignerFieldMessage } from '../designer-ui-primitives.js';
import { dataCapabilities, listDataResourceTypes } from './designer-data-source-model.js';

export function renderDesignerDataPanel(
  panel: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  hostResourceAvailable: boolean,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
): void {
  if (panel === undefined) return;
  panel.replaceChildren();
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const capabilities = dataCapabilities(
    component,
    catalog,
    hostResourceAvailable,
    runtimeContributions,
  );
  if (component === undefined || capabilities === undefined || capabilities.length === 0) {
    panel.textContent = DESIGNER_UI_TEXT.dataPanelEmpty;
    return;
  }
  const source = component.dataSource;
  const type = source?.type ?? 'none';
  const label = panel.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = DESIGNER_UI_TEXT.propertiesPanel.dataSource;
  const select = panel.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.dataSourceType = 'true';
  for (const value of ['none', ...capabilities]) {
    const option = panel.ownerDocument.createElement('option');
    option.value = value;
    option.textContent =
      value === 'none'
        ? DESIGNER_UI_TEXT.propertiesPanel.none
        : DESIGNER_UI_TEXT.dataSource.mode(value);
    option.selected = value === type;
    select.appendChild(option);
  }
  label.appendChild(select);
  panel.appendChild(label);
  if (capabilities.includes('static')) {
    appendDataInput(
      panel,
      DESIGNER_UI_TEXT.propertiesPanel.value,
      'static',
      source?.type === 'static' ? JSON.stringify(source.value) : 'null',
    );
  }
  if (capabilities.includes('host-resource')) {
    appendResourceTypeField(panel, source, runtimeContributions);
    appendDataInput(
      panel,
      DESIGNER_UI_TEXT.propertiesPanel.resourceId,
      'resourceId',
      source?.type === 'host-resource' ? source.resourceId : '',
    );
    appendDataInput(
      panel,
      DESIGNER_UI_TEXT.propertiesPanel.params,
      'params',
      source?.type === 'host-resource' ? JSON.stringify(source.params) : '{}',
    );
  }
  if (capabilities.includes('variable')) {
    const variableLabel = panel.ownerDocument.createElement('label');
    variableLabel.className = 'designer-field designer-field-label';
    variableLabel.textContent = DESIGNER_UI_TEXT.dataset.selectVariable;
    const variableSelect = panel.ownerDocument.createElement('select');
    variableSelect.className = 'designer-control designer-select';
    variableSelect.dataset.dataSourceField = 'variableId';
    const empty = panel.ownerDocument.createElement('option');
    empty.value = '';
    empty.textContent = DESIGNER_UI_TEXT.dataset.selectVariable;
    variableSelect.appendChild(empty);
    for (const variable of document?.variables ?? []) {
      const option = panel.ownerDocument.createElement('option');
      option.value = variable.id;
      option.textContent = variable.name;
      option.selected = source?.type === 'variable' && source.variableId === variable.id;
      variableSelect.appendChild(option);
    }
    variableLabel.appendChild(variableSelect);
    panel.appendChild(variableLabel);
  }
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  renderDesignerDescriptorZone(panel, manifest?.editorDescriptor?.data, {
    document,
    interaction,
    catalog,
    getDatasetFields,
  });
}

function appendResourceTypeField(
  parent: HTMLElement,
  source: ScreenComponentNode['dataSource'],
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): void {
  const value = source?.type === 'host-resource' ? source.resourceType : '';
  const resourceTypes = listDataResourceTypes(runtimeContributions);
  if (resourceTypes === undefined) {
    appendDataInput(parent, DESIGNER_UI_TEXT.propertiesPanel.resourceType, 'resourceType', value);
    return;
  }
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = DESIGNER_UI_TEXT.propertiesPanel.resourceType;
  const select = parent.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.dataSourceField = 'resourceType';
  const placeholder = parent.ownerDocument.createElement('option');
  placeholder.value = '';
  placeholder.textContent = DESIGNER_UI_TEXT.propertiesPanel.resourceTypePlaceholder;
  select.appendChild(placeholder);
  for (const resourceType of resourceTypes) {
    const option = parent.ownerDocument.createElement('option');
    option.value = resourceType.id;
    option.textContent = resourceType.name;
    option.selected = resourceType.id === value;
    select.appendChild(option);
  }
  label.appendChild(select);
  appendDesignerFieldMessage(label, select, 'data-resourceType');
  parent.appendChild(label);
}

function appendDataInput(
  parent: HTMLElement,
  labelText: string,
  field: string,
  value: string,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const input =
    field === 'static' || field === 'params'
      ? parent.ownerDocument.createElement('textarea')
      : parent.ownerDocument.createElement('input');
  input.value = value;
  input.className =
    field === 'static' || field === 'params'
      ? 'designer-control designer-textarea'
      : 'designer-control designer-input';
  input.dataset.dataSourceField = field;
  label.appendChild(input);
  appendDesignerFieldMessage(label, input, `data-${field}`);
  parent.appendChild(label);
}
