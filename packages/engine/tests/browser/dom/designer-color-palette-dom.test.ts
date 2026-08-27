import { afterEach, describe, expect, it } from 'vitest';
import {
  addColorPaletteStop,
  applyDesignerColorPaletteStopAction,
  type ColorPaletteState,
  clearColorPaletteDraftCache,
  colorPaletteDraftCacheSizes,
  createDesignerColorPalette,
  deriveColorPaletteStopsFromSolid,
  MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
  MAX_COLOR_PALETTE_STOPS,
  MIN_COLOR_PALETTE_STOPS,
  parseColorPaletteValue,
  readDesignerColorPaletteValue,
  removeColorPaletteStop,
  serializeColorPaletteValue,
  switchColorPaletteMode,
  updateColorPaletteStop,
} from '../../../src/browser/dom/designer-color-palette-dom.js';

class FakeElement {
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

class FakeDocument {
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

function documentPointerEvent(
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

function documentKeyboardEvent(key: string, target: FakeElement): Event {
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

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function byDataset(element: FakeElement, key: string): FakeElement | undefined {
  return descendants(element).find((candidate) => candidate.dataset[key] !== undefined);
}

function byAction(element: FakeElement, action: string): FakeElement | undefined {
  return descendants(element).find((candidate) => candidate.dataset.colorPaletteAction === action);
}

function byField(element: FakeElement, field: string): FakeElement | undefined {
  return descendants(element).find((candidate) => candidate.dataset.colorPaletteField === field);
}

function modeRadio(element: FakeElement, value: string): FakeElement {
  return descendants(element).find(
    (candidate) => candidate.dataset.colorPaletteField === 'mode' && candidate.value === value,
  )!;
}

function checkMode(element: FakeElement, value: string): void {
  for (const radio of descendants(element).filter(
    (candidate) => candidate.dataset.colorPaletteField === 'mode',
  )) {
    radio.checked = radio.value === value;
  }
}

function stopRows(element: FakeElement): FakeElement[] {
  return descendants(element).filter(
    (candidate) => candidate.dataset.colorPaletteStopHandle !== undefined,
  );
}

const SOLID_STATE: ColorPaletteState = {
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

afterEach(() => clearColorPaletteDraftCache());

describe('parseColorPaletteValue', () => {
  it('keeps a valid solid color', () => {
    const state = parseColorPaletteValue('#123456');
    expect(state.mode).toBe('solid');
    expect(state.solid).toBe('#123456');
  });

  it('parses linear gradients with multiple stops', () => {
    const state = parseColorPaletteValue(
      'linear-gradient(135deg, #112233 0%, #ff0000 50%, #ffffff 100%)',
    );
    expect(state.mode).toBe('linear-gradient');
    expect(state.angle).toBe(135);
    expect(state.stops).toEqual([
      { color: '#112233', position: 0 },
      { color: '#ff0000', position: 50 },
      { color: '#ffffff', position: 100 },
    ]);
  });

  it('parses radial gradients with a center', () => {
    const state = parseColorPaletteValue(
      'radial-gradient(circle at 25% 75%, #112233 0%, transparent 100%)',
    );
    expect(state.mode).toBe('radial-gradient');
    expect(state.x).toBe(25);
    expect(state.y).toBe(75);
    expect(state.stops[1]?.color).toBe('transparent');
  });

  it('falls back to solid for malformed or unsorted gradients', () => {
    for (const value of [
      'linear-gradient(135deg, #112233 0%, #ffffff)',
      'linear-gradient(135deg, #112233 60%, #ffffff 40%)',
      'linear-gradient(999deg, #112233 0%, #ffffff 100%)',
      'linear-gradient(135deg, #112233 0%, #ffffff 50.5%)',
      'radial-gradient(at 50% 50%, #112233 0%, #ffffff 100%)',
      'url(https://x/bg.png)',
    ]) {
      expect(parseColorPaletteValue(value).mode).toBe('solid');
    }
  });
});

describe('serializeColorPaletteValue', () => {
  it('round-trips solid and both gradient modes', () => {
    expect(serializeColorPaletteValue(SOLID_STATE)).toBe('#112233');
    const linear: ColorPaletteState = {
      ...SOLID_STATE,
      mode: 'linear-gradient',
      angle: 45,
      stops: [
        { color: '#000000', position: 0 },
        { color: '#ff0000', position: 50 },
        { color: '#ffffff', position: 100 },
      ],
    };
    const linearText = serializeColorPaletteValue(linear);
    expect(linearText).toBe('linear-gradient(45deg, #000000 0%, #ff0000 50%, #ffffff 100%)');
    expect(serializeColorPaletteValue(parseColorPaletteValue(linearText))).toBe(linearText);
    const radial: ColorPaletteState = {
      ...SOLID_STATE,
      mode: 'radial-gradient',
      x: 30,
      y: 70,
    };
    const radialText = serializeColorPaletteValue(radial);
    expect(radialText).toBe('radial-gradient(circle at 30% 70%, #000000 0%, #ffffff 100%)');
    expect(serializeColorPaletteValue(parseColorPaletteValue(radialText))).toBe(radialText);
  });
});

describe('gradient stop mutation helpers', () => {
  const gradient: ColorPaletteState = {
    ...SOLID_STATE,
    mode: 'linear-gradient',
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
  };

  it('adds a stop at the largest gap midpoint and respects the cap', () => {
    const added = addColorPaletteStop(gradient)!;
    expect(added.stops).toEqual([
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 50 },
      { color: '#ffffff', position: 100 },
    ]);
    let state = added;
    for (let index = 0; index < MAX_COLOR_PALETTE_STOPS - added.stops.length; index++) {
      const next = addColorPaletteStop(state);
      expect(next).toBeDefined();
      state = next!;
    }
    expect(state.stops).toHaveLength(MAX_COLOR_PALETTE_STOPS);
    expect(addColorPaletteStop(state)).toBeUndefined();
  });

  it('removes stops but never below the minimum', () => {
    const three: ColorPaletteState = {
      ...gradient,
      stops: [
        { color: '#000000', position: 0 },
        { color: '#ff0000', position: 50 },
        { color: '#ffffff', position: 100 },
      ],
    };
    const removed = removeColorPaletteStop(three, 1)!;
    expect(removed.stops).toEqual([
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ]);
    expect(removeColorPaletteStop(removed, 0)).toBeUndefined();
    expect(removeColorPaletteStop(three, 5)).toBeUndefined();
  });

  it('clamps stop positions into the free gap and rejects invalid edits', () => {
    expect(updateColorPaletteStop(gradient, 0, { position: 40 })?.stops[0]?.position).toBe(40);
    expect(updateColorPaletteStop(gradient, 0, { position: 80 })?.stops[0]?.position).toBe(80);
    expect(updateColorPaletteStop(gradient, 0, { position: -5 })).toBeUndefined();
    expect(updateColorPaletteStop(gradient, 0, { position: 150 })).toBeUndefined();
    expect(updateColorPaletteStop(gradient, 0, { color: 'not-a-color' })).toBeUndefined();
    expect(updateColorPaletteStop(gradient, 0, { position: 12.5 })).toBeUndefined();
  });
});

describe('createDesignerColorPalette', () => {
  it('renders three modes, a shared stop slider, and gradient parameters', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(45deg, #000000 0%, #ff0000 50%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    expect(element.dataset.colorPaletteMode).toBe('linear-gradient');
    const modes = descendants(element).filter(
      (candidate) => candidate.dataset.colorPaletteField === 'mode',
    );
    expect(modes.map((mode) => mode.value)).toEqual([
      'solid',
      'linear-gradient',
      'radial-gradient',
    ]);
    expect(modes.map((mode) => mode.disabled)).toEqual([false, false, false]);
    expect(modes[1]?.checked).toBe(true);
    expect(byField(element, 'solid')?.value).toBe('#000000');
    expect(byField(element, 'angle')?.value).toBe('45');
    expect(byField(element, 'x')?.value).toBe('50');
    expect(byField(element, 'y')?.value).toBe('50');
    expect(stopRows(element)).toHaveLength(3);
    const handles = stopRows(element);
    expect(
      descendants(element).filter((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-stop-slider'),
      ),
    ).toHaveLength(1);
    expect(
      handles.map((handle) => [
        handle.dataset.colorPaletteStopMin,
        handle.dataset.colorPaletteStopMax,
        handle.dataset.colorPaletteStopPosition,
      ]),
    ).toEqual([
      ['0', '49', '0'],
      ['1', '99', '50'],
      ['51', '100', '100'],
    ]);
    expect(
      descendants(element).filter(
        (candidate) => candidate.dataset.colorPaletteField === 'stop-position',
      ),
    ).toHaveLength(1);
    expect(byDataset(element, 'colorPaletteAction')?.disabled).toBe(false);
    // modes(3) + solid(color/hex/alpha) + 色标编辑器(color/hex/alpha/position) + params(3)。
    expect(palette.controls).toHaveLength(3 + 3 + 4 + 3);
    expect(
      descendants(element).some((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-tools'),
      ),
    ).toBe(true);
    expect(
      descendants(element).some((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-parameters'),
      ),
    ).toBe(true);
    expect(
      descendants(element).some(
        (candidate) =>
          candidate.tagName === 'span' &&
          candidate.className.split(/\s+/).includes('designer-color-palette-linear'),
      ),
    ).toBe(true);
    expect(
      descendants(element).some(
        (candidate) =>
          candidate.tagName === 'span' &&
          candidate.className.split(/\s+/).includes('designer-color-palette-radial'),
      ),
    ).toBe(true);
  });

  it('labels the angle, center, and stop fields so gradient parameters are discoverable', () => {
    const ownerDocument = new FakeDocument();
    const linear = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(45deg, #000000 0%, #ffffff 100%)',
    );
    const linearElement = linear.element as unknown as FakeElement;
    const labels = descendants(linearElement)
      .filter((candidate) => candidate.tagName === 'span')
      .map((candidate) => candidate.textContent);
    // 紧凑工具带保留位置/角度标签，径向轴用 X/Y 缩写并由 aria-label 补全语义。
    expect(labels).toContain('角度');
    expect(labels).toContain('X');
    expect(labels).toContain('Y');
    expect(labels).toContain('位置');
    expect(labels).toContain('透明度');
    // 颜色控件不再渲染可见「颜色」文字标签（hex 自明），改由 aria-label 提供语义。
    expect(labels).not.toContain('颜色');
    for (const field of ['solid', 'stop-color']) {
      const input = byField(linearElement, field)!;
      expect(input.attributes.get('aria-label')).toBe('颜色');
    }
    for (const field of ['solid-value', 'stop-value']) {
      const input = byField(linearElement, field)!;
      expect(input.type).toBe('text');
      expect(input.attributes.get('aria-label')).toBe('十六进制颜色');
    }
    expect(byField(linearElement, 'solid-alpha')?.attributes.get('aria-label')).toBe('透明度');
    expect(byField(linearElement, 'stop-alpha')?.attributes.get('aria-label')).toBe('透明度');
    expect(byField(linearElement, 'stop-position')?.attributes.get('aria-label')).toBe('位置');
    expect(byField(linearElement, 'angle')?.attributes.get('aria-label')).toBe('角度');
    expect(byField(linearElement, 'x')?.attributes.get('aria-label')).toBe('中心 X');
    expect(byField(linearElement, 'y')?.attributes.get('aria-label')).toBe('中心 Y');

    const radial = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'radial-gradient(circle at 25% 75%, #000000 0%, #ffffff 100%)',
    );
    const radialLabels = descendants(radial.element as unknown as FakeElement)
      .filter((candidate) => candidate.tagName === 'span')
      .map((candidate) => candidate.textContent);
    expect(radialLabels).toContain('角度');
    expect(radialLabels).toContain('X');
    expect(radialLabels).toContain('Y');
  });

  it('renders gradient controls even when the current value is a solid color', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#ff0000');
    const element = palette.element as unknown as FakeElement;
    expect(byField(element, 'solid')?.value).toBe('#ff0000');
    expect(byField(element, 'angle')).toBeDefined();
    expect(stopRows(element)).toHaveLength(2);
    expect(stopRows(element)).toHaveLength(2);
    expect(palette.controls).toHaveLength(3 + 3 + 4 + 3);
  });

  it('keeps the remove button disabled with the minimum stop count', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const remove = descendants(palette.element as unknown as FakeElement).filter(
      (candidate) => candidate.dataset.colorPaletteAction === 'remove-stop',
    );
    expect(remove.map((button) => button.disabled)).toEqual([true]);
  });
});

describe('deriveColorPaletteStopsFromSolid', () => {
  it('derives a same-family tint from a regular solid color', () => {
    expect(deriveColorPaletteStopsFromSolid('#ff0000')).toEqual([
      { color: '#ff0000', position: 0 },
      { color: '#ff7373', position: 100 },
    ]);
  });

  it('derives visible stops for black and falls back to darkening for white', () => {
    expect(deriveColorPaletteStopsFromSolid('#000000')).toEqual([
      { color: '#000000', position: 0 },
      { color: '#737373', position: 100 },
    ]);
    expect(deriveColorPaletteStopsFromSolid('#ffffff')).toEqual([
      { color: '#ffffff', position: 0 },
      { color: '#a6a6a6', position: 100 },
    ]);
  });

  it('normalizes short hex and preserves alpha channels', () => {
    expect(deriveColorPaletteStopsFromSolid('#f00')).toEqual([
      { color: '#ff0000', position: 0 },
      { color: '#ff7373', position: 100 },
    ]);
    expect(deriveColorPaletteStopsFromSolid('#ff000080')).toEqual([
      { color: '#ff000080', position: 0 },
      { color: '#ff737380', position: 100 },
    ]);
  });

  it('returns undefined for transparent and unparseable solids', () => {
    for (const value of [
      'transparent',
      'not-a-color',
      'rgb(1, 2, 3)',
      undefined as unknown as string,
    ]) {
      expect(deriveColorPaletteStopsFromSolid(value)).toBeUndefined();
    }
  });
});

describe('switchColorPaletteMode', () => {
  const solidState: ColorPaletteState = {
    mode: 'solid',
    solid: '#123456',
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
    angle: 90,
    x: 50,
    y: 50,
  };

  it('derives default stops from the solid color on solid → gradient', () => {
    const linear = switchColorPaletteMode(solidState, 'linear-gradient', 'solid');
    expect(linear.mode).toBe('linear-gradient');
    expect(linear.stops).toEqual([
      { color: '#123456', position: 0 },
      { color: '#7d8fa2', position: 100 },
    ]);
    expect(linear.angle).toBe(90);
    const radial = switchColorPaletteMode(solidState, 'radial-gradient', 'solid');
    expect(radial.mode).toBe('radial-gradient');
    expect(radial.stops).toEqual(linear.stops);
    expect(radial.x).toBe(50);
    expect(radial.y).toBe(50);
  });

  it('keeps customized stops on solid → gradient and between gradients', () => {
    const customized: ColorPaletteState = {
      ...solidState,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 100 },
      ],
    };
    const gradient = switchColorPaletteMode(customized, 'linear-gradient', 'solid');
    expect(gradient.stops).toEqual(customized.stops);
    const radial = switchColorPaletteMode(gradient, 'radial-gradient', 'linear-gradient');
    expect(radial.stops).toEqual(customized.stops);
    expect(radial.angle).toBe(90);
  });

  it('derives exactly once: derived stops survive a solid round-trip', () => {
    const derived = switchColorPaletteMode(solidState, 'linear-gradient', 'solid');
    const back = switchColorPaletteMode(derived, 'solid', 'linear-gradient');
    expect(back.mode).toBe('solid');
    const again = switchColorPaletteMode(back, 'linear-gradient', 'solid');
    expect(again.stops).toEqual([
      { color: '#123456', position: 0 },
      { color: '#7d8fa2', position: 100 },
    ]);
  });

  it('does not derive when re-selecting the active mode', () => {
    expect(switchColorPaletteMode(solidState, 'solid', 'solid')).toEqual(solidState);
  });

  it('shares the selected stop color (with alpha) back to solid on gradient -> solid', () => {
    const gradient: ColorPaletteState = {
      ...solidState,
      mode: 'linear-gradient',
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff66', position: 100 },
      ],
    };
    const shared = switchColorPaletteMode(gradient, 'solid', 'linear-gradient', 1);
    expect(shared.mode).toBe('solid');
    expect(shared.solid).toBe('#0000ff66');
    // 共享只改单色值，色标草稿原样保留（再切回渐变不丢配置）。
    expect(shared.stops).toEqual(gradient.stops);
    expect(shared.angle).toBe(90);
    // 未传索引默认选中第 0 个；越界索引回夹到有效范围。
    expect(switchColorPaletteMode(gradient, 'solid', 'radial-gradient').solid).toBe('#ff0000');
    expect(switchColorPaletteMode(gradient, 'solid', 'linear-gradient', 9).solid).toBe('#0000ff66');
  });

  it('keeps the solid draft when the selected stop is transparent', () => {
    const transparent: ColorPaletteState = {
      ...solidState,
      mode: 'radial-gradient',
      solid: '#123456',
      stops: [
        { color: '#ff0000', position: 0 },
        { color: 'transparent', position: 100 },
      ],
    };
    expect(switchColorPaletteMode(transparent, 'solid', 'radial-gradient', 1).solid).toBe(
      '#123456',
    );
    // 未选中 transparent 色标时照常共享。
    expect(switchColorPaletteMode(transparent, 'solid', 'radial-gradient', 0).solid).toBe(
      '#ff0000',
    );
    const invalid: ColorPaletteState = {
      ...transparent,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: 'not-a-color', position: 100 },
      ],
    };
    expect(switchColorPaletteMode(invalid, 'solid', 'radial-gradient', 1).solid).toBe('#123456');
  });
});

