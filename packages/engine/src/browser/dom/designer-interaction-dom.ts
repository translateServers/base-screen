import type { ScreenDocument } from '@base-screen/contracts';
import { SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type DesignerDescriptorDatasetFields,
  renderDesignerDescriptorZone,
} from './descriptor/designer-descriptor-dom.js';
import { createDesignerSection } from './panel/designer-chrome-primitives.js';

export interface DesignerInteractionCapabilities {
  readonly design: readonly string[];
  readonly previewEvents: readonly string[];
}

export function renderDesignerInteractionPanel(
  panel: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
): boolean {
  if (panel === undefined) return false;
  panel.replaceChildren();
  const capabilities = getDesignerInteractionCapabilities(
    document,
    interaction,
    catalog,
    runtimeContributions,
  );
  if (capabilities === undefined) {
    panel.textContent = DESIGNER_UI_TEXT.interactionPanel.noComponent;
    return false;
  }
  if (capabilities.design.length > 0 || capabilities.previewEvents.length > 0) {
    appendCapabilityGroup(panel, capabilities.design, capabilities.previewEvents);
  }
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  renderDesignerDescriptorZone(panel, manifest?.editorDescriptor?.interaction, {
    document,
    interaction,
    catalog,
    getDatasetFields,
  });
  const hasEvents =
    (manifest?.events.length ?? 0) > 0 || (manifest?.editorDescriptor?.events?.length ?? 0) > 0;
  if (hasEvents) {
    const events = panel.ownerDocument.createElement('section');
    events.className = 'designer-inspector-section designer-events-section';
    events.dataset.inspectorSearchText = `${DESIGNER_UI_TEXT.interaction} ${DESIGNER_UI_TEXT.events}`;
    const eventsHeading = panel.ownerDocument.createElement('h3');
    eventsHeading.className = 'designer-inspector-section-title';
    eventsHeading.textContent = DESIGNER_UI_TEXT.events;
    const eventsPanel = panel.ownerDocument.createElement('div');
    eventsPanel.dataset.eventsPanel = 'true';
    events.append(eventsHeading, eventsPanel);
    panel.appendChild(events);
  }
  if (
    capabilities.design.length === 0 &&
    capabilities.previewEvents.length === 0 &&
    (manifest?.editorDescriptor?.interaction?.length ?? 0) === 0 &&
    !hasEvents
  ) {
    panel.textContent = DESIGNER_UI_TEXT.interactionPanel.noCapabilities;
    return false;
  }
  return true;
}

export function getDesignerInteractionCapabilities(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): DesignerInteractionCapabilities | undefined {
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  if (manifest === undefined) return undefined;
  const capabilities: readonly (string | undefined)[] = [
    manifest.designCapabilities.resize ? DESIGNER_UI_TEXT.interactionPanel.resize : undefined,
    manifest.designCapabilities.rotate ? DESIGNER_UI_TEXT.interactionPanel.rotate : undefined,
    manifest.designCapabilities.children
      ? DESIGNER_UI_TEXT.interactionPanel.hasChildren
      : undefined,
  ];
  const design = capabilities.filter(
    (capability): capability is string => capability !== undefined,
  );
  const previewEvents = hasMaterialEventCapability(runtimeContributions) ? manifest.events : [];
  return { design, previewEvents };
}

/**
 * 能力摘要：默认收起。它描述「这个组件能做什么」，不是每次都要看的操作项；
 * 原来拆成「设计 / 预览」两段常驻，各占一行标题加一排 chip，把真正的交互设置推到了折线以下。
 * 合并成一段后标题直接报出全部能力（调整大小 · 旋转 · seriesClick），展开仍是两列中性 chip。
 */
function appendCapabilityGroup(
  panel: HTMLElement,
  design: readonly string[],
  previewEvents: readonly string[],
): void {
  const capabilities = [...design, ...previewEvents];
  if (capabilities.length === 0) return;
  const { element } = createDesignerSection(panel, {
    title: DESIGNER_UI_TEXT.interactionPanel.capabilityGroup,
    open: false,
    key: 'interaction-capabilities',
    summary: capabilities.join(' · '),
  });
  const list = panel.ownerDocument.createElement('ul');
  list.className = 'designer-inspector-summary';
  for (const capability of capabilities) {
    const item = panel.ownerDocument.createElement('li');
    item.textContent = capability;
    list.appendChild(item);
  }
  element.appendChild(list);
}

function hasMaterialEventCapability(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): boolean {
  try {
    return (
      runtimeContributions?.hasBlueprintCapability(SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY) ===
      true
    );
  } catch {
    return false;
  }
}
