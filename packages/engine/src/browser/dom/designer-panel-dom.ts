import type {
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourceParameter,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialPropSchema,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { validateBaseScreenMaterialProps } from '@base-screen/plugin-core';
import {
  clampScreenCoordinate,
  roundScreenGeometry,
} from '../../common/operations/designer-geometry.js';
import {
  createGroupRotationTransaction,
  createGroupSizeTransaction,
} from '../../common/operations/designer-group.js';
import {
  createGroupPositionTransaction,
  type DesignerInspectorContext,
  getDesignerInspectorContext,
} from '../../common/operations/designer-inspector.js';
import {
  createValidatedPropsTransaction,
  createValidatedStyleTransaction,
} from '../../common/operations/designer-layout-operations.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type DesignerDescriptorDatasetFields,
  renderDesignerDescriptorZone,
} from './designer-descriptor-dom.js';

export interface DesignerPanelInput {
  readonly value: string;
  readonly checked?: boolean;
  readonly type?: string;
}

export function createInitialDataSource(
  manifest: BaseScreenMaterialManifest | undefined,
): ScreenComponentDataSource | null {
  return manifest?.defaultData === undefined
    ? null
    : { type: 'static', value: manifest.defaultData };
}

export function renderDesignerProperties(
  properties: HTMLElement,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
): void {
  properties.replaceChildren();
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind === 'canvas') {
    if (document !== undefined) appendCanvasControls(properties, document);
    return;
  }
  if (context.kind === 'multi-selection') {
    appendMultiSelectionControls(properties, context);
    return;
  }
  if (context.kind === 'single-group') {
    appendGroupOverview(properties, context);
  }
  appendComponentControls(properties, context, document, interaction, catalog, getDatasetFields);
}

function appendComponentControls(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'single-material' | 'single-group' }>,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
): void {
  const { component, manifest } = context;
  const geometry = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.geometry);
  appendInput(geometry, DESIGNER_UI_TEXT.propertiesPanel.name, 'name', component.name);
  const geometryGrid = appendFieldGrid(geometry);
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.x,
    'x',
    component.position.x,
    'number',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.y,
    'y',
    component.position.y,
    'number',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.width,
    'width',
    component.size.width,
    'number',
    '1',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.height,
    'height',
    component.size.height,
    'number',
    '1',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.rotation,
    'rotation',
    component.rotation,
    'number',
    '-180',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.zIndex,
    'zIndex',
    component.zIndex,
    'number',
    '0',
  );
  const status = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.status);
  const statusGrid = appendFieldGrid(status);
  appendCheckbox(
    statusGrid,
    DESIGNER_UI_TEXT.propertiesPanel.locked,
    'locked',
    component.status.locked,
  );
  appendCheckbox(
    statusGrid,
    DESIGNER_UI_TEXT.propertiesPanel.hidden,
    'hidden',
    component.status.hidden,
  );
  if (context.kind === 'single-group') {
    appendGroupActions(properties, context);
  }
  if (manifest === undefined) return;
  const descriptorAppearance = manifest.editorDescriptor?.appearance;
  if (descriptorAppearance !== undefined && descriptorAppearance.length > 0) {
    renderDesignerDescriptorZone(properties, descriptorAppearance, {
      document,
      interaction,
      catalog,
      getDatasetFields,
    });
    return;
  }
  const content =
    manifest.propertyPanel.length === 0
      ? undefined
      : appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.content);
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
  const style =
    stylePanel.length === 0
      ? undefined
      : appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.style);
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

function appendGroupOverview(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'single-group' }>,
): void {
  const section = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.groupSummary);
  const list = properties.ownerDocument.createElement('ul');
  list.className = 'designer-inspector-summary';
  appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.group);
  appendListItem(
    list,
    DESIGNER_UI_TEXT.propertiesPanel.childCount(context.summary.directChildCount),
  );
  appendListItem(
    list,
    DESIGNER_UI_TEXT.propertiesPanel.descendantCount(context.summary.descendantCount),
  );
  if (context.summary.hasLockedDescendant) {
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.containsLockedDescendant);
  }
  if (context.summary.hasHiddenDescendant) {
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.containsHiddenDescendant);
  }
  section.appendChild(list);
}

function appendGroupActions(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'single-group' }>,
): void {
  const section = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.groupActions);
  appendActionButton(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.actionUngroup,
    'ungroup',
    !context.summary.canUngroup,
    context.component.status.locked
      ? DESIGNER_UI_TEXT.propertiesPanel.actionUnavailableLocked
      : DESIGNER_UI_TEXT.propertiesPanel.actionUnavailableEmptyGroup,
  );
}

