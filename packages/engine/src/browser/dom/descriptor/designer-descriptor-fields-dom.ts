import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialEditorSection,
} from '@base-screen/plugin-core';
import { designerIcon } from '../../dom/designer-icons.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import { createDesignerFieldRow, createDesignerSwitchField } from '../designer-field-primitives.js';
import { appendDesignerFieldMessage } from '../designer-ui-primitives.js';
import { appendDescriptorArrayControls } from './designer-descriptor-array-fields-dom.js';
import {
  applyFieldDataset,
  createDescriptorControl,
  createDescriptorRangeControl,
  descriptorFieldSchema,
} from './designer-descriptor-control-dom.js';
import { appendDescriptorCustomControl } from './designer-descriptor-custom-control-dom.js';
import {
  type DesignerDescriptorContext,
  isDescriptorFieldVisible,
  readFieldTargetValue,
} from './designer-descriptor-model.js';

export {
  appendDescriptorArrayControls,
  descriptorArraySchema,
} from './designer-descriptor-array-fields-dom.js';

export function appendDescriptorSection(
  container: HTMLElement,
  section: BaseScreenMaterialEditorSection,
  context: DesignerDescriptorContext,
): void {
  const ownerDocument = container.ownerDocument;
  const sectionElement = ownerDocument.createElement('section');
  sectionElement.className = 'designer-inspector-section';
  sectionElement.dataset.inspectorSearchKind = 'section';
  sectionElement.dataset.inspectorSearchKey = `descriptor-section-${section.id}`;
  sectionElement.dataset.inspectorSearchText = `${section.label} ${section.help ?? ''}`;
  sectionElement.dataset.inspectorPreferenceContext = context.component.type;
  if (section.advanced === true) sectionElement.dataset.inspectorAdvanced = 'true';
  const details = ownerDocument.createElement('details');
  details.className = 'designer-descriptor-group';
  details.open = section.advanced !== true && section.collapsed !== true;
  const summary = ownerDocument.createElement('summary');
  summary.className = 'designer-descriptor-group-summary';
  // 与内建分段共用同一条“标题 + 发丝线 + 折叠箭头”的段落标题语言。
  summary.textContent = section.label;
  const disclosure = ownerDocument.createElement('span');
  disclosure.className = 'designer-panel-section-disclosure designer-inspector-section-disclosure';
  disclosure.innerHTML = designerIcon('chevron-down');
  summary.appendChild(disclosure);
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

function appendDescriptorField(
  parent: HTMLElement,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): void {
  if (field.control === 'group') {
    appendDescriptorGroup(parent, field, context);
    return;
  }
  if (field.control === 'custom') {
    appendDescriptorCustomControl(parent, field, context);
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
  if (field.control === 'boolean') {
    appendDescriptorSwitchField(parent, field, value === true);
    return;
  }
  const palette =
    field.control === 'color'
      ? createDesignerColorPalette(
          ownerDocument,
          typeof value === 'string' ? value : undefined,
          `${context.component.id}:descriptor:${field.id}`,
          { allowGradient: field.allowGradient === true },
        )
      : undefined;
  // color 控件用 span 容器：label 点击会激活 color input 弹出原生取色器。
  // 四边距的标签里带联动按钮，同样不能落在 label 里（按钮会被标签的默认激活吞掉）。
  const stacked = palette !== undefined || field.control === 'json';
  const {
    field: row,
    control: fieldControl,
    labelText,
  } = createDesignerFieldRow(ownerDocument, {
    label: field.label,
    tagName: palette === undefined && field.control !== 'spacing' ? 'label' : 'span',
    stacked,
  });
  applyFieldSearch(row, field);
  const handle =
    palette === undefined
      ? (createDescriptorRangeControl(ownerDocument, field, schema, value) ??
        createDescriptorControl(
          ownerDocument,
          field,
          schema,
          value,
          context.datasetFields,
          `${context.component.id}:descriptor:${field.id}`,
        ))
      : undefined;
  if (handle?.labelAction !== undefined) {
    // 标签文字让位给字段级动作：文字先省略，按钮固定在列尾。
    const label = ownerDocument.createElement('span');
    label.className = 'designer-spacing-label-text';
    label.textContent = field.label;
    labelText.className += ' designer-spacing-label';
    labelText.textContent = '';
    labelText.append(label, handle.labelAction);
  }
  const control = handle === undefined ? palette!.controls[0]! : handle.valueTarget;
  if (handle === undefined) {
    for (const paletteControl of palette!.controls) applyFieldDataset(paletteControl, field);
    fieldControl.appendChild(palette!.element);
  } else {
    // 字段标识只挂在值载体上：步进器的外壳不重复携带，避免选择器命中两个元素。
    applyFieldDataset(handle.valueTarget, field);
    fieldControl.appendChild(handle.element);
    if (handle.trailing !== undefined) fieldControl.appendChild(handle.trailing);
  }
  appendFieldHelp(row, field);
  appendDesignerFieldMessage(row, control, `descriptor-${field.id}`);
  parent.appendChild(row);
}

/** 布尔字段：与页面配置同一个开关字段行（ADR-0102 §5），整行可点、开关贴右。 */
function appendDescriptorSwitchField(
  parent: HTMLElement,
  field: BaseScreenMaterialEditorField,
  checked: boolean,
): void {
  const { field: row, input } = createDesignerSwitchField(parent.ownerDocument, {
    label: field.label,
    checked,
  });
  applyFieldSearch(row, field);
  applyFieldDataset(input, field);
  appendFieldHelp(row, field);
  appendDesignerFieldMessage(row, input, `descriptor-${field.id}`);
  parent.appendChild(row);
}

function applyFieldSearch(row: HTMLElement, field: BaseScreenMaterialEditorField): void {
  row.dataset.inspectorSearchKind = 'field';
  row.dataset.inspectorSearchKey = `descriptor-field-${field.id}`;
  const keywords = field.keywords?.join(' ') ?? '';
  row.dataset.inspectorSearchText = `${field.label} ${field.help ?? ''} ${keywords}`;
  if (field.advanced === true) row.dataset.inspectorAdvanced = 'true';
}

function appendFieldHelp(row: HTMLElement, field: BaseScreenMaterialEditorField): void {
  if (field.help === undefined) return;
  const help = row.ownerDocument.createElement('span');
  help.className = 'designer-descriptor-help';
  help.textContent = field.help;
  row.appendChild(help);
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
