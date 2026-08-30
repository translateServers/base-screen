import { describe, expect, it } from 'vitest';
import { renderMaterialLibraryGroupNavigation } from '../../../../src/browser/dom/material-library/designer-material-library-group-dom.js';
import { parseBaseScreenMaterialLibraryGrouping } from '../../../../src/common/operations/material-library/material-library-grouping.js';

interface FakeWheelEvent {
  deltaX?: number;
  deltaY?: number;
  deltaMode?: number;
  preventDefault?: () => void;
}

// 分组导航的滚动可用性依赖布局测量（scrollWidth/clientWidth/scrollLeft）。
// 节点环境没有布局引擎，用按标签共享 metrics 的假元素驱动溢出/未溢出两种场景。
class FakeElement {
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, ((event: FakeWheelEvent) => void)[]>();
  className = '';
  hidden = false;
  textContent = '';
  type = '';
  ariaLabel = '';
  ariaPressed = '';
  scrollLeft = 0;

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tagName: string,
  ) {}

  get scrollWidth(): number {
    return this.tagName === 'div' ? this.ownerDocument.metrics.scrollWidth : 0;
  }

  get clientWidth(): number {
    return this.tagName === 'div' ? this.ownerDocument.metrics.clientWidth : 0;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, listener: (event: FakeWheelEvent) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, event: FakeWheelEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeDocument {
  metrics = { scrollWidth: 0, clientWidth: 0 };

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

function createLayout() {
  const document = new FakeDocument();
  const navigation = new FakeElement(document, 'nav');
  const layout = {
    querySelector: (selector: string) =>
      selector === '[data-material-groups]' ? navigation : null,
  };
  return { document, navigation, layout: layout as unknown as ParentNode };
}

function grouping() {
  const parsed = parseBaseScreenMaterialLibraryGrouping({
    groups: [
      {
        id: 'data',
        label: 'Data',
        children: [
          { id: 'charts', label: 'Charts', materialTypes: ['base.chart'] },
          { id: 'tables', label: 'Tables', materialTypes: ['base.table'] },
        ],
      },
      { id: 'foundation', label: 'Foundation', materialTypes: ['base.text'] },
    ],
  });
  if (!parsed.ok) throw new Error('Fixture grouping must parse.');
  return parsed.value;
}

describe('renderMaterialLibraryGroupNavigation scroll affordance', () => {
  it('keeps edge fades off and ignores the wheel when the content fits', () => {
    const { document, navigation, layout } = createLayout();
    document.metrics = { scrollWidth: 200, clientWidth: 200 };
    renderMaterialLibraryGroupNavigation(layout, grouping(), undefined);

    const [breadcrumbs, groups] = navigation.children;
    expect(breadcrumbs?.dataset).toEqual({ scrollStart: 'false', scrollEnd: 'false' });
    expect(groups?.dataset).toEqual({ scrollStart: 'false', scrollEnd: 'false' });

    let prevented = 0;
    groups?.emit('wheel', {
      deltaY: 120,
      deltaX: 0,
      deltaMode: 0,
      preventDefault: () => prevented++,
    });
    expect(prevented).toBe(0);
    expect(groups?.scrollLeft).toBe(0);
  });

  it('flags only the overflowing edge and follows scroll position updates', () => {
    const { document, navigation, layout } = createLayout();
    document.metrics = { scrollWidth: 300, clientWidth: 100 };
    renderMaterialLibraryGroupNavigation(layout, grouping(), undefined);

    const groups = navigation.children[1];
    expect(groups?.dataset).toEqual({ scrollStart: 'false', scrollEnd: 'true' });

    groups!.scrollLeft = 200;
    groups?.emit('scroll');
    expect(groups?.dataset).toEqual({ scrollStart: 'true', scrollEnd: 'false' });

    groups!.scrollLeft = 120;
    groups?.emit('scroll');
    expect(groups?.dataset).toEqual({ scrollStart: 'true', scrollEnd: 'true' });
  });

  it('maps vertical wheel deltas to horizontal scrolling and releases at the edges', () => {
    const { document, navigation, layout } = createLayout();
    document.metrics = { scrollWidth: 300, clientWidth: 100 };
    renderMaterialLibraryGroupNavigation(layout, grouping(), undefined);
    const groups = navigation.children[1]!;

    let prevented = 0;
    const wheel = (event: FakeWheelEvent) =>
      groups.emit('wheel', {
        deltaMode: 0,
        deltaX: 0,
        ...event,
        preventDefault: () => prevented++,
      });

    wheel({ deltaY: 120 });
    expect(groups.scrollLeft).toBe(120);
    expect(prevented).toBe(1);
    groups.emit('scroll');
    expect(groups.dataset).toEqual({ scrollStart: 'true', scrollEnd: 'true' });

    // 已到右端：继续向下滚动不再拦截，事件沿滚动链交给外层容器。
    groups.scrollLeft = 200;
    wheel({ deltaY: 120 });
    expect(groups.scrollLeft).toBe(200);
    expect(prevented).toBe(1);

    // 左端向上滚动同样放行；水平占优的滚轮事件保持原生行为。
    groups.scrollLeft = 0;
    wheel({ deltaY: -120 });
    wheel({ deltaY: 40, deltaX: 80 });
    expect(groups.scrollLeft).toBe(0);
    expect(prevented).toBe(1);

    // 行滚动（deltaMode=1）按行高换算，页滚动（deltaMode=2）按可视宽度换算。
    wheel({ deltaY: 3, deltaMode: 1 });
    expect(groups.scrollLeft).toBe(48);
    wheel({ deltaY: 1, deltaMode: 2 });
    expect(groups.scrollLeft).toBe(148);
    expect(prevented).toBe(3);
  });

  it('reveals the current level in overflowing breadcrumbs after drilling down', () => {
    const { document, navigation, layout } = createLayout();
    document.metrics = { scrollWidth: 300, clientWidth: 100 };
    renderMaterialLibraryGroupNavigation(layout, grouping(), 'charts');

    const [breadcrumbs] = navigation.children;
    expect(breadcrumbs?.scrollLeft).toBe(200);
    expect(breadcrumbs?.dataset).toEqual({ scrollStart: 'true', scrollEnd: 'false' });
  });

  it('hides the navigation and drops previous rows when the grouping is removed', () => {
    const { document, navigation, layout } = createLayout();
    document.metrics = { scrollWidth: 300, clientWidth: 100 };
    renderMaterialLibraryGroupNavigation(layout, grouping(), undefined);
    expect(navigation.children.length).toBeGreaterThan(0);

    renderMaterialLibraryGroupNavigation(layout, undefined, undefined);
    expect(navigation.hidden).toBe(true);
    expect(navigation.children).toEqual([]);
  });
});