function appendMultiSelectionControls(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'multi-selection' }>,
): void {
  const summary = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.selectionSummary);
  const list = properties.ownerDocument.createElement('ul');
  list.className = 'designer-inspector-summary';
  appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.multiSelect(context.summary.count));
  appendListItem(
    list,
    context.summary.sameParent
      ? DESIGNER_UI_TEXT.propertiesPanel.sameParentSelection
      : DESIGNER_UI_TEXT.propertiesPanel.mixedParentSelection,
  );
  if (context.summary.hasLocked) {
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.containsLockedSelection);
  }
  if (context.summary.hasHidden) {
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.containsHiddenSelection);
  }
  if (context.summary.canAlign)
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.alignAvailable);
  if (context.summary.canDistribute) {
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.distributeAvailable);
  }
  summary.appendChild(list);
  const arrange = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.arrangeActions);
  for (const [action, label] of [
    ['align-left', DESIGNER_UI_TEXT.propertiesPanel.alignLeft],
    ['align-center', DESIGNER_UI_TEXT.propertiesPanel.alignCenter],
    ['align-right', DESIGNER_UI_TEXT.propertiesPanel.alignRight],
    ['align-top', DESIGNER_UI_TEXT.propertiesPanel.alignTop],
    ['align-middle', DESIGNER_UI_TEXT.propertiesPanel.alignMiddle],
    ['align-bottom', DESIGNER_UI_TEXT.propertiesPanel.alignBottom],
  ] as const) {
    appendActionButton(
      arrange,
      label,
      action,
      !context.summary.canAlign,
      DESIGNER_UI_TEXT.propertiesPanel.alignUnavailableCount,
    );
  }
  appendActionButton(
    arrange,
    DESIGNER_UI_TEXT.propertiesPanel.distributeHorizontal,
    'distribute-horizontal',
    !context.summary.canDistribute,
    DESIGNER_UI_TEXT.propertiesPanel.distributeUnavailableCount,
  );
  appendActionButton(
    arrange,
    DESIGNER_UI_TEXT.propertiesPanel.distributeVertical,
    'distribute-vertical',
    !context.summary.canDistribute,
    DESIGNER_UI_TEXT.propertiesPanel.distributeUnavailableCount,
  );
  const actions = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.groupActions);
  appendActionButton(
    actions,
    DESIGNER_UI_TEXT.propertiesPanel.actionGroup,
    'group',
    !context.summary.canGroup,
    multiSelectionGroupUnavailableReason(context.summary),
  );
}

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
    option.textContent = value === 'none' ? DESIGNER_UI_TEXT.propertiesPanel.none : value;
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
    appendDataInput(
      panel,
      DESIGNER_UI_TEXT.propertiesPanel.resourceType,
      'resourceType',
      source?.type === 'host-resource' ? source.resourceType : '',
    );
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
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  renderDesignerDescriptorZone(panel, manifest?.editorDescriptor?.data, {
    document,
    interaction,
    catalog,
    getDatasetFields,
  });
}

