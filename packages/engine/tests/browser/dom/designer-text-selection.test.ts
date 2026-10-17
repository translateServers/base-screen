import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDesignerTextSelection } from '../../../src/browser/dom/designer-text-selection.js';

class FakeElement {}
class FakeInputElement extends FakeElement {}
class FakeSelectElement extends FakeElement {}
class FakeTextAreaElement extends FakeElement {}
class FakeHtmlElement extends FakeElement {
  isContentEditable = false;
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

interface FakeSelection {
  readonly anchorNode: unknown;
  readonly collapsed: boolean;
  readonly isCollapsed: boolean;
  readonly text: string;
  toString(): string;
}

function selection(anchorNode: unknown, text = 'selected', collapsed = false): FakeSelection {
  return {
    anchorNode,
    collapsed,
    isCollapsed: collapsed,
    text,
    toString: () => text,
  };
}

function shadowRoot(
  selectionValue: FakeSelection | null,
  inside: readonly unknown[] = [],
): ShadowRoot {
  return {
    getSelection: () => selectionValue,
    contains: (node: unknown) => inside.includes(node),
    ownerDocument: { getSelection: () => undefined },
    host: { tag: 'base-screen-designer' },
  } as unknown as ShadowRoot;
}

function textNode(parentElement: unknown): { nodeType: number; parentElement: unknown } {
  return { nodeType: 3, parentElement };
}

describe('hasDesignerTextSelection', () => {
  it('reports nothing without a shadow root or an active selection', () => {
    expect(hasDesignerTextSelection(undefined)).toBe(false);
    expect(hasDesignerTextSelection(null)).toBe(false);
    expect(hasDesignerTextSelection(shadowRoot(null))).toBe(false);
  });

  it('ignores collapsed and empty selections', () => {
    const panel = new FakeElement();
    const node = textNode(panel);
    expect(hasDesignerTextSelection(shadowRoot(selection(node, 'text', true), [node]))).toBe(false);
    expect(hasDesignerTextSelection(shadowRoot(selection(node, ''), [node]))).toBe(false);
  });

  it('reports a real selection anchored in the designer surface', () => {
    const panel = new FakeElement();
    const node = textNode(panel);
    expect(hasDesignerTextSelection(shadowRoot(selection(node), [node]))).toBe(true);
  });

  it('ignores selections whose anchor lives outside the surface', () => {
    const panel = new FakeElement();
    const node = textNode(panel);
    const foreign = textNode(new FakeElement());
    expect(hasDesignerTextSelection(shadowRoot(selection(foreign), [node]))).toBe(false);
  });

  it('accepts the host-projected anchor some engines return', () => {
    const host = { tag: 'base-screen-designer' };
    const root = {
      getSelection: () => selection(host),
      contains: () => false,
      ownerDocument: { getSelection: () => undefined },
      host,
    } as unknown as ShadowRoot;
    expect(hasDesignerTextSelection(root)).toBe(true);
  });

  it('leaves selections inside editable targets to the native text path', () => {
    const editable = new FakeHtmlElement();
    editable.isContentEditable = true;
    const node = textNode(editable);
    expect(hasDesignerTextSelection(shadowRoot(selection(node), [node]))).toBe(false);

    const input = new FakeInputElement();
    expect(hasDesignerTextSelection(shadowRoot(selection(input), [input]))).toBe(false);
  });
});
