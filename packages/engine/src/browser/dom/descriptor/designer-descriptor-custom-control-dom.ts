import type { BaseScreenMaterialEditorField } from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerFieldElement } from '../designer-field-primitives.js';
import { applyFieldDataset } from './designer-descriptor-control-dom.js';
import {
  type DesignerDescriptorContext,
  readFieldTargetValue,
} from './designer-descriptor-model.js';

/**
 * 只有授权目录里存在的标签才会被实例化。物料清单写一个宿主没注册的 tagName，结果是渲染
 * "不支持"提示并把该字段排除在写回路径之外，而不是把任意 Custom Element 塞进检查器。
 * 授权发生在 plugin-manager 解析宿主 registry 的阶段，所以 Engine 从不按清单标签 createElement。
 */
export function appendDescriptorCustomControl(
  parent: HTMLElement,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): void {
  const ownerDocument = parent.ownerDocument;
  const label = createDesignerFieldElement(ownerDocument, {
    label: field.label,
    tagName: 'span',
  });
  label.dataset.inspectorSearchKind = 'field';
  label.dataset.inspectorSearchKey = `descriptor-field-${field.id}`;
  label.dataset.inspectorSearchText = `${field.label} ${field.help ?? ''} ${field.keywords?.join(' ') ?? ''}`;
  if (field.advanced === true) label.dataset.inspectorAdvanced = 'true';

  const entry =
    field.tagName === undefined
      ? undefined
      : context.inspectorControls?.getByTagName(field.tagName);
  if (entry === undefined) {
    const unsupported = ownerDocument.createElement('span');
    unsupported.className = 'designer-descriptor-unsupported';
    unsupported.dataset.descriptorUnsupported = field.id;
    unsupported.textContent = DESIGNER_UI_TEXT.descriptor.unsupportedControl(
      field.tagName ?? 'unknown',
    );
    const fieldControl = ownerDocument.createElement('span');
    fieldControl.className = 'designer-field-control';
    fieldControl.appendChild(unsupported);
    label.appendChild(fieldControl);
    parent.appendChild(label);
    return;
  }

  const element = new entry.constructor();
  // 归属只用于诊断：写回身份完全由 data-descriptor-* 决定，伪造它拿不到别的字段权限。
  element.dataset.descriptorCustomOwner = entry.pluginId;
  applyFieldDataset(element, field);
  element.model = {
    value: readFieldTargetValue(field, field.path, context),
    componentId: context.component.id,
    componentType: context.component.type,
    target: field.target === 'style' ? 'style' : 'props',
    path: field.path,
  };
  const fieldControl = ownerDocument.createElement('span');
  fieldControl.className = 'designer-field-control';
  fieldControl.appendChild(element);
  label.appendChild(fieldControl);
  if (field.help !== undefined) {
    const help = ownerDocument.createElement('span');
    help.className = 'designer-descriptor-help';
    help.textContent = field.help;
    label.appendChild(help);
  }
  parent.appendChild(label);
}
