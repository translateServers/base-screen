import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { DesignerInspectorContext } from '../../../common/operations/designer-inspector.js';
import { commonStyleFields } from '../../../common/operations/designer-multi-selection-operations.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { appendDesignerQuickStyle } from '../designer-quick-style-dom.js';
import {
  appendActionButton,
  appendBatchArrangeButton,
  appendBatchNumberInput,
  appendBatchStyleControl,
  appendFieldGrid,
  appendListItem,
  appendSection,
  multiSelectionGroupUnavailableReason,
} from './designer-panel-primitives.js';

export function appendMultiSelectionControls(
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
      context.components.every((item) =>
        (catalog?.get(item.type)?.manifest.stylePanel ?? []).some(
          (candidate) => candidate.style === field && candidate.allowGradient === true,
        ),
      ),
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