describe('mode switch derives solid family in the DOM', () => {
  it('derives the gradient from the solid color when switching to linear', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#123456');
    const element = palette.element as unknown as FakeElement;
    byField(element, 'solid')!.value = '#123456';
    checkMode(element, 'linear-gradient');
    modeRadio(element, 'linear-gradient').dispatchEvent(new Event('change', { bubbles: true }));
    expect(element.dataset.colorPaletteMode).toBe('linear-gradient');
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(
      'linear-gradient(90deg, #123456 0%, #7d8fa2 100%)',
    );
    expect(stopRows(element).map((handle) => handle.dataset.colorPaletteStopColor)).toEqual([
      '#123456',
      '#7d8fa2',
    ]);
  });

  it('preserves customized stops when cycling solid → gradient → solid → gradient', () => {
    const ownerDocument = new FakeDocument();
    const value = 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)';
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, value);
    const element = palette.element as unknown as FakeElement;
    checkMode(element, 'linear-gradient');
    element.dataset.colorPaletteMode = 'linear-gradient';
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(value);

    checkMode(element, 'solid');
    element.dataset.colorPaletteMode = 'solid';
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    checkMode(element, 'linear-gradient');
    modeRadio(element, 'linear-gradient').dispatchEvent(new Event('change', { bubbles: true }));
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(value);
  });

  it('keeps document gradient stops when switching between gradient modes', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #112233 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    checkMode(element, 'radial-gradient');
    modeRadio(element, 'radial-gradient').dispatchEvent(new Event('change', { bubbles: true }));
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(
      'radial-gradient(circle at 50% 50%, #112233 0%, #ffffff 100%)',
    );
  });
});

