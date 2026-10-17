import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DesignerEventSystem } from '../../../src/browser/dom/designer-event-system.js';

class FakeElement {}
class FakeInputElement extends FakeElement {}
class FakeSelectElement extends FakeElement {}
class FakeTextAreaElement extends FakeElement {}
class FakeHtmlElement extends FakeElement {
  readonly isContentEditable = false;
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
  Object.defineProperty(globalThis, 'HTMLInputElement', {
    configurable: true,
    value: FakeInputElement,
  });
  Object.defineProperty(globalThis, 'HTMLSelectElement', {
    configurable: true,
    value: FakeSelectElement,
  });
  Object.defineProperty(globalThis, 'HTMLTextAreaElement', {
    configurable: true,
    value: FakeTextAreaElement,
  });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeHtmlElement });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'Element');
  Reflect.deleteProperty(globalThis, 'HTMLInputElement');
  Reflect.deleteProperty(globalThis, 'HTMLSelectElement');
  Reflect.deleteProperty(globalThis, 'HTMLTextAreaElement');
  Reflect.deleteProperty(globalThis, 'HTMLElement');
});

function keyEvent(partial: Record<string, unknown>): KeyboardEvent {
  return {
    target: new FakeElement(),
    getModifierState: () => false,
    ...partial,
  } as unknown as KeyboardEvent;
}

function system(
  overrides: {
    readonly gestureActive?: boolean;
    readonly onWindowBlur?: () => void;
    readonly onWindowKeyDown?: (event: KeyboardEvent) => boolean;
    readonly onWindowKeyUp?: (event: KeyboardEvent) => boolean;
  } = {},
): DesignerEventSystem {
  return new DesignerEventSystem({
    isGestureActive: () => overrides.gestureActive === true,
    findOperation: (chord) => (chord === 'Ctrl+Z' ? { repeatable: false } : undefined),
    ...(overrides.onWindowBlur === undefined ? {} : { onWindowBlur: overrides.onWindowBlur }),
    ...(overrides.onWindowKeyDown === undefined
      ? {}
      : { onWindowKeyDown: overrides.onWindowKeyDown }),
    ...(overrides.onWindowKeyUp === undefined ? {} : { onWindowKeyUp: overrides.onWindowKeyUp }),
  });
}

class FakeWindow {
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type);
    set?.delete(listener);
    if (set?.size === 0) this.listeners.delete(type);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function dragEvent(
  partial: Record<string, unknown>,
): DragEvent & { readonly defaultPrevented?: boolean } {
  const event: Record<string, unknown> = {
    composedPath: () => [],
    preventDefault: () => {
      event.defaultPrevented = true;
    },
    type: 'dragover',
    ...partial,
  };
  return event as unknown as DragEvent & { readonly defaultPrevented?: boolean };
}

