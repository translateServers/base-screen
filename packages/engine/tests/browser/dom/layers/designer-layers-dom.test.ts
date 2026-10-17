import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  createDesignerLayerView,
  DESIGNER_LAYER_PAGE_SIZE,
  filterDesignerLayerItems,
  getDesignerLayerSelectionTarget,
  renderDesignerLayers,
} from '../../../../src/browser/dom/layers/designer-layers-dom.js';

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
  locked = false,
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
    status: { hidden, locked },
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
  it('resolves selection steps from the complete visual tree and skips only hidden layers', () => {
    const view = createDesignerLayerView(
      document([
        component('back', null, 0),
        component('group', null, 2),
        component('child-back', 'group', 0),
        component('child-front', 'group', 1, false, true),
        component('hidden', null, 3, true),
        component('same-z-first', null, 1),
        component('same-z-last', null, 1),
      ]),
      undefined,
    );

    expect(view.items.map((item) => item.id)).toEqual([
      'hidden',
      'group',
      'child-front',
      'child-back',
      'same-z-last',
      'same-z-first',
      'back',
    ]);
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: [], focusedComponentId: null },
        'up',
      ),
    ).toBe('group');
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: [], focusedComponentId: null },
        'down',
      ),
    ).toBe('group');
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: ['group'], focusedComponentId: 'group' },
        'down',
      ),
    ).toBe('child-front');
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: ['child-back'], focusedComponentId: 'child-back' },
        'up',
      ),
    ).toBe('child-front');
  });

  it('uses focused multi-selection anchors, falls back visually, and never wraps', () => {
    const view = createDesignerLayerView(
      document([
        component('back', null, 0),
        component('middle', null, 1),
        component('front', null, 2),
      ]),
      undefined,
    );

    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: ['front', 'back'], focusedComponentId: 'back' },
        'up',
      ),
    ).toBe('middle');
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: ['back', 'front'], focusedComponentId: 'missing' },
        'down',
      ),
    ).toBe('middle');
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: ['front'], focusedComponentId: 'front' },
        'up',
      ),
    ).toBeUndefined();
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: ['back'], focusedComponentId: 'back' },
        'down',
      ),
    ).toBeUndefined();
    expect(
      getDesignerLayerSelectionTarget(
        view,
        { selectedComponentIds: ['missing'], focusedComponentId: 'missing' },
        'down',
      ),
    ).toBe('front');
  });

  it('handles single and empty selectable sequences at their boundaries', () => {
    const single = createDesignerLayerView(document([component('only', null, 0)]), undefined);
    const hiddenOnly = createDesignerLayerView(
      document([component('hidden', null, 0, true)]),
      undefined,
    );

    expect(
      getDesignerLayerSelectionTarget(
        single,
        { selectedComponentIds: [], focusedComponentId: null },
        'down',
      ),
    ).toBe('only');
    expect(
      getDesignerLayerSelectionTarget(
        single,
        { selectedComponentIds: ['only'], focusedComponentId: 'only' },
        'up',
      ),
    ).toBeUndefined();
    expect(
      getDesignerLayerSelectionTarget(
        hiddenOnly,
        { selectedComponentIds: [], focusedComponentId: null },
        'down',
      ),
    ).toBeUndefined();
  });

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
      dropIndicator: { rowId: 'container', edge: 'inside' },
      renameDrafts: new Map([['container', '本地草稿']]),
      renamingId: 'container',
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const tree = layers.children[2]!;
    const row = tree.children[0]!;
    expect(row.ariaSelected).toBe('true');
    expect(row.ariaCurrent).toBe('true');
    expect(row.attributes['aria-description']).toBe('已隐藏，已锁定，已选中，当前焦点，放置目标');
    expect(row.dataset.renaming).toBe('true');
    expect(row.dataset.layerSelectable).toBeUndefined();
    // 隐藏行不参与拖拽（row.draggable 只在可选中且未锁定时为 true）。
    expect(row.draggable).toBe(false);
    // 有子项的行首列是折叠按钮；叶子行不再渲染拖拽抓手（整行即把手）。
    expect(
      row.children.find((child) => child.className.includes('layer-collapse'))?.dataset
        .layerCollapse,
    ).toBe('container');
    // 不渲染可见状态芯片：隐藏/锁定由常驻的警示色开关图标表达（aria-pressed），
    // 完整状态在 aria-description 中（见上方断言）。
    expect(row.children.find((child) => child.className === 'layer-state')).toBeUndefined();
    // 行级状态开关直接落在行网格里（锁 / 眼），不再挂在悬停展开的操作簇上。
    expect(row.children.find((child) => child.dataset.layerToggle === 'locked')?.ariaPressed).toBe(
      'true',
    );
    expect(row.children.find((child) => child.dataset.layerToggle === 'hidden')?.ariaPressed).toBe(
      'true',
    );
    expect(row.children.find((child) => child.dataset.layerSelect === 'container')?.disabled).toBe(
      true,
    );
    expect(layers.children[0]!.className).toBe('list-heading');
    expect(layers.children[1]!.className).toBe('layer-search');
    expect(layers.children[1]!.children[1]!.dataset.layerSearch).toBe('true');
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
      dropIndicator: undefined,
      renameDrafts: new Map(),
      renamingId: undefined,
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const idleRow = layers.children[2]!.children[0]!;
    expect(idleRow.dataset.renaming).toBeUndefined();
    expect(idleRow.dataset.layerSelectable).toBe('true');
    expect(idleRow.children.find((child) => child.dataset.layerRename)).toBeUndefined();
    const idleSelect = idleRow.children.find((child) => child.dataset.layerSelect !== undefined);
    const idleCopy = idleSelect?.children.find((child) => child.className === 'layer-copy');
    expect(idleCopy?.children.find((child) => child.className === 'layer-name')?.textContent).toBe(
      'container',
    );
    expect(idleCopy?.children.find((child) => child.className === 'layer-meta')?.textContent).toBe(
      'container.material · 10 × 10',
    );

    renderDesignerLayers(layers as unknown as HTMLElement, view, {
      interaction: { selectedComponentIds: [], focusedComponentId: null },
      search: '',
      collapsed: new Set(),
      dropIndicator: undefined,
      renameDrafts: new Map(),
      renamingId: 'container',
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const renamingRow = layers.children[2]!.children[0]!;
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
      dropIndicator: undefined,
      renameDrafts: new Map(),
      renamingId: undefined,
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => false,
    });

    const row = layers.children[2]!.children[0]!;
    const select = row.children.find((child) => child.dataset.layerSelect === 'locked');
    // 锁定行仍可选中（否则无从解锁），但整行不可拖：锁定项不得被拖动改层级。
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
      dropIndicator: undefined,
      renameDrafts: new Map(),
      renamingId: undefined,
      renderLimit: DESIGNER_LAYER_PAGE_SIZE,
      toolbarState: toolbarState(),
      canMove: () => true,
    });

    const tree = layers.children[2]!;
    expect(tree.children).toHaveLength(DESIGNER_LAYER_PAGE_SIZE + 1);
    expect(tree.children.at(-1)?.dataset.layerShowMore).toBe('true');
  });
});