export function createPropertyTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material' && context.kind !== 'single-group') {
    return createCanvasTransaction(document, target);
  }
  const component = context.component;
  const property = target.dataset.property;
  if (property !== undefined) {
    return createGeometryTransaction(document, context, component, property, target.value);
  }
  const prop = target.dataset.prop;
  const style = target.dataset.style;
  const manifest = context.manifest;
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
    const params = validateBaseScreenMaterialProps(
      literalParameterValues(source.params),
      resourceType.configSchema,
    );
    if (!params.ok) {
      return dataSourceFailure(params.diagnostics[0]?.code ?? 'PLUGIN_CORE_MANIFEST_FIELD_INVALID');
    }
    return success(
      update(component.id, {
        dataSource: { ...source, params: literalParameters(params.value), binding: null },
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
  return parseJsonDraft(input.value);
}

function createGeometryTransaction(
  document: ScreenDocument | undefined,
  context: DesignerInspectorContext,
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
    const position = {
      ...component.position,
      [property]: roundScreenGeometry(clampScreenCoordinate(value)),
    };
    if (document !== undefined && context.kind === 'single-group') {
      const transaction = createGroupPositionTransaction(document, component.id, position);
      return transaction === undefined ? undefined : success(transaction);
    }
    return success(update(component.id, { position }));
  }
  if (context.kind === 'single-group' && document !== undefined) {
    if (property === 'width' || property === 'height') {
      const size = {
        ...component.size,
        [property]: roundScreenGeometry(Math.min(value, 1_000_000)),
      };
      const transaction = createGroupSizeTransaction(document, component.id, size);
      return transaction === undefined ? undefined : success(transaction);
    }
    if (property === 'rotation' && value >= -180 && value < 180) {
      const transaction = createGroupRotationTransaction(document, component.id, value);
      return transaction === undefined ? undefined : success(transaction);
    }
  }
  if ((property === 'width' || property === 'height') && value > 0) {
    return success(
      update(component.id, {
        size: { ...component.size, [property]: roundScreenGeometry(Math.min(value, 1_000_000)) },
      }),
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
  if (property === 'backgroundImage') {
    // 非空输入提交 URL（失败关闭校验在 canonical 解析处拒绝）；清空输入提交删除语义，
    // 与 setCanvasBackgroundImage(null) 一致（同时清除 fit）。
    const value = target.value.trim();
    return success({
      commands: [
        {
          type: 'update-canvas',
          patch:
            value === ''
              ? { backgroundImage: null, backgroundImageFit: null }
              : { backgroundImage: value },
        },
      ],
    });
  }
  if (property === 'backgroundImageFit') {
    if (target.value !== 'cover' && target.value !== 'contain') {
      return undefined;
    }
    return success({
      commands: [{ type: 'update-canvas', patch: { backgroundImageFit: target.value } }],
    });
  }
  const value = Number(target.value);
  if (!Number.isFinite(value) || value <= 0 || (property !== 'width' && property !== 'height')) {
    return undefined;
  }
  return success({
    commands: [{ type: 'update-canvas', patch: { [property]: roundScreenGeometry(value) } }],
  });
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
  const section = appendSection(parent, DESIGNER_UI_TEXT.propertiesPanel.canvas);
  appendCanvasInput(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.canvasWidth,
    'width',
    document.canvas.width,
    'number',
  );
  appendCanvasInput(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.canvasHeight,
    'height',
    document.canvas.height,
    'number',
  );
  appendCanvasInput(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.backgroundColor,
    'backgroundColor',
    document.canvas.backgroundColor,
    'color',
  );
  // 背景图片行：URL 输入 + 宿主选择按钮（ADR-0046，点击派发宿主请求事件，宿主自开弹出框可视化选择）。
  const backgroundRow = parent.ownerDocument.createElement('div');
  backgroundRow.className = 'designer-canvas-background-row';
  appendCanvasInput(
    backgroundRow,
    DESIGNER_UI_TEXT.propertiesPanel.backgroundImage,
    'backgroundImage',
    document.canvas.backgroundImage ?? '',
    'text',
  );
  const pickerButton = backgroundRow.ownerDocument.createElement('button');
  pickerButton.type = 'button';
  pickerButton.className = 'designer-control designer-button';
  pickerButton.dataset.canvasBackgroundImageAction = '';
  pickerButton.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundImageAction;
  backgroundRow.appendChild(pickerButton);
  section.appendChild(backgroundRow);
  appendCanvasSelect(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFit,
    'backgroundImageFit',
    document.canvas.backgroundImageFit ?? 'cover',
    document.canvas.backgroundImage === undefined,
  );
}

function appendCanvasSelect(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string,
  disabled: boolean,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const select = parent.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.disabled = disabled;
  select.dataset.canvasProperty = property;
  for (const option of ['cover', 'contain'] as const) {
    const element = select.ownerDocument.createElement('option');
    element.value = option;
    element.textContent = option;
    select.appendChild(element);
  }
  select.value = value;
  label.appendChild(select);
  appendFieldMessage(label, select, `canvas-${property}`);
  parent.appendChild(label);
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
  if (type === 'static') {
    const value = parseJsonDraft(fields.static);
    return value === undefined ? undefined : { type, value };
  }
  if (type === 'host-resource') {
    const params = parseJsonDraft(fields.params);
    if (!isScreenJsonObject(params)) return undefined;
    return {
      type,
      resourceType: fields.resourceType,
      resourceId: fields.resourceId,
      params: literalParameters(params),
      binding: null,
    };
  }
  return undefined;
}

function parseJsonDraft(value: string): ScreenJsonValue | undefined {
  try {
    const parsed = parseScreenJsonValue(JSON.parse(value));
    return parsed.ok ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function isScreenJsonObject(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function literalParameters(
  values: ScreenJsonObject,
): Readonly<Record<string, ScreenHostResourceParameter>> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { kind: 'literal', value }]),
  );
}

function literalParameterValues(
  values: Readonly<Record<string, ScreenHostResourceParameter>>,
): ScreenJsonObject {
  return Object.fromEntries(
    Object.entries(values).flatMap(([name, parameter]) =>
      parameter.kind === 'literal' ? [[name, parameter.value]] : [],
    ),
  );
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

function appendFieldGrid(parent: HTMLElement): HTMLElement {
  const grid = parent.ownerDocument.createElement('div');
  grid.className = 'designer-field-grid';
  parent.appendChild(grid);
  return grid;
}

function appendListItem(parent: HTMLElement, text: string): void {
  const item = parent.ownerDocument.createElement('li');
  item.textContent = text;
  parent.appendChild(item);
}

function appendActionButton(
  parent: HTMLElement,
  label: string,
  action: string,
  disabled: boolean,
  unavailableReason: string,
): void {
  const button = parent.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-button';
  button.dataset.action = action;
  button.textContent = label;
  button.disabled = disabled;
  if (disabled) {
    button.title = unavailableReason;
    button.ariaLabel = `${label}：${unavailableReason}`;
  }
  parent.appendChild(button);
}

function multiSelectionGroupUnavailableReason(
  summary: Extract<DesignerInspectorContext, { readonly kind: 'multi-selection' }>['summary'],
): string {
  if (summary.count < 2) return DESIGNER_UI_TEXT.propertiesPanel.groupUnavailableCount;
  if (!summary.sameParent) return DESIGNER_UI_TEXT.propertiesPanel.groupUnavailableDifferentParents;
  if (summary.hasLocked) return DESIGNER_UI_TEXT.propertiesPanel.groupUnavailableLocked;
  return '';
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
      ? DESIGNER_UI_TEXT.propertiesPanel.resourceTypeUnavailable
      : DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid;
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code, path: [], message }],
  };
}
