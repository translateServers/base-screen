import type { DesignerPluginCommandItem } from '../../../common/operations/plugin/designer-plugin-commands.js';
import type { DesignerMenuControllerCallbacks } from './designer-menu-model.js';

export function renderPluginToolsMenu(
  menu: HTMLElement,
  callbacks: DesignerMenuControllerCallbacks,
): void {
  const toolsSubmenu = [...menu.querySelectorAll<HTMLElement>('[data-submenu]')].find(
    (submenu) => submenu.querySelector('[data-menu-action="toggle-workbench"]') !== null,
  );
  if (toolsSubmenu === undefined) return;
  let host = toolsSubmenu.querySelector<HTMLElement>('[data-plugin-menu="menu.tools"]');
  if (host === null) {
    host = toolsSubmenu.ownerDocument.createElement('div');
    host.dataset.pluginMenu = 'menu.tools';
    toolsSubmenu.append(host);
  }
  host.innerHTML = pluginCommandMenuSection(callbacks.getPluginCommandItems?.('menu.tools') ?? []);
}

export function pluginCommandMenuSection(items: readonly DesignerPluginCommandItem[]): string {
  if (items.length === 0) return '';
  return `<div class="designer-menu-separator" data-menu-separator role="separator"></div>${items
    .map((item) => pluginCommandMenuButton(item))
    .join('')}`;
}

export function pluginCommandMenuButton(item: DesignerPluginCommandItem): string {
  const shortcut = item.shortcut === undefined ? '' : `<kbd>${escapeMenuText(item.shortcut)}</kbd>`;
  const disabled = item.disabled ? ' disabled' : '';
  const id = escapeMenuText(item.id);
  const name = escapeMenuText(item.name);
  return (
    `<button type="button" class="designer-control designer-button designer-menu-item"` +
    ` data-plugin-command="${id}" role="menuitem"${disabled}>` +
    `<span>${name}</span>${shortcut}</button>`
  );
}

function escapeMenuText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
