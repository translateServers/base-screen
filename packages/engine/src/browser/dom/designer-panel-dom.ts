import type {
  ScreenCanvasBackground,
  ScreenCanvasColorStop,
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenComponentStyleRule,
  ScreenComponentStyleRuleOperator,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourceParameter,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { MAX_STYLE_RULES_PER_COMPONENT, parseScreenJsonValue } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialPropSchema,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { validateBaseScreenMaterialProps } from '@base-screen/plugin-core';
import type { BaseScreenCanvasScaleMode } from '../../canvas-presentation.js';
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
import {
  commonStyleFields,
  createMultiSelectionGeometryTransaction,
  createMultiSelectionStyleTransaction,
} from '../../common/operations/designer-multi-selection-operations.js';
import {
  createStyleRuleDraft,
  createStyleRulesTransaction,
  STYLE_RULE_OPERATORS,
} from '../../common/operations/designer-style-rule-operations.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';
import {
  createDesignerColorPalette,
  readDesignerColorPaletteValue,
} from './designer-color-palette-dom.js';
import {
  type DesignerDescriptorDatasetFields,
  renderDesignerDescriptorZone,
} from './designer-descriptor-dom.js';
import { appendDesignerQuickStyle } from './designer-quick-style-dom.js';

export interface DesignerPanelInput {
  readonly value: string;
  readonly checked?: boolean;
  readonly type?: string;
}

export type DesignerCanvasScaleMode = BaseScreenCanvasScaleMode;

export interface DesignerCanvasPresentationSettings {
  opacity: number;
  scaleMode: DesignerCanvasScaleMode;
  backgroundAutoFill: boolean;
  disableComponentLoading: boolean;
  thumbnailUrl: string | undefined;
}

export function createDesignerCanvasPresentationSettings(): DesignerCanvasPresentationSettings {
  return {
    opacity: 1,
    scaleMode: 'fill',
    backgroundAutoFill: true,
    disableComponentLoading: false,
    thumbnailUrl: undefined,
  };
}

export interface DesignerCanvasBackgroundDrafts {
  activeType: ScreenCanvasBackground['type'];
  solid: Extract<ScreenCanvasBackground, { readonly type: 'solid' }>;
  linear: Extract<ScreenCanvasBackground, { readonly type: 'linear-gradient' }>;
  radial: Extract<ScreenCanvasBackground, { readonly type: 'radial-gradient' }>;
  committedSignature: string;
}

export function createDesignerCanvasBackgroundDrafts(
  document?: ScreenDocument,
): DesignerCanvasBackgroundDrafts {
  const background = document?.canvas.background;
  const solid =
    background?.type === 'solid'
      ? background
      : { type: 'solid' as const, color: document?.canvas.backgroundColor ?? '#000000' };
  const linear = background?.type === 'linear-gradient' ? background : defaultLinearBackground();
  const radial = background?.type === 'radial-gradient' ? background : defaultRadialBackground();
  return {
    activeType: background?.type ?? 'solid',
    solid,
    linear,
    radial,
    committedSignature: backgroundSignature(document?.canvas.background),
  };
}

export function createInitialDataSource(
  manifest: BaseScreenMaterialManifest | undefined,
): ScreenComponentDataSource | null {
  return manifest?.defaultData === undefined
    ? null
    : {
        type: 'static',
        value: manifest.defaultData,
        ...(manifest.staticData?.kind === 'tabular'
          ? { binding: manifest.staticData.defaultBinding }
          : {}),
      };
}

export function renderDesignerProperties(
  properties: HTMLElement,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
  canvasBackgroundImageButtonVisible = false,
  canvasBackgroundDrafts = createDesignerCanvasBackgroundDrafts(document),
  canvasPresentation = createDesignerCanvasPresentationSettings(),
): void {
  properties.replaceChildren();
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind === 'canvas') {
    if (document !== undefined) {
      syncCanvasBackgroundDrafts(canvasBackgroundDrafts, document);
      appendCanvasControls(
        properties,
        document,
        canvasBackgroundImageButtonVisible,
        canvasBackgroundDrafts,
        canvasPresentation,
      );
    }
    return;
  }
  if (context.kind === 'multi-selection') {
    appendMultiSelectionControls(properties, context, document, interaction, catalog);
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
  geometry.className += ' designer-datav-geometry-section';
  const geometryGrid = appendFieldGrid(geometry);
  geometryGrid.className += ' designer-datav-geometry-grid';
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
    DESIGNER_UI_TEXT.propertiesPanel.rotation,
    'rotation',
    component.rotation,
    'number',
    '-180',
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
  if (manifest !== undefined) appendFlipActions(geometryGrid, component, manifest);
  const zIndex = appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.zIndex,
    'zIndex',
    component.zIndex,
    'number',
    '0',
  );
  zIndex.dataset.inspectorAdvanced = 'true';
  const status = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.status, true);
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
  appendCommonOpacityControl(properties, component, manifest);
  appendDesignerQuickStyle(properties, manifest, { components: [component] });

  const descriptorAppearance = manifest.editorDescriptor?.appearance;
  if (descriptorAppearance !== undefined && descriptorAppearance.length > 0) {
    renderDesignerDescriptorZone(properties, descriptorAppearance, {
      document,
      interaction,
      catalog,
      getDatasetFields,
    });
    appendStyleRulesSection(properties, component, manifest, document);
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
        `${component.id}:prop:${field.prop}`,
      );
    }
  }
  const stylePanel = manifest.stylePanel ?? [];
  const style =
    stylePanel.length === 0
      ? undefined
      : appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.style);
  for (const field of stylePanel) {
    if (field.style === 'opacity') continue;
    const schema = manifest.styleSchema.properties[field.style];
    if (schema !== undefined && style !== undefined) {
      appendStyleControl(
        style,
        field.label,
        field.style,
        component.style[field.style],
        schema,
        field.control,
        `${component.id}:style:${field.style}`,
      );
    }
  }
  appendStyleRulesSection(properties, component, manifest, document);
}

function appendCommonOpacityControl(
  properties: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
): void {
  const schema = manifest.styleSchema.properties.opacity;
  if (schema?.kind !== 'number') return;
  const section = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.commonStyle);
  section.className += ' designer-datav-common-section';
  const field = properties.ownerDocument.createElement('span');
  field.className = 'designer-field designer-field-label designer-opacity-field';
  field.textContent = DESIGNER_UI_TEXT.propertiesPanel.opacity;
  const controls = properties.ownerDocument.createElement('span');
  controls.className = 'designer-opacity-controls';
  const range = properties.ownerDocument.createElement('input');
  range.type = 'range';
  range.className = 'designer-control designer-range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(Math.round(Number(component.style.opacity ?? 1) * 100));
  range.dataset.style = 'opacity';
  range.dataset.opacityPercent = 'true';
  range.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.opacity);
  const number = properties.ownerDocument.createElement('input');
  number.type = 'number';
  number.className = 'designer-control designer-input designer-number';
  number.min = '0';
  number.max = '1';
  number.step = '0.01';
  number.value = String(component.style.opacity ?? 1);
  number.dataset.style = 'opacity';
  number.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.opacity);
  controls.appendChild(range);
  controls.appendChild(number);
  field.appendChild(controls);
  appendFieldMessage(field, number, 'style-opacity');
  section.appendChild(field);
}

