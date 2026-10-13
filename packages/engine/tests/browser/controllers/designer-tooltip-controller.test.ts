import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerTooltipController } from '../../../src/browser/controllers/designer-tooltip-controller.js';

interface FakeRect {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
}

const DEFAULT_RECT: FakeRect = {
  bottom: 128,
  height: 28,
  left: 100,
  right: 128,
  top: 100,
  width: 28,
};

class FakeClassList {
  readonly names = new Set<string>();

  add(name: string): void {
    this.names.add(name);
  }

  remove(name: string): void {
    this.names.delete(name);
  }

  contains(name: string): boolean {
    return this.names.has(name);
  }
}

class FakeStyle {
  [key: string]: unknown;

  setProperty(name: string, value: string): void {
    this[name] = value;
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  focusVisible = false;
  id = '';
  isConnected = true;
  offsetHeight = 24;
  offsetWidth = 80;
  rect: FakeRect = DEFAULT_RECT;
  textContent = '';
  parent: FakeElement | undefined;

  constructor(readonly tagName: string) {}

  // 与真实 DOM 一样把 disabled 属性化：hasAttribute('disabled') 与命中扫描都依赖它。
  get disabled(): boolean {
    return this.attributes.has('disabled');
  }

  set disabled(value: boolean) {
    if (value) this.attributes.set('disabled', '');
    else this.attributes.delete('disabled');
  }

  append(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  matches(selector: string): boolean {
    return selector === ':focus-visible' && this.focusVisible;
  }

  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  closest(selector: string): FakeElement | null {
    if (selector === '[data-tip]' && this.attributes.has('data-tip')) return this;
    return this.parent?.closest(selector) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const all: FakeElement[] = [];
    for (const child of this.children) all.push(child, ...child.querySelectorAll(selector));
    if (selector !== '[data-tip][disabled]') return [];
    return all.filter((entry) => entry.attributes.has('data-tip') && entry.disabled);
  }

  getBoundingClientRect(): FakeRect {
    return this.rect;
  }
}

class FakeWindow {
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly document = { defaultView: this as unknown as Window };
  innerHeight = 900;
  innerWidth = 1440;

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({} as Event);
  }

  setTimeout(handler: () => void, timeout?: number): number {
    return globalThis.setTimeout(handler, timeout) as unknown as number;
  }

  clearTimeout(handle: number): void {
    globalThis.clearTimeout(handle);
  }
}

class FakeRoot {
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly ownerDocument: unknown;

