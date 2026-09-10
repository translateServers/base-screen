import type { DesignerPluginCommandItem } from '../../../common/operations/plugin/designer-plugin-commands.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerContextMenuAction } from '../workspace/designer-workspace.js';

export interface DesignerMenuControllerCallbacks {
  readonly getRoot: () => ShadowRoot | null;
  readonly getContextMenu: () => HTMLElement | undefined;
  readonly getSelectedComponentIds: () => readonly string[];
  readonly getOperationState: (id: string) => DesignerOperationStateShape | undefined;
  readonly getPluginCommandItems?: (
    menu: 'menu.tools' | 'context.canvas' | 'context.component' | 'context.multi',
  ) => readonly DesignerPluginCommandItem[];
}

export interface DesignerOperationStateShape {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly checked: boolean;
}

export const TOGGLE_MENU_ACTIONS = new Set([
  'toggle-grid',
  'toggle-guides',
  'toggle-border-guides',
  'toggle-snap',
]);

export const DESIGNER_CONTEXT_MENU = {
  canvas: [
    'undo',
    'redo',
    'separator',
    'select-all',
    'paste',
    'separator',
    'zoom-in',
    'zoom-out',
    'zoom-reset',
    'zoom-fit',
    'separator',
    {
      label: DESIGNER_UI_TEXT.canvasAids,
      entries: ['toggle-grid', 'toggle-guides', 'toggle-border-guides'],
    },
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
  component: [
    'undo',
    'redo',
    'separator',
    'copy',
    'paste',
    'delete',
    'separator',
    'group',
    'ungroup',
    {
      label: DESIGNER_UI_TEXT.layer,
      entries: [
        'bring-to-front',
        'bring-forward',
        'send-backward',
        'send-to-back',
        'lock',
        'unlock',
        'hide',
      ],
    },
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
  multi: [
    'undo',
    'redo',
    'separator',
    'copy',
    'paste',
    'delete',
    'separator',
    'group',
    'ungroup',
    {
      label: DESIGNER_UI_TEXT.arrange,
      entries: [
        'align-left',
        'align-center',
        'align-right',
        'align-top',
        'align-middle',
        'align-bottom',
        'separator',
        'distribute-horizontal',
        'distribute-vertical',
      ],
    },
    {
      label: DESIGNER_UI_TEXT.layer,
      entries: [
        'bring-to-front',
        'bring-forward',
        'send-backward',
        'send-to-back',
        'lock',
        'unlock',
        'hide',
      ],
    },
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
};

// 画布右键菜单与下拉菜单（含帮助面板）的 DOM 编排。只依赖根节点与操作状态查询，
