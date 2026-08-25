import { describe, expect, it } from 'vitest';
import { applyDesignerInspectorFilters } from '../../../src/browser/dom/designer-inspector-chrome-dom.js';

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Set<string>();
  ariaPressed = 'false';
  hidden = false;
  textContent = '';

  toggleAttribute(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.attributes.has(name);
    if (enabled) this.attributes.add(name);
    else this.attributes.delete(name);
    return enabled;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
}

class FakeDetails extends FakeElement {
  open = false;
}

class FakeSection extends FakeElement {
  readonly details = new FakeDetails();

  constructor() {
    super();
    this.dataset.inspectorSearchKind = 'section';
    this.dataset.inspectorSearchKey = 'descriptor-section-advanced';
    this.dataset.inspectorSearchText = '高级 标签旋转';
  }

  querySelector<T>(selector: string): T | null {
    return (selector === 'details' ? this.details : null) as T | null;
  }

  querySelectorAll<T>(): T[] {
    return [];
  }
}

class FakeRoot {
  readonly inspector = new FakeElement();
  readonly advanced = new FakeElement();
  readonly basic = new FakeElement();
  readonly all = new FakeElement();
  readonly section = new FakeSection();

  constructor() {
    this.basic.dataset.inspectorDensity = 'basic';
    this.all.dataset.inspectorDensity = 'all';
  }

  querySelector<T>(selector: string): T | null {
    if (selector === '[data-right-panel]') return this.inspector as T;
    return null;
  }

  querySelectorAll<T>(selector: string): T[] {
    if (selector === '[data-inspector-advanced]') return [this.advanced] as T[];
    if (selector === '[data-inspector-density]') return [this.basic, this.all] as T[];
    if (selector === '[data-inspector-search-kind="section"]') return [this.section] as T[];
    if (selector === '.designer-inspector-section, [data-inspector-search-section]') {
      return [this.section] as T[];
    }
    return [];
  }
}

describe('designer inspector density state', () => {
  it('persists basic density on the panel and temporarily reveals advanced content for search', () => {
    const root = new FakeRoot();

    applyDesignerInspectorFilters(root as unknown as HTMLElement, { density: 'basic', query: '' });
    expect(root.inspector.dataset.inspectorDensity).toBe('basic');
    expect(root.inspector.hasAttribute('data-inspector-searching')).toBe(false);
    expect(root.advanced.hidden).toBe(true);
    expect(root.basic.ariaPressed).toBe('true');
    expect(root.all.ariaPressed).toBe('false');

    applyDesignerInspectorFilters(root as unknown as HTMLElement, {
      density: 'basic',
      query: '高级',
    });
    expect(root.inspector.hasAttribute('data-inspector-searching')).toBe(true);
    expect(root.advanced.hidden).toBe(false);
    expect(root.section.details.open).toBe(true);
    expect(root.section.details.dataset.inspectorSearchWasOpen).toBe('false');

    applyDesignerInspectorFilters(root as unknown as HTMLElement, { density: 'all', query: '' });
    expect(root.inspector.dataset.inspectorDensity).toBe('all');
    expect(root.inspector.hasAttribute('data-inspector-searching')).toBe(false);
    expect(root.advanced.hidden).toBe(false);
    expect(root.section.details.open).toBe(false);
    expect(root.section.details.dataset.inspectorSearchWasOpen).toBeUndefined();
    expect(root.basic.ariaPressed).toBe('false');
    expect(root.all.ariaPressed).toBe('true');
  });

  it('preserves an already-open section after a temporary search expansion', () => {
    const root = new FakeRoot();
    root.section.details.open = true;

    applyDesignerInspectorFilters(root as unknown as HTMLElement, {
      density: 'basic',
      query: '标签旋转',
    });
    expect(root.section.details.open).toBe(true);
    expect(root.section.details.dataset.inspectorSearchWasOpen).toBe('true');

    applyDesignerInspectorFilters(root as unknown as HTMLElement, { density: 'basic', query: '' });
    expect(root.section.details.open).toBe(true);
    expect(root.section.details.dataset.inspectorSearchWasOpen).toBeUndefined();
  });

  it('matches searchable section content without replacing its concise result label', () => {
    const root = new FakeRoot();
    root.section.dataset.inspectorSearchText = '交互事件';
    root.section.textContent = '动作触发条件 无条件，事件触发后直接执行';

    applyDesignerInspectorFilters(root as unknown as HTMLElement, {
      density: 'all',
      query: '触发条件',
    });

    expect(root.section.hasAttribute('data-inspector-filtered')).toBe(false);
    expect(root.section.details.open).toBe(true);
    expect(root.section.dataset.inspectorSearchText).toBe('交互事件');
  });
});