function appendFlipActions(
  parent: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
): void {
  const supportsHorizontal = manifest.styleSchema.properties.flipX?.kind === 'boolean';
  const supportsVertical = manifest.styleSchema.properties.flipY?.kind === 'boolean';
  if (!supportsHorizontal && !supportsVertical) return;
  const field = parent.ownerDocument.createElement('div');
  field.className = 'designer-field designer-field-label designer-flip-field';
  field.textContent = DESIGNER_UI_TEXT.propertiesPanel.flipHorizontal;
  const actions = parent.ownerDocument.createElement('span');
  actions.className = 'designer-flip-actions';
  if (supportsHorizontal) {
    actions.appendChild(
      flipButton(
        parent.ownerDocument,
        DESIGNER_UI_TEXT.propertiesPanel.flipHorizontal,
        'flipX',
        component.style.flipX === true,
      ),
    );
  }
  if (supportsVertical) {
    const button = flipButton(
      parent.ownerDocument,
      DESIGNER_UI_TEXT.propertiesPanel.flipVertical,
      'flipY',
      component.style.flipY === true,
    );
    button.dataset.flipLabel = DESIGNER_UI_TEXT.propertiesPanel.flipVertical;
    actions.appendChild(button);
  }
  field.appendChild(actions);
  parent.appendChild(field);
}

function flipButton(
  ownerDocument: Document,
  label: string,
  property: 'flipX' | 'flipY',
  pressed: boolean,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button designer-flip-button';
  button.dataset.geometryAction = property;
  button.dataset.flipLabel = label;
  button.ariaPressed = String(pressed);
  button.title = label;
  button.setAttribute('aria-label', label);
  button.textContent = property === 'flipX' ? '↔' : '↕';
  return button;
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
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  const summary = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.selectionSummary);
  summary.className += ' designer-datav-batch-summary';
  summary.dataset.inspectorAdvanced = 'true';
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
  arrange.className += ' designer-datav-batch-arrange';
  const arrangeGrid = properties.ownerDocument.createElement('div');
  arrangeGrid.className = 'designer-datav-batch-arrange-grid';
  for (const [action, label, icon] of [
    ['align-left', DESIGNER_UI_TEXT.propertiesPanel.alignLeft, 'align-left'],
    ['align-center', DESIGNER_UI_TEXT.propertiesPanel.alignCenter, 'align-center'],
    ['align-right', DESIGNER_UI_TEXT.propertiesPanel.alignRight, 'align-right'],
    ['align-top', DESIGNER_UI_TEXT.propertiesPanel.alignTop, 'align-top'],
    ['align-middle', DESIGNER_UI_TEXT.propertiesPanel.alignMiddle, 'align-middle'],
    ['align-bottom', DESIGNER_UI_TEXT.propertiesPanel.alignBottom, 'align-bottom'],
  ] as const) {
    appendBatchArrangeButton(
      arrangeGrid,
      label,
      action,
      icon,
      !context.summary.canAlign,
      DESIGNER_UI_TEXT.propertiesPanel.alignUnavailableCount,
    );
  }
  appendBatchArrangeButton(
    arrangeGrid,
    DESIGNER_UI_TEXT.propertiesPanel.distributeHorizontal,
    'distribute-horizontal',
    'distribute-horizontal',
    !context.summary.canDistribute,
    DESIGNER_UI_TEXT.propertiesPanel.distributeUnavailableCount,
  );
  appendBatchArrangeButton(
    arrangeGrid,
    DESIGNER_UI_TEXT.propertiesPanel.distributeVertical,
    'distribute-vertical',
    'distribute-vertical',
    !context.summary.canDistribute,
    DESIGNER_UI_TEXT.propertiesPanel.distributeUnavailableCount,
  );
  arrange.appendChild(arrangeGrid);
  appendBatchGeometryControls(properties, context, interaction);
  appendBatchQuickConfiguration(properties, context, interaction, catalog);
  appendBatchStyleControls(properties, context, document, interaction, catalog);
  const actions = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.groupActions);
  actions.className += ' designer-datav-batch-secondary-actions';
  actions.dataset.inspectorAdvanced = 'true';
  appendActionButton(
    actions,
    DESIGNER_UI_TEXT.propertiesPanel.actionGroup,
    'group',
    !context.summary.canGroup,
    multiSelectionGroupUnavailableReason(context.summary),
  );
  appendMultiSelectionStateActions(properties, context);
}

/**
 * 批量几何编辑区（ADR-0053 R1）：宽度/高度/旋转，值显示焦点组件当前值，
 * 编辑后应用到全部选中组件。全部锁定或无选中时禁用。
 */
function appendMultiSelectionStateActions(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'multi-selection' }>,
): void {
  const section = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.selectionActions);
  section.className += ' designer-datav-batch-secondary-actions';
  section.dataset.inspectorAdvanced = 'true';
  const allLocked = context.components.every((component) => component.status.locked);
  const allHidden = context.components.every((component) => component.status.hidden);
  appendActionButton(
    section,
    allLocked
      ? DESIGNER_UI_TEXT.propertiesPanel.actionUnlock
      : DESIGNER_UI_TEXT.propertiesPanel.actionLock,
    allLocked ? 'unlock' : 'lock',
    false,
    '',
  );
  appendActionButton(
    section,
    allHidden
      ? DESIGNER_UI_TEXT.propertiesPanel.actionShow
      : DESIGNER_UI_TEXT.propertiesPanel.actionHide,
    allHidden ? 'show' : 'hide',
    false,
    '',
  );
  appendActionButton(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.actionDuplicate,
    'duplicate',
    false,
    '',
  );
  appendActionButton(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.actionDelete,
    'delete',
    allLocked,
    allLocked ? DESIGNER_UI_TEXT.propertiesPanel.actionUnavailableAllLocked : '',
  );
}

