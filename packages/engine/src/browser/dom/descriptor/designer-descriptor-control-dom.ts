import type { ScreenJsonValue } from '@base-screen/contracts';
import {
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialPropSchema,
  resolveSchema,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerStepper } from '../designer-field-primitives.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  createDesignerInput,
  createDesignerSelect,
  createDesignerSwitch,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';
import type {
  DesignerDescriptorContext,
  DesignerDescriptorDatasetFields,
} from './designer-descriptor-model.js';

export interface DescriptorControlHandle {
  /** 挂到字段行里的元素（复合控件时是外壳）。 */
  readonly element: HTMLElement;
  /** 承载值、派发 change、被设计器路由识别的元素。 */
  readonly valueTarget: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
}

export function createDescriptorControl(
  ownerDocument: Document,
  field: BaseScreenMaterialEditorField,
  schema: BaseScreenMaterialPropSchema | undefined,
  value: ScreenJsonValue | undefined,
  datasetFields: readonly DesignerDescriptorDatasetFields[],
): DescriptorControlHandle {
  const control = field.control;
  if (control === 'stepper') {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
    const minimum = field.min ?? (schema?.kind === 'number' ? schema.minimum : undefined) ?? 0;
    const maximum = field.max ?? (schema?.kind === 'number' ? schema.maximum : undefined) ?? 100;
    const stepper = createDesignerStepper(ownerDocument, {
      value: Number.isFinite(numeric) ? numeric : minimum,
      min: minimum,
      max: maximum,
      ...(field.step === undefined ? {} : { step: field.step }),
      ariaLabel: field.label,
    });
    return { element: stepper.element, valueTarget: stepper.input };
  }
  if (control === 'boolean') {
    // Boolean descriptor fields render as the prototype's pill switch, not a checkbox; the native
    // checkbox stays the value carrier so the descriptor read/write pipeline is unchanged.
    const toggle = createDesignerSwitch(ownerDocument, {
      ariaLabel: field.label,
      checked: value === true,
    });
    return { element: toggle, valueTarget: toggle };
  }
  if (control === 'select' && schema?.kind === 'enum') {
    const select = createDesignerSelect(ownerDocument, {
      options: schema.values.map((optionValue) => ({
        label: String(optionValue),
        selected: value === optionValue,
        value: String(optionValue),
      })),
    });
    // 自绘下拉：外壳进字段行，原生 select 仍是值载体与 change 源。
    const enhanced = enhanceDesignerSelect(select);
    return { element: enhanced.element, valueTarget: select };
  }
  if (control === 'color') {
    const input = createDesignerInput(ownerDocument, {
      appearance: 'color',
      value: typeof value === 'string' ? value : '',
    });
    return { element: input, valueTarget: input };
  }
  if (control === 'json') {
    const input = createDesignerTextarea(ownerDocument);
    input.value = JSON.stringify(value);
    return { element: input, valueTarget: input };
  }
  if (control === 'field-selector') {
    if (datasetFields.length > 0) {
      const select = createDesignerSelect(ownerDocument, {
        ariaLabel: field.label,
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
      // 与字段映射同一套自绘下拉：原生 select 继续承担取值与 change。
      const enhanced = enhanceDesignerSelect(select);
      return { element: enhanced.element, valueTarget: select };
    }
    const input = createDesignerInput(ownerDocument, {
      value: typeof value === 'string' ? value : '',
    });
    return { element: input, valueTarget: input };
  }
  const numeric = control === 'number' || control === 'unit-number';
  const input = createDesignerInput(ownerDocument, {
    appearance: numeric ? 'number' : 'text',
    ...(numeric && field.max !== undefined ? { max: field.max } : {}),
    ...(numeric && field.min !== undefined ? { min: field.min } : {}),
    ...(numeric && field.step !== undefined ? { step: field.step } : {}),
    value: String(value ?? ''),
  });
  return { element: input, valueTarget: input };
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
