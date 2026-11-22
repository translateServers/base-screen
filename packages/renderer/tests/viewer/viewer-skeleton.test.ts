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

  it('ships a stale indicator style that avoids renderer-owned inline properties (ADR-0104)', async () => {
    const { createViewerStaleStyle } = await import('../../src/viewer/viewer-stale-style.js');
    const style = createViewerStaleStyle(new FakeDocument() as unknown as Document);
    expect(style.getAttribute('data-viewer-stale-style')).toBe('true');
    expect(style.textContent).toContain('[data-base-screen-data-stale]::after');
    expect(style.textContent).toContain('--base-screen-stale-indicator-display');
    // opacity / filter 由渲染器内联写到物料宿主上，样式表盖不过，不能用来表达过期。
    expect(style.textContent).not.toMatch(/(^|[\s;{])(opacity|filter)\s*:/);
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
    // 第 4 个是推送过期角标样式（ADR-0104），排在挂载根之后。
    expect(shadow.children).toHaveLength(4);
    expect(shadow.children[3]?.attributes.get('data-viewer-stale-style')).toBe('true');
    expect(skeleton.parent).toBe(shadow);
    expect(viewer.getAttribute('data-viewer-state')).toBe('loading');
  });

  it('removes the skeleton and reports ready once the first render settles', async () => {
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
    const skeleton = shadow.children[1] as FakeNode;
    expect(skeleton.attributes.get('data-viewer-skeleton')).toBe('true');

    // `markRendered` 是渲染落定（成功或失败）的唯一出口，onRenderSettled 也走它。
    (viewer as unknown as { markRendered(): void }).markRendered();

    expect(skeleton.removed).toBe(true);
    expect(skeleton.parent).toBeUndefined();
    expect(shadow.children.some((child) => child === skeleton)).toBe(false);
    // 骨架样式也必须撤掉，挂载根要回到 Shadow Root 的第一个元素位置。
    expect(
      shadow.children.some((child) => child.attributes.get('data-viewer-skeleton-style')),
    ).toBe(false);
    expect(viewer.getAttribute('data-viewer-state')).toBe('ready');
    expect(viewer.getAttribute('aria-busy')).toBeNull();
  });
});
