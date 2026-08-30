import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerDataFlowScrollSync } from '../../../../src/browser/controllers/dataset/designer-data-flow-scroll-sync.js';

afterEach(() => vi.useRealTimers());

describe('DesignerDataFlowScrollSync', () => {
  it('tracks the nearest section and the scroll boundaries', () => {
    const steps: string[] = [];
    const surface = createSurface();
    const sync = new DesignerDataFlowScrollSync((step) => steps.push(step));

    sync.bind(surface.panel);
    expect(steps).toEqual(['source']);

    surface.content.scrollTop = 200;
    surface.sections.source.top = -180;
    surface.sections.mapping.top = 40;
    surface.sections.preview.top = 520;
    surface.content.dispatchScroll();
    expect(steps.at(-1)).toBe('mapping');

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
    sync.beginProgrammaticScroll('mapping');
    replacement.content.scrollTop = 600;
    sync.bind(replacement.panel);
    expect(steps).toEqual(['source']);

    replacement.content.scrollTop = 200;
    replacement.sections.source.top = -180;
    replacement.sections.mapping.top = 40;
    replacement.sections.preview.top = 520;
    replacement.content.dispatchScroll();
    expect(steps.at(-1)).toBe('mapping');

    replacement.content.scrollTop = 600;
    replacement.content.dispatchScroll();
    expect(steps.at(-1)).toBe('mapping');

    vi.advanceTimersByTime(700);
    expect(steps.at(-1)).toBe('preview');
  });
});

function createSurface(): {
  readonly panel: HTMLElement;
  readonly content: FakeContent;
  readonly sections: Readonly<Record<'source' | 'mapping' | 'preview', FakeSection>>;
} {
  const sections = {
    source: new FakeSection('source', 0),
    mapping: new FakeSection('mapping', 260),
    preview: new FakeSection('preview', 720),
  };
  const content = new FakeContent(Object.values(sections));
  const panel = {
    querySelector: (selector: string) => {
      if (selector === '.designer-datav-data-flow-content') return content;
      if (selector === '.designer-datav-data-flow-progress') return {};
      if (selector === '.designer-datav-data-flow') return {};
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

  constructor(
    step: 'source' | 'mapping' | 'preview',
    public top: number,
  ) {
    this.dataset = { workbenchSection: step };
  }

  getBoundingClientRect(): Pick<DOMRect, 'top'> {
    return { top: this.top };
  }
}
