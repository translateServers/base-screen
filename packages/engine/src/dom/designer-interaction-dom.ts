import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';

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
    panel.textContent = '选择组件以查看交互能力。';
    return false;
  }
  if (capabilities.design.length > 0) {
    appendCapabilitySection(panel, '设计', capabilities.design);
  }
  if (capabilities.previewEvents.length > 0) {
    appendCapabilitySection(panel, '预览', capabilities.previewEvents);
  }
  if (capabilities.design.length === 0 && capabilities.previewEvents.length === 0) {
    panel.textContent = '当前组件没有公开交互能力。';
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
  const design = [
    manifest.designCapabilities.resize ? '调整大小' : undefined,
    manifest.designCapabilities.rotate ? '旋转' : undefined,
    manifest.designCapabilities.children ? '包含子组件' : undefined,
  ].filter((capability): capability is string => capability !== undefined);
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