function appendBatchGeometryControls(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'multi-selection' }>,
  interaction: ScreenInteractionState,
): void {
  const focused =
    context.components.find((item) => item.id === interaction.focusedComponentId) ??
    context.components[0];
  if (focused === undefined) return;
  const disabled =
    context.summary.hasLocked && context.components.every((item) => item.status.locked);
  const hint = disabled
    ? DESIGNER_UI_TEXT.propertiesPanel.batchAllLocked
    : DESIGNER_UI_TEXT.propertiesPanel.batchActionsHint(context.summary.count);
  const geometry = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.geometry);
  geometry.className += ' designer-datav-batch-geometry';
  const position = appendBatchFieldRow(
    geometry,
    DESIGNER_UI_TEXT.propertiesPanel.batchObjectPosition,
  );
  appendBatchReadOnlyInput(position, DESIGNER_UI_TEXT.propertiesPanel.x);
  appendBatchReadOnlyInput(position, DESIGNER_UI_TEXT.propertiesPanel.y);
  const size = appendBatchFieldRow(geometry, DESIGNER_UI_TEXT.propertiesPanel.batchObjectSize);
  appendBatchNumberInput(
    size,
    DESIGNER_UI_TEXT.propertiesPanel.width,
    'width',
    focused.size.width,
    context.components.some((item) => item.size.width !== focused.size.width),
    disabled,
    hint,
  );
  appendBatchNumberInput(
    size,
    DESIGNER_UI_TEXT.propertiesPanel.height,
    'height',
    focused.size.height,
    context.components.some((item) => item.size.height !== focused.size.height),
    disabled,
    hint,
  );
  const rotation = appendBatchNumberInput(
    geometry,
    DESIGNER_UI_TEXT.propertiesPanel.rotation,
    'rotation',
    focused.rotation,
    context.components.some((item) => item.rotation !== focused.rotation),
    disabled,
    hint,
  );
  rotation.dataset.inspectorAdvanced = 'true';
}

function appendBatchQuickConfiguration(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'multi-selection' }>,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  const focused =
    context.components.find((item) => item.id === interaction.focusedComponentId) ??
    context.components[0];
  if (
    focused === undefined ||
    !context.components.every((component) => component.type === focused.type)
  ) {
    return;
  }
  const manifest = catalog?.get(focused.type)?.manifest;
  if (manifest === undefined) return;
  appendDesignerQuickStyle(properties, manifest, {
    components: context.components,
    includePresets: false,
    preferenceContext: `batch:${manifest.type}`,
    title: DESIGNER_UI_TEXT.propertiesPanel.quickConfiguration,
    variant: 'batch',
  });
}

function appendBatchFieldRow(parent: HTMLElement, labelText: string): HTMLElement {
  const row = parent.ownerDocument.createElement('div');
  row.className = 'designer-datav-batch-field-row';
  const label = parent.ownerDocument.createElement('span');
  label.className = 'designer-datav-batch-field-row-label';
  label.textContent = labelText;
  const controls = parent.ownerDocument.createElement('div');
  controls.className = 'designer-datav-batch-field-row-controls';
  row.appendChild(label);
  row.appendChild(controls);
  parent.appendChild(row);
  return controls;
}

function appendBatchReadOnlyInput(parent: HTMLElement, labelText: string): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label designer-datav-batch-readonly';
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = 'text';
  input.className = 'designer-control designer-input';
  input.placeholder = DESIGNER_UI_TEXT.propertiesPanel.multipleValues;
  input.disabled = true;
  input.setAttribute(
    'aria-label',
    `${labelText}：${DESIGNER_UI_TEXT.propertiesPanel.multipleValues}`,
  );
  label.appendChild(input);
  parent.appendChild(label);
}

/**
 * 批量样式编辑区（ADR-0053 R2）：所有选中组件 stylePanel 字段的交集；
 * 交集为空（混合类型）时只显示几何区。控件复用单选渲染（三段式调色板等）。
 */
function appendBatchStyleControls(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'multi-selection' }>,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  if (document === undefined) return;
  const componentIds = context.components.map((item) => item.id);
  const fields = commonStyleFields(document, componentIds, catalog);
  if (fields.length === 0) {
    appendBatchUnifiedStyleEmpty(properties);
    return;
  }
  const focused =
    context.components.find((item) => item.id === interaction.focusedComponentId) ??
    context.components[0];
  const manifest = focused === undefined ? undefined : catalog?.get(focused.type)?.manifest;
  if (manifest === undefined || focused === undefined) return;
  const disabled =
    context.summary.hasLocked && context.components.every((item) => item.status.locked);
  const hint = disabled
    ? DESIGNER_UI_TEXT.propertiesPanel.batchAllLocked
    : DESIGNER_UI_TEXT.propertiesPanel.batchActionsHint(context.summary.count);
  const style = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.unifiedStyle);
  style.className += ' designer-datav-batch-unified-style';
  for (const field of fields) {
    const schema = manifest.styleSchema?.properties?.[field];
    const panelField = (manifest.stylePanel ?? []).find((item) => item.style === field);
    if (schema === undefined || panelField === undefined) continue;
    appendBatchStyleControl(
      style,
      panelField.label,
      field,
      focused.style[field],
      context.components.some(
        (item) => JSON.stringify(item.style[field]) !== JSON.stringify(focused.style[field]),
      ),
      schema,
      panelField.control,
      disabled,
      hint,
    );
  }
}

function appendBatchUnifiedStyleEmpty(properties: HTMLElement): void {
  const section = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.unifiedStyle);
  section.className += ' designer-datav-batch-unified-style';
  const empty = properties.ownerDocument.createElement('button');
  empty.type = 'button';
  empty.className = 'designer-control designer-button designer-datav-batch-unified-empty';
  empty.disabled = true;
  empty.textContent = DESIGNER_UI_TEXT.propertiesPanel.noUnifiedStyle;
  section.appendChild(empty);
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
  canvasBackgroundDrafts?: DesignerCanvasBackgroundDrafts,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const geometryAction = target.dataset.geometryAction;
  if (geometryAction === 'flipX' || geometryAction === 'flipY') {
    const context = getDesignerInspectorContext(document, interaction, catalog);
    if (context.kind !== 'single-material' || context.manifest === undefined) return undefined;
    const schema = context.manifest.styleSchema.properties[geometryAction];
    if (schema?.kind !== 'boolean') return undefined;
    return success(
      update(context.component.id, {
        style: {
          ...context.component.style,
          [geometryAction]: context.component.style[geometryAction] !== true,
        },
      }),
    );
  }
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material' && context.kind !== 'single-group') {
    return createCanvasTransaction(document, target, canvasBackgroundDrafts);
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
    (manifest.stylePanel.some((field) => field.style === style) || style === 'opacity')
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

/**
 * 多选批量编辑事务分派（ADR-0053）：`data-multi-property` 控件（批量几何宽/高/旋转、
 * 批量样式 `style:<field>`）的独立事务通道；单选事务通道（createPropertyTransaction）
 * 零改动。值显示焦点组件，编辑后应用到全部选中组件（跳过锁定成员）。
 */
