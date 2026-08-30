import type {
  ScreenComponentNode,
  ScreenComponentStyleRule,
  ScreenDocument,
  ScreenJsonValue,
} from '@base-screen/contracts';
import { MAX_STYLE_RULES_PER_COMPONENT } from '@base-screen/contracts';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenMaterialManifest,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { STYLE_RULE_OPERATORS } from '../../../common/operations/style/designer-style-rule-operations.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import { appendDesignerFieldMessage } from '../designer-ui-primitives.js';
import { appendSection, createControl } from './designer-panel-primitives.js';

export function appendStyleRulesSection(
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
      field.allowGradient === true,
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
  allowGradient: boolean,
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
      { allowGradient },
    );
    for (const input of palette.controls) {
      input.dataset.styleRuleStyle = marker;
      (input as HTMLInputElement).disabled = locked;
    }
    label.appendChild(palette.element);
    appendDesignerFieldMessage(label, palette.controls[0]!, `style-rule-${index}-${style}`);
  } else {
    const input = createControl(parent.ownerDocument, value, schema, control);
    input.dataset.styleRuleStyle = marker;
    input.disabled = locked;
    label.appendChild(input);
    appendDesignerFieldMessage(label, input, `style-rule-${index}-${style}`);
  }
  parent.appendChild(label);
}
