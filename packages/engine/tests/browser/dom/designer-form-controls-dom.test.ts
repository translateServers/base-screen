import { describe, expect, it } from 'vitest';
import { adoptDesignerFormControls } from '../../../src/browser/dom/designer-form-controls-dom.js';

class FakeControl {
  readonly attributes: Record<string, string> = {};
  readonly listeners = new Map<string, (() => void)[]>();
  checked = false;
  className = '';
  type = '';

  constructor(readonly tagName: string) {}

  addEventListener(type: string, listener: () => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  closest(): null {
    return null;
  }

  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

function adopt(controls: FakeControl[]): void {
  const root = {
    querySelectorAll: () => controls,
  } as unknown as ParentNode;
  adoptDesignerFormControls(root);
}

/** 下拉增强需要的替身：只实现 adoptSelect → enhanceDesignerSelect 用到的同步接口。 */
class FakeDomElement {
  #attributeStore = new Map<string, string>();
  readonly children: FakeDomElement[] = [];
  readonly classList: {
    add(token: string): void;
    contains(token: string): boolean;
  };
  readonly dataset: Record<string, string> = {};
  className = '';
  disabled = false;
  hidden = false;
  parentElement: FakeDomElement | null = null;
  selected = false;
  tabIndex = 0;
  textContent = '';
  value = '';

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDomDocument,
  ) {
    this.classList = {
      add: (token) => {
        if (!this.classList.contains(token)) this.className = `${this.className} ${token}`.trim();
      },
      contains: (token) => this.className.split(/\s+/).includes(token),
    };
  }

  get attributes(): readonly { name: string; value: string }[] {
    return [...this.#attributeStore].map(([name, value]) => ({ name, value }));
  }

  get options(): FakeDomElement[] {
    return this.children.filter((child) => child.tagName === 'option');
  }

  get selectedIndex(): number {
    return this.options.findIndex((option) => option.selected);
  }

  appendChild(child: FakeDomElement): FakeDomElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
  }

  replaceWith(next: FakeDomElement): void {
    const parent = this.parentElement;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1, next);
    next.parentElement = parent;
    this.parentElement = null;
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  closest(): null {
    return null;
  }

  getAttribute(name: string): string | null {
    return this.#attributeStore.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributeStore.set(name, value);
  }

  focus(): void {}

  getBoundingClientRect(): { bottom: number; top: number } {
    return { bottom: 0, top: 0 };
  }

  getRootNode(): null {
    return null;
  }
}

class FakeDomDocument {
  activeElement: FakeDomElement | null = null;

  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName, this);
  }

  addEventListener(): void {}

  removeEventListener(): void {}
}

describe('adoptDesignerFormControls', () => {
  it('normalizes switches in place and keeps their change pipeline', () => {
    const input = new FakeControl('input');
    input.type = 'text';
    input.className = 'designer-switch';
    input.checked = true;
    adopt([input]);

    expect(input.type).toBe('checkbox');
    expect(input.className).toBe('designer-switch');
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.getAttribute('aria-checked')).toBe('true');

    input.checked = false;
    input.fire('change');
    expect(input.getAttribute('aria-checked')).toBe('false');
    // 原地归一：模板渲染后挂上的监听不会因替换节点丢失。
    expect(input.listeners.get('change')).toHaveLength(1);
  });

  it('normalizes checkboxes in place without adding switch semantics', () => {
    const input = new FakeControl('input');
    input.type = 'text';
    input.className = 'designer-checkbox';
    adopt([input]);

    expect(input.type).toBe('checkbox');
    expect(input.getAttribute('role')).toBeNull();
    expect(input.getAttribute('aria-checked')).toBe('false');
  });

  it('adds the shared control base to template buttons and forces type=button', () => {
    const button = new FakeControl('button');
    button.type = 'submit';
    button.className = 'designer-button custom-action';
    adopt([button]);

    expect(button.className).toBe('designer-button custom-action designer-control');
    expect(button.type).toBe('button');
  });

  it('replaces the template select so the field renders one dropdown', () => {
    const ownerDocument = new FakeDomDocument();
    const host = ownerDocument.createElement('label');
    const original = ownerDocument.createElement('select');
    original.className = 'designer-control designer-select';
    original.setAttribute('data-blueprint-source-event', 'true');
    const option = ownerDocument.createElement('option');
    option.value = 'valueClick';
    option.textContent = 'valueClick';
    option.selected = true;
    original.appendChild(option);
    original.value = 'valueClick';
    host.appendChild(original);
    const root = {
      querySelectorAll: () => [original],
    } as unknown as ParentNode;

    adoptDesignerFormControls(root);

    // 增强后的外壳原位替换模板里的原生 select，而不是额外插一份。
    expect(host.children).toHaveLength(1);
    const control = host.children[0]!;
    expect(control.className).toBe('designer-select-control');
    expect(control.children.some((child) => child.tagName === 'select')).toBe(true);
    expect(control.children.some((child) => child.tagName === 'button')).toBe(true);
    expect(original.parentElement).toBeNull();
  });
});