describe('mode switch shares gradient state back to solid', () => {
  it('syncs the edited stop color into the solid field on gradient -> solid', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const stopColor = byField(element, 'stop-color')!;
    stopColor.value = '#123456';
    stopColor.dispatchEvent(new Event('input', { bubbles: true }));
    checkMode(element, 'solid');
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    expect(element.dataset.colorPaletteMode).toBe('solid');
    expect(byField(element, 'solid')?.value).toBe('#123456');
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe('#123456');
  });

  it('carries the selected stop alpha into the solid field and its alpha slider', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    stopRows(element)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    const alpha = byField(element, 'stop-alpha')!;
    alpha.value = '40';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    checkMode(element, 'solid');
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    const solid = byField(element, 'solid')!;
    expect(solid.value).toBe('#ffffff');
    expect(solid.dataset.colorPaletteAlpha).toBe('66');
    expect(byField(element, 'solid-alpha')?.value).toBe('40');
    expect(readDesignerColorPaletteValue(solid)).toBe('#ffffff66');
  });

  it('keeps the solid draft when the selected stop is transparent', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'radial-gradient(circle at 50% 50%, #112233 0%, transparent 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    stopRows(element)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    checkMode(element, 'solid');
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    // 选中 transparent 色标不同步：保持解析回退的单色（文档渐变 -> DEFAULT_COLOR）。
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe('#000000');
  });
});

