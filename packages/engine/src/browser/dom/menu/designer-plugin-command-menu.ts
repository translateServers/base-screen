import type { DesignerPluginCommandItem } from '../../../common/operations/plugin/designer-plugin-commands.js';
import { designerIcon } from '../../dom/designer-icons.js';
import { escapeHtml } from '../designer-html-escape.js';
import type { DesignerMenuControllerCallbacks } from './designer-menu-model.js';

export function renderPluginToolsMenu(
  menu: HTMLElement,
  callbacks: DesignerMenuControllerCallbacks,
): void {
  // 工具菜单是顶层面板：命中 toggle-workbench 的菜单本身就是挂载点；子菜单形态（历史）兼容为就近容器。
  const toolsAnchor = menu.querySelector(
    '[data-menu-action="toggle-workbench"], [data-menu-action="show-help"]',
  );
  if (toolsAnchor === null) return;
  const host =
    toolsAnchor.closest<HTMLElement>('[data-submenu]') ??
    toolsAnchor.closest<HTMLElement>('[data-menu]');
  if (host === null) return;
  let section = host.querySelector<HTMLElement>('[data-plugin-menu="menu.tools"]');
  if (section === null) {
    section = host.ownerDocument.createElement('div');
    section.dataset.pluginMenu = 'menu.tools';
    host.append(section);
  }
  section.innerHTML = pluginCommandMenuSection(
    callbacks.getPluginCommandItems?.('menu.tools') ?? [],
  );
}

export function pluginCommandMenuSection(
  items: readonly DesignerPluginCommandItem[],
  options: { readonly label?: string } = {},
): string {
  if (items.length === 0) return '';
  const label =
    options.label === undefined
      ? ''
      : `<div class="designer-menu-section-label" role="presentation">${escapeHtml(options.label)}</div>`;
  return `<div class="designer-menu-separator" data-menu-separator role="separator"></div>${label}${items
    .map((item) => pluginCommandMenuButton(item))
    .join('')}`;
}

/** 插件命令与内建动作同网格：图标槽用 sparkle，标签与快捷键列位置一致。 */
export function pluginCommandMenuButton(item: DesignerPluginCommandItem): string {
  const shortcut = item.shortcut === undefined ? '' : `<kbd>${escapeHtml(item.shortcut)}</kbd>`;
  const disabled = item.disabled ? ' disabled' : '';
  const id = escapeHtml(item.id);
  const name = escapeHtml(item.name);
  return (
    `<button type="button" class="designer-menu-item"` +
    ` data-plugin-command="${id}" role="menuitem"${disabled}>` +
    `<span class="menu-item-icon" aria-hidden="true"><span class="menu-item-glyph">${designerIcon(
      'sparkle',
    )}</span></span>` +
    `<span class="menu-item-label">${name}</span>${shortcut}</button>`
  );
}
