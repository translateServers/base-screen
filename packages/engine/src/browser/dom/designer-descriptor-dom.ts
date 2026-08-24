import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
} from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialEditorCondition,
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialEditorSection,
  type BaseScreenMaterialPropSchema,
  resolveSchema,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { createDesignerColorPalette } from './designer-color-palette-dom.js';

export interface DesignerDescriptorDatasetFields {
  readonly id: string;
  readonly label: string;
}

export interface DesignerDescriptorPanelInput {
  readonly document: ScreenDocument | undefined;
  readonly interaction: ScreenInteractionState;
  readonly catalog: BaseScreenMaterialCatalog | undefined;
  readonly getDatasetFields?: (() => readonly DesignerDescriptorDatasetFields[]) | undefined;
}

export interface DesignerDescriptorContext {
  readonly component: ScreenComponentNode;
  readonly manifest: NonNullable<ReturnType<BaseScreenMaterialCatalog['get']>>['manifest'];
  readonly datasetFields: readonly DesignerDescriptorDatasetFields[];
}

export function renderDesignerDescriptorZone(
  container: HTMLElement | undefined,
  zone: readonly BaseScreenMaterialEditorSection[] | undefined,
  input: DesignerDescriptorPanelInput,
): void {
  if (container === undefined || zone === undefined || zone.length === 0) return;
  const context = getDesignerDescriptorContext(input);
  if (context === undefined) return;
  for (const section of zone) {
    appendDescriptorSection(container, section, context);
  }
}

export function getDesignerDescriptorContext(
  input: DesignerDescriptorPanelInput,
): DesignerDescriptorContext | undefined {
  const component = input.document?.components.find(
    (item) => item.id === input.interaction.focusedComponentId,
  );
  const manifest =
    component === undefined ? undefined : input.catalog?.get(component.type)?.manifest;
  return component === undefined || manifest === undefined
    ? undefined
    : { component, manifest, datasetFields: input.getDatasetFields?.() ?? [] };
}

function appendDescriptorSection(
  container: HTMLElement,
  section: BaseScreenMaterialEditorSection,
  context: DesignerDescriptorContext,
): void {
  const ownerDocument = container.ownerDocument;
  const sectionElement = ownerDocument.createElement('section');
  sectionElement.className = 'designer-inspector-section';
  const details = ownerDocument.createElement('details');
  details.className = 'designer-descriptor-group';
  details.open = section.advanced !== true && section.collapsed !== true;
  const summary = ownerDocument.createElement('summary');
  summary.className = 'designer-descriptor-group-summary';
  summary.textContent = section.label;
  details.appendChild(summary);
  if (section.help !== undefined) {
    const help = ownerDocument.createElement('p');
    help.className = 'designer-descriptor-help';
    help.textContent = section.help;
    details.appendChild(help);
  }
  const fields = ownerDocument.createElement('div');
  fields.className = 'designer-descriptor-fields';
  for (const field of section.fields) {
    if (!isDescriptorFieldVisible(field, context)) continue;
    appendDescriptorField(fields, field, context);
  }
  details.appendChild(fields);
  sectionElement.appendChild(details);
  container.appendChild(sectionElement);
}

export function isDescriptorFieldVisible(
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): boolean {
  if (field.when === undefined || field.when.length === 0) return true;
  return field.when.every((condition) => evaluateDescriptorCondition(condition, field, context));
}

export function evaluateDescriptorCondition(
  condition: BaseScreenMaterialEditorCondition,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): boolean {
  const value = readFieldTargetValue(field, condition.path, context);
  const exists = value !== undefined;
  switch (condition.operator) {
    case 'exists':
      return exists;
    case 'not-exists':
      return !exists;
    case 'eq':
      return exists && Object.is(condition.value, value);
    case 'neq':
      return !exists || !Object.is(condition.value, value);
    case 'in':
      return (
        Array.isArray(condition.value) &&
        exists &&
        condition.value.some((item) => Object.is(item, value))
      );
    case 'not-in':
      return (
        !exists ||
        !Array.isArray(condition.value) ||
        !condition.value.some((item) => Object.is(item, value))
      );
  }
}

export function readFieldTargetValue(
  field: BaseScreenMaterialEditorField,
  path: readonly (string | number)[],
  context: DesignerDescriptorContext,
): ScreenJsonValue | undefined {
  const target = field.target === 'interaction' ? (field.projection ?? 'props') : field.target;
  if (target === 'props') return readPath(context.component.props, path);
  if (target === 'style') return readPath(context.component.style, path);
  return readDataSourcePath(context.component.dataSource, path);
}

