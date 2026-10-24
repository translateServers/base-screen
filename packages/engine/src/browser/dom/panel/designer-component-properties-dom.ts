import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { MAX_STYLE_RULES_PER_COMPONENT } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenPluginInspectorControlCatalog,
} from '@base-screen/plugin-core';
import {
  type DesignerInspectorContext,
  getDesignerInspectorContext,
} from '../../../common/operations/style/designer-inspector.js';
import {
  DESIGNER_STYLE_RULE_OPERATORS,
  formatDesignerStyleRuleValue,
} from '../../../common/operations/style/designer-style-rules.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import type { DesignerDescriptorDatasetFields } from '../descriptor/designer-descriptor-dom.js';
import { renderDesignerDescriptorZone } from '../descriptor/designer-descriptor-dom.js';
import {
  appendDesignerRangeField,
  createDesignerFieldElement,
  createDesignerFieldRow,
} from '../designer-field-primitives.js';
import { appendDesignerQuickStyle } from '../designer-quick-style-dom.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  appendDesignerFieldMessage,
  createDesignerButton,
  createDesignerInput,
  createDesignerSelect,
} from '../designer-ui-primitives.js';
import { appendCanvasControls } from './designer-canvas-properties-dom.js';
import { createDesignerCanvasPresentationSettings } from './designer-canvas-transactions.js';
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

export function renderDesignerProperties(
  properties: HTMLElement,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
  canvasBackgroundImageButtonVisible = false,
  canvasPresentation = createDesignerCanvasPresentationSettings(),
  inspectorControls?: BaseScreenPluginInspectorControlCatalog | undefined,
): void {
  properties.replaceChildren();
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind === 'canvas') {
    if (document !== undefined) {
      appendCanvasControls(
        properties,
        document,
        canvasBackgroundImageButtonVisible,
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
  appendComponentControls(
    properties,
    context,
    document,
    interaction,
    catalog,
    getDatasetFields,
    inspectorControls,
  );
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
    if (!control.hasAttribute('data-tip')) {
      control.setAttribute('data-tip', DESIGNER_UI_TEXT.propertiesPanel.lockedEditingHint);
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
  inspectorControls?: BaseScreenPluginInspectorControlCatalog | undefined,
): void {
  const { component, manifest } = context;
  const geometry = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.geometry);
  geometry.className += ' designer-inspector-geometry-section';
  const geometryGrid = appendFieldGrid(geometry);
  geometryGrid.className += ' designer-inspector-geometry-grid';
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
  if (context.kind === 'single-material' && component.type === 'base.image') {
    appendImageDensityActions(geometryGrid, component.id);
  }
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
      inspectorControls,
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
  appendConditionalStyleSection(properties, component, manifest);
}

/** 条件样式：规则按组件 dataState.value 判定，命中后覆盖一个颜色字段。 */
function appendConditionalStyleSection(
  properties: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
): void {
  const colorKeys = (manifest.stylePanel ?? [])
    .filter(
      (field) =>
        field.control === 'color' &&
        manifest.styleSchema.properties[field.style]?.kind === 'string',
    )
    .map((field) => field.style);
  if (colorKeys.length === 0) return;
  const rules = component.styleRules ?? [];
  const section = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.conditionalStyle);
  section.className += ' designer-conditional-style-section';
  section.dataset.styleRuleComponent = component.id;
  const hint = section.ownerDocument.createElement('p');
  hint.className = 'designer-style-rule-hint';
  hint.textContent = DESIGNER_UI_TEXT.propertiesPanel.conditionalStyleHint;
  section.appendChild(hint);
  const list = section.ownerDocument.createElement('div');
  list.className = 'designer-style-rules';
  section.appendChild(list);
  if (rules.length === 0) {
    const empty = section.ownerDocument.createElement('p');
    empty.className = 'designer-style-rule-empty';
    empty.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleEmpty;
    list.appendChild(empty);
  }
  rules.forEach((rule, index) => {
    const row = section.ownerDocument.createElement('div');
    row.className = 'designer-style-rule';
    row.dataset.styleRuleId = rule.id;
    row.dataset.styleRuleComponent = component.id;
    const header = section.ownerDocument.createElement('div');
    header.className = 'designer-style-rule-header';
    const title = section.ownerDocument.createElement('strong');
    title.textContent = `${DESIGNER_UI_TEXT.propertiesPanel.styleRule} ${index + 1}`;
    const actions = section.ownerDocument.createElement('span');
    actions.className = 'designer-style-rule-actions';
    actions.appendChild(
      styleRuleActionButton(
        section.ownerDocument,
        'up',
        DESIGNER_UI_TEXT.propertiesPanel.styleRuleMoveUp,
        index === 0,
      ),
    );
    actions.appendChild(
      styleRuleActionButton(
        section.ownerDocument,
        'down',
        DESIGNER_UI_TEXT.propertiesPanel.styleRuleMoveDown,
        index === rules.length - 1,
      ),
    );
    actions.appendChild(
      styleRuleActionButton(
        section.ownerDocument,
        'remove',
        DESIGNER_UI_TEXT.propertiesPanel.styleRuleRemove,
        false,
      ),
    );
    header.appendChild(title);
    header.appendChild(actions);
    row.appendChild(header);

    const fields = section.ownerDocument.createElement('div');
    fields.className = 'designer-style-rule-fields';
    const pathRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRulePath,
    });
    const path = createDesignerInput(section.ownerDocument, {
      value: rule.when.path.join('.'),
      placeholder: DESIGNER_UI_TEXT.propertiesPanel.styleRulePathPlaceholder,
      ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.styleRulePath,
    });
    path.dataset.styleRulePath = '';
    pathRow.control.appendChild(path);
    fields.appendChild(pathRow.field);

    const operatorRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleOperator,
    });
    const operator = createDesignerSelect(section.ownerDocument, {
      options: DESIGNER_STYLE_RULE_OPERATORS.map((value) => ({
        value,
        label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleOperators[value],
        selected: value === rule.when.operator,
      })),
    });
    operator.dataset.styleRuleOperator = '';
    operatorRow.control.appendChild(enhanceDesignerSelect(operator).element);
    fields.appendChild(operatorRow.field);

    const valueRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleValue,
    });
    const value = createDesignerInput(section.ownerDocument, {
      value: formatDesignerStyleRuleValue(rule.when.value),
      ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.styleRuleValue,
      disabled: rule.when.operator === 'exists',
    });
    value.dataset.styleRuleValue = '';
    valueRow.control.appendChild(value);
    fields.appendChild(valueRow.field);

    const activeKey =
      Object.keys(rule.style).find((key) => colorKeys.includes(key)) ?? colorKeys[0]!;
    if (colorKeys.length > 1) {
      const keyRow = createDesignerFieldRow(section.ownerDocument, {
        label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleKey,
      });
      const key = createDesignerSelect(section.ownerDocument, {
        options: colorKeys.map((keyName) => ({
          value: keyName,
          label: keyName,
          selected: keyName === activeKey,
        })),
      });
      key.dataset.styleRuleStyleKey = '';
      keyRow.control.appendChild(enhanceDesignerSelect(key).element);
      fields.appendChild(keyRow.field);
    }

    const colorRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleColor,
      tagName: 'span',
      stacked: true,
    });
    const color = rule.style[activeKey];
    const palette = createDesignerColorPalette(
      section.ownerDocument,
      typeof color === 'string' ? color : undefined,
      `style-rule:${component.id}:${rule.id}`,
      { allowGradient: false },
    );
    for (const control of palette.controls) control.dataset.styleRuleColor = '';
    colorRow.control.appendChild(palette.element);
    fields.appendChild(colorRow.field);

    row.appendChild(fields);
    list.appendChild(row);
  });
  const add = createDesignerButton(section.ownerDocument, {
    text: DESIGNER_UI_TEXT.propertiesPanel.styleRuleAdd,
    className: 'designer-style-rule-add',
    disabled: rules.length >= MAX_STYLE_RULES_PER_COMPONENT,
  });
  add.dataset.styleRuleAction = 'add';
  section.appendChild(add);
  if (rules.length >= MAX_STYLE_RULES_PER_COMPONENT) {
    const limit = section.ownerDocument.createElement('p');
    limit.className = 'designer-style-rule-hint';
    limit.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleLimit(
      MAX_STYLE_RULES_PER_COMPONENT,
    );
    section.appendChild(limit);
  }
}