describe('compact palette layout', () => {
  it('keeps the picker behind one compact trigger and opens it as a dialog overlay', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#2483ff');
    const element = palette.element as unknown as FakeElement;
    const trigger = byAction(element, 'toggle')!;
    const popover = byDataset(element, 'colorPalettePopover')! as FakeElement & {
      hidden: boolean;
    };

    expect(trigger.attributes.get('aria-haspopup')).toBe('dialog');
    expect(trigger.attributes.get('aria-expanded')).toBe('false');
    expect(popover.attributes.get('role')).toBe('dialog');
    expect(popover.hidden).toBe(true);

    trigger.dispatchEvent(new Event('click', { bubbles: true }));
    expect(element.dataset.colorPaletteOpen).toBe('true');
    expect(trigger.attributes.get('aria-expanded')).toBe('true');
    expect(popover.hidden).toBe(false);

    byAction(element, 'close')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(element.dataset.colorPaletteOpen).toBe('false');
    expect(popover.hidden).toBe(true);
  });

  it('uses an icon-only mode toolbar without visible title or hint text', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#2483ff');
    const element = palette.element as unknown as FakeElement;
    const popover = byDataset(element, 'colorPalettePopover')!;
    const toolbar = descendants(popover).find(
      (candidate) => candidate.className === 'designer-color-popover-toolbar',
    );
    const modes = descendants(popover).filter(
      (candidate) => candidate.className === 'designer-color-palette-mode',
    );
    const icons = descendants(popover).filter(
      (candidate) => candidate.className === 'designer-color-palette-mode-icon',
    );
    const radios = descendants(popover).filter(
      (candidate) => candidate.dataset.colorPaletteField === 'mode',
    );

    expect(toolbar).toBeDefined();
    expect(
      descendants(popover).some(
        (candidate) => candidate.className === 'designer-color-popover-heading',
      ),
    ).toBe(false);
    expect(modes).toHaveLength(3);
    expect(modes.map((mode) => mode.textContent)).toEqual(['', '', '']);
    expect(modes.map((mode) => mode.title)).toEqual(['单色', '线性渐变', '径向渐变']);
    expect(radios.map((radio) => radio.attributes.get('aria-label'))).toEqual([
      '单色',
      '线性渐变',
      '径向渐变',
    ]);
    expect(icons).toHaveLength(3);
    expect(
      icons.every((icon) =>
        ((icon as FakeElement & { readonly innerHTML?: string }).innerHTML ?? '').includes('<svg'),
      ),
    ).toBe(true);
  });

  it('renders precise channels and quick colors while preserving the original proxy contract', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const picker = byDataset(element, 'designerFillColorPicker');
    const channels = descendants(element).filter(
      (candidate) => candidate.dataset.fillColorChannel !== undefined,
    );
    const quickColors = descendants(element).filter(
      (candidate) => candidate.dataset.fillColorQuick !== undefined,
    );

    expect(picker).toBeDefined();
    expect(channels.map((channel) => channel.dataset.fillColorChannel)).toEqual([
      'hex',
      'r',
      'g',
      'b',
      'a',
    ]);
    expect(quickColors).toHaveLength(9);
    expect(palette.controls.some((control) => control.dataset.colorPaletteField === 'solid')).toBe(
      true,
    );

    quickColors[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe('#39c5bb');
  });

  it('keeps the fill picker but omits gradient modes for solid-only color fields', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #112233 0%, #ffffff 100%)',
      'chart:grid-color',
      { allowGradient: false },
    );
    const element = palette.element as unknown as FakeElement;

    expect(element.dataset.colorPaletteMode).toBe('solid');
    expect(byField(element, 'mode')).toBeUndefined();
    expect(byDataset(element, 'designerFillColorPicker')).toBeDefined();
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#112233');
  });

  it('restores an open popover when a committed color rerenders the same field', () => {
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#112233',
      'title:style:color',
    ).element as unknown as FakeElement;
    byAction(first, 'toggle')!.dispatchEvent(new Event('click', { bubbles: true }));

    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#39c5bb',
      'title:style:color',
    ).element as unknown as FakeElement;
    expect(rerendered.dataset.colorPaletteOpen).toBe('true');
    expect(byAction(rerendered, 'toggle')?.attributes.get('aria-expanded')).toBe('true');
    expect(
      (byDataset(rerendered, 'colorPalettePopover') as FakeElement & { hidden: boolean }).hidden,
    ).toBe(false);

    byAction(rerendered, 'close')!.dispatchEvent(new Event('click', { bubbles: true }));
    const closed = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#39c5bb',
      'title:style:color',
    ).element as unknown as FakeElement;
    expect(closed.dataset.colorPaletteOpen).toBe('false');
  });

  it('restores an achromatic picker hue when the same field rerenders', () => {
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ffffff',
      'title:style:color',
    ).element as unknown as FakeElement;
    const firstHue = descendants(first).find(
      (candidate) => candidate.className === 'designer-fill-color-hue',
    )!;
    firstHue.value = '180';
    firstHue.dispatchEvent(new Event('input'));
    expect(firstHue.value).toBe('180');

    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ffffff',
      'title:style:color',
    ).element as unknown as FakeElement;
    const rerenderedHue = descendants(rerendered).find(
      (candidate) => candidate.className === 'designer-fill-color-hue',
    )!;
    expect(rerenderedHue.value).toBe('180');
  });

  it('keeps hue stationary while the color plane changes saturation and value', () => {
    const ownerDocument = new FakeDocument();
    const fieldKey = 'title:style:color';
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#0b1324',
      fieldKey,
    ).element as unknown as FakeElement;
    const plane = descendants(palette).find(
      (candidate) => candidate.className === 'designer-fill-color-plane',
    )!;
    const hue = descendants(palette).find(
      (candidate) => candidate.className === 'designer-fill-color-hue',
    )!;

    expect(hue.value).toBe('221');
    plane.dispatchEvent(
      documentPointerEvent('pointerdown', plane, 'mouse', { clientX: 10, clientY: 86 }),
    );
    expect(hue.value).toBe('221');
    plane.dispatchEvent(
      documentPointerEvent('pointermove', plane, 'mouse', { clientX: 20, clientY: 86 }),
    );
    expect(hue.value).toBe('221');
    plane.dispatchEvent(
      documentPointerEvent('pointerup', plane, 'mouse', { clientX: 20, clientY: 86 }),
    );
    expect(hue.value).toBe('221');

    const committed = readDesignerColorPaletteValue(byField(palette, 'solid')!);
    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      committed,
      fieldKey,
    ).element as unknown as FakeElement;
    const rerenderedHue = descendants(rerendered).find(
      (candidate) => candidate.className === 'designer-fill-color-hue',
    )!;
    expect(rerenderedHue.value).toBe('221');
  });

  it('keeps the color plane thumb at the dragged position when RGB quantizes to black', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ff0000',
      'title:style:color',
    ).element as unknown as FakeElement;
    const plane = descendants(palette).find(
      (candidate) => candidate.className === 'designer-fill-color-plane',
    )!;
    const picker = byDataset(palette, 'designerFillColorPicker')!;

    plane.dispatchEvent(
      documentPointerEvent('pointerdown', plane, 'mouse', { clientX: 75, clientY: 100 }),
    );

    expect(picker.attributes.get('style')).toContain('--designer-fill-saturation:75');
    expect(picker.attributes.get('style')).toContain('--designer-fill-value:0');
    expect(plane.attributes.get('aria-valuetext')).toBe('饱和度 75%，明度 0%');
  });

  it('restores the bottom-plane position after a palette re-render', () => {
    const ownerDocument = new FakeDocument();
    const fieldKey = 'title:style:color';
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ff0000',
      fieldKey,
    );
    const firstElement = first.element as unknown as FakeElement;
    const firstPlane = descendants(firstElement).find(
      (candidate) => candidate.className === 'designer-fill-color-plane',
    )!;
    firstPlane.dispatchEvent(
      documentPointerEvent('pointerdown', firstPlane, 'mouse', { clientX: 75, clientY: 100 }),
    );
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe('#000000');

    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#000000',
      fieldKey,
    ).element as unknown as FakeElement;
    const picker = byDataset(rerendered, 'designerFillColorPicker')!;
    expect(picker.attributes.get('style')).toContain('--designer-fill-saturation:75');
    expect(picker.attributes.get('style')).toContain('--designer-fill-value:0');
  });

  it('keeps the anchored popover open when its inspector pane scrolls', () => {
    const ownerDocument = new FakeDocument();
    const pane = ownerDocument.createElement('div');
    pane.dataset.inspectorPane = 'appearance';
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#112233',
      'title:style:color',
    ).element as unknown as FakeElement;
    pane.appendChild(palette);

    byAction(palette, 'toggle')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(palette.dataset.colorPaletteOpen).toBe('true');
    pane.dispatchEvent(new Event('scroll'));
    expect(palette.dataset.colorPaletteOpen).toBe('true');
  });

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'] as const)(
    'releases the color plane drag on %s and keeps achromatic hue editable',
    (terminalEvent) => {
      const ownerDocument = new FakeDocument();
      const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#ffffff')
        .element as unknown as FakeElement;
      const plane = descendants(palette).find(
        (candidate) => candidate.className === 'designer-fill-color-plane',
      )!;
      const hue = descendants(palette).find(
        (candidate) => candidate.className === 'designer-fill-color-hue',
      )!;
      const outside = { clientX: -100, clientY: -100 };

      plane.dispatchEvent(documentPointerEvent('pointerdown', plane, 'mouse', outside));
      expect(plane.hasPointerCapture(7)).toBe(true);
      plane.dispatchEvent(documentPointerEvent('pointermove', plane, 'mouse', outside));
      if (terminalEvent === 'lostpointercapture') plane.capturedPointers.delete(7);
      plane.dispatchEvent(documentPointerEvent(terminalEvent, plane, 'mouse', outside));
      expect(plane.hasPointerCapture(7)).toBe(false);

      hue.value = '180';
      hue.dispatchEvent(new Event('input'));
      expect(hue.value).toBe('180');
      plane.dispatchEvent(
        documentPointerEvent('pointermove', plane, 'mouse', { clientX: 75, clientY: 25 }),
      );
      expect(hue.value).toBe('180');
    },
  );

  it.each(['mouse', 'touch'] as const)(
    'consumes the first %s pointer sequence outside the open popover',
    (pointerType) => {
      const ownerDocument = new FakeDocument();
      const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233')
        .element as unknown as FakeElement;
      const outside = ownerDocument.createElement('button');
      const activations = { pointerdown: 0, pointerup: 0, click: 0 };
      for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
        ownerDocument.addEventListener(type, () => {
          activations[type] += 1;
        });
      }

      byAction(palette, 'toggle')!.dispatchEvent(new Event('click', { bubbles: true }));
      expect(palette.dataset.colorPaletteOpen).toBe('true');

      for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
        const event = documentPointerEvent(type, outside, pointerType);
        expect(ownerDocument.dispatchEvent(event)).toBe(false);
      }
      expect(palette.dataset.colorPaletteOpen).toBe('false');
      expect(activations).toEqual({ pointerdown: 0, pointerup: 0, click: 0 });

      for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
        ownerDocument.dispatchEvent(documentPointerEvent(type, outside, pointerType));
      }
      expect(activations).toEqual({ pointerdown: 1, pointerup: 1, click: 1 });
    },
  );

  it('keeps Escape dismissal keyboard-only and returns focus to the trigger', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233')
      .element as unknown as FakeElement;
    const trigger = byAction(palette, 'toggle')!;
    const outside = ownerDocument.createElement('button');
    let outsideClicks = 0;
    ownerDocument.addEventListener('click', () => {
      outsideClicks += 1;
    });

    trigger.dispatchEvent(new Event('click', { bubbles: true }));
    const escape = documentKeyboardEvent('Escape', outside);
    expect(ownerDocument.dispatchEvent(escape)).toBe(false);
    expect(palette.dataset.colorPaletteOpen).toBe('false');
    expect(trigger.focused).toBe(true);

    ownerDocument.dispatchEvent(documentPointerEvent('click', outside, 'mouse'));
    expect(outsideClicks).toBe(1);
  });

  it('puts stop position, mode parameters, and stop actions in one compact toolbar', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const stopColor = byField(element, 'stop-color')!;
    const stopPosition = byField(element, 'stop-position')!;
    expect(stopPosition.closest('.designer-color-palette-stop-editor')).toBe(
      stopColor.closest('.designer-color-palette-stop-editor'),
    );
    const stopAlpha = byField(element, 'stop-alpha')!;
    const stopBar = stopPosition.closest('.designer-color-palette-stop-bar');
    expect(stopBar).not.toBeNull();
    for (const control of [
      stopAlpha,
      byField(element, 'angle'),
      byField(element, 'x'),
      byField(element, 'y'),
      byAction(element, 'add-stop'),
      byAction(element, 'remove-stop'),
    ]) {
      expect(control?.closest('.designer-color-palette-stop-bar')).toBe(stopBar);
    }

    // 径向中心保留完整 aria-label，但视觉标签缩短为 X/Y。
    expect(byField(element, 'x')?.attributes.get('aria-label')).toBe('中心 X');
    expect(byField(element, 'y')?.attributes.get('aria-label')).toBe('中心 Y');
    expect(
      byField(element, 'x')?.closest('.designer-color-palette-field-inline')?.children[0]
        ?.textContent,
    ).toBe('X');
    expect(
      byField(element, 'y')?.closest('.designer-color-palette-field-inline')?.children[0]
        ?.textContent,
    ).toBe('Y');
  });
});

