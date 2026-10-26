import type { DesignerIconName } from '../../ui/designer-icons.js';

/**
 * 菜单动作图标。顶栏下拉与画布右键共用同一份登记：未登记的动作不画字形，
 * 图标槽仍然占位，标签列因此不会因菜单不同而错位。
 */
const MENU_ACTION_ICONS: Readonly<Record<string, DesignerIconName>> = {
  undo: 'undo',
  redo: 'redo',
  'select-all': 'select-all',
  paste: 'paste',
  copy: 'copy',
  duplicate: 'duplicate',
  delete: 'trash',
  group: 'group',
  ungroup: 'ungroup',
  'bring-to-front': 'bring-to-front',
  'bring-forward': 'arrow-up',
  'send-backward': 'arrow-down',
  'send-to-back': 'send-to-back',
  lock: 'lock',
  unlock: 'lock-open',
  hide: 'eye-off',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  'zoom-reset': 'reset',
  'zoom-fit': 'fit',
  'toggle-grid': 'grid',
  'toggle-guides': 'guides',
  'toggle-border-guides': 'border-guides',
  'align-left': 'align-left',
  'align-center': 'align-center',
  'align-right': 'align-right',
  'align-top': 'align-top',
  'align-middle': 'align-middle',
  'align-bottom': 'align-bottom',
  'distribute-horizontal': 'distribute-h',
  'distribute-vertical': 'distribute-v',
  // 顶栏下拉独有的动作，与顶栏按钮同族：导入/导出取文件进出方向，发布沿用顶栏的上传图标。
  'project-workspace': 'map',
  import: 'download',
  export: 'upload',
  'project-save': 'save',
  'project-publish': 'upload',
  'project-retry': 'reset',
  'project-cancel': 'close',
  'edit-position': 'locate',
  'edit-size': 'fit',
  'select-layer-up': 'arrow-up',
  'select-layer-down': 'arrow-down',
  'toggle-workbench': 'layers',
  'show-help': 'help',
};

export function menuActionIcon(action: string): DesignerIconName | undefined {
  return MENU_ACTION_ICONS[action];
}

/** 子菜单图标由内容判定，不按本地化文案匹配：文案会改，动作 id 不会。 */
export function menuSubmenuIcon(
  entries: readonly (string | { readonly entries: readonly unknown[] })[],
): DesignerIconName {
  const ids = new Set(entries.filter((entry): entry is string => typeof entry === 'string'));
  if (ids.has('toggle-grid') || ids.has('toggle-guides')) return 'guides';
  if (ids.has('align-left') || ids.has('distribute-horizontal')) return 'align-left';
  if (ids.has('bring-to-front') || ids.has('lock')) return 'layers';
  return 'sliders';
}
