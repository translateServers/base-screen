import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

const MATERIAL_EVENT_CAPABILITY = 'blueprint.trigger.material-event';

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
  if (capabilities.design.length > 0) {
    appendCapabilitySection(panel, DESIGNER_UI_TEXT.interactionPanel.design, capabilities.design);
  }
  if (capabilities.previewEvents.length > 0) {
    appendCapabilitySection(
      panel,
      DESIGNER_UI_TEXT.interactionPanel.preview,
      capabilities.previewEvents,
    );
  }
  if (capabilities.design.length === 0 && capabilities.previewEvents.length === 0) {
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

function appendCapabilitySection(
  panel: HTMLElement,
  title: string,
  capabilities: readonly string[],
): void {
  const section = panel.ownerDocument.createElement('section');
  section.className = 'designer-inspector-section';
  const heading = panel.ownerDocument.createElement('h3');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = title;
  const list = panel.ownerDocument.createElement('ul');
  for (const capability of capabilities) {
    const item = panel.ownerDocument.createElement('li');
    item.textContent = capability;
    list.appendChild(item);
  }
  section.append(heading, list);
  panel.appendChild(section);
}

function hasMaterialEventCapability(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): boolean {
  try {
    return runtimeContributions?.hasBlueprintCapability(MATERIAL_EVENT_CAPABILITY) === true;
  } catch {
    return false;
  }
}
