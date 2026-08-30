import {
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  type BaseScreenDesignerLeftPanelGroupChangeEventDetail,
} from '../../common/operations/workbench/designer-left-panel-groups.js';

export class DesignerLeftPanelGroupEventController {
  #activeGroupId: string | null = null;

  constructor(private readonly host: HTMLElement) {}

  sync(groupId: string | undefined): void {
    const normalized = groupId ?? null;
    if (normalized === this.#activeGroupId) return;
    this.#activeGroupId = normalized;
    this.host.dispatchEvent(
      new CustomEvent<BaseScreenDesignerLeftPanelGroupChangeEventDetail>(
        BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
        {
          bubbles: true,
          composed: true,
          detail: { groupId: normalized },
        },
      ),
    );
  }
}
