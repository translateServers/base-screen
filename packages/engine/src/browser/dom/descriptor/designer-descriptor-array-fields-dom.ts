import type { ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';
import {
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialPropSchema,
  resolveSchema,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerFieldElement } from '../designer-field-primitives.js';
import { appendDesignerFieldMessage, createDesignerButton } from '../designer-ui-primitives.js';
import {
  createDescriptorControl,
  descriptorFieldSchema,
} from './designer-descriptor-control-dom.js';
import {
  type DesignerDescriptorContext,
  readFieldTargetValue,
  readPath,
} from './designer-descriptor-model.js';

export function descriptorArraySchema(
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): BaseScreenMaterialPropSchema | undefined {
  return descriptorFieldSchema(field, context);
}

export function appendDescriptorArrayControls(
  parent: HTMLElement,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): void {
  const ownerDocument = parent.ownerDocument;
  const container = ownerDocument.createElement('div');
  container.className = 'designer-descriptor-array';
  const label = createDesignerFieldElement(ownerDocument, { label: field.label, tagName: 'span' });
  container.appendChild(label);
  const list = ownerDocument.createElement('ol');
  list.className = 'designer-descriptor-array-list';
  const array = readFieldTargetValue(field, field.path, context);
  const items = Array.isArray(array) ? array : [];
  const arraySchema = descriptorArraySchema(field, context);
  const maxItems = arraySchema?.kind === 'array' ? arraySchema.maxItems : undefined;
  for (let index = 0; index < items.length; index++) {
    const item = ownerDocument.createElement('li');
    item.className = 'designer-descriptor-array-item';
    const itemRecord = isRecordValue(items[index]);
    if (field.itemFields !== undefined && itemRecord) {
      for (const itemField of field.itemFields) {
        appendDescriptorItemField(item, field, itemField, index, context);
      }
    } else {
      const itemField: BaseScreenMaterialEditorField = {
        id: field.id,
        target: field.target,
        ...(field.projection === undefined ? {} : { projection: field.projection }),
        path: [index],
        label: field.itemLabel ?? DESIGNER_UI_TEXT.descriptor.item(index + 1),
        control: scalarControlForSchema(arraySchema),
      };
      appendDescriptorItemField(item, field, itemField, index, context);
    }
    const actions = ownerDocument.createElement('span');
    actions.className = 'designer-descriptor-array-actions';
    if (field.control === 'reorderable-array') {
      actions.appendChild(
        arrayActionButton(
          ownerDocument,
          DESIGNER_UI_TEXT.descriptor.moveUp,
          'move-up',
          field,
          index,
          index === 0,
        ),
      );
      actions.appendChild(
        arrayActionButton(
          ownerDocument,
          DESIGNER_UI_TEXT.descriptor.moveDown,
          'move-down',
          field,
          index,
          index === items.length - 1,
        ),
      );
    }
    actions.appendChild(
      arrayActionButton(
        ownerDocument,
        DESIGNER_UI_TEXT.descriptor.removeItem,
        'remove',
        field,
        index,
        field.control === 'array',
      ),
    );
    item.appendChild(actions);
    list.appendChild(item);
  }
  container.appendChild(list);
  const canAdd = maxItems === undefined || items.length < maxItems;
  container.appendChild(
    arrayActionButton(
      ownerDocument,
      DESIGNER_UI_TEXT.descriptor.addItem,
      'add',
      field,
      items.length,
      !canAdd,
    ),
  );
  parent.appendChild(container);
}

function scalarControlForSchema(
  schema: BaseScreenMaterialPropSchema | undefined,
): BaseScreenMaterialEditorField['control'] {
  if (schema?.kind === 'array') return scalarControlForSchema(schema.items);
  switch (schema?.kind) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return 'select';
    case 'string':
      return 'text';
    default:
      return 'text';
  }
}

function isRecordValue(value: ScreenJsonValue): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function appendDescriptorItemField(
  parent: HTMLElement,
  arrayField: BaseScreenMaterialEditorField,
  itemField: BaseScreenMaterialEditorField,
  index: number,
  context: DesignerDescriptorContext,
): void {
  const ownerDocument = parent.ownerDocument;
  // color 控件用 span 容器：label 点击会激活 color input 弹出原生取色器。
  const label = createDesignerFieldElement(ownerDocument, {
    label: itemField.label,
    ...(itemField.control === 'color' ? { tagName: 'span' } : {}),
  });
  const itemValue = readArrayItemValue(context, arrayField, index, itemField.path);
  const itemSchema = itemFieldSchema(arrayField, itemField, context);
  const handle = createDescriptorControl(
    ownerDocument,
    itemField,
    itemSchema,
    itemValue,
    context.datasetFields,
  );
  const control = handle.valueTarget;
  control.dataset.descriptorFieldId = itemField.id;
  control.dataset.descriptorTarget = itemField.target;
  control.dataset.descriptorPath = JSON.stringify([...arrayField.path, index, ...itemField.path]);
  control.dataset.descriptorControl = itemField.control;
  label.appendChild(handle.element);
  appendDesignerFieldMessage(
    label,
    control,
    `descriptor-${arrayField.id}-${index}-${itemField.id}`,
  );
  parent.appendChild(label);
}

function readArrayItemValue(
  context: DesignerDescriptorContext,
  arrayField: BaseScreenMaterialEditorField,
  index: number,
  itemPath: readonly (string | number)[],
): ScreenJsonValue | undefined {
  const array = readFieldTargetValue(arrayField, arrayField.path, context);
  if (!Array.isArray(array)) return undefined;
  const item = array[index];
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
  return readPath(item as ScreenJsonObject, itemPath);
}

function itemFieldSchema(
  arrayField: BaseScreenMaterialEditorField,
  itemField: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): BaseScreenMaterialPropSchema | undefined {
  const arraySchema = descriptorArraySchema(arrayField, context);
  if (arraySchema?.kind !== 'array') return undefined;
  const items = arraySchema.items;
  if (items.kind !== 'object') return items;
  return resolveSchema(itemField.path, items);
}

function arrayActionButton(
  ownerDocument: Document,
  label: string,
  action: 'add' | 'remove' | 'move-up' | 'move-down',
  field: BaseScreenMaterialEditorField,
  index: number,
  disabled: boolean,
): HTMLButtonElement {
  const button = createDesignerButton(ownerDocument, { disabled, text: label });
  button.dataset.descriptorArrayPath = JSON.stringify(field.path);
  button.dataset.descriptorArrayAction = action;
  button.dataset.descriptorArrayIndex = String(index);
  button.dataset.descriptorFieldId = field.id;
  return button;
}
