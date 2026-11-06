import { describe, expect, it, vi } from 'vitest';
import { enhanceDesignerSelect } from '../../../src/browser/dom/designer-select-dom.js';

interface NodeFileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}

interface NodeRuntime {
  getBuiltinModule(name: string): unknown;
}

function readSource(file: string): string {
  const runtime = (globalThis as typeof globalThis & { readonly process?: NodeRuntime }).process;
  const fileSystem = runtime?.getBuiltinModule('node:fs') as NodeFileSystem | undefined;
  if (fileSystem === undefined) throw new Error('NODE_BUILTIN_MODULE_UNAVAILABLE');
  return fileSystem.readFileSync(new URL(file, import.meta.url), 'utf8');
}

const controlsCss = readSource('../../../src/browser/styles/controls/designer-controls-inputs.css');

/** 取出单条选择器的声明块，避免静态断言被同文件的其他规则误命中。 */
function cssBlock(selector: string): string {
  const start = controlsCss.indexOf(selector);
  if (start < 0) throw new Error(`SELECT_STYLE_RULE_MISSING:${selector}`);
  const open = controlsCss.indexOf('{', start);
  const close = controlsCss.indexOf('}', open);
  return controlsCss.slice(open + 1, close);
}

type Listener = (event: { readonly type: string; readonly target?: unknown }) => void;

interface FakeBubblingEvent {
  readonly type: string;
  readonly target: unknown;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  propagationStopped: boolean;
  defaultPrevented: boolean;
  stopPropagation(): void;
  preventDefault(): void;
}

class FakeWindow {
  readonly listeners = new Map<string, Listener[]>();
  #frameCallbacks = new Map<number, () => void>();
  #nextFrameId = 0;

  constructor(
    readonly innerWidth: number,
    readonly innerHeight: number,
  ) {}

  addEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? [];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  }

  dispatch(type: string, target: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ type, target });
  }

  requestAnimationFrame(callback: () => void): number {
    this.#nextFrameId += 1;
    this.#frameCallbacks.set(this.#nextFrameId, callback);
    return this.#nextFrameId;
  }

  cancelAnimationFrame(id: number): void {
    this.#frameCallbacks.delete(id);
  }

  /** 运行一次当前排队的帧回调；回调内重新排队，留给下一次 flush。 */
  flushFrames(): void {
    const callbacks = [...this.#frameCallbacks.values()];
    this.#frameCallbacks.clear();
    for (const callback of callbacks) callback();
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly rect = { left: 0, top: 0, width: 0, height: 0 };
  className = '';
  clientHeight = 0;
  disabled = false;
  focused = false;
  hidden = false;
  isConnected = true;
  offsetHeight = 0;
  offsetTop = 0;
  parentElement: FakeElement | null = null;
  scrollHeight = 0;
  scrollTop = 0;
  selected = false;
  tabIndex = 0;
  textContent = '';
  type = '';
  value = '';

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  get options(): FakeElement[] {
    return this.children.filter((child) => child.tagName === 'option');
  }

  get selectedIndex(): number {
    return this.options.findIndex((option) => option.selected);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) this.appendChild(child);
  }

  replaceChildren(): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
  }

  addEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? [];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  }

  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ type, target: this });
  }

  /** 模拟冒泡阶段：沿 parentElement 链派发，记录 stopPropagation/preventDefault。 */
  dispatchBubbling(
    type: string,
    modifiers: { readonly ctrlKey?: boolean; readonly metaKey?: boolean } = {},
  ): FakeBubblingEvent {
    const event: FakeBubblingEvent = {
      type,
      target: this,
      ctrlKey: modifiers.ctrlKey ?? false,
      metaKey: modifiers.metaKey ?? false,
      propagationStopped: false,
      defaultPrevented: false,
      stopPropagation: () => {
        event.propagationStopped = true;
      },
      preventDefault: () => {
        event.defaultPrevented = true;
      },
    };
    let node: FakeElement | null = this;
    while (node !== null && !event.propagationStopped) {
      for (const listener of [...(node.listeners.get(type) ?? [])]) listener(event);
      node = node.parentElement;
    }
    return event;
  }

  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  focus(): void {
    this.focused = true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getBoundingClientRect(): typeof this.rect & { right: number; bottom: number } {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
    };
  }

  getRootNode(): null {
    return null;
  }
}

class FakeDocument {
  readonly listeners = new Map<string, Listener[]>();
  activeElement: FakeElement | null = null;

