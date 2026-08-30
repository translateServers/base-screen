import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adoptDesignerStyleSheets,
  createDesignerStyle,
  DESIGNER_CSS,
} from '../../../src/browser/styles/designer-style.js';

describe('designer style sheet sharing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to a style element when constructable sheets are unavailable', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    const root = { adoptedStyleSheets: [] } as unknown as ShadowRoot;

    expect(adoptDesignerStyleSheets(root)).toBe(false);
    expect(root.adoptedStyleSheets).toHaveLength(0);

    const element = createDesignerStyle({
      createElement: () => ({ textContent: '' }),
    } as unknown as Document);
    // vitest 不解析 ?inline 导入（值为空串），与模块实际拼接值精确比对。
    expect(element.textContent).toBe(DESIGNER_CSS);
  });

  it('adopts one shared constructable sheet across roots and stays idempotent', () => {
    const replaceSync = vi.fn();
    class FakeSheet {
      constructor() {
        return { replaceSync };
      }
    }
    vi.stubGlobal('CSSStyleSheet', FakeSheet);
    const first = { adoptedStyleSheets: [] } as unknown as ShadowRoot;
    const second = { adoptedStyleSheets: [] } as unknown as ShadowRoot;

    expect(adoptDesignerStyleSheets(first)).toBe(true);
    expect(first.adoptedStyleSheets).toHaveLength(1);
    expect(replaceSync).toHaveBeenCalledTimes(1);
    expect(replaceSync.mock.calls[0]?.[0]).toBe(DESIGNER_CSS);

    // 第二个 root 复用同一共享 sheet 实例，不重复 replaceSync。
    expect(adoptDesignerStyleSheets(second)).toBe(true);
    expect(second.adoptedStyleSheets[0]).toBe(first.adoptedStyleSheets[0]);
    expect(replaceSync).toHaveBeenCalledTimes(1);

    // 同一 root 重复 adopt 幂等，不追加重复条目。
    expect(adoptDesignerStyleSheets(first)).toBe(true);
    expect(first.adoptedStyleSheets).toHaveLength(1);
  });
});