  constructor(ownerWindow: FakeWindow) {
    this.ownerDocument = ownerWindow.document;
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as unknown as Event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createHarness(): {
  readonly controller: DesignerTooltipController;
  readonly layer: FakeElement;
  readonly root: FakeRoot;
  readonly win: FakeWindow;
  readonly trigger: FakeElement;
} {
  const win = new FakeWindow();
  const root = new FakeRoot(win);
  const layer = new FakeElement('div');
  layer.offsetWidth = 80;
  layer.offsetHeight = 24;
  const trigger = new FakeElement('button');
  trigger.setAttribute('data-tip', '复制组件');
  const controller = new DesignerTooltipController();
  controller.connect(root as unknown as ShadowRoot, layer as unknown as HTMLElement);
  return { controller, layer, root, win, trigger };
}

function hoverEvent(target: FakeElement, x = 110, y = 20): Record<string, unknown> {
  return { clientX: x, clientY: y, pointerType: 'mouse', target };
}

describe('DesignerTooltipController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Element', FakeElement);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('R2 reveals hover tips after the show delay and wires aria-describedby', () => {
    const { layer, root, trigger } = createHarness();

    root.emit('pointerover', hoverEvent(trigger));
    expect(layer.classList.contains('is-open')).toBe(false);

    vi.advanceTimersByTime(420);
    expect(layer.classList.contains('is-open')).toBe(true);
    expect(layer.textContent).toBe('复制组件');
    expect(trigger.getAttribute('aria-describedby')).toBe('designer-tooltip');
  });

  it('R2 shows immediately for keyboard focus and hides at once on focus loss', () => {
    const { layer, root, trigger } = createHarness();
    trigger.focusVisible = true;

    root.emit('focusin', { target: trigger });
    vi.advanceTimersByTime(0);
    expect(layer.classList.contains('is-open')).toBe(true);

    root.emit('focusout', { target: trigger });
    expect(layer.classList.contains('is-open')).toBe(false);
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
  });

  it('R2 suppresses re-showing after Escape until the pointer leaves', () => {
    const { layer, root, trigger } = createHarness();

    root.emit('pointerover', hoverEvent(trigger));
    vi.advanceTimersByTime(420);
    expect(layer.classList.contains('is-open')).toBe(true);

    root.emit('keydown', { key: 'Escape' });
    expect(layer.classList.contains('is-open')).toBe(false);

    root.emit('pointerover', hoverEvent(trigger));
    vi.advanceTimersByTime(420);
    expect(layer.classList.contains('is-open')).toBe(false);

    root.emit('pointerout', { relatedTarget: null, target: trigger });
    root.emit('pointerover', hoverEvent(trigger));
    vi.advanceTimersByTime(420);
    expect(layer.classList.contains('is-open')).toBe(true);
  });

  it('R2 switches tips with a shorter delay while browsing consecutively', () => {
    const { layer, root, trigger } = createHarness();
    const second = new FakeElement('button');
    second.setAttribute('data-tip', '删除组件');

    root.emit('pointerover', hoverEvent(trigger));
    vi.advanceTimersByTime(420);
    expect(layer.textContent).toBe('复制组件');

    root.emit('pointerout', { relatedTarget: second, target: trigger });
    root.emit('pointerover', hoverEvent(second));
    vi.advanceTimersByTime(90);
    expect(layer.textContent).toBe('删除组件');
  });

  it('R2 falls back to hit scanning for disabled controls that emit no pointer events', () => {
    const { layer, root } = createHarness();
    const container = new FakeElement('div');
    const disabled = new FakeElement('button');
    disabled.disabled = true;
    disabled.setAttribute('data-tip', '选中至少 3 个组件后可分布');
    disabled.rect = { bottom: 40, height: 28, left: 60, right: 88, top: 12, width: 28 };
    container.append(disabled);

    root.emit('pointerover', hoverEvent(container, 70, 20));
    vi.advanceTimersByTime(420);
    expect(layer.classList.contains('is-open')).toBe(true);
    expect(layer.textContent).toBe('选中至少 3 个组件后可分布');

    root.emit('pointermove', hoverEvent(container, 300, 200));
    vi.advanceTimersByTime(90);
    expect(layer.classList.contains('is-open')).toBe(false);
  });

  it('R2 places above by default, flips below near the top edge and clamps horizontally', () => {
    const { layer, root, trigger } = createHarness();

    root.emit('pointerover', hoverEvent(trigger));
    vi.advanceTimersByTime(420);
    expect(layer.dataset.side).toBe('top');
    expect(layer.style.left).toBe('74px');
    expect(layer.style.top).toBe('67px');

    const nearTop = new FakeElement('button');
    nearTop.setAttribute('data-tip', '顶部按钮');
    nearTop.rect = { bottom: 24, height: 24, left: 4, right: 28, top: 0, width: 24 };
    root.emit('pointerover', hoverEvent(nearTop, 10, 12));
    vi.advanceTimersByTime(90);
    expect(layer.dataset.side).toBe('bottom');
    expect(layer.style.left).toBe('8px');
    expect(layer.style.top).toBe('33px');
    expect(layer.style['--designer-tooltip-caret']).toBe('14px');
  });

  it('R2 hides on scroll, resize and pointerdown, and detaches every listener', () => {
    const { controller, layer, root, trigger, win } = createHarness();

    root.emit('pointerover', hoverEvent(trigger));
    vi.advanceTimersByTime(420);
    expect(layer.classList.contains('is-open')).toBe(true);

    win.emit('scroll');
    expect(layer.classList.contains('is-open')).toBe(false);

    root.emit('pointerover', hoverEvent(trigger));
    vi.advanceTimersByTime(420);
    root.emit('pointerdown', { target: trigger });
    expect(layer.classList.contains('is-open')).toBe(false);

    controller.disconnect();
    expect(root.listenerCount('pointerover')).toBe(0);
    expect(root.listenerCount('keydown')).toBe(0);
    expect(win.listeners.get('scroll')?.size ?? 0).toBe(0);
  });
});
