import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerDataFlowScrollSync } from '../../../../src/browser/controllers/dataset/designer-data-flow-scroll-sync.js';

afterEach(() => vi.useRealTimers());

describe('DesignerDataFlowScrollSync', () => {
  it('tracks the section container and the scroll boundaries', () => {
    const steps: string[] = [];
    const surface = createSurface();
    const sync = new DesignerDataFlowScrollSync((step) => steps.push(step));

    sync.bind(surface.panel);
    expect(steps).toEqual(['source']);

    // 派生的锚点是**段容器**（`[data-ds-section]`），不是段内内容：折叠后内容 rect 全 0，
    // 但容器顶边稳定。「字段映射」不再有独立段——它是 `source` 段内的组，所以这一步是 source。
    surface.content.scrollTop = 200;
    surface.content.dispatchScroll();
    expect(steps.at(-1)).toBe('source');

    surface.content.scrollTop = 600;
    surface.content.dispatchScroll();
    expect(steps.at(-1)).toBe('preview');
  });

  it('preserves a programmatic target while binding replacement content', () => {
    vi.useFakeTimers();
    const steps: string[] = [];
    const initial = createSurface();
    const replacement = createSurface();
    const sync = new DesignerDataFlowScrollSync((step) => steps.push(step));

    sync.bind(initial.panel);
    sync.beginProgrammaticScroll('source');
    replacement.content.scrollTop = 600;
    sync.bind(replacement.panel);
    expect(steps).toEqual(['source']);

    // 程序化目标期间，实际位置派生出别的步骤会被压住（这里位置本身就是 source）。
    replacement.content.scrollTop = 200;
    replacement.content.dispatchScroll();
    expect(steps.at(-1)).toBe('source');

    replacement.content.scrollTop = 600;
    replacement.content.dispatchScroll();
    expect(steps.at(-1)).toBe('source');

    vi.advanceTimersByTime(700);
    expect(steps.at(-1)).toBe('preview');
  });
});

function createSurface(): {
  readonly panel: HTMLElement;
  readonly content: FakeContent;
  readonly sections: Readonly<Record<'value' | 'source' | 'host-link' | 'preview', FakeSection>>;
} {
  // 五个段 key 冻结；这里只造派生会用到的四个（authoring 在预览之后，不影响断言）。
  const sections = {
    value: new FakeSection('value', 0),
    source: new FakeSection('source', 260),
    'host-link': new FakeSection('host-link', 400),
    preview: new FakeSection('preview', 720),
  };
  const content = new FakeContent(Object.values(sections));
  const panel = {
    querySelector: (selector: string) => {
      if (selector === '.designer-inspector-data-flow-content') return content;
      if (selector === '.designer-inspector-data-flow-progress') return {};
      if (selector === '.designer-inspector-data-flow') return {};
      return null;
    },
  } as unknown as HTMLElement;
  return { panel, content, sections };
}

class FakeContent {
  readonly clientHeight = 400;
  readonly scrollHeight = 1_000;
  scrollTop = 0;
  #scrollHandler: (() => void) | undefined;

  constructor(private readonly sections: readonly FakeSection[]) {}

  querySelectorAll(): readonly FakeSection[] {
    return this.sections;
  }

  addEventListener(type: string, handler: () => void): void {
    if (type === 'scroll') this.#scrollHandler = handler;
  }

  removeEventListener(type: string, handler: () => void): void {
    if (type === 'scroll' && this.#scrollHandler === handler) this.#scrollHandler = undefined;
  }

  getBoundingClientRect(): Pick<DOMRect, 'height' | 'top'> {
    return { height: this.clientHeight, top: 0 };
  }

  dispatchScroll(): void {
    this.#scrollHandler?.();
  }
}

class FakeSection {
  readonly dataset: DOMStringMap;
  /** 段容器顶边：折叠不会让它失真，所以派生只读它（不读内容 rect）。 */
  readonly offsetTop: number;

  constructor(key: 'value' | 'source' | 'host-link' | 'preview', top: number) {
    this.dataset = { dsSection: key };
    this.offsetTop = top;
  }
}