describe('manual hex color input', () => {
  it('keeps a shorthand draft while typing, then syncs solid rgb and alpha on change', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const value = byField(element, 'solid-value')!;
    value.value = '#fff';
    value.dispatchEvent(new Event('input', { bubbles: true }));
    // #fff 是有效完整短写，但输入期间不重写，作者可以继续输入 #ffffff。
    expect(value.value).toBe('#fff');
    expect(value.attributes.get('aria-invalid')).toBe('false');
    expect(byField(element, 'solid')?.value).toBe('#112233');
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(value.value).toBe('#FFFFFF');
    expect(byField(element, 'solid')?.value).toBe('#ffffff');

    value.value = '#12345680';
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(byField(element, 'solid')?.value).toBe('#123456');
    expect(byField(element, 'solid')?.dataset.colorPaletteAlpha).toBe('80');
    expect(byField(element, 'solid-alpha')?.value).toBe('50');
    expect(readDesignerColorPaletteValue(value)).toBe('#12345680');
  });

  it('syncs a selected stop into its handle and rejects an invalid hex draft', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const value = byField(element, 'stop-value')!;
    value.value = '#0EA5E9';
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(value.value).toBe('#0EA5E9');
    expect(byField(element, 'stop-color')?.value).toBe('#0ea5e9');
    expect(stopRows(element)[0]?.dataset.colorPaletteStopColor).toBe('#0ea5e9');
    expect(readDesignerColorPaletteValue(value)).toBe(
      'linear-gradient(90deg, #0ea5e9 0%, #ffffff 100%)',
    );

    value.value = '#12';
    value.dispatchEvent(new Event('input', { bubbles: true }));
    expect(value.attributes.get('aria-invalid')).toBe('true');
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(readDesignerColorPaletteValue(value)).toBeUndefined();
    expect(stopRows(element)[0]?.dataset.colorPaletteStopColor).toBe('#0ea5e9');
  });
});

