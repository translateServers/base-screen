import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { BaseScreenDesignerWorkbenchMode } from '../../../common/operations/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  hostLeftPanelGroupId,
  hostLeftPanelTab,
  hostLeftPanelTabId,
} from '../../dom/designer-left-panel-groups-dom.js';
import type { DesignerPanelSide } from './designer-panel-layout-controller.js';

type LeftTab = 'materials' | 'layers' | 'variables' | `host:${string}`;
export type DesignerInspectorTab = 'appearance' | 'data' | 'interaction';
type RightTab = DesignerInspectorTab;

interface DesignerWorkbenchTabsCallbacks {
  readonly expandPanel: (side: DesignerPanelSide) => void;
  readonly getCatalog?: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getRoot: () => ShadowRoot | null;
  readonly onLeftPanelGroupChange?: (groupId: string | undefined) => void;
}

export class DesignerWorkbenchTabsController {
  #leftTab: LeftTab = 'materials';
  #rightTab: RightTab = 'appearance';
  #authoringMode: BaseScreenDesignerWorkbenchMode = 'canvas';

  constructor(private readonly callbacks: DesignerWorkbenchTabsCallbacks) {}

  initialize(): void {
    this.render();
  }

  onClick(target: Element): boolean {
    const leftTab = target.closest<HTMLButtonElement>('[data-panel-tab]')?.dataset.panelTab;
    if (leftTab !== undefined && isLeftTab(leftTab) && this.leftTabAvailable(leftTab)) {
      return this.selectLeftTab(leftTab);
    }
    const rightTab =
      target.closest<HTMLButtonElement>('[data-inspector-tab]')?.dataset.inspectorTab;
    if (rightTab === 'appearance' || rightTab === 'data' || rightTab === 'interaction') {
      if (!this.rightTabAvailable(rightTab)) return true;
      this.#rightTab = rightTab;
      this.render();
      return true;
    }
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.getAttribute('role') !== 'tab') {
      return false;
    }
    const direction = tabDirection(event.key);
    if (direction === undefined) return false;
    const tabList = target.closest<HTMLElement>('[role="tablist"]');
    if (tabList === null) return false;
    const controls = Array.from(tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(
      (tab) => !tab.hidden && !tab.disabled,
    );
    const current = controls.findIndex((tab) => tab === target);
    if (current < 0 || controls.length === 0) return false;
    const next =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? controls.length - 1
          : (current + direction + controls.length) % controls.length;
    const control = controls[next];
    if (control === undefined) return false;
    control.focus();
    event.preventDefault();
    return this.onClick(control);
  }

  selectInspectorTab(tab: DesignerInspectorTab): void {
    if (!this.rightTabAvailable(tab)) return;
    this.#rightTab = tab;
    this.callbacks.expandPanel('right');
    this.render();
  }

