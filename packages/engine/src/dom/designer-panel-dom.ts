import type {
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { createValidatedPropsTransaction } from '../operations/designer-layout-operations.js';

export interface DesignerPanelInput {
  readonly value: string;
  readonly checked?: boolean;
  readonly type?: string;
}

export function renderDesignerProperties(
  properties: HTMLElement,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  properties.replaceChildren();
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  if (component === undefined) {
    if (document !== undefined) appendCanvasControls(properties, document);
    return;
  }
  if (interaction.selectedComponentIds.length > 1) {
    const summary = properties.ownerDocument.createElement('p');
    summary.textContent = `已选择 ${interaction.selectedComponentIds.length} 个组件。`;
    properties.appendChild(summary);
    return;
  }
  appendInput(properties, '名称', 'name', component.name);
  appendInput(properties, 'X', 'x', component.position.x, 'number');
  appendInput(properties, 'Y', 'y', component.position.y, 'number');
  appendInput(properties, '宽度', 'width', component.size.width, 'number', '1');
  appendInput(properties, '高度', 'height', component.size.height, 'number', '1');
  appendCheckbox(properties, '锁定', 'locked', component.status.locked);
  appendCheckbox(properties, '隐藏', 'hidden', component.status.hidden);
  const manifest = catalog?.get(component.type)?.manifest;
  if (manifest === undefined) return;
  for (const field of manifest.propertyPanel) {
    const schema = manifest.propsSchema.properties[field.prop];
    if (schema !== undefined) {
      appendPropControl(
        properties,
        field.label,
        field.prop,
        component.props[field.prop],
        schema,
        field.control,
      );
    }
  }
}

export function renderDesignerDataPanel(
  panel: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  hostResourceAvailable: boolean,
): void {
  if (panel === undefined) return;
  panel.replaceChildren();
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const capabilities = (
    component === undefined ? undefined : catalog?.get(component.type)?.manifest.dataCapabilities
  )?.filter((capability) => capability !== 'host-resource' || hostResourceAvailable);
  if (component === undefined || capabilities === undefined || capabilities.length === 0) {
    panel.textContent = '未选择数据源。';
    return;
  }
  const source = component.dataSource;
  const type = source?.type ?? 'none';
  const label = panel.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = '数据源';
  const select = panel.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.dataSourceType = component.id;
  for (const value of ['none', ...capabilities]) {
    const option = panel.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = value === 'none' ? '无' : value;
    option.selected = value === type;
    select.appendChild(option);
  }
  label.appendChild(select);
  panel.appendChild(label);
  if (source?.type === 'static') {
    appendDataInput(panel, '值', 'static', JSON.stringify(source.value));
  }
  if (source?.type === 'host-resource') {
    appendDataInput(panel, '资源类型', 'resourceType', source.resourceType);
    appendDataInput(panel, '资源 ID', 'resourceId', source.resourceId);
    appendDataInput(panel, '参数', 'params', JSON.stringify(source.params));
  }
}

export function createPropertyTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  if (component === undefined) return createCanvasTransaction(document, target);
  const property = target.dataset.property;
  if (property !== undefined) return createGeometryTransaction(component, property, target.value);
  const prop = target.dataset.prop;
  const manifest = catalog?.get(component.type)?.manifest;
  const schema = prop === undefined ? undefined : manifest?.propsSchema.properties[prop];
  if (
    manifest === undefined ||
    prop === undefined ||
    schema === undefined ||
    !manifest.propertyPanel.some((field) => field.prop === prop)
  ) {
    return undefined;
  }
  const value = parsePropertyControlValue(target, schema);
  if (value === undefined) return undefined;
  return createValidatedPropsTransaction(
    component.id,
    { ...component.props, [prop]: value },
    manifest.propsSchema,
  );
}

export function createDataSourceTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  hostResourceAvailable: boolean,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const capabilities = (
    component === undefined ? undefined : catalog?.get(component.type)?.manifest.dataCapabilities
  )?.filter((capability) => capability !== 'host-resource' || hostResourceAvailable);
  if (component === undefined || capabilities === undefined) return undefined;
  const fields = readDataSourceFields(target, component);
  if (fields === undefined) return undefined;
  const source = createDataSource(target.dataset.dataSourceType ?? fields.type, fields);
  if (source === undefined || (source !== null && !capabilities.includes(source.type)))
    return undefined;
  return success(update(component.id, { dataSource: source }));
}

export function parsePropertyControlValue(
  input: DesignerPanelInput,
  schema: BaseScreenMaterialPropSchema,
): ScreenJsonValue | undefined {
  if (input.type === 'checkbox') return input.checked === true;
  if (schema.kind === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : undefined;
  }
  if (schema.kind === 'boolean') return input.value === 'true';
  if (schema.kind === 'enum') return schema.values.find((value) => String(value) === input.value);
  if (schema.kind === 'string') return input.value;
  try {
    return JSON.parse(input.value) as ScreenJsonValue;
  } catch {
    return undefined;
  }
}

