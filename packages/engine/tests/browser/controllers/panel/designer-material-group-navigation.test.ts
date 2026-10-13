import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerMaterialGroupNavigationController } from '../../../../src/browser/controllers/panel/designer-material-group-navigation-controller.js';
import {
  createMaterialGroupLayout,
  MaterialGroupTestElement,
  materialGrouping,
} from '../../dom/material-library/material-group-dom-fixture.js';

const controllers: DesignerMaterialGroupNavigationController[] = [];

beforeEach(() => {
  vi.stubGlobal('HTMLElement', MaterialGroupTestElement);
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.unstubAllGlobals();
});

function setup(width = 277) {
  const surface = createMaterialGroupLayout();
  surface.content.rect.width = width;
  const grouping = materialGrouping();
  const select = vi.fn((groupId: string | undefined) =>
    controller.refresh(surface.layout, grouping, groupId),
  );
  const controller = new DesignerMaterialGroupNavigationController(select);
  controllers.push(controller);
  controller.refresh(surface.layout, grouping, undefined);
  const button = (selector: string) => surface.element.querySelector(selector)!;
  const click = (selector: string) => {
    const target = button(selector);
    target.focus();
    return controller.onClick(target as unknown as Element);
  };
  const key = (selector: string, value: string, isComposing = false) => {
    const target = button(selector);
    const event = { target, key: value, isComposing, preventDefault: vi.fn() };
    const handled = controller.onKeyDown(event as unknown as KeyboardEvent);
    return { handled, event };
  };
  return { ...surface, grouping, controller, select, button, click, key };
}

