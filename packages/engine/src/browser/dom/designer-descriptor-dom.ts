import type { BaseScreenMaterialEditorSection } from '@base-screen/plugin-core';
import { appendDescriptorSection } from './descriptor/designer-descriptor-fields-dom.js';
import {
  type DesignerDescriptorPanelInput,
  getDesignerDescriptorContext,
} from './descriptor/designer-descriptor-model.js';

export {
  appendDescriptorArrayControls,
  descriptorArraySchema,
} from './descriptor/designer-descriptor-fields-dom.js';
export type {
  DesignerDescriptorContext,
  DesignerDescriptorDatasetFields,
  DesignerDescriptorPanelInput,
} from './descriptor/designer-descriptor-model.js';
export {
  evaluateDescriptorCondition,
  getDesignerDescriptorContext,
  isDescriptorFieldVisible,
  readFieldTargetValue,
} from './descriptor/designer-descriptor-model.js';

export function renderDesignerDescriptorZone(
  container: HTMLElement | undefined,
  zone: readonly BaseScreenMaterialEditorSection[] | undefined,
  input: DesignerDescriptorPanelInput,
): void {
  if (container === undefined || zone === undefined || zone.length === 0) return;
  const context = getDesignerDescriptorContext(input);
  if (context === undefined) return;
  for (const section of zone) {
    appendDescriptorSection(container, section, context);
  }
}
