import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  getDesignerInteractionCapabilities,
  renderDesignerInteractionPanel,
} from '../../../src/browser/dom/designer-interaction-dom.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  className = '';
  textContent = '';

  constructor(readonly ownerDocument: FakeDocument) {}

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
      id: 'text-1',
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

function catalog(designCapabilities: {
  readonly resize: boolean;
  readonly rotate: boolean;
  readonly children: boolean;
}): BaseScreenMaterialCatalog {
  return {
    get: () => ({ manifest: { designCapabilities, events: ['click'] } }),
  } as unknown as BaseScreenMaterialCatalog;
}

function authority(granted: boolean): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: () => undefined,
    hasBlueprintCapability: () => granted,
  };
}

describe('designer interaction projection', () => {
  it('R9 projects manifest design behavior without creating private interaction controls', () => {
    const ownerDocument = new FakeDocument();
    const panel = new FakeElement(ownerDocument);

    const available = renderDesignerInteractionPanel(
      panel as unknown as HTMLElement,
      document,
      { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] },
      catalog({ resize: true, rotate: false, children: false }),
      undefined,
    );

    expect(available).toBe(true);
    expect(
      getDesignerInteractionCapabilities(
        document,
        { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] },
        catalog({ resize: true, rotate: false, children: false }),
        undefined,
      ),
    ).toEqual({ design: ['调整大小'], previewEvents: [] });
    expect(panel.children).toHaveLength(1);
    expect(panel.children[0]?.children[0]?.textContent).toBe('设计');
  });

  it('R9 exposes preview events only when the current authority grants them', () => {
    const interaction = { focusedComponentId: 'text-1', selectedComponentIds: ['text-1'] };
    const materialCatalog = catalog({ resize: false, rotate: false, children: false });

    expect(
      getDesignerInteractionCapabilities(document, interaction, materialCatalog, authority(false)),
    ).toEqual({ design: [], previewEvents: [] });
    expect(
      getDesignerInteractionCapabilities(document, interaction, materialCatalog, authority(true)),
    ).toEqual({ design: [], previewEvents: ['click'] });

    const ownerDocument = new FakeDocument();
    const panel = new FakeElement(ownerDocument);
    expect(
      renderDesignerInteractionPanel(
        panel as unknown as HTMLElement,
        document,
        interaction,
        materialCatalog,
        authority(false),
      ),
    ).toBe(false);
    expect(panel.textContent).toBe('当前组件没有公开交互能力。');
  });
});