export function createMultiSelectionTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target) || document === undefined) return undefined;
  const multiProperty = target.dataset.multiProperty;
  if (multiProperty === undefined) return undefined;
  const componentIds = interaction.selectedComponentIds;
  if (multiProperty === 'width' || multiProperty === 'height' || multiProperty === 'rotation') {
    return createMultiSelectionGeometryTransaction(
      document,
      componentIds,
      multiProperty,
      Number(target.value),
    );
  }
  if (multiProperty.startsWith('style:')) {
    const style = multiProperty.slice('style:'.length);
    const focused = document.components.find((item) => item.id === interaction.focusedComponentId);
    const manifest = focused === undefined ? undefined : catalog?.get(focused.type)?.manifest;
    const schema = manifest?.styleSchema?.properties?.[style];
    if (schema === undefined) return undefined;
    const value = parsePropertyControlValue(target, schema);
    if (value === undefined) return undefined;
    return createMultiSelectionStyleTransaction(document, componentIds, style, value, catalog);
  }
  return undefined;
}

/**
 * 条件样式字段编辑事务（ADR-0058）：`data-style-rule-path/operator/value/style` 控件
 * 的变更在当前规则数组上做单项替换，整份数组经校验后恰一条事务提交。
 */
export function createStyleRuleEditTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target) || document === undefined) return undefined;
  const dataset = target.dataset;
  const pathMarker = dataset.styleRulePath;
  const operatorMarker = dataset.styleRuleOperator;
  const valueMarker = dataset.styleRuleValue;
  const styleMarker = dataset.styleRuleStyle;
  if (
    pathMarker === undefined &&
    operatorMarker === undefined &&
    valueMarker === undefined &&
    styleMarker === undefined
  ) {
    return undefined;
  }
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material' || context.manifest === undefined) return undefined;
  const component = context.component;
  const rules = component.styleRules ?? [];
  const replaceAt = (
    index: number,
    next: ScreenComponentStyleRule,
  ): ScreenParseResult<ScreenDocumentTransaction> | undefined =>
    createStyleRulesTransaction(
      document,
      component.id,
      rules.map((rule, position) => (position === index ? next : rule)),
      catalog,
    );

  if (pathMarker !== undefined) {
    const index = Number(pathMarker);
    const rule = rules[index];
    if (rule === undefined) return undefined;
    const path =
      target.value.trim() === '' ? [] : target.value.split('.').map((segment) => segment.trim());
    if (path.some((segment) => segment === '')) return undefined;
    return replaceAt(index, { ...rule, when: { ...rule.when, path } });
  }
  if (operatorMarker !== undefined) {
    const index = Number(operatorMarker);
    const rule = rules[index];
    const operator = target.value as ScreenComponentStyleRuleOperator;
    if (rule === undefined || !STYLE_RULE_OPERATORS.includes(operator)) return undefined;
    const when =
      operator === 'exists'
        ? { path: rule.when.path, operator }
        : {
            path: rule.when.path,
            operator,
            ...(rule.when.value === undefined ? {} : { value: rule.when.value }),
          };
    return replaceAt(index, { ...rule, when });
  }
  if (valueMarker !== undefined) {
    const index = Number(valueMarker);
    const rule = rules[index];
    if (rule === undefined) return undefined;
    const parsed = parseJsonDraft(target.value);
    if (parsed === undefined) return undefined;
    return replaceAt(index, { ...rule, when: { ...rule.when, value: parsed } });
  }
  if (styleMarker === undefined) return undefined;
  const separator = styleMarker.indexOf(':');
  const index = Number(styleMarker.slice(0, separator));
  const key = styleMarker.slice(separator + 1);
  const rule = rules[index];
  const schema = context.manifest.styleSchema.properties[key];
  if (
    rule === undefined ||
    schema === undefined ||
    !context.manifest.stylePanel.some((field) => field.style === key)
  ) {
    return undefined;
  }
  const parsed = parsePropertyControlValue(target, schema);
  if (parsed === undefined) return undefined;
  return replaceAt(index, { ...rule, style: { ...rule.style, [key]: parsed } });
}

/**
 * 条件样式添加/删除按钮事务（ADR-0058）：追加默认草稿或按索引移除，
 * 同样整份数组校验后恰一条事务提交。
 */
export function createStyleRuleClickTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined) return undefined;
  const dataset = (target as { readonly dataset?: DOMStringMap } | null)?.dataset;
  if (dataset === undefined) return undefined;
  const add = dataset.styleRuleAdd;
  const remove = dataset.styleRuleRemove;
  if (add === undefined && remove === undefined) return undefined;
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material') return undefined;
  const component = context.component;
  const rules = component.styleRules ?? [];
  const next =
    add !== undefined
      ? [...rules, createStyleRuleDraft(rules)]
      : rules.filter((_, position) => position !== Number(remove));
  return createStyleRulesTransaction(document, component.id, next, catalog);
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
    return success(
      update(component.id, {
        dataSource: {
          type: source.type,
          value: value.value,
          ...(component.dataSource?.type === 'static' && component.dataSource.binding !== undefined
            ? { binding: component.dataSource.binding }
            : {}),
        },
      }),
    );
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
        dataSource: {
          ...source,
          params: literalParameters(params.value),
          binding:
            component.dataSource?.type === 'host-resource' ? component.dataSource.binding : null,
        },
      }),
    );
  }
  return success(update(component.id, { dataSource: source }));
}

