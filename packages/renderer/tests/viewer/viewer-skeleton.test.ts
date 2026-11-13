import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeNode {
  readonly style = {} as CSSStyleDeclaration;
  readonly attributes = new Map<string, string>();
  readonly children: FakeNode[] = [];
  parent: FakeNode | undefined;
  textContent = '';
  removed = false;

  appendChild<T extends FakeNode>(child: T): T {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (this.parent !== undefined) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = undefined;
    }
    this.removed = true;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

class FakeShadowRoot extends FakeNode {}

class FakeDocument {
  createElement(): FakeNode {
    return new FakeNode();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('viewer skeleton', () => {
  it('creates a full-size placeholder and matching shadow style', async () => {
    const { createViewerSkeleton, createViewerSkeletonStyle } = await import(
      '../../src/viewer/viewer-skeleton.js'
    );
    const ownerDocument = new FakeDocument() as unknown as Document;
    const skeleton = createViewerSkeleton(ownerDocument);
    const style = createViewerSkeletonStyle(ownerDocument);

    expect(skeleton.getAttribute('data-viewer-skeleton')).toBe('true');
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(style.getAttribute('data-viewer-skeleton-style')).toBe('true');
    expect(style.textContent).toContain('base-screen-viewer-skeleton-pulse');
    expect(style.textContent).toContain('prefers-reduced-motion');
  });

  it('stays on the shadow root until the first render settles', async () => {
    const ownerDocument = new FakeDocument();
    class FakeHTMLElement extends FakeNode {
      isConnected = true;
      ownerDocument = ownerDocument as unknown as Document;
      shadowRoot: FakeShadowRoot | null = null;

      attachShadow(): FakeShadowRoot {
        this.shadowRoot = new FakeShadowRoot();
        return this.shadowRoot;
      }

      dispatchEvent(): boolean {
        return true;
      }
    }
    class FakeCustomEvent {
      constructor(
        readonly type: string,
        readonly init?: unknown,
      ) {}
    }
    vi.stubGlobal('HTMLElement', FakeHTMLElement);
    vi.stubGlobal('CustomEvent', FakeCustomEvent);
    const { BaseScreenViewerElement } = await import('../../src/viewer/viewer.js');
    const viewer = new BaseScreenViewerElement();

    viewer.connectedCallback();

    const shadow = viewer.shadowRoot as unknown as FakeShadowRoot;
    expect(shadow.children).toHaveLength(2);
    const skeleton = shadow.children[1] as FakeNode;
    expect(skeleton.attributes.get('data-viewer-skeleton')).toBe('true');
    expect(viewer.getAttribute('data-viewer-state')).toBe('loading');
    expect(viewer.getAttribute('aria-busy')).toBe('true');

    const configured = viewer.configure({
      catalog: { get: () => undefined, has: () => false, list: () => [] },
    });
    expect(configured.ok).toBe(true);

    // 文档未渲染时挂载根还没有画布尺寸，骨架仍在挂载根外层撑住查看区。
    expect(shadow.children).toHaveLength(3);
    expect(skeleton.parent).toBe(shadow);
    expect(viewer.getAttribute('data-viewer-state')).toBe('loading');
  });
});
