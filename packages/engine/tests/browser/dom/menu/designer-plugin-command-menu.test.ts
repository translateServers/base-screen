import { describe, expect, it } from 'vitest';
import { pluginCommandMenuSection } from '../../../../src/browser/dom/menu/designer-plugin-command-menu.js';

describe('pluginCommandMenuSection', () => {
  it('renders data-plugin-command items and escapes labels', () => {
    expect(pluginCommandMenuSection([])).toBe('');
    expect(
      pluginCommandMenuSection([
        {
          id: 'acme.ping',
          name: 'Ping <metrics>',
          disabled: false,
          shortcut: 'Ctrl+Shift+P',
        },
      ]),
    ).toContain('data-plugin-command="acme.ping"');
    expect(
      pluginCommandMenuSection([
        {
          id: 'acme.ping',
          name: 'Ping <metrics>',
          disabled: false,
        },
      ]),
    ).toContain('Ping &lt;metrics&gt;');
    expect(
      pluginCommandMenuSection([
        {
          id: 'acme.ping',
          name: 'Ping',
          disabled: true,
        },
      ]),
    ).toContain(' disabled');
  });

  it('labels and iconifies plugin commands when used by the context menu', () => {
    const html = pluginCommandMenuSection(
      [{ id: 'acme.ping', name: 'Ping', disabled: false, shortcut: 'Ctrl+Shift+P' }],
      { label: '插件', context: true },
    );
    expect(html).toContain('designer-menu-section-label');
    expect(html).toContain('插件');
    expect(html).toContain('menu-item-icon');
    expect(html).toContain('menu-item-label');
    expect(html).toContain('Ctrl+Shift+P');
  });
});
