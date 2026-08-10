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

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => undefined,
    has: () => false,
    list: () => [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('BaseScreenViewerElement lifecycle', () => {
  it('R2/RB3 keeps configuration drift rejected after configure until unload releases the renderer', async () => {
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
    const { BaseScreenViewerElement } = await import('../src/viewer.js');
    const firstCatalog = catalog();
    const secondCatalog = catalog();
    const firstPort = {
      resolve: async () => ({ ok: true as const, value: {}, diagnostics: [] }),
    } as ScreenHostResourcePort;
    const secondPort = {} as ScreenHostResourcePort;
    const viewer = new BaseScreenViewerElement();

    // 运行时依赖 setter 只保留值，不创建 Renderer（RB3）。
    viewer.resourcePort = firstPort;
    viewer.catalog = firstCatalog;
    expect(viewer.catalog).toBe(firstCatalog);
    expect(viewer.resourcePort).toBe(firstPort);

    // configure 原子提交后，变更已提交的运行时依赖被拒绝（需先 unload）。
    const configured = viewer.configure({ catalog: firstCatalog, resourcePort: firstPort });
    expect(configured).toEqual({ ok: true, value: null, diagnostics: [] });
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
