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

  it('renders plugin commands with the shared icon and label columns', () => {
    const html = pluginCommandMenuSection(
      [{ id: 'acme.ping', name: 'Ping', disabled: false, shortcut: 'Ctrl+Shift+P' }],
      { label: '插件' },
    );
    expect(html).toContain('designer-menu-section-label');
    expect(html).toContain('插件');
    expect(html).toContain('menu-item-icon');
    expect(html).toContain('menu-item-label');
    expect(html).toContain('Ctrl+Shift+P');
    // 顶栏“工具”菜单与右键菜单共用同一命令行，不再按入口切换网格。
    expect(
      pluginCommandMenuSection([{ id: 'acme.ping', name: 'Ping', disabled: false }]),
    ).toContain('menu-item-icon');
  });
});