describe('readDesignerColorPaletteValue', () => {
  it('reads the palette DOM and serializes the active mode', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    byField(element, 'solid')!.value = '#abcdef';
    checkMode(element, 'linear-gradient');
    element.dataset.colorPaletteMode = 'linear-gradient';
    const stopPosition = byField(element, 'stop-position')!;
    stopPosition.value = '0';
    stopPosition.dispatchEvent(new Event('input', { bubbles: true }));
    const handles = stopRows(element);
    handles[1]!.dataset.colorPaletteStopPosition = '100';
    byField(element, 'angle')!.value = '135';

    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe(
      'linear-gradient(135deg, #000000 0%, #ffffff 100%)',
    );
  });

  it('returns undefined for out-of-order stops fail-closed', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    checkMode(element, 'linear-gradient');
    element.dataset.colorPaletteMode = 'linear-gradient';
    const handles = stopRows(element);
    handles[0]!.dataset.colorPaletteStopPosition = '60';
    handles[1]!.dataset.colorPaletteStopPosition = '40';
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBeUndefined();
  });

  it('selects a handle and keeps its editor position in sync', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const handles = stopRows(element);
    const position = byField(element, 'stop-position')!;
    expect(element.dataset.colorPaletteSelectedStop).toBe('0');
    handles[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(element.dataset.colorPaletteSelectedStop).toBe('1');
    expect(position.value).toBe('100');
    expect(position.dataset.colorPaletteStopIndex).toBe('1');
    position.value = '80';
    position.dispatchEvent(new Event('input', { bubbles: true }));
    expect(handles[1]!.dataset.colorPaletteStopPosition).toBe('80');
  });

  it('retains the selected handle after a committed panel re-render', () => {
    const ownerDocument = new FakeDocument();
    const value = 'linear-gradient(90deg, #000000 0%, #ffffff 100%)';
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      value,
      'component:style:color',
    );
    const firstElement = first.element as unknown as FakeElement;
    stopRows(firstElement)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe(value);

    const second = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      value,
      'component:style:color',
    );
    const secondElement = second.element as unknown as FakeElement;
    expect(secondElement.dataset.colorPaletteSelectedStop).toBe('1');
    expect(byField(secondElement, 'stop-position')?.value).toBe('100');
  });
});

