import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  createDesignerLayerView,
  DESIGNER_LAYER_PAGE_SIZE,
  filterDesignerLayerItems,
  renderDesignerLayers,
} from '../../../src/browser/dom/designer-layers-dom.js';

class FakeElement {
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> & {
    setProperty?: (name: string, value: string) => void;
  } = {};
  ariaCurrent = '';
  ariaLabel = '';
  ariaLevel = '';
  ariaPressed = '';
  ariaSelected = '';
  className = '';
  disabled = false;
  draggable = false;
  placeholder = '';
  textContent = '';
  type = '';
  value = '';

  constructor(readonly ownerDocument: FakeDocument) {
    this.style.setProperty = (name: string, value: string) => {
      this.style[name] = value;
    };
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

function component(
  id: string,
  parentId: string | null,
  zIndex: number,
  hidden = false,
): ScreenComponentNode {
  return {
    id,
    parentId,
    zIndex,
    type: `${id}.material`,
    name: id,
    position: { x: 0, y: 0 },
    size: { width: 10, height: 10 },
    rotation: 0,
    status: { hidden, locked: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

function toolbarState() {
  return {
    arrange: { front: false, up: false, down: false, back: false },
    group: false,
    ungroup: false,
  } as const;
}

describe('designer layers view', () => {
  it('uses canonical painter order and preserves missing-material nodes with diagnostics', () => {
    const view = createDesignerLayerView(
      document([
        component('root', null, 1, true),
        component('child', 'root', 0),
        component('back', null, 0),
      ]),
      undefined,
    );

    expect(view.items.map((item) => [item.id, item.depth, item.hidden])).toEqual([
      ['root', 0, true],
      ['child', 1, true],
      ['back', 0, false],
    ]);
    expect(view.items).toHaveLength(3);
    expect(view.diagnostics).toHaveLength(3);
  });

  it('R6 filters through collapsed branches and searches with canonical ancestor context', () => {
    const view = createDesignerLayerView(
      document([
        component('back', null, 0),
        component('container', null, 1),
        component('target', 'container', 0),
        component('grandchild', 'target', 0),
      ]),
      undefined,
    );

    expect(
      filterDesignerLayerItems(view.items, '', new Set(['container'])).map((item) => item.id),
    ).toEqual(['container', 'back']);
    expect(
      filterDesignerLayerItems(view.items, 'target', new Set(['container'])).map((item) => item.id),
    ).toEqual(['container', 'target', 'grandchild']);
    expect(view.items.map((item) => item.id)).toEqual([
      'container',
      'target',
      'grandchild',
      'back',
    ]);
  });

  it('R8 exposes selected, focused, hidden, locked, and drop-target states beyond color', () => {
    const ownerDocument = new FakeDocument();
    const layers = new FakeElement(ownerDocument);
    const view = createDesignerLayerView(
      document([component('container', null, 0, true), component('child', 'container', 0)]),
      undefined,
    );
    const lockedView = {
      ...view,
      items: view.items.map((item) => (item.id === 'container' ? { ...item, locked: true } : item)),
    };

    renderDesignerLayers(layers as unknown as HTMLElement, lockedView, {
      interaction: { selectedComponentIds: ['container'], focusedComponentId: 'container' },
      search: '',
      collapsed: new Set(),
      dropTargetId: 'container',
      renameDrafts: new Map([['container', '本地草稿']]),
      renamingId: 'container',
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const tree = layers.children[1]!;
    const row = tree.children[0]!;
    expect(row.ariaSelected).toBe('true');
    expect(row.ariaCurrent).toBe('true');
    expect(row.attributes['aria-description']).toBe('已隐藏，已锁定，已选中，当前焦点，放置目标');
    expect(row.dataset.renaming).toBe('true');
    expect(row.dataset.layerSelectable).toBeUndefined();
    expect(row.draggable).toBe(false);
    // 不渲染可见状态芯片：隐藏/锁定由常驻的警示色开关图标表达（aria-pressed），
    // 完整状态在 aria-description 中（见上方断言）。
    expect(row.children.find((child) => child.className === 'layer-state')).toBeUndefined();
    const actions = row.children.find((child) => child.className === 'layer-actions');
    expect(actions?.children.map((control) => control.ariaPressed)).toEqual([
      '',
      'true',
      'true',
      '',
      '',
    ]);
    expect(row.children.find((child) => child.dataset.layerSelect === 'container')?.disabled).toBe(
      true,
    );
    const toolbar = layers.children[0]!.children[0]!;
    expect(toolbar.attributes.role).toBe('toolbar');
    expect(toolbar.children.filter((child) => child.type === 'button')).toHaveLength(6);
    expect(row.children.find((child) => child.dataset.layerRename === 'container')?.value).toBe(
      '本地草稿',
    );
  });

  it('R8 renders the rename input only while renaming and hides the name button in that mode', () => {
    const ownerDocument = new FakeDocument();
    const layers = new FakeElement(ownerDocument);
    const view = createDesignerLayerView(document([component('container', null, 0)]), undefined);

    renderDesignerLayers(layers as unknown as HTMLElement, view, {
      interaction: { selectedComponentIds: [], focusedComponentId: null },
      search: '',
      collapsed: new Set(),
      dropTargetId: undefined,
      renameDrafts: new Map(),
      renamingId: undefined,
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const idleRow = layers.children[1]!.children[0]!;
    expect(idleRow.dataset.renaming).toBeUndefined();
    expect(idleRow.dataset.layerSelectable).toBe('true');
    expect(idleRow.children.find((child) => child.dataset.layerRename)).toBeUndefined();
    const idleSelect = idleRow.children.find((child) => child.dataset.layerSelect !== undefined);
    expect(
      idleSelect?.children.find((child) => child.className === 'layer-name')?.textContent,
    ).toBe('container');

    renderDesignerLayers(layers as unknown as HTMLElement, view, {
      interaction: { selectedComponentIds: [], focusedComponentId: null },
      search: '',
      collapsed: new Set(),
      dropTargetId: undefined,
      renameDrafts: new Map(),
      renamingId: 'container',
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const renamingRow = layers.children[1]!.children[0]!;
    expect(renamingRow.dataset.renaming).toBe('true');
    expect(
      renamingRow.children.find((child) => child.dataset.layerRename === 'container')?.value,
    ).toBe('container');
  });

  it('keeps locked layers selectable while disabling drag and rename affordances', () => {
    const ownerDocument = new FakeDocument();
    const layers = new FakeElement(ownerDocument);
    const view = createDesignerLayerView(document([component('locked', null, 0)]), undefined);
    const lockedView = {
      ...view,
      items: view.items.map((item) => ({ ...item, locked: true })),
    };

    renderDesignerLayers(layers as unknown as HTMLElement, lockedView, {
      interaction: { selectedComponentIds: [], focusedComponentId: null },
      search: '',
      collapsed: new Set(),
      dropTargetId: undefined,
      renameDrafts: new Map(),
      renamingId: undefined,
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => false,
    });

    const row = layers.children[1]!.children[0]!;
    const select = row.children.find((child) => child.dataset.layerSelect === 'locked');
    expect(row.dataset.layerSelectable).toBe('true');
    expect(row.draggable).toBe(false);
    expect(select?.disabled).toBe(false);
  });

  it('R6 renders large layer trees in stable pages with an explicit continuation control', () => {
    const ownerDocument = new FakeDocument();
    const layers = new FakeElement(ownerDocument);
    const view = createDesignerLayerView(
      document(
        Array.from({ length: DESIGNER_LAYER_PAGE_SIZE + 1 }, (_, index) =>
          component(`layer-${index}`, null, index),
        ),
      ),
      undefined,
    );

    renderDesignerLayers(layers as unknown as HTMLElement, view, {
      interaction: { selectedComponentIds: [], focusedComponentId: null },
      search: '',
      collapsed: new Set(),
      dropTargetId: undefined,
      renameDrafts: new Map(),
      renamingId: undefined,
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const tree = layers.children[1]!;
    expect(tree.children).toHaveLength(DESIGNER_LAYER_PAGE_SIZE + 1);
    expect(tree.children.at(-1)?.dataset.layerShowMore).toBe('true');
  });
});