function styleRuleActionButton(
  ownerDocument: Document,
  action: 'up' | 'down' | 'remove',
  label: string,
  disabled: boolean,
): HTMLButtonElement {
  const button = createDesignerButton(ownerDocument, {
    text: action === 'remove' ? '×' : action === 'up' ? '↑' : '↓',
    ariaLabel: label,
    tip: label,
    variant: action === 'remove' ? 'danger' : 'ghost',
    className: 'designer-style-rule-action',
    disabled,
  });
  button.dataset.styleRuleAction = action;
  return button;
}

function appendImageDensityActions(parent: HTMLElement, componentId: string): void {
  const field = createDesignerFieldElement(parent.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.imageDensity,
    tagName: 'div',
    className: 'designer-image-density-field',
  });
  const actions = parent.ownerDocument.createElement('span');
  actions.className = 'designer-image-density-actions';
  for (const density of [1, 2, 3, 4] as const) {
    const title = DESIGNER_UI_TEXT.propertiesPanel.imageDensityAction(density);
    const button = createDesignerButton(parent.ownerDocument, {
      ariaLabel: title,
      className: 'designer-image-density-button',
      text: DESIGNER_UI_TEXT.propertiesPanel.imageDensityValue(density),
      tip: title,
    });
    button.dataset.imageDensityAction = String(density);
    button.dataset.imageDensityComponentId = componentId;
    actions.appendChild(button);
  }
  field.appendChild(actions);
  parent.appendChild(field);
}

function appendCommonOpacityControl(
  properties: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
): void {
  const schema = manifest.styleSchema.properties.opacity;
  if (schema?.kind !== 'number') return;
  const section = appendSection(properties, DESIGNER_UI_TEXT.propertiesPanel.commonStyle);
  section.className += ' designer-inspector-common-section';
  const { field, control } = createDesignerFieldRow(properties.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.opacity,
    tagName: 'span',
    className: 'designer-opacity-field',
  });
  // 面板读数统一按百分比（原型 .range-row 的 0–100），事务侧仍写 0–1 的 canonical 值。
  const percent = Math.round(Number(component.style.opacity ?? 1) * 100);
  const { range, number } = appendDesignerRangeField(control, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.opacity,
    min: 0,
    max: 100,
    step: 1,
    value: String(percent),
    numberClassName: 'designer-field-range-value',
  });
  for (const target of [range, number]) {
    target.dataset.style = 'opacity';
    target.dataset.opacityPercent = 'true';
  }
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
  const field = createDesignerFieldElement(parent.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.flipHorizontal,
    tagName: 'div',
    className: 'designer-flip-field',
  });
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
    tip: label,
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
