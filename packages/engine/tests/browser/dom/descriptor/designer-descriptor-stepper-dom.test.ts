import { describe, expect, it } from 'vitest';
import { createDesignerStepper } from '../../../../src/browser/dom/descriptor/designer-descriptor-stepper-dom.js';

type Listener = (event: { type: string }) => void;

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Set<Listener>>();
  readonly children: FakeElement[] = [];
  ownerDocument!: FakeDocument;
  disabled = false;
  innerHTML = '';
  max = '';
  min = '';
  parent: FakeElement | undefined;
  step = '';
  type = '';
  className = '';
  value = '';

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  dispatchEvent(event: { type: string }): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }

  click(): void {
    this.dispatchEvent({ type: 'click' });
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  blur(): void {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = undefined;
    this.dispatchEvent({ type: 'blur' });
  }

  input(value: string, type: 'input' | 'change' = 'input'): void {
    this.value = value;
    this.dispatchEvent({ type });
  }
}

class FakeDocument {
  activeElement: FakeElement | undefined;

  createElement(tagName: string): FakeElement {
    const element = new FakeElement(tagName);
    element.ownerDocument = this;
    return element;
  }
}

function createHarness(
  options: Partial<{ value: number; min: number; max: number; step: number }> = {},
): {
  readonly document: FakeDocument;
  readonly element: FakeElement;
  readonly input: FakeElement;
  readonly decrement: FakeElement;
  readonly increment: FakeElement;
  readonly changes: string[];
} {
  const ownerDocument = new FakeDocument();
  const handle = createDesignerStepper(ownerDocument as unknown as Document, {
    value: options.value ?? 14,
    min: options.min ?? 10,
    max: options.max ?? 24,
    ...(options.step === undefined ? {} : { step: options.step }),
    ariaLabel: '字号',
  });
  const element = handle.element as unknown as FakeElement;
  const [decrement, input, increment] = element.children as [FakeElement, FakeElement, FakeElement];
  const changes: string[] = [];
  input.addEventListener('change', () => changes.push(input.value));
  return { document: ownerDocument, element, input, decrement, increment, changes };
}

describe('createDesignerStepper', () => {
  it('R5 renders the prototype three-part shell with bounds and clamped value', () => {
    const { element, input, decrement, increment } = createHarness({ value: 99 });

    expect(element.className).toBe('designer-stepper');
    expect(element.getAttribute('role')).toBe('group');
    expect(element.getAttribute('aria-label')).toBe('字号');
    expect(decrement.dataset.step).toBe('-1');
    expect(increment.dataset.step).toBe('1');
    expect(decrement.getAttribute('aria-label')).toBe('减小字号');
    expect(increment.getAttribute('aria-label')).toBe('增大字号');
    expect(input.type).toBe('number');
    expect(input.min).toBe('10');
    expect(input.max).toBe('24');
    expect(input.step).toBe('1');
    expect(input.value).toBe('24');
    expect(increment.disabled).toBe(true);
    expect(decrement.disabled).toBe(false);
  });

  it('R5 steps with the buttons and reports each change through the input', () => {
    const { input, decrement, increment, changes } = createHarness();

    increment.click();
    expect(input.value).toBe('15');
    decrement.click();
    decrement.click();
    expect(input.value).toBe('13');
    expect(changes).toEqual(['15', '14', '13']);
  });

  it('R5 disables the bound buttons and hands focus to the opposite side', () => {
    const { decrement, increment, input } = createHarness({ value: 10, min: 10, max: 11 });

    expect(decrement.disabled).toBe(true);
    increment.focus();
    increment.click();
    expect(input.value).toBe('11');
    // 到顶后 + 禁用，焦点交给 −。
    expect(increment.disabled).toBe(true);
    expect(decrement.disabled).toBe(false);
    expect(decrement.ownerDocument.activeElement).toBe(decrement);
  });

  it('R5 clamps typed values on commit and honours a custom step', () => {
    const { input, increment, changes } = createHarness({ step: 5, value: 10, min: 0, max: 20 });

    increment.click();
    expect(input.value).toBe('15');
    input.input('999', 'change');
    expect(input.value).toBe('20');
    input.input('-4', 'input');
    expect(increment.disabled).toBe(false);
    input.blur();
    expect(input.value).toBe('0');
    // 失焦只归一位（不再补发一次 change，避免同一笔编辑写两条历史）。
    expect(changes).toEqual(['15', '20']);
  });
});