export function parsePropertyControlValue(
  input: DesignerPanelInput,
  schema: BaseScreenMaterialPropSchema,
): ScreenJsonValue | undefined {
  const paletteValue = readDesignerColorPaletteValue(input as unknown as EventTarget);
  if (paletteValue !== undefined) return paletteValue;
  if (input.type === 'checkbox') return input.checked === true;
  const dataset = (input as unknown as { readonly dataset?: DOMStringMap }).dataset;
  if (dataset?.opacityPercent === 'true' && schema.kind === 'number') {
    const percent = Number(input.value);
    return Number.isFinite(percent) ? percent / 100 : undefined;
  }
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
  drafts = createDesignerCanvasBackgroundDrafts(document),
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined || target.dataset.canvasProperty === undefined) return undefined;
  const property = target.dataset.canvasProperty;
  if (property === 'backgroundType') {
    if (!isCanvasBackgroundType(target.value)) return undefined;
    drafts.activeType = target.value;
    return canvasBackgroundTransaction(drafts, activeCanvasBackground(drafts));
  }
  if (property === 'backgroundSolidColor') {
    drafts.solid = { type: 'solid', color: target.value };
    return canvasBackgroundTransaction(drafts, drafts.solid);
  }
  if (property === 'backgroundLinearAngle') {
    const angle = Number(target.value);
    if (!Number.isFinite(angle) || angle < 0 || angle > 360) return undefined;
    drafts.linear = { ...drafts.linear, angle };
    return canvasBackgroundTransaction(drafts, drafts.linear);
  }
  if (property === 'backgroundRadialX' || property === 'backgroundRadialY') {
    const coordinate = Number(target.value);
    if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 100) return undefined;
    drafts.radial = {
      ...drafts.radial,
      position: {
        ...drafts.radial.position,
        [property === 'backgroundRadialX' ? 'x' : 'y']: coordinate,
      },
    };
    return canvasBackgroundTransaction(drafts, drafts.radial);
  }
  if (property === 'backgroundStopColor' || property === 'backgroundStopPosition') {
    const index = Number(target.dataset.canvasBackgroundStopIndex);
    if (!Number.isInteger(index)) return undefined;
    const background = activeCanvasBackground(drafts);
    if (background.type === 'solid' || background.stops[index] === undefined) return undefined;
    const value = property === 'backgroundStopColor' ? target.value : Number(target.value);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > 100)) {
      return undefined;
    }
    const stops = background.stops.map((stop, stopIndex) =>
      stopIndex === index
        ? { ...stop, [property === 'backgroundStopColor' ? 'color' : 'position']: value }
        : stop,
    );
    if (!areAscendingStops(stops)) return undefined;
    setActiveCanvasBackground(drafts, { ...background, stops });
    return canvasBackgroundTransaction(drafts, activeCanvasBackground(drafts));
  }
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

export function createCanvasBackgroundStopTransaction(
  document: ScreenDocument | undefined,
  drafts: DesignerCanvasBackgroundDrafts,
  action: 'add' | 'remove',
  index?: number,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined) return undefined;
  const background = activeCanvasBackground(drafts);
  if (background.type === 'solid') return undefined;
  if (action === 'add') {
    if (background.stops.length >= 8) return undefined;
    const last = background.stops[background.stops.length - 1]!;
    const previous = background.stops[background.stops.length - 2]!;
    const position = previous.position + (last.position - previous.position) / 2;
    setActiveCanvasBackground(drafts, {
      ...background,
      stops: [...background.stops.slice(0, -1), { color: previous.color, position }, last],
    });
  } else {
    if (
      index === undefined ||
      background.stops.length <= 2 ||
      background.stops[index] === undefined
    ) {
      return undefined;
    }
    setActiveCanvasBackground(drafts, {
      ...background,
      stops: background.stops.filter((_, stopIndex) => stopIndex !== index),
    });
  }
  return canvasBackgroundTransaction(drafts, activeCanvasBackground(drafts));
}

function appendInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
  min?: string,
): HTMLLabelElement {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const symbol = geometryPropertySymbol(property);
  if (symbol !== undefined) label.dataset.propertySymbol = symbol;
  const input = parent.ownerDocument.createElement('input');
  input.type = type;
  input.className = `designer-control designer-input${type === 'number' ? ' designer-number' : ''}`;
  input.value = String(value);
  input.dataset.property = property;
  if (min !== undefined) input.min = min;
  label.appendChild(input);
  appendFieldMessage(label, input, `property-${property}`);
  parent.appendChild(label);
  return label;
}

function geometryPropertySymbol(property: string): string | undefined {
  if (property === 'x') return 'X';
  if (property === 'y') return 'Y';
  if (property === 'width') return 'W';
  if (property === 'height') return 'H';
  if (property === 'rotation') return '°';
  if (property === 'zIndex') return 'Z';
  return undefined;
}

/** 批量数值输入（ADR-0053）：带 `data-multi-property` 标记，经独立事务分派。 */
function appendBatchNumberInput(
  parent: HTMLElement,
  labelText: string,
  multiProperty: string,
  value: number,
  mixed: boolean,
  disabled: boolean,
  hint: string,
): HTMLLabelElement {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = 'number';
  input.className = 'designer-control designer-input designer-number';
  input.value = mixed ? '' : String(value);
  if (mixed) {
    input.placeholder = DESIGNER_UI_TEXT.inspectorUi.mixed;
    input.dataset.mixed = 'true';
  }
  input.dataset.multiProperty = multiProperty;
  input.disabled = disabled;
  input.title = hint;
  label.appendChild(input);
  appendFieldMessage(label, input, `multi-property-${multiProperty}`);
  parent.appendChild(label);
  return label;
}

