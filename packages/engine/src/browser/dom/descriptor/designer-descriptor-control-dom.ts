import type { ScreenJsonValue } from '@base-screen/contracts';
import {
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialPropSchema,
  resolveSchema,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  createDesignerCheckbox,
  createDesignerInput,
  createDesignerSelect,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';
import type {
  DesignerDescriptorContext,
  DesignerDescriptorDatasetFields,
} from './designer-descriptor-model.js';

export function createDescriptorControl(
  ownerDocument: Document,
  field: BaseScreenMaterialEditorField,
  schema: BaseScreenMaterialPropSchema | undefined,
  value: ScreenJsonValue | undefined,
  datasetFields: readonly DesignerDescriptorDatasetFields[],
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const control = field.control;
  if (control === 'boolean') {
    return createDesignerCheckbox(ownerDocument, { checked: value === true });
  }
  if (control === 'select' && schema?.kind === 'enum') {
    return createDesignerSelect(ownerDocument, {
      options: schema.values.map((optionValue) => ({
        label: String(optionValue),
        selected: value === optionValue,
        value: String(optionValue),
      })),
    });
  }
  if (control === 'color') {
    return createDesignerInput(ownerDocument, {
      appearance: 'color',
      value: typeof value === 'string' ? value : '',
    });
  }
  if (control === 'json') {
    const input = createDesignerTextarea(ownerDocument);
    input.value = JSON.stringify(value);
    return input;
  }
  if (control === 'field-selector') {
    if (datasetFields.length > 0) {
      return createDesignerSelect(ownerDocument, {
        options: [
          {
            label: DESIGNER_UI_TEXT.descriptor.noField,
            selected: value === undefined || value === '',
            value: '',
          },
          ...datasetFields.map((datasetField) => ({
            label: datasetField.label,
            selected: value === datasetField.id,
            value: datasetField.id,
          })),
        ],
      });
    }
    return createDesignerInput(ownerDocument, {
      value: typeof value === 'string' ? value : '',
    });
  }
  const numeric = control === 'number' || control === 'unit-number';
  return createDesignerInput(ownerDocument, {
    appearance: numeric ? 'number' : 'text',
    ...(numeric && field.max !== undefined ? { max: field.max } : {}),
    ...(numeric && field.min !== undefined ? { min: field.min } : {}),
    ...(numeric && field.step !== undefined ? { step: field.step } : {}),
    value: String(value ?? ''),
  });
}

export function descriptorFieldSchema(
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): BaseScreenMaterialPropSchema | undefined {
  const target = field.target === 'interaction' ? (field.projection ?? 'props') : field.target;
  const schema =
    target === 'props'
      ? context.manifest.propsSchema
      : target === 'style'
        ? context.manifest.styleSchema
        : undefined;
  return schema === undefined ? undefined : resolveSchema(field.path, schema);
}

export function applyFieldDataset(
  control: HTMLElement,
  field: BaseScreenMaterialEditorField,
): void {
  control.dataset.descriptorFieldId = field.id;
  control.dataset.descriptorTarget = field.target;
  control.dataset.descriptorPath = JSON.stringify(field.path);
  control.dataset.descriptorControl = field.control;
  if (field.projection !== undefined) control.dataset.descriptorProjection = field.projection;
}