function createGeometryTransaction(
  component: ScreenComponentNode,
  property: string,
  input: string,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (property === 'name') return success(update(component.id, { name: input }));
  if (property === 'locked' || property === 'hidden') {
    return success(
      update(component.id, { status: { ...component.status, [property]: input === 'true' } }),
    );
  }
  const value = Number(input);
  if (!Number.isFinite(value)) return undefined;
  if (property === 'x' || property === 'y') {
    return success(
      update(component.id, { position: { ...component.position, [property]: clamp(value) } }),
    );
  }
  if ((property === 'width' || property === 'height') && value > 0) {
    return success(
      update(component.id, { size: { ...component.size, [property]: Math.min(value, 1_000_000) } }),
    );
  }
  return undefined;
}

function createCanvasTransaction(
  document: ScreenDocument | undefined,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined || target.dataset.canvasProperty === undefined) return undefined;
  const property = target.dataset.canvasProperty;
  if (property === 'backgroundColor') {
    return success({
      commands: [{ type: 'update-canvas', patch: { backgroundColor: target.value } }],
    });
  }
  const value = Number(target.value);
  if (!Number.isFinite(value) || value <= 0 || (property !== 'width' && property !== 'height')) {
    return undefined;
  }
  return success({ commands: [{ type: 'update-canvas', patch: { [property]: value } }] });
}

function appendInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
  min?: string,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = type;
  input.className = `designer-control designer-input${type === 'number' ? ' designer-number' : ''}`;
  input.value = String(value);
  input.dataset.property = property;
  if (min !== undefined) input.min = min;
  label.appendChild(input);
  parent.appendChild(label);
}

function appendCheckbox(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: boolean,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.className = 'designer-checkbox';
  input.checked = value;
  input.value = String(input.checked);
  input.dataset.property = property;
  input.addEventListener('change', () => {
    input.value = String(input.checked);
  });
  label.appendChild(input);
  parent.appendChild(label);
}

function appendCanvasControls(parent: HTMLElement, document: ScreenDocument): void {
  appendCanvasInput(parent, '画布宽度', 'width', document.canvas.width, 'number');
  appendCanvasInput(parent, '画布高度', 'height', document.canvas.height, 'number');
  appendCanvasInput(
    parent,
    '背景颜色',
    'backgroundColor',
    document.canvas.backgroundColor,
    'color',
  );
}

function appendCanvasInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = type;
  input.className =
    type === 'color'
      ? 'designer-control designer-color'
      : `designer-control designer-input${type === 'number' ? ' designer-number' : ''}`;
  input.value = String(value);
  input.dataset.canvasProperty = property;
  label.appendChild(input);
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
  parent.appendChild(label);
}

function readDataSourceFields(
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  component: ScreenComponentNode,
):
  | {
      readonly type: string;
      readonly static: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly params: string;
    }
  | undefined {
  const panel = target.closest<HTMLElement>('[data-inspector-pane="data"]');
  if (panel === null) return undefined;
  const type = panel.querySelector<HTMLSelectElement>('[data-data-source-type]')?.value;
  if (type === undefined) return undefined;
  const value = (field: string) =>
    panel.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-data-source-field="${field}"]`,
    )?.value ?? '';
  const source = component.dataSource;
  return {
    type,
    static: value('static') || (source?.type === 'static' ? JSON.stringify(source.value) : 'null'),
    resourceType:
      value('resourceType') || (source?.type === 'host-resource' ? source.resourceType : ''),
    resourceId: value('resourceId') || (source?.type === 'host-resource' ? source.resourceId : ''),
    params:
      value('params') || (source?.type === 'host-resource' ? JSON.stringify(source.params) : '{}'),
  };
}

function createDataSource(
  type: string,
  fields: {
    readonly static: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly params: string;
  },
): ScreenComponentDataSource | null | undefined {
  if (type === 'none') return null;
  try {
    if (type === 'static') return { type, value: JSON.parse(fields.static) as ScreenJsonValue };
    if (type === 'host-resource') {
      const params = JSON.parse(fields.params) as ScreenJsonValue;
      if (typeof params !== 'object' || params === null || Array.isArray(params)) return undefined;
      return {
        type,
        resourceType: fields.resourceType,
        resourceId: fields.resourceId,
        params: params as ScreenJsonObject,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function appendPropControl(
  parent: HTMLElement,
  labelText: string,
  prop: string,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const input = createControl(parent.ownerDocument, value, schema, control);
  input.dataset.prop = prop;
  label.appendChild(input);
  parent.appendChild(label);
}

function createControl(
  ownerDocument: Document,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (control === 'boolean') {
    const input = ownerDocument.createElement('input');
    input.type = 'checkbox';
    input.className = 'designer-checkbox';
    input.checked = value === true;
    return input;
  }
  if (control === 'select' && schema.kind === 'enum') {
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
  if (control === 'json') {
    const input = ownerDocument.createElement('textarea');
    input.className = 'designer-control designer-textarea';
    input.value = JSON.stringify(value);
    return input;
  }
  const input = ownerDocument.createElement('input');
  input.type = control === 'number' ? 'number' : 'text';
  input.className = `designer-control designer-input${control === 'number' ? ' designer-number' : ''}`;
  input.value = String(value ?? '');
  return input;
}

function isControl(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function update(componentId: string, patch: Record<string, unknown>): ScreenDocumentTransaction {
  return {
    commands: [{ type: 'update-components', componentIds: [componentId], patch }],
  } as ScreenDocumentTransaction;
}

function success(value: ScreenDocumentTransaction): ScreenParseResult<ScreenDocumentTransaction> {
  return { ok: true, value, diagnostics: [] };
}

function clamp(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}