describe('material group column navigation', () => {
  it('moves focus within a column without filtering until Enter or Space commits', () => {
    const view = setup();
    const all = '[data-material-group-all]';
    const foundation = '[data-material-group="foundation"]';
    const data = '[data-material-group="data"]';
    const roots = view.button('[data-material-group-list="roots"]');
    roots.scrollTop = 48;

    expect(view.key(all, 'ArrowDown').handled).toBe(true);
    expect(view.document.activeElement).toBe(view.button(foundation));
    expect(view.button(foundation).tabIndex).toBe(0);
    expect(view.button(all).tabIndex).toBe(-1);
    expect(view.select).not.toHaveBeenCalled();
    expect(view.button(all).ariaPressed).toBe('true');
    view.key(foundation, 'End');
    expect(view.document.activeElement).toBe(view.button(data));
    expect(view.button(data).scrolledIntoView).toBe(true);
    view.key(data, 'Home');
    expect(view.document.activeElement).toBe(view.button(all));
    view.key(all, 'ArrowUp');
    expect(view.document.activeElement).toBe(view.button(all));
    expect(roots.scrollTop).toBe(48);

    const enter = view.key(data, 'Enter');
    expect(enter.event.preventDefault).toHaveBeenCalledOnce();
    expect(view.select).toHaveBeenLastCalledWith('data', view.layout);
    const space = view.key('[data-material-group="tables"]', ' ');
    expect(space.event.preventDefault).toHaveBeenCalledOnce();
    expect(view.select).toHaveBeenLastCalledWith('tables', view.layout);
    expect(view.select).toHaveBeenCalledTimes(2);
  });

  it('keeps root identities and leaf siblings while drilling and returning in the second column', () => {
    const view = setup();
    const data = view.button('[data-material-group="data"]');
    view.click('[data-material-group="data"]');
    const tables = view.button('[data-material-group="tables"]');
    view.click('[data-material-group="tables"]');
    expect(view.button('[data-material-group="tables"]')).toBe(tables);
    expect(view.button('[data-material-group="charts"]')).toBeDefined();
    expect(view.button('[data-material-group="data"]')).toBe(data);
    expect(data.ariaPressed).toBe('true');

    view.click('[data-material-group="charts"]');
    expect(view.button('[data-material-group-current="charts"]')).toBe(view.document.activeElement);
    expect(view.button('[data-material-group-breadcrumb="data"]').hidden).toBe(false);
    view.click('[data-material-group="bars"]');
    expect(view.button('[data-material-group="lines"]')).toBeDefined();
    view.click('[data-material-group-action="back"]');
    expect(view.select).toHaveBeenLastCalledWith('data', view.layout);
    expect(view.document.activeElement).toBe(view.button('[data-material-group="charts"]'));
    expect(view.button('[data-material-group-action="back"]').hidden).toBe(true);
    view.click('[data-material-group-all]');
    expect(view.select).toHaveBeenLastCalledWith(undefined, view.layout);
  });

  it('leaves Tab and composition keys to the browser and ignores unrelated controls', () => {
    const view = setup();
    for (const key of ['Tab', 'Escape']) {
      const result = view.key('[data-material-group-all]', key);
      expect(result.handled).toBe(false);
      expect(result.event.preventDefault).not.toHaveBeenCalled();
    }
    expect(view.key('[data-material-group-all]', 'Enter', true).handled).toBe(false);
    expect(view.controller.onClick(view.node('button') as unknown as Element)).toBe(false);
    expect(view.select).not.toHaveBeenCalled();
  });

  it('uses Right to enter branches and Left to return a level or focus the selected root', () => {
    const view = setup();
    view.key('[data-material-group="data"]', 'ArrowRight');
    expect(view.select).toHaveBeenLastCalledWith('data', view.layout);
    expect(view.document.activeElement).toBe(view.button('[data-material-group-current="data"]'));
    view.key('[data-material-group="charts"]', 'ArrowRight');
    expect(view.document.activeElement).toBe(view.button('[data-material-group-current="charts"]'));
    view.key('[data-material-group-current="charts"]', 'ArrowLeft');
    expect(view.select).toHaveBeenLastCalledWith('data', view.layout);
    expect(view.document.activeElement).toBe(view.button('[data-material-group="charts"]'));
    const selections = view.select.mock.calls.length;
    view.key('[data-material-group="charts"]', 'ArrowLeft');
    expect(view.document.activeElement).toBe(view.button('[data-material-group="data"]'));
    expect(view.select).toHaveBeenCalledTimes(selections);
    view.key('[data-material-group="data"]', 'ArrowLeft');
    expect(view.select).toHaveBeenCalledTimes(selections);
  });

  it('does not commit leaves with Right or consume modified hierarchy shortcuts', () => {
    const view = setup(220);
    view.click('[data-material-group-toggle]');
    view.key('[data-material-group="data"]', 'ArrowRight');
    view.key('[data-material-group="charts"]', 'ArrowRight');
    const selections = view.select.mock.calls.length;
    view.key('[data-material-group="bars"]', 'ArrowRight');
    expect(view.select).toHaveBeenCalledTimes(selections);
    expect(view.overlay.hidden).toBe(false);
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
      const event = {
        target: view.button('[data-material-group-current="charts"]'),
        key: 'ArrowLeft',
        [modifier]: true,
        preventDefault: vi.fn(),
      };
      expect(view.controller.onKeyDown(event as unknown as KeyboardEvent)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(view.select).toHaveBeenCalledTimes(selections);
  });

  it('preserves the selected leaf when moving between the active root and its child column', () => {
    const view = setup();
    view.click('[data-material-group="data"]');
    view.click('[data-material-group="tables"]');
    const selections = view.select.mock.calls.length;
    view.key('[data-material-group="tables"]', 'ArrowLeft');
    expect(view.document.activeElement).toBe(view.button('[data-material-group="data"]'));
    view.key('[data-material-group="data"]', 'ArrowRight');
    expect(view.document.activeElement).toBe(view.button('[data-material-group="tables"]'));
    expect(view.button('[data-material-group="tables"]').ariaPressed).toBe('true');
    expect(view.select).toHaveBeenCalledTimes(selections);
  });

  it('keeps compact branches open and closes on a leaf, current-group aggregate or global all', () => {
    const view = setup(220);
    const navigation = view.navigation;
    view.click('[data-material-group-toggle]');
    expect(view.overlay.hidden).toBe(false);
    expect(view.mount.children).toEqual([navigation]);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('true');

    view.click('[data-material-group="data"]');
    expect(view.overlay.hidden).toBe(false);
    view.click('[data-material-group="charts"]');
    expect(view.overlay.hidden).toBe(false);
    view.click('[data-material-group="bars"]');
    expect(view.overlay.hidden).toBe(true);
    expect(view.document.activeElement).toBe(view.trigger);
    expect(view.inline.children).toEqual([navigation]);
    expect(view.trigger.getAttribute('data-tip')).toBe('全部物料 / Data / Charts / Bars');

    view.click('[data-material-group-toggle]');
    expect(view.document.activeElement).toBe(view.button('[data-material-group="bars"]'));
    view.click('[data-material-group-action="back"]');
    expect(view.overlay.hidden).toBe(false);
    view.click('[data-material-group-current="data"]');
    expect(view.overlay.hidden).toBe(true);
    expect(view.document.activeElement).toBe(view.trigger);
    view.click('[data-material-group-toggle]');
    view.click('[data-material-group-all]');
    expect(view.overlay.hidden).toBe(true);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(view.select).toHaveBeenLastCalledWith(undefined, view.layout);
  });

  it('closes when grouping is replaced or removed, and supports remount without duplicate handlers', () => {
    const view = setup(220);
    view.click('[data-material-group-toggle]');
    view.controller.refresh(view.layout, materialGrouping(), 'tables');
    expect(view.overlay.hidden).toBe(true);
    expect(view.button('[data-material-group="tables"]').ariaPressed).toBe('true');
    view.click('[data-material-group-toggle]');
    view.controller.refresh(view.layout, undefined, undefined);
    expect(view.overlay.hidden).toBe(true);
    expect(view.navigation.hidden).toBe(true);
    expect(view.trigger.hidden).toBe(true);
    expect(view.document.listeners.get('pointerdown')?.size).toBe(0);
    expect(view.controller.onClick(view.trigger as unknown as Element)).toBe(false);

    view.controller.refresh(view.layout, view.grouping, undefined);
    view.controller.refresh(view.layout, view.grouping, undefined);
    expect(view.document.listeners.get('pointerdown')?.size).toBe(1);
    view.click('[data-material-group-toggle]');
    view.controller.dispose();
    expect(view.overlay.hidden).toBe(true);
    expect(view.inline.children).toEqual([view.navigation]);
    expect(view.document.listeners.get('pointerdown')?.size).toBe(0);
  });
});
