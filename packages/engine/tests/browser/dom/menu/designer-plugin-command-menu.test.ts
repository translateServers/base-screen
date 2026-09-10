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
});
