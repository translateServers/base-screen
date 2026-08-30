import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import {
  type DesignerInspectorContext,
  getDesignerInspectorContext,
} from '../../../common/operations/designer-inspector.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDescriptorDatasetFields } from '../designer-descriptor-dom.js';
import { renderDesignerDescriptorZone } from '../designer-descriptor-dom.js';
import { appendDesignerQuickStyle } from '../designer-quick-style-dom.js';
import { appendDesignerFieldMessage, createDesignerButton } from '../designer-ui-primitives.js';
import { appendCanvasControls } from './designer-canvas-properties-dom.js';
import {
  createDesignerCanvasBackgroundDrafts,
  createDesignerCanvasPresentationSettings,
  syncCanvasBackgroundDrafts,
} from './designer-canvas-transactions.js';
import { appendMultiSelectionControls } from './designer-multi-selection-dom.js';
import {
  appendActionButton,
  appendCheckbox,
  appendFieldGrid,
  appendInput,
  appendListItem,
  appendPropControl,
  appendSection,
  appendStyleControl,
} from './designer-panel-primitives.js';
import { appendStyleRulesSection } from './designer-style-rules-dom.js';

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
  const locked =
    document !== undefined && isScreenComponentEffectivelyLocked(document, context.component.id);
  if (locked) appendLockedInspectorNotice(properties);
  appendComponentControls(properties, context, document, interaction, catalog, getDatasetFields);
  if (locked) disableLockedComponentControls(properties);
}

function appendLockedInspectorNotice(properties: HTMLElement): void {
  const notice = properties.ownerDocument.createElement('p');
  notice.className = 'designer-inspector-lock-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = DESIGNER_UI_TEXT.propertiesPanel.lockedEditingHint;
  properties.appendChild(notice);
}

function disableLockedComponentControls(properties: HTMLElement): void {
  for (const control of properties.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
  >('input, select, textarea, button')) {
    const property = control.dataset.property;
    if (property === 'locked' || property === 'hidden') continue;
    control.disabled = true;
    if (control.title === '') {
      control.title = DESIGNER_UI_TEXT.propertiesPanel.lockedEditingHint;
    }
  }
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
        field.allowGradient === true,
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
        field.allowGradient === true,
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
  appendDesignerFieldMessage(field, number, 'style-opacity');
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
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: label,
    className: 'designer-flip-button',
    pressed,
    text: property === 'flipX' ? '↔' : '↕',
    title: label,
  });
  button.dataset.geometryAction = property;
  button.dataset.flipLabel = label;
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
