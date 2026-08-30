import type { BaseScreenDesignerLeftPanelGroup } from '../../../common/operations/workbench/designer-left-panel-groups.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { blueprintHostLeftPanelTabId } from '../designer-left-panel-groups-dom.js';

export function syncDesignerBlueprintHostLeftPanel(
  root: ShadowRoot,
  group: BaseScreenDesignerLeftPanelGroup | undefined,
  builtinCount: number,
): void {
  for (const pane of root.querySelectorAll<HTMLElement>(
    '.host-left-panel-view[data-host-left-panel-group]',
  )) {
    const active = pane.dataset.hostLeftPanelGroup === group?.id;
    pane.hidden = !active;
    if (active && group !== undefined) {
      pane.setAttribute('aria-labelledby', blueprintHostLeftPanelTabId(group.id));
    }
  }

  const counter = root.querySelector<HTMLElement>('[data-left-panel-count]');
  if (counter !== null) {
    counter.hidden = group !== undefined;
    if (group !== undefined) {
      counter.textContent = '';
      counter.removeAttribute('aria-label');
    } else {
      counter.textContent = String(builtinCount);
      counter.setAttribute(
        'aria-label',
        DESIGNER_UI_TEXT.blueprint.panelCount(DESIGNER_UI_TEXT.blueprint.library, builtinCount),
      );
    }
  }
  const title = root.querySelector<HTMLElement>('[data-left-panel-title]');
  if (title !== null) {
    title.textContent = group?.label ?? DESIGNER_UI_TEXT.blueprint.library;
  }
}