function readDataSourcePath(
  source: ScreenComponentNode['dataSource'],
  path: readonly (string | number)[],
): ScreenJsonValue | undefined {
  const root = path[0];
  if (root === 'params') {
    const parameter = source?.type === 'host-resource' ? source.params[String(path[1])] : undefined;
    return parameter?.kind === 'literal' ? parameter.value : undefined;
  }
  if (root === 'binding') {
    const fields = source?.type === 'host-resource' ? source.binding?.fields : undefined;
    if (path[1] !== 'fields') return undefined;
    const role = String(path[2]);
    const values = fields?.[role];
    if (values === undefined) return undefined;
    const index = path[3];
    return typeof index === 'number' ? values[index] : values;
  }
  return undefined;
}

function readPath(
  record: ScreenJsonObject | undefined,
  path: readonly (string | number)[],
): ScreenJsonValue | undefined {
  if (record === undefined) return undefined;
  let current: unknown = record;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) return undefined;
      current = current[segment];
    } else {
      if (typeof segment !== 'string' || !Object.hasOwn(current, segment)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current as ScreenJsonValue | undefined;
}

function appendDescriptorField(
  parent: HTMLElement,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): void {
  if (field.control === 'group') {
    appendDescriptorGroup(parent, field, context);
    return;
  }
  if (
    field.control === 'array' ||
    field.control === 'repeatable-array' ||
    field.control === 'reorderable-array'
  ) {
    appendDescriptorArrayControls(parent, field, context);
    return;
  }
  const schema = descriptorFieldSchema(field, context);
  const value = readFieldTargetValue(field, field.path, context);
  const ownerDocument = parent.ownerDocument;
  const palette =
    field.control === 'color'
      ? createDesignerColorPalette(
          ownerDocument,
          typeof value === 'string' ? value : undefined,
          `${context.component.id}:descriptor:${field.id}`,
        )
      : undefined;
  // color 控件用 span 容器：label 点击会激活 color input 弹出原生取色器。
  const label = ownerDocument.createElement(palette === undefined ? 'label' : 'span');
  label.className = 'designer-field designer-field-label';
  label.textContent = field.label;
  const control =
    palette === undefined
      ? createDescriptorControl(ownerDocument, field, schema, value, context.datasetFields)
      : palette.controls[0]!;
  if (palette === undefined) {
    applyFieldDataset(control, field);
    label.appendChild(control);
  } else {
    for (const paletteControl of palette.controls) applyFieldDataset(paletteControl, field);
    label.appendChild(palette.element);
  }
  if (field.help !== undefined) {
    const help = ownerDocument.createElement('span');
    help.className = 'designer-descriptor-help';
    help.textContent = field.help;
    label.appendChild(help);
  }
  appendFieldMessage(label, control, `descriptor-${field.id}`);
  parent.appendChild(label);
}

function appendDescriptorGroup(
  parent: HTMLElement,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): void {
  const ownerDocument = parent.ownerDocument;
  const group = ownerDocument.createElement('fieldset');
  group.className = 'designer-descriptor-group';
  const legend = ownerDocument.createElement('legend');
  legend.textContent = field.label;
  group.appendChild(legend);
  for (const child of collectGroupChildren(context, field)) {
    if (!isDescriptorFieldVisible(child, context)) continue;
    appendDescriptorField(group, child, context);
  }
  parent.appendChild(group);
}

function collectGroupChildren(
  context: DesignerDescriptorContext,
  group: BaseScreenMaterialEditorField,
): readonly BaseScreenMaterialEditorField[] {
  const zones = ['appearance', 'data', 'interaction'] as const;
  const children: BaseScreenMaterialEditorField[] = [];
  for (const zone of zones) {
    for (const section of context.manifest.editorDescriptor?.[zone] ?? []) {
      for (const candidate of section.fields) {
        if (candidate.id !== group.id && isPathPrefixed(candidate.path, group.path)) {
          children.push(candidate);
        }
      }
    }
  }
  return children;
}

function isPathPrefixed(
  path: readonly (string | number)[],
  prefix: readonly (string | number)[],
): boolean {
  return path.length > prefix.length && prefix.every((segment, index) => segment === path[index]);
}

function createDescriptorControl(
  ownerDocument: Document,
  field: BaseScreenMaterialEditorField,
  schema: BaseScreenMaterialPropSchema | undefined,
  value: ScreenJsonValue | undefined,
  datasetFields: readonly DesignerDescriptorDatasetFields[],
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const control = field.control;
  if (control === 'boolean') {
    const input = ownerDocument.createElement('input');
    input.type = 'checkbox';
    input.className = 'designer-checkbox';
    input.checked = value === true;
    return input;
  }
  if (control === 'select' && schema?.kind === 'enum') {
    const select = ownerDocument.createElement('select');
    select.className = 'designer-control designer-select';
    for (const optionValue of schema.values) {
      const option = ownerDocument.createElement('option');
      option.value = String(optionValue);
      option.textContent = String(optionValue);
      option.selected = value === optionValue;
      select.appendChild(option);
    }
    return select;
  }
  if (control === 'color') {
    const input = ownerDocument.createElement('input');
    input.type = 'color';
    input.className = 'designer-control designer-color';
    input.value = typeof value === 'string' ? value : '';
    return input;
  }
  if (control === 'json') {
    const input = ownerDocument.createElement('textarea');
    input.className = 'designer-control designer-textarea';
    input.value = JSON.stringify(value);
    return input;
  }
  if (control === 'field-selector') {
    if (datasetFields.length > 0) {
      const select = ownerDocument.createElement('select');
      select.className = 'designer-control designer-select';
      const empty = ownerDocument.createElement('option');
      empty.value = '';
      empty.textContent = DESIGNER_UI_TEXT.descriptor.noField;
      empty.selected = value === undefined || value === '';
      select.appendChild(empty);
      for (const datasetField of datasetFields) {
        const option = ownerDocument.createElement('option');
        option.value = datasetField.id;
        option.textContent = datasetField.label;
        option.selected = value === datasetField.id;
        select.appendChild(option);
      }
      return select;
    }
    const input = ownerDocument.createElement('input');
    input.type = 'text';
    input.className = 'designer-control designer-input';
    input.value = typeof value === 'string' ? value : '';
    return input;
  }
  const numeric = control === 'number' || control === 'unit-number';
  const input = ownerDocument.createElement('input');
  input.type = numeric ? 'number' : 'text';
  input.className = `designer-control designer-input${numeric ? ' designer-number' : ''}`;
  input.value = String(value ?? '');
  if (numeric) {
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);
  }
  return input;
}

