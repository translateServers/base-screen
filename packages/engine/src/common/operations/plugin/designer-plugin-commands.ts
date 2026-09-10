import type {
  BaseScreenPluginCatalog,
  BaseScreenPluginCommandMenu,
  BaseScreenPluginContribution,
} from '@base-screen/plugin-core';
import { DESIGNER_TOOLS, getDesignerToolShortcut } from '../../tools/designer-tools.js';
import { DESIGNER_OPERATION_TEXT } from '../designer-operation-registry.js';

export type DesignerPluginCommandChromeMenu = BaseScreenPluginCommandMenu;

export interface DesignerPluginCommandItem {
  readonly id: string;
  readonly name: string;
  readonly disabled: boolean;
  readonly shortcut?: string;
}

export type DesignerPluginCommandPaletteItem = DesignerPluginCommandItem;

export function listDesignerPluginCommandPaletteItems(
  catalog: BaseScreenPluginCatalog | undefined,
  hasCommandPort: boolean,
): readonly DesignerPluginCommandPaletteItem[] {
  return listDesignerPluginCommandItems(catalog, hasCommandPort, 'commandPalette');
}

export function listDesignerPluginCommandItems(
  catalog: BaseScreenPluginCatalog | undefined,
  hasCommandPort: boolean,
  menu: DesignerPluginCommandChromeMenu,
): readonly DesignerPluginCommandItem[] {
  const items: DesignerPluginCommandItem[] = [];
  for (const command of listCommandContributions(catalog)) {
    if (!commandAppearsOnMenu(command.contribution, menu)) continue;
    items.push(toCommandItem(command, hasCommandPort, catalog));
  }
  return items.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function findDesignerPluginCommandByShortcut(
  catalog: BaseScreenPluginCatalog | undefined,
  chord: string,
): DesignerPluginCommandItem | undefined {
  const normalized = normalizeDesignerShortcut(chord);
  const claimed = claimedPluginShortcuts(catalog);
  const commandId = claimed.get(normalized);
  if (commandId === undefined) return undefined;
  for (const command of listCommandContributions(catalog)) {
    if (command.contribution.id === commandId) {
      return toCommandItem(command, true, catalog);
    }
  }
  return undefined;
}

export function designerReservedShortcutChords(): ReadonlySet<string> {
  const chords = new Set<string>();
  for (const text of Object.values(DESIGNER_OPERATION_TEXT)) {
    if ('shortcut' in text) chords.add(normalizeDesignerShortcut(text.shortcut));
  }
  for (const alias of ['Ctrl+Y', 'Ctrl+Shift+=']) {
    chords.add(normalizeDesignerShortcut(alias));
  }
  for (const tool of DESIGNER_TOOLS) {
    chords.add(normalizeDesignerShortcut(getDesignerToolShortcut(tool.id)));
  }
  return chords;
}

interface CatalogCommand {
  readonly grantedCapabilities: readonly string[];
  readonly contribution: BaseScreenPluginContribution & { readonly kind: 'command' };
}

function listCommandContributions(
  catalog: BaseScreenPluginCatalog | undefined,
): readonly CatalogCommand[] {
  if (catalog === undefined) return [];
  const items: CatalogCommand[] = [];
  for (const plugin of catalog.list()) {
    for (const contribution of plugin.contributions) {
      if (contribution.kind !== 'command') continue;
      items.push({
        grantedCapabilities: plugin.grantedCapabilities,
        contribution,
      });
    }
  }
  return items;
}

function commandAppearsOnMenu(
  contribution: BaseScreenPluginContribution & { readonly kind: 'command' },
  menu: DesignerPluginCommandChromeMenu,
): boolean {
  const menus = contribution.menus ?? ['commandPalette'];
  return menus.includes(menu);
}

function toCommandItem(
  command: CatalogCommand,
  hasCommandPort: boolean,
  catalog: BaseScreenPluginCatalog | undefined,
): DesignerPluginCommandItem {
  const claimed = claimedPluginShortcuts(catalog);
  const shortcut =
    command.contribution.shortcut !== undefined &&
    claimed.get(normalizeDesignerShortcut(command.contribution.shortcut)) ===
      command.contribution.id
      ? command.contribution.shortcut
      : undefined;
  return {
    id: command.contribution.id,
    name: command.contribution.name,
    disabled:
      !hasCommandPort || !isGrantedCommand(command.grantedCapabilities, command.contribution),
    ...(shortcut === undefined ? {} : { shortcut }),
  };
}

function claimedPluginShortcuts(
  catalog: BaseScreenPluginCatalog | undefined,
): ReadonlyMap<string, string> {
  const reserved = designerReservedShortcutChords();
  const claimed = new Map<string, string>();
  const candidates = listCommandContributions(catalog)
    .filter(
      (command) =>
        command.contribution.shortcut !== undefined &&
        isGrantedCommand(command.grantedCapabilities, command.contribution),
    )
    .sort((left, right) =>
      left.contribution.id < right.contribution.id
        ? -1
        : left.contribution.id > right.contribution.id
          ? 1
          : 0,
    );
  for (const command of candidates) {
    const shortcut = command.contribution.shortcut;
    if (shortcut === undefined) continue;
    const normalized = normalizeDesignerShortcut(shortcut);
    if (reserved.has(normalized) || claimed.has(normalized)) continue;
    claimed.set(normalized, command.contribution.id);
  }
  return claimed;
}

function isGrantedCommand(
  grantedCapabilities: readonly string[],
  contribution: BaseScreenPluginContribution & { readonly kind: 'command' },
): boolean {
  return grantedCapabilities.includes(contribution.requiredCapability);
}

function normalizeDesignerShortcut(shortcut: string): string {
  return shortcut.replace('Cmd', 'Ctrl').toUpperCase();
}