/** 批量样式控件（ADR-0053）：复用单选控件渲染，color 字段走统一三段式调色板。 */
function appendBatchStyleControl(
  parent: HTMLElement,
  labelText: string,
  style: string,
  value: ScreenJsonValue | undefined,
  mixed: boolean,
  schema: BaseScreenMaterialPropSchema,
  control: string,
  disabled: boolean,
  hint: string,
): void {
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      `multi:style:${style}`,
    );
    for (const input of palette.controls) {
      input.dataset.multiProperty = `style:${style}`;
      input.disabled = disabled;
      input.title = hint;
      if (mixed) input.dataset.mixed = 'true';
    }
    label.appendChild(palette.element);
    appendFieldMessage(label, palette.controls[0]!, `multi-style-${style}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.multiProperty = `style:${style}`;
    input.disabled = disabled;
    input.title = hint;
    if (mixed) {
      input.dataset.mixed = 'true';
      if (control === 'boolean' && input instanceof HTMLInputElement) {
        input.checked = false;
        input.indeterminate = true;
      } else if (control === 'select' && input instanceof HTMLSelectElement) {
        const option = parent.ownerDocument.createElement('option');
        option.value = '';
        option.textContent = DESIGNER_UI_TEXT.inspectorUi.mixed;
        option.selected = true;
        input.prepend(option);
      } else {
        input.value = '';
        (input as HTMLInputElement | HTMLTextAreaElement).placeholder =
          DESIGNER_UI_TEXT.inspectorUi.mixed;
      }
    }
    label.appendChild(input);
    appendFieldMessage(label, input, `multi-style-${style}`);
  }
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

function appendCanvasControls(
  parent: HTMLElement,
  document: ScreenDocument,
  canvasBackgroundImageButtonVisible: boolean,
  drafts: DesignerCanvasBackgroundDrafts,
  canvasPresentation: DesignerCanvasPresentationSettings,
): void {
  const section = appendSection(parent, DESIGNER_UI_TEXT.propertiesPanel.canvas);
  section.className += ' designer-datav-canvas-section';
  const size = parent.ownerDocument.createElement('div');
  size.className = 'designer-canvas-size';
  const sizeCaption = parent.ownerDocument.createElement('span');
  sizeCaption.className = 'designer-canvas-row-label';
  sizeCaption.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasDimensions;
  const sizeControls = parent.ownerDocument.createElement('span');
  sizeControls.className = 'designer-canvas-size-controls';
  const width = createCanvasInput(sizeControls, 'W', 'width', document.canvas.width, 'number');
  width.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasWidth);
  const height = createCanvasInput(sizeControls, 'H', 'height', document.canvas.height, 'number');
  height.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasHeight);
  size.appendChild(sizeCaption);
  size.appendChild(sizeControls);
  section.appendChild(size);
  appendCanvasPresentationControls(section, canvasPresentation);
  appendCanvasBackgroundControls(section, drafts);
  // 背景图片：URL 输入；宿主选择按钮（ADR-0046）默认隐藏，仅宿主配置
  // canvasBackgroundImageButton 后渲染（点击派发请求事件，宿主自开弹出框可视化选择）。
  if (canvasBackgroundImageButtonVisible) {
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
  } else {
    appendCanvasInput(
      section,
      DESIGNER_UI_TEXT.propertiesPanel.backgroundImage,
      'backgroundImage',
      document.canvas.backgroundImage ?? '',
      'text',
    );
  }
  appendCanvasSelect(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFit,
    'backgroundImageFit',
    document.canvas.backgroundImageFit ?? 'cover',
    document.canvas.backgroundImage === undefined,
  );
}

function appendCanvasPresentationControls(
  parent: HTMLElement,
  settings: DesignerCanvasPresentationSettings,
): void {
  const opacity = parent.ownerDocument.createElement('label');
  opacity.className = 'designer-field designer-field-label designer-canvas-opacity';
  opacity.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity;
  const opacityControls = parent.ownerDocument.createElement('span');
  opacityControls.className = 'designer-opacity-controls';
  const range = parent.ownerDocument.createElement('input');
  range.type = 'range';
  range.className = 'designer-control designer-range';
  range.min = '0';
  range.max = '1';
  range.step = '0.01';
  range.value = String(settings.opacity);
  range.dataset.canvasSetting = 'opacity';
  range.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity);
  const number = parent.ownerDocument.createElement('input');
  number.type = 'number';
  number.className = 'designer-control designer-input designer-number';
  number.min = '0';
  number.max = '1';
  number.step = '0.01';
  number.value = String(settings.opacity);
  number.dataset.canvasSetting = 'opacity';
  number.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity);
  opacityControls.appendChild(range);
  opacityControls.appendChild(number);
  opacity.appendChild(opacityControls);
  parent.appendChild(opacity);

  const scale = parent.ownerDocument.createElement('label');
  scale.className = 'designer-field designer-field-label designer-canvas-scale';
  scale.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasScaleMode;
  const scaleControls = parent.ownerDocument.createElement('span');
  scaleControls.className = 'designer-canvas-scale-options';
  const scaleOptions: readonly [DesignerCanvasScaleMode, string][] = [
    ['fill', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFill],
    ['fit', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFit],
    ['width', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleWidth],
    ['height', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleHeight],
    ['original', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleOriginal],
    ['none', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleNone],
  ];
  for (const [value, label] of scaleOptions) {
    const button = parent.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button designer-canvas-scale-option';
    button.dataset.canvasSetting = 'scaleMode';
    button.dataset.canvasSettingValue = value;
    button.textContent = label;
    button.title = label;
    button.ariaPressed = String(settings.scaleMode === value);
    scaleControls.appendChild(button);
  }
  scale.appendChild(scaleControls);
  parent.appendChild(scale);

  appendCanvasSettingCheckbox(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundAutoFill,
    'backgroundAutoFill',
    settings.backgroundAutoFill,
  );
  appendCanvasSettingCheckbox(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasDisableLoading,
    'disableComponentLoading',
    settings.disableComponentLoading,
  );

  const thumbnail = parent.ownerDocument.createElement('section');
  thumbnail.className = 'designer-inspector-section designer-canvas-thumbnail';
  thumbnail.dataset.inspectorSearchKind = 'section';
  thumbnail.dataset.inspectorSearchText = DESIGNER_UI_TEXT.propertiesPanel.canvasThumbnail;
  const heading = parent.ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasThumbnail;
  const actions = parent.ownerDocument.createElement('div');
  actions.className = 'designer-canvas-thumbnail-actions';
  actions.appendChild(
    canvasSettingAction(
      parent.ownerDocument,
      DESIGNER_UI_TEXT.propertiesPanel.canvasThumbnailCapture,
      'capture-thumbnail',
    ),
  );
  actions.appendChild(
    canvasSettingAction(
      parent.ownerDocument,
      DESIGNER_UI_TEXT.propertiesPanel.canvasThumbnailUpload,
      'upload-thumbnail',
    ),
  );
  const preview = parent.ownerDocument.createElement('div');
  preview.className = 'designer-canvas-thumbnail-preview';
  if (settings.thumbnailUrl !== undefined) {
    const image = parent.ownerDocument.createElement('img');
    image.src = settings.thumbnailUrl;
    image.alt = '';
    preview.appendChild(image);
  } else {
    preview.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasThumbnailHint;
  }
  thumbnail.appendChild(heading);
  thumbnail.appendChild(actions);
  thumbnail.appendChild(preview);
  parent.appendChild(thumbnail);
}

function appendCanvasSettingCheckbox(
  parent: HTMLElement,
  labelText: string,
  setting: 'backgroundAutoFill' | 'disableComponentLoading',
  checked: boolean,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label designer-canvas-setting-checkbox';
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.className = 'designer-checkbox';
  input.checked = checked;
  input.value = String(checked);
  input.dataset.canvasSetting = setting;
  label.appendChild(input);
  parent.appendChild(label);
}

function canvasSettingAction(
  ownerDocument: Document,
  label: string,
  action: string,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.canvasSettingAction = action;
  button.textContent = label;
  return button;
}

function appendCanvasBackgroundControls(
  parent: HTMLElement,
  drafts: DesignerCanvasBackgroundDrafts,
): void {
  const type = parent.ownerDocument.createElement('label');
  type.className = 'designer-field designer-field-label';
  type.dataset.canvasField = 'backgroundType';
  type.dataset.inspectorAdvanced = 'true';
  type.textContent = DESIGNER_UI_TEXT.propertiesPanel.backgroundType;
  const select = type.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.canvasProperty = 'backgroundType';
  for (const [value, label] of [
    ['solid', DESIGNER_UI_TEXT.propertiesPanel.backgroundSolid],
    ['linear-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundLinear],
    ['radial-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundRadial],
  ] as const) {
    const option = select.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = drafts.activeType;
  type.appendChild(select);
  appendFieldMessage(type, select, 'canvas-backgroundType');
  parent.appendChild(type);

  if (drafts.activeType === 'solid') {
    appendCanvasInput(
      parent,
      DESIGNER_UI_TEXT.propertiesPanel.canvasBackground,
      'backgroundSolidColor',
      drafts.solid.color,
      'color',
    );
    return;
  }
  if (drafts.activeType === 'linear-gradient') {
    appendCanvasInput(
      parent,
      DESIGNER_UI_TEXT.propertiesPanel.gradientAngle,
      'backgroundLinearAngle',
      drafts.linear.angle,
      'number',
    );
    appendCanvasGradientStops(parent, drafts.linear.stops);
    return;
  }
  appendCanvasInput(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterX,
    'backgroundRadialX',
    drafts.radial.position.x,
    'number',
  );
  appendCanvasInput(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterY,
    'backgroundRadialY',
    drafts.radial.position.y,
    'number',
  );
  appendCanvasGradientStops(parent, drafts.radial.stops);
}

function appendCanvasGradientStops(
  parent: HTMLElement,
  stops: readonly ScreenCanvasColorStop[],
): void {
  const section = parent.ownerDocument.createElement('div');
  section.className = 'designer-field-grid';
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]!;
    const color = createCanvasInput(
      section,
      DESIGNER_UI_TEXT.propertiesPanel.gradientStopColor,
      'backgroundStopColor',
      stop.color,
      'color',
    );
    color.dataset.canvasBackgroundStopIndex = String(index);
    const position = createCanvasInput(
      section,
      DESIGNER_UI_TEXT.propertiesPanel.gradientStopPosition,
      'backgroundStopPosition',
      stop.position,
      'number',
    );
    position.dataset.canvasBackgroundStopIndex = String(index);
    const remove = section.ownerDocument.createElement('button');
    remove.type = 'button';
    remove.className = 'designer-control designer-button';
    remove.disabled = stops.length <= 2;
    remove.dataset.canvasBackgroundStopAction = 'remove';
    remove.dataset.canvasBackgroundStopIndex = String(index);
    remove.textContent = DESIGNER_UI_TEXT.propertiesPanel.gradientRemoveStop;
    section.appendChild(remove);
  }
  const add = section.ownerDocument.createElement('button');
  add.type = 'button';
  add.className = 'designer-control designer-button';
  add.disabled = stops.length >= 8;
  add.dataset.canvasBackgroundStopAction = 'add';
  add.textContent = DESIGNER_UI_TEXT.propertiesPanel.gradientAddStop;
  section.appendChild(add);
  parent.appendChild(section);
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
  label.dataset.canvasField = property;
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

function createCanvasInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
): HTMLInputElement {
  // color 输入用 span 容器：label 点击会激活 color input 弹出原生取色器。
  const label = parent.ownerDocument.createElement(type === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.dataset.canvasField = property;
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
  return input;
}

function appendCanvasInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
): HTMLInputElement {
  // color 输入用 span 容器：label 点击会激活 color input 弹出原生取色器。
  const label = parent.ownerDocument.createElement(type === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.dataset.canvasField = property;
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
  return input;
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
  paletteKey: string,
): void {
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      paletteKey,
    );
    for (const input of palette.controls) input.dataset.prop = prop;
    label.appendChild(palette.element);
    appendFieldMessage(label, palette.controls[0]!, `prop-${prop}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.prop = prop;
    label.appendChild(input);
    appendFieldMessage(label, input, `prop-${prop}`);
  }
  parent.appendChild(label);
}

