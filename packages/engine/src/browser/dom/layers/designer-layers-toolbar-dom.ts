import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerIconName } from '../../ui/designer-icons.js';
import { createDesignerIconButton } from '../designer-ui-primitives.js';

export type DesignerLayerArrangeAction = 'front' | 'up' | 'down' | 'back';
export type DesignerLayerGroupAction = 'group' | 'ungroup';

export interface DesignerLayerToolbarState {
  readonly arrange: Readonly<Record<DesignerLayerArrangeAction, boolean>>;
  readonly group: boolean;
  readonly ungroup: boolean;
}

const ARRANGE_ACTIONS = [
  {
    action: 'front',
    icon: 'bring-to-front',
    label: DESIGNER_UI_TEXT.layersPanel.bringToFront,
  },
  { action: 'up', icon: 'arrow-up', label: DESIGNER_UI_TEXT.layersPanel.moveUp },
  { action: 'down', icon: 'arrow-down', label: DESIGNER_UI_TEXT.layersPanel.moveDown },
  {
    action: 'back',
    icon: 'send-to-back',
    label: DESIGNER_UI_TEXT.layersPanel.sendToBack,
  },
] as const satisfies readonly {
  readonly action: DesignerLayerArrangeAction;
  readonly icon: DesignerIconName;
  readonly label: string;
}[];

const GROUP_ACTIONS = [
  { action: 'group', icon: 'group', label: DESIGNER_UI_TEXT.layersPanel.group },
  { action: 'ungroup', icon: 'ungroup', label: DESIGNER_UI_TEXT.layersPanel.ungroup },
] as const satisfies readonly {
  readonly action: DesignerLayerGroupAction;
  readonly icon: DesignerIconName;
  readonly label: string;
}[];

export function createDesignerLayerToolbar(
  ownerDocument: Document,
  state: DesignerLayerToolbarState,
): HTMLElement {
  const toolbar = ownerDocument.createElement('div');
  toolbar.className = 'layer-toolbar';
  toolbar.dataset.layerToolbar = 'true';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.ariaLabel = DESIGNER_UI_TEXT.layersPanel.toolbar;
  for (const item of ARRANGE_ACTIONS) {
    const control = iconButton(ownerDocument, item.icon, item.label, state.arrange[item.action]);
    control.dataset.layerArrange = item.action;
    toolbar.appendChild(control);
  }
  const separator = ownerDocument.createElement('span');
  separator.className = 'layer-toolbar-separator';
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-orientation', 'vertical');
  toolbar.appendChild(separator);
  for (const item of GROUP_ACTIONS) {
    const control = iconButton(ownerDocument, item.icon, item.label, state[item.action]);
    control.dataset.layerGroupAction = item.action;
    toolbar.appendChild(control);
  }
  return toolbar;
}

/**
 * 工具栏是常驻外壳：可用性随选中态变化，只同步 disabled，不重建按钮。
 * 重建会让点击后的焦点/悬停态跟着节点一起消失，连续调整层级时手要重新找按钮。
 */
export function applyDesignerLayerToolbarState(
  toolbar: HTMLElement,
  state: DesignerLayerToolbarState,
): void {
  for (const control of Array.from(toolbar.children ?? []) as HTMLElement[]) {
    const arrange = control.dataset.layerArrange as DesignerLayerArrangeAction | undefined;
    const groupAction = control.dataset.layerGroupAction as DesignerLayerGroupAction | undefined;
    const enabled =
      arrange !== undefined
        ? state.arrange[arrange]
        : groupAction !== undefined
          ? state[groupAction]
          : undefined;
    if (enabled !== undefined) (control as HTMLButtonElement).disabled = !enabled;
  }
}

function iconButton(
  ownerDocument: Document,
  icon: DesignerIconName,
  label: string,
  enabled: boolean,
): HTMLButtonElement {
  return createDesignerIconButton(ownerDocument, {
    className: 'layer-toolbar-button',
    disabled: !enabled,
    icon,
    label,
  });
}
