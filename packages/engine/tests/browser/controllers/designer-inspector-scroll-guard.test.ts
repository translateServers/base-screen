import { describe, expect, it } from 'vitest';
import {
  DesignerInspectorScrollGuard,
  INSPECTOR_CLICK_SCROLL_GUARD_MS,
  INSPECTOR_PRE_POINTER_SCROLL_WINDOW_MS,
  isInspectorFormControlTarget,
} from '../../../src/browser/controllers/designer-inspector-scroll-guard.js';

describe('DesignerInspectorScrollGuard', () => {
  it('restores a browser nudge inside the guard window', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    // 先挂载监听并建立稳定位置（非守卫滚动）
    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    // 控件 pointerdown 武装守卫，随后浏览器把被裁剪控件滚入视口
    guard.begin(pane as unknown as HTMLElement);
    pane.scrollTop = 508;
    pane.dispatchScroll();
    expect(pane.scrollTop).toBe(500);
  });

  it('ignores scrolls after the guard window expires', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    guard.begin(pane as unknown as HTMLElement);
    clock += INSPECTOR_CLICK_SCROLL_GUARD_MS + 1;
    pane.scrollTop = 508;
    pane.dispatchScroll();
    expect(pane.scrollTop).toBe(508);
    // 过期后的滚动成为新的稳定位置
    pane.scrollTop = 532;
    pane.dispatchScroll();
    expect(pane.scrollTop).toBe(532);
  });

  it('stops guarding once the user wheels', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    guard.begin(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 508;
    pane.dispatchScroll();
    expect(pane.scrollTop).toBe(508);
  });

  it('only restores the armed pane', () => {
    let clock = 0;
    const pane = new FakePane();
    const other = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    guard.begin(pane as unknown as HTMLElement);
    other.scrollTop = 300;
    other.dispatchScroll();
    expect(other.scrollTop).toBe(300);
  });

  it('keeps restoring repeated browser nudges within the window', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    guard.begin(pane as unknown as HTMLElement);
    pane.scrollTop = 506;
    pane.dispatchScroll();
    pane.scrollTop = 514;
    pane.dispatchScroll();
    expect(pane.scrollTop).toBe(500);
  });

  it('detaches listeners on dispose', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    guard.begin(pane as unknown as HTMLElement);
    guard.dispose();
    pane.scrollTop = 508;
    pane.dispatchScroll();
    expect(pane.scrollTop).toBe(508);
    expect(pane.listenerCount()).toBe(0);
  });

  it('restores a browser pre-scroll that happens immediately before pointerdown', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    clock += 1_000;
    // Chromium/Playwright can internally scrollIntoView before pointerdown is dispatched.
    pane.scrollTop = 548;
    pane.dispatchScroll();
    clock += INSPECTOR_PRE_POINTER_SCROLL_WINDOW_MS - 1;
    guard.begin(pane as unknown as HTMLElement);

    expect(pane.scrollTop).toBe(500);
  });

  it('restores the start of a multi-event browser pre-scroll batch', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    clock += 1_000;
    pane.scrollTop = 520;
    pane.dispatchScroll();
    clock += 10;
    pane.scrollTop = 548;
    pane.dispatchScroll();
    clock += 10;
    guard.begin(pane as unknown as HTMLElement);

    expect(pane.scrollTop).toBe(500);
  });

  it('keeps a settled programmatic scroll as the new position', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.scrollTop = 500;
    pane.dispatchScroll();
    clock += INSPECTOR_PRE_POINTER_SCROLL_WINDOW_MS + 1;
    guard.begin(pane as unknown as HTMLElement);

    expect(pane.scrollTop).toBe(500);
  });

  it('does not undo a wheel scroll immediately followed by pointerdown', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    clock += 10;
    guard.begin(pane as unknown as HTMLElement);

    expect(pane.scrollTop).toBe(500);
  });

  it('re-arms at change time for delayed native select commits', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    clock += INSPECTOR_CLICK_SCROLL_GUARD_MS + 1;
    guard.preserve(pane as unknown as HTMLElement);
    pane.scrollTop = 512;
    pane.dispatchScroll();

    expect(pane.scrollTop).toBe(500);
  });

  it('can attach again after dispose when the designer reconnects', () => {
    let clock = 0;
    const pane = new FakePane();
    const guard = new DesignerInspectorScrollGuard(() => clock);

    guard.ensureListeners(pane as unknown as HTMLElement);
    guard.dispose();
    guard.ensureListeners(pane as unknown as HTMLElement);
    pane.dispatchWheel();
    pane.scrollTop = 500;
    pane.dispatchScroll();
    guard.begin(pane as unknown as HTMLElement);
    pane.scrollTop = 508;
    pane.dispatchScroll();

    expect(pane.scrollTop).toBe(500);
    expect(pane.listenerCount()).toBe(2);
  });
});

describe('isInspectorFormControlTarget', () => {
  const FORM_SELECTOR = 'input, select, textarea, label';

  function targetWithAncestry(tagName: string, ancestors: readonly string[]): EventTarget {
    return {
      tagName,
      closest(selector: string): HTMLElement | null {
        if (selector !== FORM_SELECTOR) return null;
        const chain = [tagName, ...ancestors].map((tag) => tag.toLowerCase());
        return chain.some(
          (tag) => tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'label',
        )
          ? ({} as HTMLElement)
          : null;
      },
    } as unknown as EventTarget;
  }

  it('matches inputs and selects directly', () => {
    expect(isInspectorFormControlTarget(targetWithAncestry('INPUT', []))).toBe(true);
    expect(isInspectorFormControlTarget(targetWithAncestry('SELECT', []))).toBe(true);
    expect(isInspectorFormControlTarget(targetWithAncestry('TEXTAREA', []))).toBe(true);
  });

  it('matches the wrapping label of a form field', () => {
    // label 包裹控件：点击 label 文本时目标是 label（控件是其子孙，非祖先）
    expect(isInspectorFormControlTarget(targetWithAncestry('LABEL', []))).toBe(true);
    expect(isInspectorFormControlTarget(targetWithAncestry('SPAN', ['LABEL']))).toBe(true);
  });

  it('rejects non-form targets', () => {
    expect(isInspectorFormControlTarget(targetWithAncestry('DIV', []))).toBe(false);
    expect(isInspectorFormControlTarget(targetWithAncestry('SPAN', ['DIV', 'SECTION']))).toBe(
      false,
    );
    expect(isInspectorFormControlTarget(null)).toBe(false);
  });
});

class FakePane {
  scrollTop = 0;
  #scrollHandler: (() => void) | undefined;
  #wheelHandler: (() => void) | undefined;

  addEventListener(type: string, handler: () => void): void {
    if (type === 'scroll') this.#scrollHandler = handler;
    if (type === 'wheel') this.#wheelHandler = handler;
  }

  removeEventListener(type: string, handler: () => void): void {
    if (type === 'scroll' && this.#scrollHandler === handler) this.#scrollHandler = undefined;
    if (type === 'wheel' && this.#wheelHandler === handler) this.#wheelHandler = undefined;
  }

  dispatchScroll(): void {
    this.#scrollHandler?.();
  }

  dispatchWheel(): void {
    this.#wheelHandler?.();
  }

  listenerCount(): number {
    return (this.#scrollHandler === undefined ? 0 : 1) + (this.#wheelHandler === undefined ? 0 : 1);
  }
}