  constructor(readonly defaultView: FakeWindow) {}

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  addEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? [];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  }
}

interface SelectFixture {
  readonly handle: ReturnType<typeof enhanceDesignerSelect>;
  readonly trigger: FakeElement;
  readonly menu: FakeElement;
  readonly optionButtons: FakeElement[];
}

function createSelect(viewport: FakeWindow, optionCount = 20, selectedIndex = 0): SelectFixture {
  const ownerDocument = new FakeDocument(viewport);
  const select = ownerDocument.createElement('select');
  select.className = 'designer-select';
  select.setAttribute('aria-label', 'event');
  for (let index = 0; index < optionCount; index += 1) {
    const option = ownerDocument.createElement('option');
    option.value = `option-${index}`;
    option.textContent = `选项 ${index}`;
    select.appendChild(option);
  }
  const selected = select.options[selectedIndex];
  if (selected !== undefined) {
    selected.selected = true;
    select.value = selected.value;
  }
  const handle = enhanceDesignerSelect(select as unknown as HTMLSelectElement);
  const trigger = handle.trigger as unknown as FakeElement;
  const element = handle.element as unknown as FakeElement;
  const menu = element.children.find((child) =>
    child.className.split(/\s+/).includes('designer-select-menu'),
  );
  if (menu === undefined) throw new Error('SELECT_MENU_MISSING');
  const optionButtons = menu.children.filter((child) => child.tagName === 'button');
  menu.scrollHeight = optionCount * 28 + 8;
  menu.offsetHeight = menu.scrollHeight;
  for (const [index, button] of optionButtons.entries()) {
    button.offsetTop = 4 + index * 28;
    button.offsetHeight = 28;
  }
  return { handle, trigger, menu, optionButtons };
}