function descriptorFieldSchema(
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

export function descriptorArraySchema(
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): BaseScreenMaterialPropSchema | undefined {
  return descriptorFieldSchema(field, context);
}

function applyFieldDataset(control: HTMLElement, field: BaseScreenMaterialEditorField): void {
  control.dataset.descriptorFieldId = field.id;
  control.dataset.descriptorTarget = field.target;
  control.dataset.descriptorPath = JSON.stringify(field.path);
  control.dataset.descriptorControl = field.control;
  if (field.projection !== undefined) control.dataset.descriptorProjection = field.projection;
}

export function appendDescriptorArrayControls(
  parent: HTMLElement,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): void {
  const ownerDocument = parent.ownerDocument;
  const container = ownerDocument.createElement('div');
  container.className = 'designer-descriptor-array';
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field designer-field-label';
  label.textContent = field.label;
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
  const label = ownerDocument.createElement(itemField.control === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.textContent = itemField.label;
  const itemValue = readArrayItemValue(context, arrayField, index, itemField.path);
  const itemSchema = itemFieldSchema(arrayField, itemField, context);
  const control = createDescriptorControl(
    ownerDocument,
    itemField,
    itemSchema,
    itemValue,
    context.datasetFields,
  );
  control.dataset.descriptorFieldId = itemField.id;
  control.dataset.descriptorTarget = itemField.target;
  control.dataset.descriptorPath = JSON.stringify([...arrayField.path, index, ...itemField.path]);
  control.dataset.descriptorControl = itemField.control;
  label.appendChild(control);
  appendFieldMessage(label, control, `descriptor-${arrayField.id}-${index}-${itemField.id}`);
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
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-button';
  button.textContent = label;
  button.disabled = disabled;
  button.dataset.descriptorArrayPath = JSON.stringify(field.path);
  button.dataset.descriptorArrayAction = action;
  button.dataset.descriptorArrayIndex = String(index);
  button.dataset.descriptorFieldId = field.id;
  return button;
}

function appendFieldMessage(
  container: HTMLElement,
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  key: string,
): void {
  const id = `designer-field-${key}`;
  const messageId = `${id}-message`;
  input.id = id;
  input.setAttribute('aria-describedby', messageId);
  // 只有 label 容器才建立 for 关联：color 控件用 span 容器，点击字段文字不得激活
  // color input（否则会弹出浏览器原生取色器）。
  if (container.tagName.toLowerCase() === 'label') {
    (container as HTMLLabelElement).htmlFor = id;
  }
  const message = container.ownerDocument.createElement('span');
  message.id = messageId;
  message.className = 'designer-field-message';
  message.dataset.fieldMessage = 'true';
  message.ariaLive = 'polite';
  container.appendChild(message);
}
