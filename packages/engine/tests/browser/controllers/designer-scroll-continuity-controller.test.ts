import { describe, expect, it } from 'vitest';
import { DesignerScrollContinuityController } from '../../../src/browser/controllers/designer-scroll-continuity-controller.js';

describe('DesignerScrollContinuityController', () => {
  it('restores both axes after replacement content becomes scrollable', () => {
    const scheduled: Array<() => void> = [];
    const root = new FakeRoot(new FakeScroller('color-palette:title', 80, 12));
    const controller = new DesignerScrollContinuityController((work) => scheduled.push(work));
    const replacement = new FakeScroller('color-palette:title', 0, 0, 0, 0);

    controller.preserve(root as unknown as ShadowRoot, () => root.replace(replacement));

    expect(replacement.scrollTop).toBe(0);
    expect(replacement.scrollLeft).toBe(0);
    replacement.maxTop = 200;
    replacement.maxLeft = 40;
    scheduled[0]?.();
    expect(replacement.scrollTop).toBe(80);
    expect(replacement.scrollLeft).toBe(12);
  });

  it('carries the original target through repeated synchronous rerenders', () => {
    const scheduled: Array<() => void> = [];
    const root = new FakeRoot(new FakeScroller('color-palette:title', 80));
    const controller = new DesignerScrollContinuityController((work) => scheduled.push(work));
    const firstReplacement = new FakeScroller('color-palette:title', 0, 0, 0);
    const finalReplacement = new FakeScroller('color-palette:title', 0, 0, 0);

    controller.preserve(root as unknown as ShadowRoot, () => root.replace(firstReplacement));
    controller.preserve(root as unknown as ShadowRoot, () => root.replace(finalReplacement));
    finalReplacement.maxTop = 200;
    scheduled[0]?.();

    expect(scheduled).toHaveLength(1);
    expect(finalReplacement.scrollTop).toBe(80);
  });

  it('does not schedule a delayed write when synchronous restoration succeeds', () => {
    const scheduled: Array<() => void> = [];
    const root = new FakeRoot(new FakeScroller('data-source:component', 80));
    const controller = new DesignerScrollContinuityController((work) => scheduled.push(work));
    const replacement = new FakeScroller('data-source:component', 0);

    controller.preserve(root as unknown as ShadowRoot, () => root.replace(replacement));

    expect(replacement.scrollTop).toBe(80);
    expect(scheduled).toHaveLength(0);
  });

  it('does not transfer a position to a different semantic scope', () => {
    const scheduled: Array<() => void> = [];
    const root = new FakeRoot(new FakeScroller('color-palette:title', 80));
    const controller = new DesignerScrollContinuityController((work) => scheduled.push(work));
    const replacement = new FakeScroller('color-palette:background', 24);

    controller.preserve(root as unknown as ShadowRoot, () => root.replace(replacement));
    replacement.scrollTop = 32;
    scheduled[0]?.();

    expect(replacement.scrollTop).toBe(32);
  });

  it('invalidates a scheduled restore when disposed', () => {
    const scheduled: Array<() => void> = [];
    const root = new FakeRoot(new FakeScroller('data-source:component', 80));
    const controller = new DesignerScrollContinuityController((work) => scheduled.push(work));
    const replacement = new FakeScroller('data-source:component', 0, 0, 0);

    controller.preserve(root as unknown as ShadowRoot, () => root.replace(replacement));
    controller.dispose();
    replacement.maxTop = 200;
    scheduled[0]?.();

    expect(replacement.scrollTop).toBe(0);
  });
});

class FakeRoot {
  readonly ownerDocument = undefined;
  #scrollers: FakeScroller[];

  constructor(...scrollers: FakeScroller[]) {
    this.#scrollers = scrollers;
  }

  querySelectorAll(): readonly FakeScroller[] {
    return this.#scrollers;
  }

  replace(...scrollers: FakeScroller[]): void {
    this.#scrollers = scrollers;
  }
}

class FakeScroller {
  readonly dataset: { readonly designerScrollScope: string };
  maxTop: number;
  maxLeft: number;
  #scrollTop: number;
  #scrollLeft: number;

  constructor(scope: string, top: number, left = 0, maxTop = 1_000, maxLeft = 1_000) {
    this.dataset = { designerScrollScope: scope };
    this.maxTop = maxTop;
    this.maxLeft = maxLeft;
    this.#scrollTop = Math.min(top, maxTop);
    this.#scrollLeft = Math.min(left, maxLeft);
  }

  get scrollTop(): number {
    return this.#scrollTop;
  }

  set scrollTop(value: number) {
    this.#scrollTop = Math.min(value, this.maxTop);
  }

  get scrollLeft(): number {
    return this.#scrollLeft;
  }

  set scrollLeft(value: number) {
    this.#scrollLeft = Math.min(value, this.maxLeft);
  }
}
