import { describe, expect, it } from 'vitest';
import { renderMaterialLibraryGroupNavigation } from '../../../../src/browser/dom/material-library/designer-material-library-group-dom.js';
import type { BaseScreenMaterialLibraryGroup } from '../../../../src/common/operations/material-library/material-library-grouping.js';
import {
  createMaterialGroupLayout,
  materialGrouping,
  parseGrouping,
} from './material-group-dom-fixture.js';

describe('material group column navigation', () => {
  it('keeps ordered roots visible, with an explicit all-materials entry in both columns', () => {
    const { layout, navigation, trigger, content } = createMaterialGroupLayout();
    const view = renderMaterialLibraryGroupNavigation(layout, materialGrouping(), undefined)!;
    expect(navigation.hidden).toBe(false);
    expect(trigger.hidden).toBe(false);
    expect(content.dataset.materialGrouped).toBe('true');
    expect(
      [...view.roots.children].map((entry) => (entry as HTMLElement).dataset.materialGroupKey),
    ).toEqual(['all', 'group:foundation', 'group:data']);
    expect(view.children.children.length).toBe(1);
    expect(view.children.querySelector('[aria-pressed="true"]')?.textContent).toContain('5');
    expect(view.back.hidden).toBe(true);
    expect(view.children.querySelector('.material-group-label')?.textContent).toBe('全部');
    expect(navigation.querySelector('.material-group-heading')).toBeNull();
  });

  it('keeps root icons decorative and exposes full paths and counts without visible labels', () => {
    const { layout } = createMaterialGroupLayout();
    const view = renderMaterialLibraryGroupNavigation(layout, materialGrouping(), 'data')!;
    expect(
      [...view.roots.querySelectorAll<HTMLElement>('.material-group-glyph')].map((glyph) => ({
        icon: glyph.dataset.icon,
        hidden: glyph.hidden,
        decorative: glyph.getAttribute('aria-hidden'),
      })),
    ).toEqual([
      { icon: 'grid', hidden: false, decorative: 'true' },
      { icon: 'type', hidden: false, decorative: 'true' },
      { icon: 'chart-bar', hidden: false, decorative: 'true' },
    ]);
    const data = view.roots.querySelector<HTMLButtonElement>('[data-material-group="data"]')!;
    expect(data.getAttribute('data-tip')).toBe('Data（4 个物料）');
    expect(data.ariaLabel).toBe('查看 Data 物料');
    expect(data.getAttribute('aria-description')).toBe(data.getAttribute('data-tip'));
    const tables = view.children.querySelector<HTMLButtonElement>(
      '[data-material-group="tables"]',
    )!;
    expect(tables.getAttribute('data-tip')).toBe('Data / Tables（1 个物料）');
    expect(tables.querySelector<HTMLElement>('.material-group-glyph')?.hidden).toBe(true);
  });

  it('prefers category icons, falls back for unknown groups, and updates glyphs in place', () => {
    const { layout } = createMaterialGroupLayout();
    const groups = [
      { id: 'named', label: '基础', materialTypes: ['base.image'] },
      { id: 'custom', label: '<b>Custom</b>', materialTypes: ['host.custom'] },
    ];
    const view = renderMaterialLibraryGroupNavigation(layout, parseGrouping({ groups }), 'named')!;
    const named = view.roots.querySelector<HTMLButtonElement>('[data-material-group="named"]')!;
    const glyph = named.querySelector<HTMLElement>('.material-group-glyph')!;
    const custom = view.roots.querySelector<HTMLElement>('[data-material-group="custom"]')!;
    expect(glyph.dataset.icon).toBe('shapes');
    expect(custom.querySelector<HTMLElement>('.material-group-glyph')?.dataset.icon).toBe('rect');
    expect(custom.querySelector<HTMLElement>('.material-group-glyph')?.innerHTML).not.toContain(
      '<b>',
    );
    expect(custom.getAttribute('data-tip')).toBe('<b>Custom</b>（1 个物料）');
    renderMaterialLibraryGroupNavigation(
      layout,
      parseGrouping({ groups: [{ ...groups[0], label: 'Images' }, groups[1]] }),
      'named',
    );
    expect(view.roots.querySelector('[data-material-group="named"]')).toBe(named);
    expect(named.querySelector('.material-group-glyph')).toBe(glyph);
    expect(glyph.dataset.icon).toBe('image');
    expect(named.getAttribute('data-tip')).toBe('Images（1 个物料）');
    expect(named.ariaPressed).toBe('true');
  });

  it('selects a parent aggregate and keeps leaf siblings reachable without going back', () => {
    const { layout } = createMaterialGroupLayout();
    const grouping = materialGrouping();
    const parent = renderMaterialLibraryGroupNavigation(layout, grouping, 'data')!;
    expect(
      parent.roots.querySelector<HTMLElement>('[data-material-group="data"]')?.ariaPressed,
    ).toBe('true');
    expect(
      [...parent.children.querySelectorAll<HTMLElement>('[data-material-group]')].map(
        (button) => button.dataset.materialGroup,
      ),
    ).toEqual(['charts', 'tables']);
    expect(
      parent.children.querySelector<HTMLElement>('[data-material-group-current]')?.ariaPressed,
    ).toBe('true');
    expect(parent.children.querySelector('.material-group-count')?.textContent).toBe('4');

    const leaf = renderMaterialLibraryGroupNavigation(layout, grouping, 'tables')!;
    expect(leaf.children).toBe(parent.children);
    expect(
      leaf.children.querySelector<HTMLElement>('[data-material-group="tables"]')?.ariaPressed,
    ).toBe('true');
    expect(
      leaf.children.querySelector<HTMLElement>('[data-material-group-current]')?.ariaPressed,
    ).toBe('false');
    expect(leaf.heading.textContent).toBe('');
    expect(leaf.back.hidden).toBe(true);
  });

  it('drills branches in place while retaining their own material types in the aggregate', () => {
    const { layout, trigger } = createMaterialGroupLayout();
    const view = renderMaterialLibraryGroupNavigation(layout, materialGrouping(), 'charts')!;
    expect(view.back.hidden).toBe(false);
    expect(view.back.dataset.materialGroupBreadcrumb).toBe('data');
    expect(view.heading.textContent).toBe('Data');
    expect(view.back.contains(view.heading)).toBe(true);
    expect(view.back.getAttribute('data-tip')).toBe('返回上一级分类：Data');
    expect(view.children.querySelector('.material-group-count')?.textContent).toBe('3');
    expect(
      [...view.children.querySelectorAll<HTMLElement>('[data-material-group]')].map(
        (button) => button.dataset.materialGroup,
      ),
    ).toEqual(['bars', 'lines']);
    expect(trigger.getAttribute('data-tip')).toBe('全部物料 / Data / Charts');
    expect(trigger.querySelector('[data-material-group-toggle-label]')?.textContent).toBe('Charts');
  });

  it('resets only the child scroll on a new branch and preserves scrolling between leaf siblings', () => {
    const { layout } = createMaterialGroupLayout();
    const grouping = materialGrouping();
    const view = renderMaterialLibraryGroupNavigation(layout, grouping, 'data')!;
    view.roots.scrollTop = 20;
    view.children.scrollTop = 80;
    renderMaterialLibraryGroupNavigation(layout, grouping, 'charts');
    expect(view.roots.scrollTop).toBe(20);
    expect(view.children.scrollTop).toBe(0);
    view.children.scrollTop = 40;
    renderMaterialLibraryGroupNavigation(layout, grouping, 'bars');
    expect(view.children.scrollTop).toBe(40);
    renderMaterialLibraryGroupNavigation(layout, grouping, 'lines');
    expect(view.children.scrollTop).toBe(40);
  });

  it('preserves button identity and column scrolling across selection and host reorder updates', () => {
    const { layout } = createMaterialGroupLayout();
    const grouping = materialGrouping();
    const before = renderMaterialLibraryGroupNavigation(layout, grouping, 'data')!;
    const root = before.roots.querySelector('[data-material-group="data"]');
    const leaf = before.children.querySelector('[data-material-group="tables"]');
    before.roots.scrollTop = 12;
    before.children.scrollTop = 24;
    const selected = renderMaterialLibraryGroupNavigation(layout, grouping, 'tables')!;
    expect(selected.roots.querySelector('[data-material-group="data"]')).toBe(root);
    expect(selected.children.querySelector('[data-material-group="tables"]')).toBe(leaf);
    expect(selected.roots.scrollTop).toBe(12);
    expect(selected.children.scrollTop).toBe(24);
    const reordered = parseGrouping({ groups: [...grouping.groups].reverse() });
    const updated = renderMaterialLibraryGroupNavigation(layout, reordered, 'tables')!;
    expect(updated.roots.children[1]).toBe(root);
    expect(updated.children.querySelector('[data-material-group="tables"]')).toBe(leaf);
  });

  it('keeps reserved UI keys distinct from host ids named all and current', () => {
    const { layout } = createMaterialGroupLayout();
    const grouping = parseGrouping({
      groups: [
        {
          id: 'all',
          label: 'All',
          children: [{ id: 'current', label: 'Current', materialTypes: ['base.text'] }],
        },
      ],
    });
    const first = renderMaterialLibraryGroupNavigation(layout, grouping, 'all')!;
    const second = renderMaterialLibraryGroupNavigation(layout, grouping, 'current')!;
    expect(first.roots.children.length).toBe(2);
    expect(second.children.children.length).toBe(2);
    expect(
      second.children.querySelector<HTMLElement>('[data-material-group="current"]')?.ariaPressed,
    ).toBe('true');
  });

  it('preserves focus when host updates reorder or remove groups', () => {
    const { layout, document } = createMaterialGroupLayout();
    const grouping = materialGrouping();
    const view = renderMaterialLibraryGroupNavigation(layout, grouping, 'data')!;
    const data = view.roots.querySelector<HTMLButtonElement>('[data-material-group="data"]')!;
    data.focus();
    renderMaterialLibraryGroupNavigation(
      layout,
      parseGrouping({ groups: [...grouping.groups].reverse() }),
      'data',
    );
    expect(document.activeElement).toBe(data);
    renderMaterialLibraryGroupNavigation(
      layout,
      parseGrouping({ groups: [grouping.groups[0]] }),
      undefined,
    );
    expect(document.activeElement).toBe(view.roots.querySelector('[data-material-group-all]'));
  });

  it('renders all 128 supported groups as independent, keyboard-reachable root entries', () => {
    const { layout } = createMaterialGroupLayout();
    const groups = Array.from({ length: 128 }, (_, index) => ({
      id: `group${index}`,
      label: `Group ${index}`,
      materialTypes: [`base.item${index}`],
    }));
    const view = renderMaterialLibraryGroupNavigation(
      layout,
      parseGrouping({ groups }),
      'group127',
    )!;
    expect(view.roots.querySelectorAll('[data-material-group]')).toHaveLength(128);
    expect(
      view.roots.querySelector('[data-material-group-all] .material-group-count')?.textContent,
    ).toBe('128');
    expect(
      view.roots.querySelector<HTMLButtonElement>('[data-material-group="group127"]')?.tabIndex,
    ).toBe(0);
  });

  it('renders the deepest supported level, full long labels and three-digit totals safely', () => {
    const { layout } = createMaterialGroupLayout();
    const label = '<b>' + 'Long name '.repeat(9) + '</b>';
    const validLabel = label.slice(0, 96);
    let group: BaseScreenMaterialLibraryGroup = {
      id: 'level7',
      label: validLabel,
      materialTypes: Array.from({ length: 512 }, (_, index) => 'base.item' + index),
    };
    for (let index = 6; index >= 0; index--)
      group = { id: 'level' + index, label: 'Level ' + index, children: [group] };
    const view = renderMaterialLibraryGroupNavigation(
      layout,
      parseGrouping({ groups: [group] }),
      'level7',
    )!;
    const leaf = view.children.querySelector<HTMLElement>('[data-material-group="level7"]')!;
    expect(leaf.querySelector('.material-group-label')?.textContent).toBe(validLabel);
    expect(leaf.querySelector('.material-group-count')?.textContent).toBe('512');
    expect(leaf.getAttribute('data-tip')).toContain(validLabel);
    expect(view.back.dataset.materialGroupBreadcrumb).toBe('level5');
    expect(view.roots.querySelector('.material-group-count')?.textContent).toBe('512');
  });

  it('restores the flat-category layout when grouping is removed and supports reconfiguration', () => {
    const { layout, navigation, inline, trigger, content } = createMaterialGroupLayout();
    const grouping = materialGrouping();
    renderMaterialLibraryGroupNavigation(layout, grouping, 'data');
    expect(renderMaterialLibraryGroupNavigation(layout, undefined, undefined)).toBeUndefined();
    expect(navigation.hidden).toBe(true);
    expect(inline.hidden).toBe(true);
    expect(trigger.hidden).toBe(true);
    expect(content.dataset.materialGrouped).toBe('false');
    expect(navigation.children).toEqual([]);
    expect(
      renderMaterialLibraryGroupNavigation(layout, grouping, undefined)?.roots.children.length,
    ).toBe(3);
  });
});