describe('DesignerEventSystem', () => {
  it('R1 swallows blocked chords in capture phase', () => {
    const event = keyEvent({ ctrlKey: true, key: 'w' });
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    Object.assign(event, { preventDefault, stopImmediatePropagation });

    expect(system().swallow(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('R1 leaves native text editing untouched on editable targets', () => {
    const event = keyEvent({ ctrlKey: true, key: 'z', target: new FakeInputElement() });
    expect(system().swallow(event)).toBe(false);
  });

  it('R3 swallows every key while a gesture is active', () => {
    const event = keyEvent({ key: 'a' });
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    Object.assign(event, { preventDefault, stopImmediatePropagation });

    expect(system({ gestureActive: true }).swallow(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('R1 lets native copy through only when the surface holds a text selection', () => {
    const withCopy = (hasTextSelection: boolean) =>
      new DesignerEventSystem({
        isGestureActive: () => false,
        findOperation: (chord) => (chord === 'Ctrl+C' ? { repeatable: false } : undefined),
        hasTextSelection: () => hasTextSelection,
      });
    const event = keyEvent({ ctrlKey: true, key: 'c' });

    // 无选区：Ctrl+C 命中"复制选中组件"命令。
    expect(withCopy(false).resolve(event)).toEqual({ kind: 'command', chord: 'Ctrl+C' });
    // 有选区：Ctrl+C 归浏览器原生文本复制，命令通道不接管、capture 也不吞。
    expect(withCopy(true).resolve(event)).toEqual({ kind: 'allow' });
    expect(withCopy(true).swallow(event)).toBe(false);
  });

  it('R2 resolves commands through the operation lookup', () => {
    expect(system().resolve(keyEvent({ ctrlKey: true, key: 'z' }))).toEqual({
      kind: 'command',
      chord: 'Ctrl+Z',
    });
    expect(system().resolve(keyEvent({ key: 'Escape' }))).toEqual({ kind: 'allow' });
  });

  it('R2 guards AltGr layouts through getModifierState', () => {
    const event = keyEvent({
      ctrlKey: true,
      altKey: true,
      key: '5',
      getModifierState: (modifier: string) => modifier === 'AltGraph',
    });
    expect(system().resolve(event)).toEqual({ kind: 'allow' });
  });

  it('R5 intercepts only own drags at the window and leaves host drags alone', () => {
    const systemInstance = system();
    const view = new FakeWindow();
    const root = new FakeElement();
    systemInstance.connectWindowGuards(view as unknown as Window, root as unknown as ShadowRoot);

    // 宿主自身的拖拽（无标记、不在本 shadow）：零干预。
    const hostDrag = dragEvent({ type: 'dragover' });
    view.dispatch('dragover', hostDrag);
    expect(hostDrag.defaultPrevented).toBeUndefined();

    // 本设计器发起的拖拽：dragover/drop 阻止默认（防拖出导航）。
    systemInstance.markDragStart();
    const ownDrag = dragEvent({ type: 'dragover' });
    view.dispatch('dragover', ownDrag);
    expect(ownDrag.defaultPrevented).toBe(true);

    // 拖拽结束（drop/dragend）后标记复位，后续宿主拖拽恢复零干预。
    const ownDrop = dragEvent({ type: 'drop' });
    view.dispatch('drop', ownDrop);
    expect(ownDrop.defaultPrevented).toBe(true);
    const laterDrag = dragEvent({ type: 'dragover' });
    view.dispatch('dragover', laterDrag);
    expect(laterDrag.defaultPrevented).toBeUndefined();
  });

  it('R5 prevents file drops on the designer surface from opening', () => {
    const systemInstance = system();
    const view = new FakeWindow();
    const root = new FakeElement();
    systemInstance.connectWindowGuards(view as unknown as Window, root as unknown as ShadowRoot);

    // 宿主拖拽落到本设计器表面（composedPath 含本 shadow）：阻止默认打开文件。
    const drop = dragEvent({ type: 'drop', composedPath: () => [root] });
    view.dispatch('drop', drop);
    expect(drop.defaultPrevented).toBe(true);
  });

  it('R5 resets transient state on window blur and unregisters every listener', () => {
    const onWindowBlur = vi.fn();
    const systemInstance = system({ onWindowBlur });
    const view = new FakeWindow();
    const root = new FakeElement();
    systemInstance.connectWindowGuards(view as unknown as Window, root as unknown as ShadowRoot);

    view.dispatch('blur', new Event('blur'));
    expect(onWindowBlur).toHaveBeenCalledOnce();

    systemInstance.disconnectWindowGuards();
    expect(view.listeners.size).toBe(0);
    view.dispatch('blur', new Event('blur'));
    expect(onWindowBlur).toHaveBeenCalledOnce();
  });

  it('R4 routes window keydown only for events outside the designer shadow', () => {
    const onWindowKeyDown = vi.fn(() => false);
    const onWindowKeyUp = vi.fn(() => false);
    const systemInstance = system({ onWindowKeyDown, onWindowKeyUp });
    const view = new FakeWindow();
    const root = new FakeElement();
    systemInstance.connectWindowGuards(view as unknown as Window, root as unknown as ShadowRoot);

    // 事件落点在本设计器 shadow 内（焦点在设计器）：跳过 window 旁路，既有链路处理。
    const inside = {
      key: ' ',
      type: 'keydown',
      composedPath: () => [root],
    } as unknown as KeyboardEvent;
    view.dispatch('keydown', inside);
    expect(onWindowKeyDown).not.toHaveBeenCalled();

    // 事件落点在宿主页面（焦点在 body，鼠标悬停视窗）：交给 hover 判定。
    const outside = {
      key: ' ',
      type: 'keydown',
      composedPath: () => [],
    } as unknown as KeyboardEvent;
    view.dispatch('keydown', outside);
    expect(onWindowKeyDown).toHaveBeenCalledOnce();

    const outsideUp = {
      key: ' ',
      type: 'keyup',
      composedPath: () => [],
    } as unknown as KeyboardEvent;
    view.dispatch('keyup', outsideUp);
    expect(onWindowKeyUp).toHaveBeenCalledOnce();
  });
});