  get selectedLeftPanelGroupId(): string | undefined {
    return hostLeftPanelGroupId(this.#leftTab);
  }

  setAuthoringMode(mode: BaseScreenDesignerWorkbenchMode): void {
    if (this.#authoringMode === mode) return;
    this.#authoringMode = mode;
    if (mode === 'canvas') {
      this.render();
      return;
    }
    const root = this.callbacks.getRoot();
    if (root === null) return;
    for (const pane of root.querySelectorAll<HTMLElement>(
      '.host-left-panel-view[data-host-left-panel-group]',
    )) {
      pane.hidden = true;
    }
  }

  selectLeftPanelGroup(groupId: string): boolean {
    if (this.#authoringMode !== 'canvas') return false;
    return this.selectLeftTab(hostLeftPanelTab(groupId));
  }

  refreshLeftPanelGroups(): void {
    if (this.leftTabAvailable(this.#leftTab)) {
      if (this.#authoringMode === 'canvas') this.render();
      return;
    }
    const previousGroupId = hostLeftPanelGroupId(this.#leftTab);
    this.#leftTab = 'materials';
    if (this.#authoringMode === 'canvas') this.render();
    if (previousGroupId !== undefined) this.callbacks.onLeftPanelGroupChange?.(undefined);
  }

  renderInspectorTabs(): void {
    this.render();
  }

  private render(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    if (this.#authoringMode === 'blueprint') return;
    const selection = this.callbacks.getInteraction();
    const singleComponentSelected =
      selection.focusedComponentId !== null && selection.selectedComponentIds.length === 1;
    const dataTabAvailable = singleComponentSelected && this.rightTabAvailable('data');
    const rightPanelTitle = root.querySelector<HTMLElement>('[data-right-panel-title]');
    if (rightPanelTitle !== null) {
      rightPanelTitle.textContent = singleComponentSelected
        ? DESIGNER_UI_TEXT.inspectorUi.componentConfiguration
        : selection.selectedComponentIds.length > 1
          ? DESIGNER_UI_TEXT.inspectorUi.batchConfiguration
          : DESIGNER_UI_TEXT.inspectorUi.canvasConfiguration;
    }
    if (!singleComponentSelected || (this.#rightTab === 'data' && !dataTabAvailable)) {
      this.#rightTab = 'appearance';
    }
    const leftTabControls = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-panel-tab]'),
    );
    for (const control of leftTabControls) {
      control.ariaSelected = String(control.dataset.panelTab === this.#leftTab);
    }
    const materials = root.querySelector<HTMLElement>('[data-materials]');
    const layers = root.querySelector<HTMLElement>('[data-layers]');
    const variables = root.querySelector<HTMLElement>('[data-variables]');
    const leftTitle = root.querySelector<HTMLElement>('[data-left-panel-title]');
    const leftCount = root.querySelector<HTMLElement>('[data-left-panel-count]');
    const hostGroupId = hostLeftPanelGroupId(this.#leftTab);
    const leftPanelLabel =
      hostGroupId !== undefined
        ? (leftTabControls.find((control) => control.dataset.panelTab === this.#leftTab)?.dataset
            .panelLabel ?? hostGroupId)
        : this.#leftTab === 'materials'
          ? DESIGNER_UI_TEXT.materials
          : this.#leftTab === 'layers'
            ? DESIGNER_UI_TEXT.layers
            : DESIGNER_UI_TEXT.variables.title;
    if (leftTitle !== null) leftTitle.textContent = leftPanelLabel;
    if (leftCount !== null && hostGroupId !== undefined) {
      leftCount.hidden = true;
      leftCount.textContent = '';
      leftCount.removeAttribute('aria-label');
    } else if (leftCount !== null) {
      leftCount.hidden = false;
      const itemCount =
        this.#leftTab === 'materials'
          ? Number(leftCount.dataset.materialTotal ?? 0)
          : this.#leftTab === 'layers'
            ? (this.callbacks.getDocument()?.components.length ?? 0)
            : (this.callbacks.getDocument()?.variables.length ?? 0);
      leftCount.textContent = String(itemCount);
      leftCount.ariaLabel = DESIGNER_UI_TEXT.leftPanelCount(leftPanelLabel, itemCount);
    }
    if (materials !== null) materials.hidden = this.#leftTab !== 'materials';
    if (layers !== null) layers.hidden = this.#leftTab !== 'layers';
    if (variables !== null) variables.hidden = this.#leftTab !== 'variables';
    for (const pane of root.querySelectorAll<HTMLElement>(
      '.host-left-panel-view[data-host-left-panel-group]',
    )) {
      const paneGroupId = pane.dataset.hostLeftPanelGroup;
      pane.hidden = paneGroupId !== hostGroupId;
      if (!pane.hidden && paneGroupId !== undefined) {
        pane.setAttribute('aria-labelledby', hostLeftPanelTabId(paneGroupId));
      }
    }
    const inspectorTabs = root.querySelector<HTMLElement>('.inspector-tabs');
    if (inspectorTabs !== null) inspectorTabs.hidden = !singleComponentSelected;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) {
      control.hidden = control.dataset.inspectorTab === 'data' && !dataTabAvailable;
      control.ariaSelected = String(control.dataset.inspectorTab === this.#rightTab);
    }
    for (const pane of root.querySelectorAll<HTMLElement>('[data-inspector-pane]')) {
      const active = pane.dataset.inspectorPane === this.#rightTab;
      pane.hidden = !active;
      if (singleComponentSelected) {
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', `designer-${pane.dataset.inspectorPane}-tab`);
        pane.removeAttribute('aria-label');
      } else if (active) {
        pane.setAttribute('role', 'region');
        pane.removeAttribute('aria-labelledby');
        pane.setAttribute('aria-label', nonTabbedInspectorLabel(selection.selectedComponentIds));
      } else {
        pane.removeAttribute('role');
        pane.removeAttribute('aria-labelledby');
        pane.removeAttribute('aria-label');
      }
    }
  }

  private selectLeftTab(tab: LeftTab): boolean {
    if (!this.leftTabAvailable(tab)) return false;
    this.callbacks.expandPanel('left');
    const previousGroupId = hostLeftPanelGroupId(this.#leftTab);
    this.#leftTab = tab;
    this.render();
    const nextGroupId = hostLeftPanelGroupId(tab);
    if (previousGroupId !== nextGroupId) {
      this.callbacks.onLeftPanelGroupChange?.(nextGroupId);
    }
    return true;
  }

  private leftTabAvailable(tab: LeftTab): boolean {
    if (tab === 'materials' || tab === 'layers' || tab === 'variables') return true;
    const root = this.callbacks.getRoot();
    if (root === null) return false;
    return Array.from(root.querySelectorAll<HTMLElement>('[data-panel-tab]')).some(
      (control) => control.dataset.panelTab === tab,
    );
  }

  private rightTabAvailable(tab: RightTab): boolean {
    if (tab !== 'data' || this.callbacks.getCatalog === undefined) return true;
    const catalog = this.callbacks.getCatalog();
    const focusedId = this.callbacks.getInteraction().focusedComponentId;
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === focusedId);
    if (catalog === undefined || component === undefined) return false;
    return (catalog.get(component.type)?.manifest.dataCapabilities.length ?? 0) > 0;
  }
}

function tabDirection(key: string): -1 | 1 | 'first' | 'last' | undefined {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return undefined;
}

function isLeftTab(value: string): value is LeftTab {
  return (
    value === 'materials' ||
    value === 'layers' ||
    value === 'variables' ||
    hostLeftPanelGroupId(value) !== undefined
  );
}

function nonTabbedInspectorLabel(selectedComponentIds: readonly string[]): string {
  return selectedComponentIds.length > 1
    ? DESIGNER_UI_TEXT.propertiesPanel.selectionSummary
    : DESIGNER_UI_TEXT.propertiesPanel.canvas;
}
