import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type DesignerSurfaceBindings,
  DesignerSurfaceRouter,
  getInspectorDraftTarget,
  isInspectorDraftTarget,
  isTextAreaDraft,
} from '../../../src/browser/dom/designer-surface-router.js';

class FakeElement {}

beforeAll(() => {
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'Element');
});

class FakeSurfaceRoot {
  readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, target: unknown, extra: Record<string, unknown> = {}): void {
    const event = { target, ...extra } as Event;
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
  }
}

function bindings(overrides: Partial<DesignerSurfaceBindings> = {}): DesignerSurfaceBindings {
  const handlers: DesignerSurfaceBindings = {
    click: [vi.fn(() => false)],
    contextMenu: vi.fn(() => false),
    change: [vi.fn(() => false)],
    input: [vi.fn(() => false)],
    dragStart: [vi.fn(() => false)],
    dragOver: vi.fn(() => false),
    drop: vi.fn(() => false),
    dragEnd: vi.fn(() => false),
    pointerDown: vi.fn(() => false),
    pointerDownCapture: vi.fn(() => false),
    pointerMove: vi.fn(() => false),
    pointerUp: vi.fn(() => false),
    pointerCancel: vi.fn(() => false),
    mouseOver: vi.fn(() => false),
    mouseOut: vi.fn(() => false),
    doubleClick: vi.fn(() => false),
    focusOut: vi.fn(() => false),
    copy: vi.fn(() => false),
    cut: vi.fn(() => false),
    paste: vi.fn(() => false),
    selectStart: vi.fn(() => false),
    gesture: vi.fn(() => false),
    keyDownCapture: vi.fn(() => false),
    keyUpCapture: vi.fn(() => false),
    keyDown: [vi.fn(() => false)],
    keyUp: vi.fn(() => false),
  };
  return { ...handlers, ...overrides };
}

