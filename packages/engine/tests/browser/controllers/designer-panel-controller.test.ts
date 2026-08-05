import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerPanelController } from '../../../src/browser/controllers/designer-panel-controller.js';
import {
  renderDesignerDataPanel,
  renderDesignerProperties,
} from '../../../src/browser/dom/designer-panel-dom.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  checked = false;
  hidden = false;
  selected = false;
  textContent = '';
  type = '';
  value = '';

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(): void {}

  setAttribute(): void {}

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    this.textContent = '';
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeInput {
  readonly dataset: Record<string, string>;

  constructor(
    property: string,
    readonly value: string,
  ) {
    this.dataset = { property };
  }

  closest(): null {
    return null;
  }
}

function document(
  dataSource: ScreenDocument['components'][number]['dataSource'] = null,
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'label-1',
        type: 'base.label',
        name: 'Label',
        parentId: null,
        position: { x: 10, y: 20 },
        size: { width: 100, height: 40 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: { title: 'Status' },
        style: { color: '#ffffff' },
        dataSource,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () =>
      ({
        manifest: {
          dataCapabilities: ['static', 'host-resource'],
          propertyPanel: [{ prop: 'title', label: 'Title', control: 'text' }],
          propsSchema: {
            kind: 'object',
            properties: { title: { kind: 'string' } },
            required: ['title'],
          },
          stylePanel: [{ style: 'color', label: 'Color', control: 'color' }],
          styleSchema: {
            kind: 'object',
            properties: { color: { kind: 'string' } },
            required: ['color'],
          },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

function resourceAuthority(): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'asset'
        ? {
            kind: 'dataResourceType',
            id: 'asset',
            name: '资源',
            configSchema: { kind: 'object', properties: {}, required: [] },
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

afterEach(() => vi.unstubAllGlobals());

describe('designer panel rendering', () => {
  it('renders canvas settings when no component is selected', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: [], focusedComponentId: null },
      catalog(),
    );

    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'input')
        .map((element) => element.dataset.canvasProperty),
    ).toEqual(['width', 'height', 'backgroundColor']);
  });

  it('renders focused geometry and status controls', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
    );

    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'input')
        .map((element) => element.dataset.property),
    ).toEqual([
      'name',
      'x',
      'y',
      'width',
      'height',
      'rotation',
      'zIndex',
      'locked',
      'hidden',
      undefined,
      undefined,
    ]);
    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'h3')
        .map((element) => element.textContent),
    ).toEqual(['几何', '状态', '内容', '样式']);
    expect(descendants(properties).find((element) => element.dataset.prop === 'title')?.value).toBe(
      'Status',
    );
  });

  it('renders no material properties for a multi-selection', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: ['label-1', 'label-2'], focusedComponentId: 'label-1' },
      catalog(),
    );

    expect(descendants(properties).some((element) => element.dataset.prop !== undefined)).toBe(
      false,
    );
    expect(properties.children[0]?.textContent).toBe('已选择 2 个组件。');
  });

  it('R9 keeps static sources available and requires host support plus contribution authority', () => {
    const ownerDocument = new FakeDocument();
    const withoutHost = ownerDocument.createElement('div');
    const withHost = ownerDocument.createElement('div');
    const staticDocument = document({ type: 'static', value: { status: 'ready' } });

    renderDesignerDataPanel(
      withoutHost as unknown as HTMLElement,
      staticDocument,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
      false,
      undefined,
    );
    renderDesignerDataPanel(
      withHost as unknown as HTMLElement,
      staticDocument,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
      true,
      resourceAuthority(),
    );

    expect(
      descendants(withoutHost)
        .filter((element) => element.tagName === 'option')
        .map((element) => element.value),
    ).toEqual(['none', 'static']);
    expect(
      descendants(withoutHost).some((element) => element.dataset.dataSourceField === 'static'),
    ).toBe(true);
    expect(
      descendants(withHost)
        .filter((element) => element.tagName === 'option')
        .map((element) => element.value),
    ).toEqual(['none', 'static', 'host-resource']);
  });
});

describe('DesignerPanelController property drafts', () => {
  it('emits a stable diagnostic for an invalid draft without executing a transaction', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const transactions: unknown[] = [];
    const diagnostics: unknown[] = [];
    const controller = new DesignerPanelController({
      emitDiagnostics: (value) => diagnostics.push(value),
      executeCommand: () => ({ ok: true, value: document(), diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return { ok: true, value: document(), diagnostics: [] };
      },
      getCatalog: catalog,
      getDocument: document,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });

    controller.onPropertyChange({
      target: new FakeInput('width', 'not-a-number'),
    } as unknown as Event);

    expect(transactions).toEqual([]);
    expect(diagnostics).toEqual([
      [
        {
          severity: 'error',
          code: 'CORE_COMMAND_INVALID',
          path: [],
          message: '字段值无效，未保存修改。',
        },
      ],
    ]);
  });
});
