import type { DesignerIconName } from '../../ui/designer-icons.js';

/**
 * 右键菜单的动作图标。只覆盖画布/组件/多选菜单实际出现的动作；
 * 未登记的动作不占图标列（由渲染器判断），不会出现空槽导致的文字错位。
 */
const CONTEXT_MENU_ICONS: Readonly<Record<string, DesignerIconName>> = {
  undo: 'undo',
  redo: 'redo',
  'select-all': 'select-all',
  paste: 'paste',
  copy: 'copy',
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
};

export function contextMenuIcon(action: string): DesignerIconName | undefined {
  return CONTEXT_MENU_ICONS[action];
}

/** 子菜单图标由内容判定，不按本地化文案匹配：文案会改，动作 id 不会。 */
export function contextSubmenuIcon(
  entries: readonly (string | { readonly entries: readonly unknown[] })[],
): DesignerIconName {
  const ids = new Set(entries.filter((entry): entry is string => typeof entry === 'string'));
  if (ids.has('toggle-grid') || ids.has('toggle-guides')) return 'guides';
  if (ids.has('align-left') || ids.has('distribute-horizontal')) return 'align-left';
  if (ids.has('bring-to-front') || ids.has('lock')) return 'layers';
  return 'sliders';
}
