import type { BaseScreenDesignerWorkbenchMode } from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export function renderDesignerBlueprintWorkbenchChrome(
  root: ShadowRoot,
  mode: BaseScreenDesignerWorkbenchMode,
  available: boolean,
  status: {
    readonly nodes: number;
    readonly relations: number;
    readonly semantic: number;
    readonly structural: number;
    readonly problems: number;
  },
): void {
  const layout = root.querySelector<HTMLElement>('.designer');
  if (layout !== null) layout.dataset.authoringMode = mode;
  const surface = root.querySelector<HTMLElement>('[data-blueprint-surface]');
  if (surface !== null) {
    surface.hidden = mode !== 'blueprint' || !available;
    surface.dataset.slotReady = String(available);
  }
  for (const control of root.querySelectorAll<HTMLButtonElement>('[data-workbench-mode-tab]')) {
    const controlMode = control.dataset.workbenchModeTab;
    const active = controlMode === mode;
    const unavailable = controlMode === 'blueprint' && !available;
    control.disabled = unavailable;
    control.dataset.active = String(active);
    control.setAttribute('aria-selected', String(active));
    control.tabIndex = active ? 0 : -1;
    const controlTip = unavailable
      ? DESIGNER_UI_TEXT.interactionWorkspaceUnavailable
      : controlMode === 'blueprint'
        ? DESIGNER_UI_TEXT.interactionWorkspaceHint
        : DESIGNER_UI_TEXT.canvasWorkspace;
    control.setAttribute('data-tip', controlTip);
    control.ariaLabel = controlTip;
  }
  const searchText =
    mode === 'blueprint'
      ? DESIGNER_UI_TEXT.commandPalette.blueprintTrigger
      : DESIGNER_UI_TEXT.commandPalette.trigger;
  const searchLabel = root.querySelector<HTMLElement>('[data-command-palette-trigger-label]');
  if (searchLabel !== null) searchLabel.textContent = searchText;
  const searchTrigger = root.querySelector<HTMLButtonElement>('[data-command-palette-toggle]');
  if (searchTrigger !== null) {
    searchTrigger.ariaLabel = searchText;
    searchTrigger.setAttribute('data-tip', searchText);
  }
  renderBlueprintPanelChrome(root, mode, status.nodes);
  if (mode !== 'blueprint') return;
  const selection = root.querySelector<HTMLElement>('[data-status-selection]');
  if (selection !== null) selection.textContent = DESIGNER_UI_TEXT.blueprint.workbench;
  const canvas = root.querySelector<HTMLElement>('[data-status-canvas]');
  if (canvas !== null) {
    canvas.textContent = DESIGNER_UI_TEXT.blueprint.status(
      status.nodes,
      status.relations,
      status.semantic,
      status.structural,
      status.problems,
    );
  }
}

function renderBlueprintPanelChrome(
  root: ShadowRoot,
  mode: BaseScreenDesignerWorkbenchMode,
  nodeCount: number,
): void {
  const active = mode === 'blueprint';
  const library = root.querySelector<HTMLElement>('[data-blueprint-library]');
  const inspector = root.querySelector<HTMLElement>('[data-blueprint-inspector]');
  if (library !== null) library.hidden = !active;
  if (inspector !== null) inspector.hidden = !active;
  updatePanelHeading(root, 'left', active, DESIGNER_UI_TEXT.blueprint.library, nodeCount);
  updatePanelHeading(root, 'right', active, DESIGNER_UI_TEXT.blueprint.inspector);
}

function updatePanelHeading(
  root: ShadowRoot,
  side: 'left' | 'right',
  active: boolean,
  title: string,
  count?: number,
): void {
  const heading = root.querySelector<HTMLElement>(`[data-${side}-panel-title]`);
  const counter = root.querySelector<HTMLElement>(`[data-${side}-panel-count]`);
  if (heading !== null) {
    if (active) {
      heading.dataset.canvasTitle ??= heading.textContent ?? '';
      heading.textContent = title;
    } else if (heading.dataset.canvasTitle !== undefined) {
      heading.textContent = heading.dataset.canvasTitle;
      delete heading.dataset.canvasTitle;
    }
  }
  if (counter === null) return;
  if (active) {
    counter.dataset.canvasCount ??= counter.textContent ?? '';
    counter.dataset.canvasAriaLabel ??= counter.getAttribute('aria-label') ?? '';
    counter.textContent = String(count ?? 0);
    counter.setAttribute('aria-label', DESIGNER_UI_TEXT.blueprint.panelCount(title, count ?? 0));
  } else if (counter.dataset.canvasCount !== undefined) {
    counter.textContent = counter.dataset.canvasCount;
    counter.setAttribute('aria-label', counter.dataset.canvasAriaLabel ?? '');
    delete counter.dataset.canvasCount;
    delete counter.dataset.canvasAriaLabel;
  }
}
