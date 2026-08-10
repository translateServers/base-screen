import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  getDesignerFocusedEventDescriptors,
  getDesignerFocusedMaterialEvents,
  renderDesignerEventsPanel,
} from '../../../src/browser/dom/designer-blueprint-dom.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  checked = false;
  className = '';
  disabled = false;
  selected = false;
  textContent = '';
  title = '';
  type = '';
  value = '';

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    this.textContent = '';
  }

  setAttribute(): void {}

  querySelector<T>(selector: string): T | null {
    const match = /^\[data-([a-z-]+)="([^"]*)"\]$/.exec(selector);
    if (match === null) return null;
    const [, key, expected] = match;
    const keyName = (key ?? '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const found = descendants(this).find((item) => item.dataset[keyName] === expected);
    return (found ?? null) as T | null;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

function panelElement(): FakeElement {
  return new FakeDocument().createElement('div');
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function queryText(element: FakeElement): string {
  return [element, ...descendants(element)]
    .map((item) => item.textContent)
    .join(' ')
    .replace(/\s+/g, ' ');
}

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'chart-1',
      type: 'base.chart',
      name: '图表',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    },
  ],
  variables: [],
  blueprint: {
    rules: [
      {
        id: 'r1',
        trigger: { type: 'material-event', componentId: 'chart-1', eventName: 'seriesClick' },
        actions: [],
      },
    ],
  },
};

function authority(...capabilities: string[]): BaseScreenRuntimeContributionIndex {
  const granted = new Set(capabilities);
  return {
    getResourceType: () => undefined,
    hasBlueprintCapability: (capability) => granted.has(capability),
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => ({
      manifest: {
        events: ['seriesClick'],
        editorDescriptor: {
          events: [
            {
              name: 'seriesClick',
              label: '系列点击',
              hint: '点击数据点',
              requiredCapability: 'blueprint.trigger.material-event',
            },
          ],
        },
      },
    }),
  } as unknown as BaseScreenMaterialCatalog;
}

describe('EB-R7-C03 events panel summary and capability state', () => {
  it('renders event summaries with descriptor labels and hints', () => {
    const panel = panelElement();
    renderDesignerEventsPanel(
      panel as unknown as HTMLElement,
      document,
      { selectedComponentIds: ['chart-1'], focusedComponentId: 'chart-1' },
      catalog(),
      authority('blueprint.trigger.material-event'),
    );
    expect(queryText(panel)).toContain('系列点击');
    expect(queryText(panel)).toContain('点击数据点');
    expect(queryText(panel)).toContain('1');
  });

  it('marks required capability state fail closed', () => {
    const panel = panelElement();
    renderDesignerEventsPanel(
      panel as unknown as HTMLElement,
      document,
      { selectedComponentIds: ['chart-1'], focusedComponentId: 'chart-1' },
      catalog(),
      authority('unrelated'),
    );
    expect(queryText(panel)).toContain('能力不可用');
  });

  it('exposes structured event declarations and the raw event list', () => {
    const interaction = { selectedComponentIds: ['chart-1'], focusedComponentId: 'chart-1' };
    expect(getDesignerFocusedMaterialEvents(document, interaction, catalog())).toEqual([
      'seriesClick',
    ]);
    expect(getDesignerFocusedEventDescriptors(document, interaction, catalog())).toHaveLength(1);
  });

  it('keeps the internal surface to summary, capability and request entry', () => {
    const panel = panelElement();
    renderDesignerEventsPanel(
      panel as unknown as HTMLElement,
      document,
      { selectedComponentIds: ['chart-1'], focusedComponentId: 'chart-1' },
      catalog(),
      authority('blueprint.trigger.material-event'),
    );
    expect(panel.querySelector('[data-action="open-blueprint"]')).not.toBeNull();
    expect(panel.querySelector('[data-blueprint-graph="true"]')).toBeNull();
    expect(panel.querySelector('[data-blueprint-expression="action"]')).toBeNull();
    expect(panel.querySelector('[data-blueprint-add-action="set-variable"]')).toBeNull();
  });
});
