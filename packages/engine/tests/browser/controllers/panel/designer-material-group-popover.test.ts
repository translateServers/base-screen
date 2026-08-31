import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerMaterialGroupPopoverController } from '../../../../src/browser/controllers/panel/designer-material-group-popover-controller.js';
import { renderMaterialLibraryGroupNavigation } from '../../../../src/browser/dom/material-library/designer-material-library-group-dom.js';
import {
  createMaterialGroupLayout,
  MaterialGroupTestElement,
  materialGrouping,
} from '../../dom/material-library/material-group-dom-fixture.js';

const controllers: DesignerMaterialGroupPopoverController[] = [];
const observers: TestObserver[] = [];
class TestObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(readonly notify: () => void) {
    observers.push(this);
  }
}

beforeEach(() => {
  vi.stubGlobal('HTMLElement', MaterialGroupTestElement);
  vi.stubGlobal('ResizeObserver', TestObserver);
  vi.stubGlobal('MutationObserver', TestObserver);
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  observers.splice(0);
  vi.unstubAllGlobals();
});

function setup(width = 263) {
  const surface = createMaterialGroupLayout();
  surface.content.rect.width = width;
  renderMaterialLibraryGroupNavigation(surface.layout, materialGrouping(), 'data');
  const controller = new DesignerMaterialGroupPopoverController();
  controllers.push(controller);
  controller.bind(surface.layout, surface.navigation as unknown as HTMLElement);
  return { ...surface, controller, sync: () => observers.forEach((observer) => observer.notify()) };
}

describe('compact material group popover', () => {
  it.each([263, 264, 265])('uses the content width breakpoint at %i pixels', (width) => {
    const view = setup(width);
    view.controller.toggle();
    expect(view.overlay.hidden).toBe(width >= 264);
    expect(view.navigation.parentElement).toBe(width < 264 ? view.mount : view.inline);
  });

  it('clamps the popup to the viewport and designer, flipping above a low trigger', () => {
    const view = setup();
    view.document.defaultView.innerWidth = 480;
    view.document.defaultView.innerHeight = 640;
    view.trigger.rect = { left: 400, top: 580, width: 60, height: 32 };
    view.controller.toggle();
    expect(view.overlay.hidden).toBe(false);
    expect(view.popover.style).toMatchObject({
      left: '168px',
      top: '200px',
      width: '288px',
      height: '360px',
    });

    view.element.rect = { left: 16, top: 16, width: 240, height: 280 };
    view.trigger.rect = { left: 60, top: 100, width: 130, height: 32 };
    view.sync();
    expect(view.popover.style).toMatchObject({
      left: '8px',
      top: '120px',
      width: '224px',
      height: '152px',
    });
    expect(view.overlay.hidden).toBe(false);
    view.element.rect.height = 120;
    view.trigger.rect.top = 60;
    view.sync();
    expect(view.overlay.hidden).toBe(true);
  });

  it('handles Escape in capture phase and returns focus without changing selection', () => {
    const view = setup();
    view.controller.toggle();
    const composing = {
      key: 'Escape',
      isComposing: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    view.element.emit('keydown', composing);
    expect(view.overlay.hidden).toBe(false);
    expect(composing.preventDefault).not.toHaveBeenCalled();
    const event = { ...composing, isComposing: false };
    view.element.emit('keydown', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(view.overlay.hidden).toBe(true);
    expect(view.document.activeElement).toBe(view.trigger);
    expect(view.navigation.querySelector('[data-material-group="data"]')?.ariaPressed).toBe('true');
  });

  it('dismisses outside pointer and focus events without stealing focus', () => {
    const view = setup();
    view.controller.toggle();
    view.document.emit('pointerdown', {
      composedPath: () => [view.navigation, view.popover, view.overlay],
    });
    expect(view.overlay.hidden).toBe(false);
    view.document.emit('focusin', { composedPath: () => [view.trigger, view.panel] });
    expect(view.overlay.hidden).toBe(false);
    const outside = view.node('input');
    view.element.append(outside);
    outside.focus();
    view.document.emit('pointerdown', { composedPath: () => [outside, view.element] });
    expect(view.overlay.hidden).toBe(true);
    expect(view.document.activeElement).toBe(outside);
    view.controller.toggle();
    outside.focus();
    view.document.emit('focusin', { composedPath: () => [outside, view.element] });
    expect(view.overlay.hidden).toBe(true);
    expect(view.document.activeElement).toBe(outside);
    view.controller.toggle();
    outside.focus();
    view.element.emit('focusin', { composedPath: () => [outside, view.element] });
    expect(view.overlay.hidden).toBe(true);
    expect(view.document.activeElement).toBe(outside);
  });

  it.each(['leftCollapsed', 'authoringMode', 'dataWorkbenchOpen', 'workbenchMode', 'panel'])(
    'closes when %s hides material browsing',
    (reason) => {
      const view = setup();
      view.controller.toggle();
      if (reason === 'panel') view.panel.hidden = true;
      else
        view.element.dataset[reason] =
          reason === 'authoringMode'
            ? 'blueprint'
            : reason === 'workbenchMode'
              ? 'fullscreen'
              : 'true';
      view.sync();
      expect(view.overlay.hidden).toBe(true);
      expect(view.navigation.parentElement).toBe(view.inline);
      view.controller.toggle();
      expect(view.overlay.hidden).toBe(true);
    },
  );

  it('keeps focus on the same node when an open popup becomes an inline directory', () => {
    const view = setup();
    const roots = view.navigation.querySelector('[data-material-group-list="roots"]')!;
    roots.scrollTop = 75;
    view.controller.toggle();
    const selected = view.document.activeElement;
    view.content.rect.width = 264;
    view.sync();
    expect(view.overlay.hidden).toBe(true);
    expect(view.navigation.parentElement).toBe(view.inline);
    expect(view.document.activeElement).toBe(selected);
    expect(roots.scrollTop).toBe(75);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('moves focus out of the hidden navigation or trigger when crossing the breakpoint', () => {
    const view = setup(265);
    const selected = view.navigation.querySelector('[data-material-group="data"]')!;
    selected.focus();
    view.content.rect.width = 263;
    view.sync();
    expect(view.document.activeElement).toBe(view.trigger);
    expect(view.overlay.hidden).toBe(true);
    view.content.rect.width = 265;
    view.sync();
    expect(view.document.activeElement).toBe(selected);
  });

  it('repositions on external scroll and removes observers and listeners on teardown', () => {
    const view = setup();
    view.controller.toggle();
    const left = view.popover.style.left;
    view.trigger.rect.left += 20;
    view.document.emit('scroll', { composedPath: () => [view.navigation] });
    expect(view.popover.style.left).toBe(left);
    view.document.emit('scroll', { composedPath: () => [view.element] });
    expect(view.popover.style.left).not.toBe(left);
    view.controller.dispose();
    expect(observers).toHaveLength(2);
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledOnce();
    for (const target of [view.document, view.element, view.document.defaultView]) {
      for (const listeners of target.listeners.values()) expect(listeners.size).toBe(0);
    }
    expect(view.overlay.hidden).toBe(true);
    view.document.defaultView.emit('resize', {});
    expect(view.overlay.hidden).toBe(true);
  });
});
