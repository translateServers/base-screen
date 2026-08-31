import { parseBaseScreenMaterialLibraryGrouping } from '../../../../src/common/operations/material-library/material-library-grouping.js';

class TestEvents {
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, callback: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, callback: (event: Event) => void): void {
    this.listeners.get(type)?.delete(callback);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as Event);
  }
}

export class MaterialGroupTestDocument extends TestEvents {
  activeElement: MaterialGroupTestElement | null = null;
  layout: MaterialGroupTestElement | undefined;
  readonly defaultView = Object.assign(new TestEvents(), { innerWidth: 1440, innerHeight: 900 });

  createElement(tag: string): MaterialGroupTestElement {
    return new MaterialGroupTestElement(this, tag);
  }
}

// A small DOM double for identity, focus, events and deterministic layout measurements.
// Actual CSS, layout, scrolling and composed-event behavior are covered by the browser harness.
export class MaterialGroupTestElement extends TestEvents {
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly children: MaterialGroupTestElement[] = [];
  readonly style: Record<string, string> = {};
  parentElement: MaterialGroupTestElement | null = null;
  className = '';
  type = '';
  title = '';
  value = '';
  ariaPressed = '';
  ariaLabel = '';
  hidden = false;
  disabled = false;
  tabIndex = -1;
  scrollTop = 0;
  clientLeft = 0;
  clientTop = 0;
  scrolledIntoView = false;
  rect = { left: 76, top: 200, width: 277, height: 500 };
  #text = '';

  constructor(
    readonly ownerDocument: MaterialGroupTestDocument,
    readonly tagName: string,
  ) {
    super();
  }

  get textContent(): string {
    return this.#text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.replaceChildren();
    this.#text = value;
  }

  get isConnected(): boolean {
    return this.ownerDocument.layout?.contains(this) ?? false;
  }

  appendChild(child: MaterialGroupTestElement): MaterialGroupTestElement {
    child.remove();
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  append(...children: MaterialGroupTestElement[]): void {
    for (const child of children) this.appendChild(child);
  }

  insertBefore(child: MaterialGroupTestElement, reference: MaterialGroupTestElement | null): void {
    child.remove();
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    this.children.splice(index, 0, child);
    child.parentElement = this;
  }

  replaceChildren(...children: MaterialGroupTestElement[]): void {
    for (const child of [...this.children]) child.remove();
    this.#text = '';
    this.append(...children);
  }

  remove(): void {
    const focused = this.ownerDocument.activeElement;
    if (focused !== null && this.contains(focused)) this.ownerDocument.activeElement = null;
    const parent = this.parentElement;
    if (parent !== null) parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }

  contains(child: MaterialGroupTestElement): boolean {
    let current: MaterialGroupTestElement | null = child;
    while (current !== null) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  setAttribute(name: string, value: string): void {
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = value;
    else if (name === 'aria-pressed') this.ariaPressed = value;
    else if (name === 'aria-label') this.ariaLabel = value;
    else this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
    if (name === 'aria-pressed') return this.ariaPressed || null;
    if (name === 'aria-label') return this.ariaLabel || null;
    if (name === 'tabindex') return String(this.tabIndex);
    return this.attributes[name] ?? null;
  }

  querySelector<T = MaterialGroupTestElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T = MaterialGroupTestElement>(selector: string): T[] {
    return descendants(this).filter((child) => matches(child, selector)) as T[];
  }

  closest<T = MaterialGroupTestElement>(selector: string): T | null {
    let current: MaterialGroupTestElement | null = this;
    while (current !== null) {
      if (matches(current, selector)) return current as T;
      current = current.parentElement;
    }
    return null;
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  scrollIntoView(): void {
    this.scrolledIntoView = true;
  }

  getRootNode(): MaterialGroupTestDocument {
    return this.ownerDocument;
  }

  getBoundingClientRect() {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
    };
  }
}

function dataKey(name: string): string {
  return name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function descendants(element: MaterialGroupTestElement): MaterialGroupTestElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function matches(element: MaterialGroupTestElement, selector: string): boolean {
  if (selector.includes(','))
    return selector.split(',').some((part) => matches(element, part.trim()));
  const parts = selector.trim().split(/\s+/);
  const self = parts.pop()!;
  const tag = /^[a-z][a-z-]*/.exec(self)?.[0];
  if (tag !== undefined && element.tagName !== tag) return false;
  for (const match of self.replace(/\[[^\]]*\]/g, '').matchAll(/\.([\w-]+)/g)) {
    if (!element.className.split(' ').includes(match[1]!)) return false;
  }
  for (const match of self.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    const actual = element.getAttribute(match[1]!);
    if (actual === null || (match[2] !== undefined && actual !== match[2])) return false;
  }
  return parts.length === 0 || element.parentElement?.closest(parts.join(' ')) != null;
}

export function createMaterialGroupLayout() {
  const document = new MaterialGroupTestDocument();
  const node = (tag: string, className = '', dataset: Record<string, string> = {}) => {
    const element = document.createElement(tag);
    element.className = className;
    Object.assign(element.dataset, dataset);
    return element;
  };
  const layout = node('div', 'designer');
  document.layout = layout;
  layout.rect = { left: 16, top: 16, width: 1400, height: 850 };
  const panel = node('div', '', { materials: '' });
  const trigger = node('button', '', { materialGroupToggle: '', materialGroupAction: 'toggle' });
  trigger.rect = { left: 76, top: 180, width: 220, height: 32 };
  trigger.append(node('span', '', { materialGroupToggleLabel: '' }));
  const content = node('div', '', { materialLibraryContent: '' });
  const inline = node('div', '', { materialGroupInline: '' });
  const navigation = node('nav', '', { materialGroups: '' });
  inline.append(navigation);
  content.append(inline);
  panel.append(trigger, content);
  const overlay = node('div', '', { materialGroupOverlay: '' });
  overlay.hidden = true;
  const popover = node('section', '', { materialGroupPopover: '' });
  const close = node('button', '', { materialGroupAction: 'close' });
  const mount = node('div', '', { materialGroupPopoverContent: '' });
  popover.append(close, mount);
  overlay.append(popover);
  layout.append(panel, overlay);
  return {
    document,
    layout: layout as unknown as HTMLElement,
    element: layout,
    panel,
    content,
    inline,
    navigation,
    trigger,
    overlay,
    popover,
    mount,
    close,
    node,
  };
}

export function materialGrouping() {
  return parseGrouping({
    groups: [
      { id: 'foundation', label: 'Foundation', materialTypes: ['base.text'] },
      {
        id: 'data',
        label: 'Data',
        children: [
          {
            id: 'charts',
            label: 'Charts',
            materialTypes: ['base.chart'],
            children: [
              { id: 'bars', label: 'Bars', materialTypes: ['base.bar'] },
              { id: 'lines', label: 'Lines', materialTypes: ['base.line'] },
            ],
          },
          { id: 'tables', label: 'Tables', materialTypes: ['base.table'] },
        ],
      },
    ],
  });
}

export function parseGrouping(input: unknown) {
  const parsed = parseBaseScreenMaterialLibraryGrouping(input);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.value;
}
