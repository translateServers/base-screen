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
import { createDesignerFieldRow } from '../designer-field-primitives.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  appendDesignerFieldMessage,
  createDesignerInput,
  createDesignerSelect,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';
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
  appendDataSourceTypeField(panel, type, capabilities);
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
    appendVariableField(panel, source, document);
  }
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  renderDesignerDescriptorZone(panel, manifest?.editorDescriptor?.data, {
    document,
    interaction,
    catalog,
    getDatasetFields,
  });
}

/**
 * 数据源面板的字段统一走检查器的字段行原语（标签列 + 控件列 + 自绘下拉）。
 * 此前这里手写 `label.designer-field` + 裸 `<select>`：原生下拉的外观/高度与其余面板不一致，
 * 也没有控件列，长标签（如“数据源类型”）被 74px 标签列挤成两行。
 */
function appendDataSourceTypeField(
  parent: HTMLElement,
  type: string,
  capabilities: readonly string[],
): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createDesignerFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.dataSource,
  });
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.dataSource,
    options: ['none', ...capabilities].map((value) => ({
      label:
        value === 'none'
          ? DESIGNER_UI_TEXT.propertiesPanel.none
          : DESIGNER_UI_TEXT.dataSource.mode(value),
      selected: value === type,
      value,
    })),
    value: type,
  });
  select.dataset.dataSourceType = 'true';
  control.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(field, select, 'data-source-type');
  parent.appendChild(field);
}

function appendVariableField(
  parent: HTMLElement,
  source: ScreenComponentNode['dataSource'],
  document: ScreenDocument | undefined,
): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createDesignerFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.dataset.selectVariable,
  });
  const current = source?.type === 'variable' ? source.variableId : '';
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataset.selectVariable,
    options: [
      { label: DESIGNER_UI_TEXT.dataset.selectVariable, selected: current === '', value: '' },
      ...(document?.variables ?? []).map((variable) => ({
        label: variable.name,
        selected: variable.id === current,
        value: variable.id,
      })),
    ],
    value: current,
  });
  select.dataset.dataSourceField = 'variableId';
  control.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(field, select, 'data-variableId');
  parent.appendChild(field);
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
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createDesignerFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.resourceType,
  });
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.resourceType,
    options: [
      {
        label: DESIGNER_UI_TEXT.propertiesPanel.resourceTypePlaceholder,
        selected: value === '',
        value: '',
      },
      ...resourceTypes.map((resourceType) => ({
        label: resourceType.name,
        selected: resourceType.id === value,
        value: resourceType.id,
      })),
    ],
    value,
  });
  select.dataset.dataSourceField = 'resourceType';
  control.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(field, select, 'data-resourceType');
  parent.appendChild(field);
}

function appendDataInput(
  parent: HTMLElement,
  labelText: string,
  field: string,
  value: string,
): void {
  const ownerDocument = parent.ownerDocument;
  const multiline = field === 'static' || field === 'params';
  // 多行文本（静态值 / 参数 JSON）用「标签在上、控件占满整行」的堆叠行，
  // 与检查器里的文本域同一形态：72px 高的输入框不该被塞进 74px 标签列旁边。
  const { field: row, control } = createDesignerFieldRow(ownerDocument, {
    label: labelText,
    ...(multiline ? { tagName: 'span' as const, stacked: true } : {}),
  });
  const input = multiline
    ? createDesignerTextarea(ownerDocument, { ariaLabel: labelText, value })
    : createDesignerInput(ownerDocument, { ariaLabel: labelText, value });
  input.dataset.dataSourceField = field;
  control.appendChild(input);
  appendDesignerFieldMessage(row, input, `data-${field}`);
  parent.appendChild(row);
}
