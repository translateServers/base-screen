import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { renderDesignerEventsPanel } from './designer-blueprint-dom.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  disabled = false;
  textContent = '';
  type = '';

  constructor(readonly ownerDocument: FakeDocument) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
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

describe('renderDesignerEventsPanel', () => {
  it('disables Blueprint entry when the focused material has no declared event', () => {
    const ownerDocument = new FakeDocument();
    const panel = new FakeElement(ownerDocument);
    const catalog = {
      get: () => ({ manifest: { events: [] } }),
    } as unknown as BaseScreenMaterialCatalog;

    renderDesignerEventsPanel(
      panel as unknown as HTMLElement,
      document,
      { selectedComponentIds: ['component-1'], focusedComponentId: 'component-1' },
      catalog,
    );

    expect(panel.children[1]).toMatchObject({ disabled: true, textContent: '打开蓝图' });
  });
});
