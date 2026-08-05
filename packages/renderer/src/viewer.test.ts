import type { ScreenHostResourcePort } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeNode {
  readonly style = {} as CSSStyleDeclaration;
  removed = false;

  appendChild<T>(child: T): T {
    return child;
  }

  remove(): void {
    this.removed = true;
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

describe('BaseScreenViewerElement lifecycle', () => {
  it('R2 rejects renderer configuration drift until unload releases the renderer', async () => {
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
    const { BaseScreenViewerElement } = await import('./viewer.js');
    const firstCatalog = {} as BaseScreenMaterialCatalog;
    const secondCatalog = {} as BaseScreenMaterialCatalog;
    const firstPort = {} as ScreenHostResourcePort;
    const secondPort = {} as ScreenHostResourcePort;
    const viewer = new BaseScreenViewerElement();

    viewer.resourcePort = firstPort;
    viewer.catalog = firstCatalog;
    viewer.catalog = secondCatalog;
    viewer.resourcePort = secondPort;

    expect(viewer.catalog).toBe(firstCatalog);
    expect(viewer.resourcePort).toBe(firstPort);

    viewer.unload();
    viewer.resourcePort = secondPort;
    viewer.catalog = secondCatalog;

    expect(viewer.catalog).toBe(secondCatalog);
    expect(viewer.resourcePort).toBe(secondPort);
  });
});