describe('enhanceDesignerSelect placement', () => {
  it('floats the menu above in a bottom panel and clamps its scrolling height', () => {
    const viewport = new FakeWindow(1440, 900);
    const fixture = createSelect(viewport);
    const { trigger, menu, optionButtons } = fixture;
    trigger.rect.left = 370;
    trigger.rect.top = 685.390625;
    trigger.rect.width = 388.859375;
    trigger.rect.height = 30;
    menu.clientHeight = 320;
    trigger.dispatch('click');

    // 弹层必须脱离面板 overflow 裁切：fixed + 视口坐标，而不是相对字段的绝对定位。
    expect(menu.dataset.floating).toBe('true');
    expect(menu.dataset.side).toBe('top');
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.bottom).toBe('auto');
    expect(menu.style.width).toBe('388.859375px');
    expect(menu.style.left).toBe('370px');
    expect(menu.style.maxHeight).toBe('312px');
    expect(menu.style.top).toBe('369.390625px');
    expect(menu.dataset.scroll).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(optionButtons[0]?.focused).toBe(true);
  });

  it('uses the roomier side and clamps max-height to the space below', () => {
    const viewport = new FakeWindow(1440, 300);
    const fixture = createSelect(viewport);
    const { trigger, menu } = fixture;
    trigger.rect.left = 16;
    trigger.rect.top = 20;
    trigger.rect.width = 200;
    trigger.rect.height = 30;
    trigger.dispatch('click');

    expect(menu.dataset.side).toBe('bottom');
    // 238px 的可用空间只放得下 8 整行（8 × 28 + 4 = 228），
    // 对齐整行后底边不会露出第 9 行的行首。
    expect(menu.style.maxHeight).toBe('228px');
    expect(menu.style.top).toBe('54px');
  });

  it('clamps max-height to the space above and keeps the menu inside the viewport', () => {
    const viewport = new FakeWindow(1440, 300);
    const fixture = createSelect(viewport);
    const { trigger, menu } = fixture;
    trigger.rect.left = 50;
    trigger.rect.top = 200;
    trigger.rect.width = 180;
    trigger.rect.height = 30;
    trigger.dispatch('click');

    expect(menu.dataset.side).toBe('top');
    // 188px 可用高度对齐到 6 整行（6 × 28 + 4 = 172），翻转后与触发器保持 4px 间距。
    expect(menu.style.maxHeight).toBe('172px');
    expect(menu.style.top).toBe('24px');
  });

  it('reveals the selected option inside the scrollable menu', () => {
    const viewport = new FakeWindow(1440, 900);
    const fixture = createSelect(viewport, 20, 18);
    const { menu, optionButtons } = fixture;
    menu.clientHeight = 320;
    fixture.trigger.rect.top = 600;
    fixture.trigger.rect.width = 240;
    fixture.trigger.dispatch('click');

    // 选中项偏下时必须把它滚进视野，否则打开看到的是列表顶部。
    expect(optionButtons[18]?.focused).toBe(true);
    expect(menu.scrollTop).toBe(18 * 28 + 4 - (320 - 28) / 2);
  });

  it('keeps the menu anchored to the trigger while the panel moves', () => {
    const viewport = new FakeWindow(1440, 900);
    const fixture = createSelect(viewport);
    fixture.trigger.rect.left = 370;
    fixture.trigger.rect.top = 685.390625;
    fixture.trigger.rect.width = 388.859375;
    fixture.trigger.rect.height = 30;
    fixture.trigger.dispatch('click');

    expect(fixture.menu.style.left).toBe('370px');
    expect(fixture.menu.style.top).toBe('369.390625px');

    // 面板滚动/展开把触发器带到新位置：下一帧重新贴合，而不是停在旧坐标。
    fixture.trigger.rect.left = 320;
    fixture.trigger.rect.top = 600;
    fixture.trigger.rect.width = 300;
    viewport.flushFrames();

    expect(fixture.menu.hidden).toBe(false);
    expect(fixture.menu.style.left).toBe('320px');
    expect(fixture.menu.style.width).toBe('300px');
    expect(fixture.menu.style.top).toBe('284px');
  });

  it('stops following once the menu closes', () => {
    const viewport = new FakeWindow(1440, 900);
    const fixture = createSelect(viewport);
    fixture.trigger.rect.left = 370;
    fixture.trigger.rect.top = 685.390625;
    fixture.trigger.rect.width = 388.859375;
    fixture.trigger.rect.height = 30;
    fixture.trigger.dispatch('click');
    expect(fixture.menu.hidden).toBe(false);

    fixture.trigger.dispatch('click');
    expect(fixture.menu.hidden).toBe(true);
    expect(fixture.trigger.getAttribute('aria-expanded')).toBe('false');

    fixture.trigger.rect.top = 100;
    viewport.flushFrames();
    expect(fixture.menu.style.top).toBe('369.390625px');
  });

  it('aligns the left edge with the trigger even near the viewport edge', () => {
    const viewport = new FakeWindow(1440, 900);
    const fixture = createSelect(viewport);
    fixture.trigger.rect.left = 1300;
    fixture.trigger.rect.top = 400;
    fixture.trigger.rect.width = 300;
    fixture.trigger.dispatch('click');

    // 宽度等于触发器时，左对齐即右对齐；横向夹紧会把弹层从触发器上移开。
    expect(fixture.menu.style.left).toBe('1300px');
    expect(fixture.menu.style.width).toBe('300px');
  });

  it('keeps menu wheel scrolling away from the canvas pan/zoom handler', () => {
    const viewport = new FakeWindow(1440, 900);
    const fixture = createSelect(viewport);
    const element = fixture.handle.element as unknown as FakeElement;
    const canvas = element.ownerDocument.createElement('div');
    const canvasWheel = vi.fn();
    canvas.addEventListener('wheel', canvasWheel);
    canvas.appendChild(element);

    const event = fixture.menu.dispatchBubbling('wheel');
    const ctrlEvent = fixture.menu.dispatchBubbling('wheel', { ctrlKey: true });
    // 弹层截断冒泡：画布 handler 收不到；普通滚轮不 preventDefault，保留弹层自身滚动。
    expect(event.propagationStopped).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    // ctrl+wheel 等价浏览器缩放，弹层上要阻断，避免改缩放整个页面。
    expect(ctrlEvent.propagationStopped).toBe(true);
    expect(ctrlEvent.defaultPrevented).toBe(true);
    expect(canvasWheel).not.toHaveBeenCalled();
    expect(fixture.menu.dataset.designerOverlay).toBe('select-menu');

    // 弹层之外的画布区域仍正常收到 wheel（缩放/平移链未被改动）。
    canvas.dispatchBubbling('wheel');
    expect(canvasWheel).toHaveBeenCalledTimes(1);
  });

  it('escapes ancestor clipping through the shared floating rule', () => {
    const block = cssBlock('.designer-select-menu[data-floating="true"]');
    expect(block).toContain('position: fixed');
    expect(block).toContain('bottom: auto');
    expect(block).toContain('overflow-y: auto');
    expect(block).toContain('overscroll-behavior: contain');
  });
});
