import { createBaseScreenPluginCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  findDesignerPluginCommandByShortcut,
  listDesignerPluginCommandItems,
  listDesignerPluginCommandPaletteItems,
} from '../../../../src/common/operations/plugin/designer-plugin-commands.js';

function catalog(
  contributions: readonly {
    readonly id: string;
    readonly name: string;
    readonly menus?: readonly (
      | 'commandPalette'
      | 'menu.tools'
      | 'context.canvas'
      | 'context.component'
      | 'context.multi'
    )[];
    readonly shortcut?: string;
  }[],
) {
  return createBaseScreenPluginCatalog([
    {
      manifest: {
        id: 'acme.tools',
        dependencies: [],
        capabilities: ['command.execute'],
        contributions: contributions.map((item) => ({
          kind: 'command' as const,
          id: item.id,
          name: item.name,
          requiredCapability: 'command.execute',
          ...(item.menus === undefined ? {} : { menus: item.menus }),
          ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
        })),
      },
      grantedCapabilities: ['command.execute'],
      contributions: contributions.map((item) => ({
        kind: 'command' as const,
        id: item.id,
        name: item.name,
        requiredCapability: 'command.execute',
        ...(item.menus === undefined ? {} : { menus: item.menus }),
        ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
      })),
    },
  ]);
}

describe('listDesignerPluginCommandPaletteItems', () => {
  it('lists granted command contributions and disables them without a port', () => {
    const items = catalog([{ id: 'refresh', name: 'Refresh' }]);

    expect(listDesignerPluginCommandPaletteItems(undefined, true)).toEqual([]);
    expect(listDesignerPluginCommandPaletteItems(items, false)).toEqual([
      { id: 'refresh', name: 'Refresh', disabled: true },
    ]);
    expect(listDesignerPluginCommandPaletteItems(items, true)).toEqual([
      { id: 'refresh', name: 'Refresh', disabled: false },
    ]);
  });

  it('omits commands that write menus without commandPalette', () => {
    const items = catalog([
      {
        id: 'canvas-only',
        name: 'Canvas only',
        menus: ['context.canvas'],
      },
      {
        id: 'hidden',
        name: 'Hidden',
        menus: [],
      },
      {
        id: 'tools',
        name: 'Tools ping',
        menus: ['commandPalette', 'menu.tools'],
        shortcut: 'Ctrl+Shift+P',
      },
    ]);

    expect(listDesignerPluginCommandPaletteItems(items, true)).toEqual([
      { id: 'tools', name: 'Tools ping', disabled: false, shortcut: 'Ctrl+Shift+P' },
    ]);
    expect(listDesignerPluginCommandItems(items, true, 'menu.tools')).toEqual([
      { id: 'tools', name: 'Tools ping', disabled: false, shortcut: 'Ctrl+Shift+P' },
    ]);
    expect(listDesignerPluginCommandItems(items, true, 'context.canvas')).toEqual([
      { id: 'canvas-only', name: 'Canvas only', disabled: false },
    ]);
  });

  it('ignores shortcuts that collide with built-ins or earlier catalog commands', () => {
    const items = catalog([
      { id: 'alpha.ping', name: 'Alpha', shortcut: 'Ctrl+S' },
      { id: 'beta.ping', name: 'Beta', shortcut: 'Ctrl+Shift+P' },
      { id: 'gamma.ping', name: 'Gamma', shortcut: 'Ctrl+Shift+P' },
    ]);

    expect(listDesignerPluginCommandPaletteItems(items, true)).toEqual([
      { id: 'alpha.ping', name: 'Alpha', disabled: false },
      { id: 'beta.ping', name: 'Beta', disabled: false, shortcut: 'Ctrl+Shift+P' },
      { id: 'gamma.ping', name: 'Gamma', disabled: false },
    ]);
    expect(findDesignerPluginCommandByShortcut(items, 'Ctrl+S')).toBeUndefined();
    expect(findDesignerPluginCommandByShortcut(items, 'Ctrl+Shift+P')).toMatchObject({
      id: 'beta.ping',
    });
    expect(findDesignerPluginCommandByShortcut(items, 'Cmd+Shift+P')).toMatchObject({
      id: 'beta.ping',
    });
  });
});
