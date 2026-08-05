import type {
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialPropSchema,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { validateBaseScreenMaterialProps } from '@base-screen/plugin-core';
import {
  createValidatedPropsTransaction,
  createValidatedStyleTransaction,
} from '../../common/operations/designer-layout-operations.js';

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
  const geometry = appendSection(properties, '几何');
  appendInput(geometry, '名称', 'name', component.name);
  appendInput(geometry, 'X', 'x', component.position.x, 'number');
  appendInput(geometry, 'Y', 'y', component.position.y, 'number');
  appendInput(geometry, '宽度', 'width', component.size.width, 'number', '1');
  appendInput(geometry, '高度', 'height', component.size.height, 'number', '1');
  appendInput(geometry, '旋转', 'rotation', component.rotation, 'number', '-180');
  appendInput(geometry, '层级', 'zIndex', component.zIndex, 'number', '0');
  const status = appendSection(properties, '状态');
  appendCheckbox(status, '锁定', 'locked', component.status.locked);
  appendCheckbox(status, '隐藏', 'hidden', component.status.hidden);
  const manifest = catalog?.get(component.type)?.manifest;
  if (manifest === undefined) return;
  const content =
    manifest.propertyPanel.length === 0 ? undefined : appendSection(properties, '内容');
  for (const field of manifest.propertyPanel) {
    const schema = manifest.propsSchema.properties[field.prop];
    if (schema !== undefined && content !== undefined) {
      appendPropControl(
        content,
        field.label,
        field.prop,
        component.props[field.prop],
        schema,
        field.control,
      );
    }
  }
  const stylePanel = manifest.stylePanel ?? [];
  const style = stylePanel.length === 0 ? undefined : appendSection(properties, '样式');
  for (const field of stylePanel) {
    const schema = manifest.styleSchema.properties[field.style];
    if (schema !== undefined && style !== undefined) {
      appendStyleControl(
        style,
        field.label,
        field.style,
        component.style[field.style],
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
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
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
  select.dataset.dataSourceType = 'true';
  for (const value of ['none', ...capabilities]) {
    const option = panel.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = value === 'none' ? '无' : value;
    option.selected = value === type;
    select.appendChild(option);
  }
  label.appendChild(select);
  panel.appendChild(label);
  if (capabilities.includes('static')) {
    appendDataInput(
      panel,
      '值',
      'static',
      source?.type === 'static' ? JSON.stringify(source.value) : 'null',
    );
  }
  if (capabilities.includes('host-resource')) {
    appendDataInput(
      panel,
      '资源类型',
      'resourceType',
      source?.type === 'host-resource' ? source.resourceType : '',
    );
    appendDataInput(
      panel,
      '资源 ID',
      'resourceId',
      source?.type === 'host-resource' ? source.resourceId : '',
    );
    appendDataInput(
      panel,
      '参数',
      'params',
      source?.type === 'host-resource' ? JSON.stringify(source.params) : '{}',
    );
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
  const style = target.dataset.style;
  const manifest = catalog?.get(component.type)?.manifest;
  if (
    manifest !== undefined &&
    style !== undefined &&
    manifest.styleSchema.properties[style] !== undefined &&
    manifest.stylePanel.some((field) => field.style === style)
  ) {
    const value = parsePropertyControlValue(target, manifest.styleSchema.properties[style]);
    return value === undefined
      ? undefined
      : createValidatedStyleTransaction(
          component.id,
          { ...component.style, [style]: value },
          manifest.styleSchema,
        );
  }
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
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const capabilities = dataCapabilities(
    component,
    catalog,
    hostResourceAvailable,
    runtimeContributions,
  );
  if (component === undefined || capabilities === undefined) return undefined;
  const fields = readDataSourceFields(target, component);
  if (fields === undefined) return undefined;
  const source = createDataSource(fields.type, fields);
  if (source === undefined) return dataSourceFailure('CORE_COMMAND_INVALID');
  if (source !== null && !capabilities.includes(source.type)) {
    return dataSourceFailure('PLUGIN_CORE_CONTRIBUTION_UNKNOWN');
  }
  if (source?.type === 'static') {
    const value = parseScreenJsonValue(source.value);
    if (!value.ok) return dataSourceFailure(value.diagnostics[0]?.code ?? 'JSON_VALUE_INVALID');
    return success(update(component.id, { dataSource: { type: source.type, value: value.value } }));
  }
  if (source?.type === 'host-resource') {
    const resourceType = getResourceType(runtimeContributions, source.resourceType);
    if (resourceType === undefined) return dataSourceFailure('PLUGIN_CORE_CONTRIBUTION_UNKNOWN');
    const params = validateBaseScreenMaterialProps(source.params, resourceType.configSchema);
    if (!params.ok) {
      return dataSourceFailure(params.diagnostics[0]?.code ?? 'PLUGIN_CORE_MANIFEST_FIELD_INVALID');
    }
    return success(
      update(component.id, {
        dataSource: { ...source, params: params.value },
      }),
    );
  }
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
  if (property === 'rotation' && value >= -180 && value < 180) {
    return success(update(component.id, { rotation: value }));
  }
  if (property === 'zIndex' && Number.isInteger(value) && value >= 0 && value <= 1_000_000) {
    return success(update(component.id, { zIndex: value }));
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
  appendFieldMessage(label, input, `property-${property}`);
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
  appendFieldMessage(label, input, `property-${property}`);
  parent.appendChild(label);
}

function appendCanvasControls(parent: HTMLElement, document: ScreenDocument): void {
  const section = appendSection(parent, '画布');
  appendCanvasInput(section, '画布宽度', 'width', document.canvas.width, 'number');
  appendCanvasInput(section, '画布高度', 'height', document.canvas.height, 'number');
  appendCanvasInput(
    section,
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
  appendFieldMessage(label, input, `canvas-${property}`);
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
  appendFieldMessage(label, input, `data-${field}`);
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

function dataCapabilities(
  component: ScreenComponentNode | undefined,
  catalog: BaseScreenMaterialCatalog | undefined,
  hostResourceAvailable: boolean,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly ('static' | 'host-resource')[] | undefined {
  return catalog
    ?.get(component?.type ?? '')
    ?.manifest.dataCapabilities.filter(
      (capability) =>
        capability !== 'host-resource' ||
        (hostResourceAvailable && runtimeContributions !== undefined),
    );
}

function getResourceType(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  resourceType: string,
) {
  try {
    return runtimeContributions?.getResourceType(resourceType);
  } catch {
    return undefined;
  }
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
  appendFieldMessage(label, input, `prop-${prop}`);
  parent.appendChild(label);
}

function appendStyleControl(
  parent: HTMLElement,
  labelText: string,
  style: string,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const input = createControl(parent.ownerDocument, value, schema, control);
  input.dataset.style = style;
  label.appendChild(input);
  appendFieldMessage(label, input, `style-${style}`);
  parent.appendChild(label);
}

function appendSection(parent: HTMLElement, title: string): HTMLElement {
  const section = parent.ownerDocument.createElement('section');
  section.className = 'designer-inspector-section';
  const heading = parent.ownerDocument.createElement('h3');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  parent.appendChild(section);
  return section;
}

function appendFieldMessage(
  label: HTMLLabelElement,
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  key: string,
): void {
  const id = `designer-field-${key}`;
  const messageId = `${id}-message`;
  input.id = id;
  input.setAttribute('aria-describedby', messageId);
  label.htmlFor = id;
  const message = label.ownerDocument.createElement('span');
  message.id = messageId;
  message.className = 'designer-field-message';
  message.dataset.fieldMessage = 'true';
  message.ariaLive = 'polite';
  label.appendChild(message);
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
  input.type = control === 'number' || control === 'color' ? control : 'text';
  input.className =
    control === 'color'
      ? 'designer-control designer-color'
      : `designer-control designer-input${control === 'number' ? ' designer-number' : ''}`;
  input.value = String(value ?? '');
  return input;
}

function isControl(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const candidate = target as
    | (Partial<HTMLInputElement> & { readonly dataset?: DOMStringMap })
    | null;
  return candidate?.dataset !== undefined && typeof candidate.value === 'string';
}

function update(componentId: string, patch: Record<string, unknown>): ScreenDocumentTransaction {
  return {
    commands: [{ type: 'update-components', componentIds: [componentId], patch }],
  } as ScreenDocumentTransaction;
}

function success(value: ScreenDocumentTransaction): ScreenParseResult<ScreenDocumentTransaction> {
  return { ok: true, value, diagnostics: [] };
}

function dataSourceFailure(
  code: ScreenDiagnostic['code'],
): ScreenParseResult<ScreenDocumentTransaction> {
  const message =
    code === 'PLUGIN_CORE_CONTRIBUTION_UNKNOWN'
      ? '资源类型不可用，未保存修改。'
      : '数据源配置无效，未保存修改。';
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code, path: [], message }],
  };
}

function clamp(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}
