import { createBaseScreenPluginCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { listDesignerPluginCommandPaletteItems } from '../../../../src/common/operations/plugin/designer-plugin-commands.js';

describe('listDesignerPluginCommandPaletteItems', () => {
  it('lists granted command contributions and disables them without a port', () => {
    const catalog = createBaseScreenPluginCatalog([
      {
        manifest: {
          id: 'acme.tools',
          dependencies: [],
          capabilities: ['command.execute'],
          contributions: [
            {
              kind: 'command',
              id: 'refresh',
              name: 'Refresh',
              requiredCapability: 'command.execute',
            },
          ],
        },
        grantedCapabilities: ['command.execute'],
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
          },
        ],
      },
    ]);

    expect(listDesignerPluginCommandPaletteItems(undefined, true)).toEqual([]);
    expect(listDesignerPluginCommandPaletteItems(catalog, false)).toEqual([
      { id: 'refresh', name: 'Refresh', disabled: true },
    ]);
    expect(listDesignerPluginCommandPaletteItems(catalog, true)).toEqual([
      { id: 'refresh', name: 'Refresh', disabled: false },
    ]);
  });
});