function appendStyleControl(
  parent: HTMLElement,
  labelText: string,
  style: string,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
  paletteKey: string,
): void {
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      paletteKey,
    );
    for (const input of palette.controls) input.dataset.style = style;
    label.appendChild(palette.element);
    appendFieldMessage(label, palette.controls[0]!, `style-${style}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.style = style;
    label.appendChild(input);
    appendFieldMessage(label, input, `style-${style}`);
  }
  parent.appendChild(label);
}

/**
 * 条件样式编辑区（ADR-0058）：规则列表 + 添加/删除；每条规则编辑数据路径、
 * 操作符、比较值与 stylePanel 声明的样式覆盖。锁定组件只读；多选不渲染本区。
 */
function appendStyleRulesSection(
  parent: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
  document: ScreenDocument | undefined,
): void {
  // 无可编辑样式键的物料（如组）不提供条件样式：规则样式覆盖需要 stylePanel 控件。
  if ((manifest.stylePanel ?? []).length === 0) return;
  const section = appendSection(parent, DESIGNER_UI_TEXT.propertiesPanel.conditionalStyles, true);
  const locked =
    document !== undefined && isScreenComponentEffectivelyLocked(document, component.id);
  const rules = component.styleRules ?? [];
  if (rules.length === 0) {
    const empty = parent.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleEmpty;
    section.appendChild(empty);
  }
  for (let index = 0; index < rules.length; index++) {
    appendStyleRuleBlock(section, component, manifest, rules[index]!, index, locked);
  }
  const add = parent.ownerDocument.createElement('button');
  add.type = 'button';
  add.className = 'designer-button';
  add.dataset.styleRuleAdd = '';
  add.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleAdd;
  add.disabled = locked || rules.length >= MAX_STYLE_RULES_PER_COMPONENT;
  section.appendChild(add);
}

function appendStyleRuleBlock(
  section: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
  rule: ScreenComponentStyleRule,
  index: number,
  locked: boolean,
): void {
  const ownerDocument = section.ownerDocument;
  const block = ownerDocument.createElement('div');
  block.className = 'designer-style-rule';
  const header = ownerDocument.createElement('div');
  header.className = 'designer-style-rule-header';
  const title = ownerDocument.createElement('span');
  title.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRule(index);
  const remove = ownerDocument.createElement('button');
  remove.type = 'button';
  remove.className = 'designer-button';
  remove.dataset.styleRuleRemove = String(index);
  remove.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleRemove;
  remove.disabled = locked;
  header.appendChild(title);
  header.appendChild(remove);
  block.appendChild(header);

  const condition = ownerDocument.createElement('div');
  condition.className = 'designer-field-grid';
  const pathLabel = ownerDocument.createElement('label');
  pathLabel.className = 'designer-field designer-field-label';
  pathLabel.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRulePath;
  const pathInput = ownerDocument.createElement('input');
  pathInput.type = 'text';
  pathInput.className = 'designer-control designer-input';
  pathInput.value = rule.when.path.join('.');
  pathInput.title = DESIGNER_UI_TEXT.propertiesPanel.styleRulePathHint;
  pathInput.dataset.styleRulePath = String(index);
  pathInput.disabled = locked;
  pathLabel.appendChild(pathInput);
  condition.appendChild(pathLabel);

  const operatorLabel = ownerDocument.createElement('label');
  operatorLabel.className = 'designer-field designer-field-label';
  operatorLabel.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleOperator;
  const operatorSelect = ownerDocument.createElement('select');
  operatorSelect.className = 'designer-control designer-select';
  operatorSelect.dataset.styleRuleOperator = String(index);
  operatorSelect.disabled = locked;
  for (const operator of STYLE_RULE_OPERATORS) {
    const option = ownerDocument.createElement('option');
    option.value = operator;
    option.textContent = operator;
    option.selected = rule.when.operator === operator;
    operatorSelect.appendChild(option);
  }
  operatorLabel.appendChild(operatorSelect);
  condition.appendChild(operatorLabel);

  const valueLabel = ownerDocument.createElement('label');
  valueLabel.className = 'designer-field designer-field-label';
  valueLabel.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleValue;
  const valueInput = ownerDocument.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'designer-control designer-input';
  valueInput.value = rule.when.value === undefined ? '' : JSON.stringify(rule.when.value);
  valueInput.dataset.styleRuleValue = String(index);
  valueInput.disabled = locked || rule.when.operator === 'exists';
  valueLabel.appendChild(valueInput);
  condition.appendChild(valueLabel);
  block.appendChild(condition);

  for (const field of manifest.stylePanel ?? []) {
    const schema = manifest.styleSchema.properties[field.style];
    if (schema === undefined) continue;
    appendStyleRuleControl(
      block,
      field.label,
      index,
      field.style,
      rule.style[field.style] ?? component.style[field.style],
      schema,
      field.control,
      `${component.id}:style-rule:${index}:${field.style}`,
      locked,
    );
  }
  section.appendChild(block);
}

function appendStyleRuleControl(
  parent: HTMLElement,
  labelText: string,
  index: number,
  style: string,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
  paletteKey: string,
  locked: boolean,
): void {
  const label = parent.ownerDocument.createElement(control === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  const marker = `${index}:${style}`;
  if (control === 'color') {
    const palette = createDesignerColorPalette(
      parent.ownerDocument,
      typeof value === 'string' ? value : undefined,
      paletteKey,
    );
    for (const input of palette.controls) {
      input.dataset.styleRuleStyle = marker;
      (input as HTMLInputElement).disabled = locked;
    }
    label.appendChild(palette.element);
    appendFieldMessage(label, palette.controls[0]!, `style-rule-${index}-${style}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.styleRuleStyle = marker;
    input.disabled = locked;
    label.appendChild(input);
    appendFieldMessage(label, input, `style-rule-${index}-${style}`);
  }
  parent.appendChild(label);
}

