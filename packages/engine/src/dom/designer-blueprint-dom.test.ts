import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { renderDesignerEventsPanel } from './designer-blueprint-dom.js';

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
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'component-1',
      type: 'base.text',
      name: '文本',
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
  blueprint: { rules: [] },
};

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function capabilityIndex(...capabilities: string[]): BaseScreenRuntimeContributionIndex {
  const available = new Set(capabilities);
  return {
    getResourceType: () => undefined,
    hasBlueprintCapability: (capability) => available.has(capability),
  };
}

describe('renderDesignerEventsPanel', () => {
  it('R10 disables Blueprint entry when the focused material has no declared event', () => {
    const ownerDocument = new FakeDocument();
    const panel = new FakeElement('div', ownerDocument);
    const catalog = {
      get: () => ({ manifest: { events: [] } }),
    } as unknown as BaseScreenMaterialCatalog;

    renderDesignerEventsPanel(
      panel as unknown as HTMLElement,
      document,
      { selectedComponentIds: ['component-1'], focusedComponentId: 'component-1' },
      catalog,
      undefined,
      undefined,
    );

    expect(panel.children[1]).toMatchObject({ disabled: true, textContent: '打开蓝图' });
  });

  it('R10 lists focused manifest events and their related canonical rules', () => {
    const ownerDocument = new FakeDocument();
    const panel = new FakeElement('div', ownerDocument);
    const catalog = {
      get: () => ({ manifest: { events: ['click', 'change'] } }),
    } as unknown as BaseScreenMaterialCatalog;
    const populated: ScreenDocument = {
      ...document,
      blueprint: {
        rules: [
          {
            id: 'rule-1',
            trigger: { type: 'material-event', componentId: 'component-1', eventName: 'click' },
            actions: [],
          },
        ],
      },
    };

    renderDesignerEventsPanel(
      panel as unknown as HTMLElement,
      populated,
      { selectedComponentIds: ['component-1'], focusedComponentId: 'component-1' },
      catalog,
      'change',
      capabilityIndex('blueprint.trigger.material-event'),
    );

    expect(
      descendants(panel).find((element) => element.dataset.blueprintEvent === 'true'),
    ).toMatchObject({
      disabled: false,
    });
    expect(
      descendants(panel)
        .filter((element) => element.tagName === 'li')
        .map((element) => element.textContent),
    ).toEqual(['click：1 条规则', 'change：0 条规则']);
  });
});
