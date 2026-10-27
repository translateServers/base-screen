import {
  BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX,
  type BaseScreenDesignerLeftPanelGroup,
  baseScreenDesignerLeftPanelGroupSupportsMode,
  baseScreenDesignerLeftPanelSlotName,
} from '../../common/operations/workbench/designer-left-panel-groups.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import { createDesignerTabButton } from './designer-ui-primitives.js';

const HOST_TAB_PREFIX = 'host:';

export function renderDesignerLeftPanelGroups(
  root: HTMLElement,
  groups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined,
): void {
  const tabs = root.querySelector<HTMLElement>('.rail-tabs');
  const rail = root.querySelector<HTMLElement>('[data-left-panel]');
  if (tabs === null || rail === null) return;
  const focus = captureHostLeftPanelFocus(root);

  for (const element of root.querySelectorAll<HTMLElement>('[data-host-left-panel-rendered]')) {
    element.remove();
  }

  for (const group of groups ?? []) {
    const tabId = hostLeftPanelTabId(group.id);
    const panelId = hostLeftPanelPanelId(group.id);
    if (baseScreenDesignerLeftPanelGroupSupportsMode(group, 'canvas')) {
      const tab = createDesignerTabButton(root.ownerDocument, {
        label: '',
        tip: group.label,
        value: group.id,
      });
      tab.id = tabId;
      tab.setAttribute('aria-controls', panelId);
      tab.dataset.panelTab = `${HOST_TAB_PREFIX}${group.id}`;
      tab.dataset.panelLabel = group.label;
      tab.dataset.hostLeftPanelGroup = group.id;
      tab.dataset.hostLeftPanelMode = 'canvas';
      tab.dataset.hostLeftPanelRendered = '';

      const glyph = root.ownerDocument.createElement('span');
      glyph.className = 'rail-tab-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.innerHTML = designerIcon(group.icon ?? 'shapes');
      const label = root.ownerDocument.createElement('span');
      label.className = 'rail-tab-label';
      label.textContent = group.label;
      tab.append(glyph, label);
      tabs.append(tab);
    }

    const panel = root.ownerDocument.createElement('div');
    panel.className = 'rail-view host-left-panel-view';
    panel.id = panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute(
      'aria-labelledby',
      baseScreenDesignerLeftPanelGroupSupportsMode(group, 'canvas')
        ? tabId
        : blueprintHostLeftPanelTabId(group.id),
    );
    panel.dataset.hostLeftPanelGroup = group.id;
    panel.dataset.hostLeftPanelRendered = '';
    panel.hidden = true;

    const content = root.ownerDocument.createElement('div');
    content.className = 'host-left-panel-content';
    const slot = root.ownerDocument.createElement('slot');
    slot.name = baseScreenDesignerLeftPanelSlotName(group.id);
    slot.dataset.hostLeftPanelSlot = group.id;
    const fallback = root.ownerDocument.createElement('p');
    fallback.className = 'designer-empty-state';
    fallback.textContent = DESIGNER_UI_TEXT.hostLeftPanelEmpty;
    slot.append(fallback);
    content.append(slot);
    panel.append(content);
    rail.append(panel);
  }
  restoreHostLeftPanelFocus(root, groups, focus);
}

export function hostLeftPanelTab(groupId: string): `host:${string}` {
  return `${HOST_TAB_PREFIX}${groupId}`;
}

export function hostLeftPanelGroupId(tab: string): string | undefined {
  return tab.startsWith(HOST_TAB_PREFIX) ? tab.slice(HOST_TAB_PREFIX.length) : undefined;
}

interface HostLeftPanelFocus {
  readonly groupId: string;
  readonly location: 'content' | 'tab';
}

function captureHostLeftPanelFocus(root: HTMLElement): HostLeftPanelFocus | undefined {
  const rootNode = root.getRootNode() as ShadowRoot;
  const focusedTab = rootNode.activeElement?.closest<HTMLElement>(
    '[role="tab"][data-host-left-panel-mode="canvas"]',
  );
  if (focusedTab?.dataset.hostLeftPanelGroup !== undefined) {
    return { groupId: focusedTab.dataset.hostLeftPanelGroup, location: 'tab' };
  }

  const host = rootNode.host;
  const activeElement = root.ownerDocument.activeElement;
  const view = root.ownerDocument.defaultView;
  if (
    view === null ||
    !(host instanceof view.HTMLElement) ||
    !(activeElement instanceof view.Element)
  ) {
    return undefined;
  }
  for (const child of host.children) {
    if (!(child instanceof view.HTMLElement)) continue;
    if (!child.slot.startsWith(BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX)) continue;
    if (child !== activeElement && !child.contains(activeElement)) continue;
    return {
      groupId: child.slot.slice(BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX.length),
      location: 'content',
    };
  }
  return undefined;
}

function restoreHostLeftPanelFocus(
  root: HTMLElement,
  groups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined,
  focus: HostLeftPanelFocus | undefined,
): void {
  if (focus === undefined) return;
  const retainedGroup = groups?.find((group) => group.id === focus.groupId);
  if (focus.location === 'content' && retainedGroup !== undefined) return;
  const retained =
    retainedGroup !== undefined &&
    baseScreenDesignerLeftPanelGroupSupportsMode(retainedGroup, 'canvas');
  const tab = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-panel-tab]')).find(
    (control) =>
      control.dataset.panelTab === (retained ? hostLeftPanelTab(focus.groupId) : 'materials'),
  );
  tab?.focus();
}

export function blueprintHostLeftPanelTabId(groupId: string): string {
  return `designer-blueprint-host-${groupId}-tab`;
}

export function hostLeftPanelTabId(groupId: string): string {
  return `designer-host-${groupId}-tab`;
}

export function hostLeftPanelPanelId(groupId: string): string {
  return `designer-host-${groupId}-panel`;
}