describe('color palette alpha transparency', () => {
  it('splits alpha-hex colors into rgb value and alpha dataset on render', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#ff000080');
    const element = palette.element as unknown as FakeElement;
    const solid = byField(element, 'solid')!;
    expect(solid.value).toBe('#ff0000');
    expect(solid.dataset.colorPaletteAlpha).toBe('80');
    expect(byField(element, 'solid-alpha')?.value).toBe('50');
  });

  it('composes the alpha slider into the solid value on input', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const alpha = byField(element, 'solid-alpha')!;
    alpha.value = '50';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#11223380');
    alpha.value = '0';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#11223300');
    alpha.value = '100';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    // 不透明：不带透明通道后缀，保持既有 6 位值格式（旧文档零迁移）。
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#112233');
  });

  it('applies stop alpha to the selected gradient stop and keeps other stops intact', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const alpha = byField(element, 'stop-alpha')!;
    alpha.value = '40';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe(
      'linear-gradient(90deg, #00000066 0%, #ffffff 100%)',
    );
  });

  it('switching stops refreshes the alpha slider from the stop color', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #00000080 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    expect(byField(element, 'stop-alpha')?.value).toBe('50');
    stopRows(element)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(byField(element, 'stop-alpha')?.value).toBe('100');
    expect(byField(element, 'stop-color')?.value).toBe('#ffffff');
  });

  it('groups the solid alpha slider with the solid field so gradient modes hide them together', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const solid = byField(element, 'solid')!;
    const alpha = byField(element, 'solid-alpha')!;
    const solidGroup = solid.closest('.designer-color-palette-solid-field');
    expect(solidGroup).not.toBeNull();
    // 单色透明度行与单色字段同一组：渐变模式的 hide 规则（display: none 锚定
    // .designer-color-palette-solid-field）会把两者一起隐藏，滑杆不会单独露出。
    expect(alpha.closest('.designer-color-palette-solid-field')).toBe(solidGroup);
    expect(
      descendants(element).filter((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-solid-field'),
      ),
    ).toHaveLength(1);
  });

  it('keeps transparent gradient stops serialized as transparent when untouched', () => {
    const ownerDocument = new FakeDocument();
    const value = 'radial-gradient(circle at 50% 50%, #112233 0%, transparent 100%)';
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, value);
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe(value);
  });

  it('round-trips alpha solid and alpha gradient values through parse/serialize', () => {
    expect(parseColorPaletteValue('#aabbcc40').solid).toBe('#aabbcc40');
    expect(serializeColorPaletteValue(parseColorPaletteValue('#aabbcc40'))).toBe('#aabbcc40');
    const gradient = 'linear-gradient(90deg, #ff000080 0%, #0000ff20 100%)';
    expect(serializeColorPaletteValue(parseColorPaletteValue(gradient))).toBe(gradient);
  });
});