describe('DesignerSurfaceRouter', () => {
  it('routes click chains in order and stops at the first handled handler', () => {
    const root = new FakeSurfaceRoot();
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    const third = vi.fn(() => false);
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ click: [first, second, third] }),
    );

    root.dispatch('click', new FakeElement());

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).not.toHaveBeenCalled();
  });

  it('skips click chains for non-Element targets', () => {
    const root = new FakeSurfaceRoot();
    const handler = vi.fn(() => false);
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ click: [handler] }),
    );

    root.dispatch('click', {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('leaves events from host left panel slots entirely to the host', () => {
    const root = new FakeSurfaceRoot();
    const click = vi.fn(() => false);
    const pointerDown = vi.fn(() => false);
    const keyDownCapture = vi.fn(() => false);
    const target = new FakeElement();
    const composedPath = () => [target, { dataset: { hostLeftPanelSlot: 'assets' } }];
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ click: [click], pointerDown, keyDownCapture }),
    );

    root.dispatch('click', target, { composedPath });
    root.dispatch('pointerdown', target, { composedPath });
    root.dispatch('keydown', target, { composedPath });

    expect(click).not.toHaveBeenCalled();
    expect(pointerDown).not.toHaveBeenCalled();
    expect(keyDownCapture).not.toHaveBeenCalled();
  });

  it('routes change, input and keydown chains until handled', () => {
    const root = new FakeSurfaceRoot();
    const change = [vi.fn(() => false), vi.fn(() => true), vi.fn(() => false)];
    const keyDown = [vi.fn(() => false), vi.fn(() => false)];
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ change, keyDown }),
    );

    root.dispatch('change', {});
    root.dispatch('keydown', {});

    expect(change[0]).toHaveBeenCalledTimes(1);
    expect(change[1]).toHaveBeenCalledTimes(1);
    expect(change[2]).not.toHaveBeenCalled();
    for (const handler of keyDown) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it('passes target and event to single-slot handlers', () => {
    const root = new FakeSurfaceRoot();
    const contextMenu = vi.fn(() => false);
    const pointerDown = vi.fn(() => false);
    const keyUp = vi.fn(() => false);
    const preventDefault = vi.fn();
    const target = new FakeElement();
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ contextMenu, pointerDown, keyUp }),
    );

    root.dispatch('contextmenu', target, { preventDefault });
    root.dispatch('pointerdown', target);
    root.dispatch('keyup', target);

    expect(contextMenu).toHaveBeenCalledWith(target, expect.objectContaining({ preventDefault }));
    expect(pointerDown).toHaveBeenCalledWith(target, expect.anything());
    expect(keyUp).toHaveBeenCalledWith(target, expect.anything());
  });

  it('skips context menu for non-Element targets', () => {
    const root = new FakeSurfaceRoot();
    const contextMenu = vi.fn(() => false);
    new DesignerSurfaceRouter().connect(root as unknown as ShadowRoot, bindings({ contextMenu }));

    root.dispatch('contextmenu', {});

    expect(contextMenu).not.toHaveBeenCalled();
  });

  it('routes capture-phase keyboard handlers for Element targets', () => {
    const root = new FakeSurfaceRoot();
    const keyDownCapture = vi.fn(() => false);
    const keyUpCapture = vi.fn(() => false);
    const target = new FakeElement();
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ keyDownCapture, keyUpCapture }),
    );

    root.dispatch('keydown', target);
    root.dispatch('keyup', target);
    root.dispatch('keydown', {});

    expect(keyDownCapture).toHaveBeenCalledWith(target, expect.anything());
    expect(keyUpCapture).toHaveBeenCalledWith(target, expect.anything());
  });

  it('routes selectstart and gesture handlers for Element targets', () => {
    const root = new FakeSurfaceRoot();
    const selectStart = vi.fn(() => false);
    const gesture = vi.fn(() => false);
    const target = new FakeElement();
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ selectStart, gesture }),
    );

    root.dispatch('selectstart', target);
    root.dispatch('gesturestart', target);
    root.dispatch('gesturechange', target);

    expect(selectStart).toHaveBeenCalledWith(target, expect.anything());
    expect(gesture).toHaveBeenCalledTimes(2);
  });

  it('routes focusout to the single-slot handler', () => {
    const root = new FakeSurfaceRoot();
    const focusOut = vi.fn(() => false);
    const target = new FakeElement();
    new DesignerSurfaceRouter().connect(root as unknown as ShadowRoot, bindings({ focusOut }));

    root.dispatch('focusout', target);

    expect(focusOut).toHaveBeenCalledWith(target, expect.anything());
  });

  it('routes clipboard events for Element targets', () => {
    const root = new FakeSurfaceRoot();
    const copy = vi.fn(() => false);
    const cut = vi.fn(() => false);
    const paste = vi.fn(() => false);
    const target = new FakeElement();
    new DesignerSurfaceRouter().connect(
      root as unknown as ShadowRoot,
      bindings({ copy, cut, paste }),
    );

    root.dispatch('copy', target);
    root.dispatch('cut', target);
    root.dispatch('paste', target);

    expect(copy).toHaveBeenCalledWith(target, expect.anything());
    expect(cut).toHaveBeenCalledWith(target, expect.anything());
    expect(paste).toHaveBeenCalledWith(target, expect.anything());
  });

  it('attaches listeners only once across repeated connects', () => {
    const root = new FakeSurfaceRoot();
    const handler = vi.fn(() => false);
    const router = new DesignerSurfaceRouter();
    router.connect(root as unknown as ShadowRoot, bindings({ click: [handler] }));
    router.connect(root as unknown as ShadowRoot, bindings({ click: [handler] }));

    root.dispatch('click', new FakeElement());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('disconnect removes every mounted listener and reconnect restores dispatch', () => {
    const root = new FakeSurfaceRoot();
    const handler = vi.fn(() => false);
    const router = new DesignerSurfaceRouter();
    router.connect(root as unknown as ShadowRoot, bindings({ pointerDown: handler }));
    const mounted = root.listenerCount();
    expect(mounted).toBeGreaterThan(0);

    router.disconnect();
    expect(root.listenerCount()).toBe(0);

    // 断开后事件不再分发；重连后恢复。
    root.dispatch('pointerdown', new FakeElement());
    expect(handler).not.toHaveBeenCalled();

    router.connect(root as unknown as ShadowRoot, bindings({ pointerDown: handler }));
    expect(root.listenerCount()).toBe(mounted);
    root.dispatch('pointerdown', new FakeElement());
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('designer surface keyboard helpers', () => {
  it('detects inspector draft targets from the composed path', () => {
    const draft = { dataset: { property: 'x' } } as unknown as EventTarget;
    const event = { composedPath: () => [draft] } as KeyboardEvent;
    expect(getInspectorDraftTarget(event)).toBe(draft);
    expect(isInspectorDraftTarget({ dataset: { prop: 'y' } } as unknown as EventTarget)).toBe(true);
    expect(
      isInspectorDraftTarget({ dataset: { style: 'opacity' } } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isInspectorDraftTarget({ dataset: { canvasSetting: 'opacity' } } as unknown as EventTarget),
    ).toBe(true);
    expect(isInspectorDraftTarget({ dataset: {} } as unknown as EventTarget)).toBe(false);
    expect(isInspectorDraftTarget(null)).toBe(false);
  });

  it('treats text areas as non-committable drafts', () => {
    expect(isTextAreaDraft({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextAreaDraft({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(false);
  });
});
