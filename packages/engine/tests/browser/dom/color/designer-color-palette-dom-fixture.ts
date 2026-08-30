import type { ColorPaletteState } from '../../../../src/browser/dom/color/designer-color-palette-dom.js';

export class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  checked = false;
  disabled = false;
  value = '';
  type = '';
  name = '';
  min = '';
  max = '';
  step = '';
  title = '';
  className = '';
  textContent = '';
  focused = false;
  readonly capturedPointers = new Set<number>();
  dispatched: string[] = [];
  readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  readonly attributes = new Map<string, string>();

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length, ...children);
    for (const child of children) child.parentElement = this;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type);
    if (listeners === undefined) return;
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  dispatchEvent(event: Event): boolean {
    this.dispatched.push(event.type);
    if (event.target === null) {
      Object.defineProperty(event, 'target', { configurable: true, value: this });
    }
    for (const listener of this.listeners.get(event.type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
    if (event.bubbles && this.parentElement !== null) this.parentElement.dispatchEvent(event);
    return true;
  }

  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this;
    while (node !== null) {
      if (matchesSelector(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  contains(target: FakeElement): boolean {
    let node: FakeElement | null = target;
    while (node !== null) {
      if (node === this) return true;
      node = node.parentElement;
    }
    return false;
  }

  focus(): void {
    this.focused = true;
  }

  getBoundingClientRect(): DOMRect {
    return {
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const results: FakeElement[] = [];
    for (const part of selector.split(',')) {
      collectDescendants(this, part.trim(), results);
    }
    return results;
  }
}

export class FakeDocument {
  readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
      if (
        (event as Event & { readonly immediatePropagationStopped?: boolean })
          .immediatePropagationStopped === true
      ) {
        break;
      }
    }
    return !event.defaultPrevented;
  }
}

export function documentPointerEvent(
  type:
    | 'pointerdown'
    | 'pointermove'
    | 'pointerup'
    | 'pointercancel'
    | 'lostpointercapture'
    | 'click',
  target: FakeElement,
  pointerType: 'mouse' | 'touch',
  position: { readonly clientX: number; readonly clientY: number } = {
    clientX: 0,
    clientY: 0,
  },
): Event {
  const state = { defaultPrevented: false, immediatePropagationStopped: false };
  return {
    type,
    target,
    button: 0,
    isPrimary: true,
    clientX: position.clientX,
    clientY: position.clientY,
    pointerId: 7,
    pointerType,
    get defaultPrevented() {
      return state.defaultPrevented;
    },
    get immediatePropagationStopped() {
      return state.immediatePropagationStopped;
    },
    composedPath: () => [target],
    preventDefault() {
      state.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      state.immediatePropagationStopped = true;
    },
  } as unknown as Event;
}

export function documentKeyboardEvent(key: string, target: FakeElement): Event {
  const state = { defaultPrevented: false };
  return {
    type: 'keydown',
    key,
    target,
    get defaultPrevented() {
      return state.defaultPrevented;
    },
    preventDefault() {
      state.defaultPrevented = true;
    },
  } as unknown as Event;
}

function collectDescendants(root: FakeElement, selector: string, results: FakeElement[]): void {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) results.push(child);
    collectDescendants(child, selector, results);
  }
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  const attribute = selector.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\](:checked)?$/);
  if (attribute !== null) {
    const key = attribute[1]!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (attribute[2] === undefined) {
      if (element.dataset[key] === undefined) return false;
    } else if (element.dataset[key] !== attribute[2]) {
      return false;
    }
    return attribute[3] !== ':checked' || element.checked;
  }
  if (selector.startsWith('.')) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }
  return element.tagName === selector;
}

export function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

export function byDataset(element: FakeElement, key: string): FakeElement | undefined {
  return descendants(element).find((candidate) => candidate.dataset[key] !== undefined);
}

export function byAction(element: FakeElement, action: string): FakeElement | undefined {
  return descendants(element).find((candidate) => candidate.dataset.colorPaletteAction === action);
}

export function byField(element: FakeElement, field: string): FakeElement | undefined {
  return descendants(element).find((candidate) => candidate.dataset.colorPaletteField === field);
}

export function modeRadio(element: FakeElement, value: string): FakeElement {
  return descendants(element).find(
    (candidate) => candidate.dataset.colorPaletteField === 'mode' && candidate.value === value,
  )!;
}

export function checkMode(element: FakeElement, value: string): void {
  for (const radio of descendants(element).filter(
    (candidate) => candidate.dataset.colorPaletteField === 'mode',
  )) {
    radio.checked = radio.value === value;
  }
}

export function stopRows(element: FakeElement): FakeElement[] {
  return descendants(element).filter(
    (candidate) => candidate.dataset.colorPaletteStopHandle !== undefined,
  );
}

export const SOLID_STATE: ColorPaletteState = {
  mode: 'solid',
  solid: '#112233',
  stops: [
    { color: '#000000', position: 0 },
    { color: '#ffffff', position: 100 },
  ],
  angle: 90,
  x: 50,
  y: 50,
};