describe('applyDesignerColorPaletteStopAction', () => {
  it('adds and removes stops in the DOM and dispatches a change', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    byField(element, 'solid')!.dataset.style = 'color';
    expect(stopRows(element)).toHaveLength(MIN_COLOR_PALETTE_STOPS);

    expect(
      applyDesignerColorPaletteStopAction(element as unknown as HTMLElement, 'add-stop', 0),
    ).toBe(true);
    expect(stopRows(element)).toHaveLength(MIN_COLOR_PALETTE_STOPS + 1);
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toMatch(
      /linear-gradient\(90deg, #000000 0%, #ffffff 50%, #ffffff 100%\)/,
    );
    expect(byField(element, 'stop-position')).toBeDefined();
    expect(byField(element, 'stop-position')?.dataset.style).toBe('color');
    expect(byField(element, 'solid')?.dispatched).toContain('change');

    expect(
      applyDesignerColorPaletteStopAction(element as unknown as HTMLElement, 'remove-stop', 1),
    ).toBe(true);
    expect(stopRows(element)).toHaveLength(MIN_COLOR_PALETTE_STOPS);
  });
});

describe('per-mode draft retention', () => {
  it('keeps every mode draft across panel re-renders and invalidates on document drift', () => {
    const linearValue = 'linear-gradient(90deg, #000000 0%, #ffffff 100%)';
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'c1:style:backgroundColor',
    );
    // 首次编辑提交后缓存建立。
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe(linearValue);

    // 面板重渲染：同一字段 key 复用缓存（当前模式序列化 == 文档值）。
    const second = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'c1:style:backgroundColor',
    );
    const secondElement = second.element as unknown as FakeElement;
    byField(secondElement, 'solid')!.value = '#abcdef';
    checkMode(secondElement, 'solid');
    secondElement.dataset.colorPaletteMode = 'solid';
    expect(readDesignerColorPaletteValue(second.controls[0]!)).toBe('#abcdef');

    // 再切回线性：缓存中的色标仍然保留。
    const third = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#abcdef',
      'c1:style:backgroundColor',
    );
    const thirdElement = third.element as unknown as FakeElement;
    checkMode(thirdElement, 'linear-gradient');
    thirdElement.dataset.colorPaletteMode = 'linear-gradient';
    expect(readDesignerColorPaletteValue(third.controls[0]!)).toBe(linearValue);

    // 文档值漂移（撤销/重做/替换）时缓存失效，从文档重新解析。
    const drifted = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'radial-gradient(circle at 25% 75%, #112233 0%, transparent 100%)',
      'c1:style:backgroundColor',
    );
    expect((drifted.element as unknown as FakeElement).dataset.colorPaletteMode).toBe(
      'radial-gradient',
    );
  });

  it('evicts the oldest field draft beyond the FIFO cap', () => {
    const linearValue = 'linear-gradient(90deg, #000000 0%, #ffffff 100%)';
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'field-1',
    );
    (first.element as unknown as FakeElement).dataset.colorPaletteSelectedStop = '1';
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe(linearValue);
    expect(colorPaletteDraftCacheSizes()).toEqual({ drafts: 1, selections: 1 });

    // 未超限时同 key 复用选中草稿。
    const reused = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'field-1',
    );
    expect((reused.element as unknown as FakeElement).dataset.colorPaletteSelectedStop).toBe('1');

    // 逐个写入直到上限：缓存条目数封顶。
    for (let index = 2; index <= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES; index++) {
      const palette = createDesignerColorPalette(
        ownerDocument as unknown as Document,
        '#123456',
        `field-${index}`,
      );
      expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#123456');
    }
    expect(colorPaletteDraftCacheSizes()).toEqual({
      drafts: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
      selections: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
    });

    // 超限写入：最早字段（field-1）被 FIFO 淘汰，条目数保持封顶。
    const overflow = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#123456',
      `field-${MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES + 1}`,
    );
    readDesignerColorPaletteValue(overflow.controls[0]!);
    expect(colorPaletteDraftCacheSizes()).toEqual({
      drafts: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
      selections: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
    });
    const evicted = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'field-1',
    );
    expect((evicted.element as unknown as FakeElement).dataset.colorPaletteSelectedStop).toBe('0');
  });
});
