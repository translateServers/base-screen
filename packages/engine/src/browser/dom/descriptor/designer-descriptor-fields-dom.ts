import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialEditorSection,
} from '@base-screen/plugin-core';
import { designerIcon } from '../../ui/designer-icons.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import { createDesignerFieldRow } from '../designer-field-primitives.js';
import { appendDesignerFieldMessage } from '../designer-ui-primitives.js';
import { appendDescriptorArrayControls } from './designer-descriptor-array-fields-dom.js';
import {
  applyFieldDataset,
  createDescriptorControl,
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
  const stacked = palette !== undefined || field.control === 'json';
  const { field: row, control: fieldControl } = createDesignerFieldRow(ownerDocument, {
    label: field.label,
    tagName: palette === undefined ? 'label' : 'span',
    stacked,
  });
  row.dataset.inspectorSearchKind = 'field';
  row.dataset.inspectorSearchKey = `descriptor-field-${field.id}`;
  row.dataset.inspectorSearchText = `${field.label} ${field.help ?? ''} ${field.keywords?.join(' ') ?? ''}`;
  if (field.advanced === true) row.dataset.inspectorAdvanced = 'true';
  const handle =
    palette === undefined
      ? createDescriptorControl(ownerDocument, field, schema, value, context.datasetFields)
      : undefined;
  const control = handle === undefined ? palette!.controls[0]! : handle.valueTarget;
  if (handle === undefined) {
    for (const paletteControl of palette!.controls) applyFieldDataset(paletteControl, field);
    fieldControl.appendChild(palette!.element);
  } else {
    // 字段标识只挂在值载体上：步进器的外壳不重复携带，避免选择器命中两个元素。
    applyFieldDataset(handle.valueTarget, field);
    fieldControl.appendChild(handle.element);
  }
  if (field.help !== undefined) {
    const help = ownerDocument.createElement('span');
    help.className = 'designer-descriptor-help';
    help.textContent = field.help;
    row.appendChild(help);
  }
  appendDesignerFieldMessage(row, control, `descriptor-${field.id}`);
  parent.appendChild(row);
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
