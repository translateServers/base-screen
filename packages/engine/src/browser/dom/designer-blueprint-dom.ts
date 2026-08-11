import type { ScreenBlueprint, ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialEventDescriptor,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_BLUEPRINT_CAPABILITIES } from '../../common/operations/designer-blueprint-authoring.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export function getDesignerFocusedMaterialEvents(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly string[] {
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  return component === undefined ? [] : (catalog?.get(component.type)?.manifest.events ?? []);
}

export function getDesignerFocusedEventDescriptors(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly BaseScreenMaterialEventDescriptor[] {
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  return component === undefined
    ? []
    : (catalog?.get(component.type)?.manifest.editorDescriptor?.events ?? []);
}

export function renderDesignerEventsPanel(
  panel: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): void {
  if (panel === undefined) return;
  panel.replaceChildren();
  const focused = interaction.focusedComponentId;
  const rules =
    document?.blueprint.rules.filter((rule) => rule.trigger.componentId === focused) ?? [];

  const summarySection = appendSection(panel, DESIGNER_UI_TEXT.blueprint.summaryTitle);
  const summary = panel.ownerDocument.createElement('p');
  summary.className = 'designer-blueprint-summary';
  summary.textContent =
    focused === null
      ? DESIGNER_UI_TEXT.blueprint.noComponent
      : DESIGNER_UI_TEXT.blueprint.ruleCount(rules.length);
  summarySection.appendChild(summary);

  const events = getDesignerFocusedMaterialEvents(document, interaction, catalog);
  const descriptors = getDesignerFocusedEventDescriptors(document, interaction, catalog);
  const capabilityAvailable = hasCapability(
    runtimeContributions,
    DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent,
  );
  if (events.length > 0) {
    const eventList = panel.ownerDocument.createElement('ul');
    eventList.className = 'designer-inspector-summary';
    for (const eventName of events) {
      const item = panel.ownerDocument.createElement('li');
      const descriptor = descriptors.find((candidate) => candidate.name === eventName);
      const count = rules.filter((rule) => rule.trigger.eventName === eventName).length;
      item.textContent = DESIGNER_UI_TEXT.blueprint.ruleListItem(
        descriptor?.label ?? eventName,
        count,
      );
      if (descriptor?.hint !== undefined) {
        const hint = panel.ownerDocument.createElement('span');
        hint.className = 'designer-descriptor-help';
        hint.textContent = descriptor.hint;
        item.appendChild(hint);
      }
      if (descriptor?.requiredCapability !== undefined) {
        const required = hasCapability(runtimeContributions, descriptor.requiredCapability);
        const status = panel.ownerDocument.createElement('span');
        status.className = required ? 'designer-capability-ok' : 'designer-capability-missing';
        status.textContent = required
          ? DESIGNER_UI_TEXT.blueprint.capabilityAvailable
          : DESIGNER_UI_TEXT.blueprint.capabilityUnavailable;
        item.appendChild(status);
      }
      eventList.appendChild(item);
    }
    summarySection.appendChild(eventList);
  }

  const editorSection = appendSection(panel, DESIGNER_UI_TEXT.blueprint.editorTitle);
  const open = createButton(panel.ownerDocument, DESIGNER_UI_TEXT.blueprint.editInHost);
  open.dataset.action = 'open-blueprint';
  open.disabled = !capabilityAvailable;
  open.title = DESIGNER_UI_TEXT.blueprint.hostEditorHint;
  editorSection.appendChild(open);
  if (!capabilityAvailable) {
    const unavailable = panel.ownerDocument.createElement('p');
    unavailable.className = 'designer-field-message';
    unavailable.setAttribute('role', 'status');
    unavailable.textContent = DESIGNER_UI_TEXT.blueprint.unavailable;
    editorSection.appendChild(unavailable);
  }
}

function appendSection(parent: HTMLElement, title: string): HTMLElement {
  const section = parent.ownerDocument.createElement('section');
  section.className = 'designer-inspector-section';
  const heading = parent.ownerDocument.createElement('h3');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  parent.appendChild(section);
  return section;
}

export function renderDesignerBlueprintSnapshot(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
): ScreenBlueprint | undefined {
  if (document === undefined || interaction.focusedComponentId === null) return undefined;
  return document.blueprint;
}

function createButton(ownerDocument: Document, label: string): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.textContent = label;
  button.title = label;
  return button;
}

function hasCapability(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  capability: string,
): boolean {
  try {
    return runtimeContributions?.hasBlueprintCapability(capability) === true;
  } catch {
    return false;
  }
}