function appendSection(parent: HTMLElement, title: string, advanced = false): HTMLElement {
  // Sections render as native disclosures so every region can be collapsed with
  // pointer or keyboard; open state is persisted by the inspector group
  // preferences machinery in DesignerPanelController.
  const section = parent.ownerDocument.createElement('details');
  section.className = 'designer-inspector-section designer-inspector-disclosure';
  section.open = true;
  if (advanced) section.dataset.inspectorAdvanced = 'true';
  const summary = parent.ownerDocument.createElement('summary');
  summary.className = 'designer-inspector-section-title designer-datav-section-summary';
  summary.textContent = title;
  const disclosure = parent.ownerDocument.createElement('span');
  disclosure.className = 'designer-datav-section-disclosure';
  disclosure.innerHTML = designerIcon('chevron-down');
  summary.appendChild(disclosure);
  section.appendChild(summary);
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

function appendBatchArrangeButton(
  parent: HTMLElement,
  label: string,
  action: string,
  icon: DesignerIconName,
  disabled: boolean,
  unavailableReason: string,
): void {
  const button = parent.ownerDocument.createElement('button');
  button.type = 'button';
  button.className =
    'designer-control designer-button designer-icon-button designer-datav-batch-arrange-button';
  button.dataset.action = action;
  button.title = disabled ? `${label}：${unavailableReason}` : label;
  button.setAttribute('aria-label', button.title);
  button.disabled = disabled;
  button.innerHTML = designerIcon(icon);
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

function defaultLinearBackground(): Extract<
  ScreenCanvasBackground,
  { readonly type: 'linear-gradient' }
> {
  return {
    type: 'linear-gradient',
    angle: 90,
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
  };
}

function defaultRadialBackground(): Extract<
  ScreenCanvasBackground,
  { readonly type: 'radial-gradient' }
> {
  return {
    type: 'radial-gradient',
    position: { x: 50, y: 50 },
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
  };
}

function syncCanvasBackgroundDrafts(
  drafts: DesignerCanvasBackgroundDrafts,
  document: ScreenDocument,
): void {
  const signature = backgroundSignature(document.canvas.background);
  if (signature === drafts.committedSignature) return;
  const background = document.canvas.background;
  drafts.activeType = background?.type ?? 'solid';
  if (background?.type === 'solid') drafts.solid = background;
  if (background?.type === 'linear-gradient') drafts.linear = background;
  if (background?.type === 'radial-gradient') drafts.radial = background;
  if (background === undefined) {
    drafts.solid = { type: 'solid', color: document.canvas.backgroundColor };
  }
  drafts.committedSignature = signature;
}

function activeCanvasBackground(drafts: DesignerCanvasBackgroundDrafts): ScreenCanvasBackground {
  if (drafts.activeType === 'solid') return drafts.solid;
  return drafts.activeType === 'linear-gradient' ? drafts.linear : drafts.radial;
}

function setActiveCanvasBackground(
  drafts: DesignerCanvasBackgroundDrafts,
  background: Exclude<ScreenCanvasBackground, { readonly type: 'solid' }>,
): void {
  if (background.type === 'linear-gradient') drafts.linear = background;
  else drafts.radial = background;
}

function canvasBackgroundTransaction(
  drafts: DesignerCanvasBackgroundDrafts,
  background: ScreenCanvasBackground,
): ScreenParseResult<ScreenDocumentTransaction> {
  drafts.committedSignature = backgroundSignature(background);
  return success({
    commands: [
      {
        type: 'update-canvas',
        patch:
          background.type === 'solid'
            ? { background, backgroundColor: background.color }
            : { background },
      },
    ],
  });
}

function backgroundSignature(background: ScreenCanvasBackground | undefined): string {
  return background === undefined ? '' : JSON.stringify(background);
}

function areAscendingStops(stops: readonly ScreenCanvasColorStop[]): boolean {
  return stops.every((stop, index) => index === 0 || stops[index - 1]!.position < stop.position);
}

function isCanvasBackgroundType(value: string): value is ScreenCanvasBackground['type'] {
  return value === 'solid' || value === 'linear-gradient' || value === 'radial-gradient';
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
