import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialEditorSection,
} from '@base-screen/plugin-core';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import { appendDesignerFieldMessage } from '../designer-ui-primitives.js';
import { appendDescriptorArrayControls } from './designer-descriptor-array-fields-dom.js';
import {
  applyFieldDataset,
  createDescriptorControl,
  descriptorFieldSchema,
} from './designer-descriptor-control-dom.js';
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
  summary.textContent = section.label;
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
  const label = ownerDocument.createElement(palette === undefined ? 'label' : 'span');
  label.className = 'designer-field designer-field-label';
  label.dataset.inspectorSearchKind = 'field';
  label.dataset.inspectorSearchKey = `descriptor-field-${field.id}`;
  label.dataset.inspectorSearchText = `${field.label} ${field.help ?? ''} ${field.keywords?.join(' ') ?? ''}`;
  if (field.advanced === true) label.dataset.inspectorAdvanced = 'true';
  label.textContent = field.label;
  const control =
    palette === undefined
      ? createDescriptorControl(ownerDocument, field, schema, value, context.datasetFields)
      : palette.controls[0]!;
  if (palette === undefined) {
    applyFieldDataset(control, field);
    label.appendChild(control);
  } else {
    for (const paletteControl of palette.controls) applyFieldDataset(paletteControl, field);
    label.appendChild(palette.element);
  }
  if (field.help !== undefined) {
    const help = ownerDocument.createElement('span');
    help.className = 'designer-descriptor-help';
    help.textContent = field.help;
    label.appendChild(help);
  }
  appendDesignerFieldMessage(label, control, `descriptor-${field.id}`);
  parent.appendChild(label);
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
