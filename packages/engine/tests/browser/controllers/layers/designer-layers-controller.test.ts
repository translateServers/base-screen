import type { ScreenDocument } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerLayersController } from '../../../../src/browser/controllers/layers/designer-layers-controller.js';

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly matches: Record<string, FakeElement> = {};

  querySelectorAll(): FakeElement[] {
    return [];
  }

  closest<T extends Element>(selector: string): T | null {
    return (this.matches[selector] ?? null) as T | null;
  }
}

class FakeButton extends FakeElement {
  disabled = false;
  focused = false;

  readonly tagName = 'BUTTON';

  focus(): void {
    this.focused = true;
  }
}

class FakeInput extends FakeElement {
  isConnected = true;

  constructor(readonly value: string) {
    super();
  }
}

// 极简面板骨架：满足 renderDesignerLayers 的属性写入面，用于观察重命名模式的 DOM 生命周期。
class FakePanel {
  readonly ownerDocument = { createElement: () => new FakePanel() };
  readonly children: FakePanel[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = {
    setProperty: () => undefined,
  };
  ariaCurrent = '';
  ariaExpanded = '';
  ariaLabel = '';
  ariaLevel = '';
  ariaPressed = '';
  ariaSelected = '';
  className = '';
  disabled = false;
  draggable = false;
  innerHTML = '';
  placeholder = '';
  textContent = '';
  title = '';
  type = '';
  value = '';

  appendChild(child: FakePanel): FakePanel {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakePanel[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  querySelector(): FakePanel | null {
    return null;
  }

  setAttribute(name: string, value: string): void {
    this.dataset[name] = value;
  }
}

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};

function component(
  id: string,
  parentId: string | null,
  zIndex: number,
  options: { readonly hidden?: boolean; readonly locked?: boolean; readonly type?: string } = {},
): ScreenDocument['components'][number] {
  return {
    id,
    parentId,
    zIndex,
    type: options.type ?? 'base.leaf',
    name: id,
    position: { x: 0, y: 0 },
    size: { width: 10, height: 10 },
    rotation: 0,
    status: { hidden: options.hidden ?? false, locked: options.locked ?? false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function createDocument(
  components: readonly ScreenDocument['components'][number][],
): ScreenDocument {
  return { ...document, components };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: (type: string) =>
      ({
        manifest: {
          designCapabilities: { children: type === 'base.container' },
        },
      }) as unknown,
  } as BaseScreenMaterialCatalog;
}

function createController(
  initial: ScreenDocument,
  selectedComponentIds: readonly string[] = [],
): {
  readonly controller: DesignerLayersController;
  readonly transactions: ScreenDocumentTransaction[];
  readonly document: () => ScreenDocument;
} {
  let current = initial;
  const transactions: ScreenDocumentTransaction[] = [];
  const controller = new DesignerLayersController({
    emitDiagnostics: () => undefined,
    executeTransaction: (transaction) => {
      transactions.push(transaction);
      const result = applyScreenDocumentTransaction(current, transaction);
      if (result.ok) current = result.document;
      return result.ok
        ? { ok: true, value: result.document, diagnostics: [] }
        : { ok: false, diagnostics: result.diagnostics };
    },
    getCatalog: catalog,
    getDocument: () => current,
    getInteraction: () => ({
      selectedComponentIds,
      focusedComponentId: selectedComponentIds.at(-1) ?? null,
    }),
    reduceSelection: () => undefined,
  });
  return { controller, transactions, document: () => current };
}

function layerRow(id: string): FakeElement {
  const row = new FakeElement();
  row.dataset.layerId = id;
  row.matches['[data-layer-id]'] = row;
  return row;
}

function renderedLayerRow(panel: FakePanel, id: string): FakePanel {
  const row = panel.children[1]!.children.find((item) => item.dataset.layerId === id);
  if (row === undefined) throw new Error(`Missing rendered layer row ${id}.`);
  return row;
}

describe('DesignerLayersController', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('steps selection through the full layer tree without document transactions', () => {
    const actions: unknown[] = [];
    let interaction = {
      selectedComponentIds: [] as readonly string[],
      focusedComponentId: null as string | null,
    };
    const controller = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => {
        throw new Error('Layer selection must not mutate the document.');
      },
      getCatalog: catalog,
      getDocument: () =>
        createDocument([
          component('back', null, 0),
          component('group', null, 2, { type: 'base.container' }),
          component('child', 'group', 0, { locked: true }),
          component('hidden', null, 3, { hidden: true }),
        ]),
      getInteraction: () => interaction,
      reduceSelection: (action) => {
        actions.push(action);
        if (action.type === 'replace-selection') {
          interaction = {
            selectedComponentIds: action.componentIds,
            focusedComponentId: action.focusedComponentId,
          };
        }
      },
    });

    expect(controller.canStepSelection('up')).toBe(true);
    expect(controller.canStepSelection('down')).toBe(true);
    controller.stepSelection('down');
    controller.stepSelection('down');
    controller.stepSelection('down');
    expect(controller.canStepSelection('down')).toBe(false);
    controller.stepSelection('down');

    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['group'], focusedComponentId: 'group' },
      { type: 'replace-selection', componentIds: ['child'], focusedComponentId: 'child' },
      { type: 'replace-selection', componentIds: ['back'], focusedComponentId: 'back' },
    ]);
  });

  it('R6 uses the Canvas selection reducer for plain and modifier layer clicks', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const actions: unknown[] = [];
    const controller = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () => document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      reduceSelection: (action) => actions.push(action),
    });
    const target = new FakeElement();
    target.dataset.layerSelect = 'layer-1';
    target.matches['[data-layer-select]'] = target;

    controller.onClick({ target } as unknown as MouseEvent);
    controller.onClick({ target, shiftKey: true } as unknown as MouseEvent);
    controller.onClick({ target, ctrlKey: true } as unknown as MouseEvent);
    controller.onClick({ target, metaKey: true } as unknown as MouseEvent);

    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['layer-1'], focusedComponentId: 'layer-1' },
      { type: 'toggle-selection', componentId: 'layer-1' },
      { type: 'toggle-selection', componentId: 'layer-1' },
      { type: 'toggle-selection', componentId: 'layer-1' },
    ]);
  });

  it('uses the highlighted row as the pointer target without leaking action-cluster gaps', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const actions: unknown[] = [];
    const controller = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () => document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      reduceSelection: (action) => actions.push(action),
    });
    const row = new FakeElement();
    row.dataset.layerId = 'layer-1';
    row.matches['[data-layer-selectable="true"]'] = row;

    expect(controller.onClick({ target: row } as unknown as MouseEvent)).toBe(true);
    expect(controller.onClick({ target: row, shiftKey: true } as unknown as MouseEvent)).toBe(true);

    const actionGap = new FakeElement();
    actionGap.matches['.layer-actions'] = actionGap;
    expect(controller.onClick({ target: actionGap } as unknown as MouseEvent)).toBe(true);
    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['layer-1'], focusedComponentId: 'layer-1' },
      { type: 'toggle-selection', componentId: 'layer-1' },
    ]);
  });

  it('runs DataV toolbar arrange, group, and locate actions through functional callbacks', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const arranged = createController(
      createDocument([
        component('back', null, 0),
        component('middle', null, 1),
        component('front', null, 2),
      ]),
      ['middle'],
    );
    const arrange = new FakeElement();
    arrange.dataset.layerArrange = 'up';
    arrange.matches['[data-layer-arrange]'] = arrange;

    expect(arranged.controller.onClick({ target: arrange } as unknown as Event)).toBe(true);
    expect(arranged.transactions).toHaveLength(1);
    expect(
      [...arranged.document().components]
        .sort((left, right) => right.zIndex - left.zIndex)
        .map((item) => item.id),
    ).toEqual(['middle', 'front', 'back']);

    const group = vi.fn(() => ({ ok: true as const, value: document, diagnostics: [] }));
    const locateComponent = vi.fn();
    const controller = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () => document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      group,
      locateComponent,
      reduceSelection: () => undefined,
    });
    const groupButton = new FakeElement();
    groupButton.dataset.layerGroupAction = 'group';
    groupButton.matches['[data-layer-group-action]'] = groupButton;
    const locateButton = new FakeElement();
    locateButton.dataset.layerLocate = 'middle';
    locateButton.matches['[data-layer-locate]'] = locateButton;

    expect(controller.onClick({ target: groupButton } as unknown as Event)).toBe(true);
    expect(controller.onClick({ target: locateButton } as unknown as Event)).toBe(true);
    expect(group).toHaveBeenCalledOnce();
    expect(locateComponent).toHaveBeenCalledWith('middle');
  });

  it('R4 keeps keyboard tree movement on the shared selection path', () => {
    vi.stubGlobal('HTMLButtonElement', FakeButton);
    const actions: unknown[] = [];
    const controller = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () => document,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      reduceSelection: (action) => actions.push(action),
    });
    const root = new FakeElement();
    const first = new FakeButton();
    const second = new FakeButton();
    first.dataset.layerSelect = 'first';
    second.dataset.layerSelect = 'second';
    first.matches['[data-layer-root]'] = root;
    root.querySelectorAll = () => [first, second];

    expect(
      controller.onKeyDown({
        target: first,
        key: 'ArrowDown',
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent),
    ).toBe(true);
    expect(second.focused).toBe(true);
    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['second'], focusedComponentId: 'second' },
    ]);
  });

  it('R6 keeps rename drafts local and commits exactly once for Enter or blur', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const enter = createController(createDocument([component('layer-1', null, 0)]));
    const enterDraft = new FakeInput('Renamed with Enter');
    enterDraft.dataset.layerRename = 'layer-1';

    enter.controller.onInput({ target: enterDraft } as unknown as Event);
    expect(
      enter.controller.onKeyDown({
        target: enterDraft,
        key: 'Enter',
        isComposing: false,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent),
    ).toBe(true);
    enter.controller.onChange({ target: enterDraft } as unknown as Event);

    expect(enter.transactions).toHaveLength(1);
    expect(enter.document().components[0]?.name).toBe('Renamed with Enter');

    const blur = createController(createDocument([component('layer-1', null, 0)]));
    const blurDraft = new FakeInput('Renamed on blur');
    blurDraft.dataset.layerRename = 'layer-1';
    blur.controller.onInput({ target: blurDraft } as unknown as Event);
    blur.controller.onChange({ target: blurDraft } as unknown as Event);

    expect(blur.transactions).toHaveLength(1);
    expect(blur.document().components[0]?.name).toBe('Renamed on blur');
  });

  it('R6 cancels a rename with Escape without creating history work', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const state = createController(createDocument([component('layer-1', null, 0)]));
    const draft = new FakeInput('Discarded draft');
    draft.dataset.layerRename = 'layer-1';

    state.controller.onInput({ target: draft } as unknown as Event);
    expect(
      state.controller.onKeyDown({
        target: draft,
        key: 'Escape',
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent),
    ).toBe(true);
    state.controller.onChange({ target: draft } as unknown as Event);

    expect(draft.value).toBe('layer-1');
    expect(state.transactions).toEqual([]);
  });

  it('R6 enters rename mode on double-click and exits after commit or cancel', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const state = createController(createDocument([component('layer-1', null, 0)]));
    const panel = new FakePanel();
    state.controller.render(panel as unknown as HTMLElement);
    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBeUndefined();

    const row = new FakeElement();
    row.dataset.layerId = 'layer-1';
    row.matches['[data-layer-selectable="true"]'] = row;
    expect(state.controller.onDoubleClick({ target: row } as unknown as MouseEvent)).toBe(true);
    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBe('true');

    const draft = new FakeInput('Renamed with double-click');
    draft.dataset.layerRename = 'layer-1';
    state.controller.onInput({ target: draft } as unknown as Event);
    expect(
      state.controller.onKeyDown({
        target: draft,
        key: 'Enter',
        isComposing: false,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent),
    ).toBe(true);

    expect(state.transactions).toHaveLength(1);
    expect(state.document().components[0]?.name).toBe('Renamed with double-click');
    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBeUndefined();
  });

  it('recognizes a double-click when selection rendering replaces the row between clicks', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const state = createController(createDocument([component('layer-1', null, 0)]));
    const panel = new FakePanel();
    state.controller.render(panel as unknown as HTMLElement);
    const firstRow = new FakeElement();
    firstRow.dataset.layerId = 'layer-1';
    firstRow.matches['[data-layer-selectable="true"]'] = firstRow;
    const replacementRow = new FakeElement();
    replacementRow.dataset.layerId = 'layer-1';
    replacementRow.matches['[data-layer-selectable="true"]'] = replacementRow;
    const preventDefault = vi.fn();

    expect(
      state.controller.onClick({
        target: firstRow,
        button: 0,
        detail: 1,
        timeStamp: 100,
        preventDefault,
      } as unknown as MouseEvent),
    ).toBe(true);
    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBeUndefined();
    expect(
      state.controller.onClick({
        target: replacementRow,
        button: 0,
        detail: 1,
        timeStamp: 260,
        preventDefault,
      } as unknown as MouseEvent),
    ).toBe(true);

    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBe('true');
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('does not treat repeated keyboard or programmatic clicks as a rename gesture', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const state = createController(createDocument([component('layer-1', null, 0)]));
    const panel = new FakePanel();
    state.controller.render(panel as unknown as HTMLElement);
    const row = new FakeElement();
    row.dataset.layerId = 'layer-1';
    row.matches['[data-layer-selectable="true"]'] = row;

    for (const timeStamp of [100, 200]) {
      state.controller.onClick({
        target: row,
        button: 0,
        detail: 0,
        timeStamp,
        preventDefault: () => undefined,
      } as unknown as MouseEvent);
    }

    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBeUndefined();
  });

  it('R6 refuses rename mode for locked components and exits on unchanged focus-out', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const state = createController(
      createDocument([
        component('layer-1', null, 0),
        component('locked', null, 1, { locked: true }),
      ]),
    );
    const panel = new FakePanel();
    state.controller.render(panel as unknown as HTMLElement);

    const lockedSelect = new FakeElement();
    lockedSelect.dataset.layerSelect = 'locked';
    lockedSelect.matches['[data-layer-select]'] = lockedSelect;
    expect(state.controller.onDoubleClick({ target: lockedSelect } as unknown as MouseEvent)).toBe(
      false,
    );
    expect(renderedLayerRow(panel, 'locked').dataset.renaming).toBeUndefined();

    const select = new FakeElement();
    select.dataset.layerSelect = 'layer-1';
    select.matches['[data-layer-select]'] = select;
    state.controller.onDoubleClick({ target: select } as unknown as MouseEvent);
    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBe('true');

    const draft = new FakeInput('layer-1');
    draft.dataset.layerRename = 'layer-1';
    expect(state.controller.onFocusOut({ target: draft } as unknown as FocusEvent)).toBe(true);
    expect(state.transactions).toEqual([]);
    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBeUndefined();
  });

  it('R6 ignores focus-out of inputs removed by re-rendering', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const state = createController(createDocument([component('layer-1', null, 0)]));
    const panel = new FakePanel();
    state.controller.render(panel as unknown as HTMLElement);
    const select = new FakeElement();
    select.dataset.layerSelect = 'layer-1';
    select.matches['[data-layer-select]'] = select;
    state.controller.onDoubleClick({ target: select } as unknown as MouseEvent);

    // 渲染重建移除聚焦输入框时，浏览器同步派发的 focusout 落在已脱离文档的节点上：
    // 控制器必须忽略（状态由渲染方持有），不得重入 endRename 破坏正在进行的渲染。
    const detached = new FakeInput('layer-1');
    detached.dataset.layerRename = 'layer-1';
    detached.isConnected = false;
    expect(state.controller.onFocusOut({ target: detached } as unknown as FocusEvent)).toBe(true);
    expect(renderedLayerRow(panel, 'layer-1').dataset.renaming).toBe('true');
  });

  it('R6 normalizes duplicate sibling z-indexes when reordering in one transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const state = createController(
      createDocument([component('first', null, 0), component('second', null, 0)]),
    );
    const move = new FakeElement();
    move.dataset.layerId = 'first';
    move.dataset.layerMove = 'up';
    move.matches['[data-layer-move]'] = move;

    expect(state.controller.onClick({ target: move } as unknown as Event)).toBe(true);
    expect(state.transactions).toHaveLength(1);
    expect(
      [...state.document().components]
        .sort((left, right) => left.zIndex - right.zIndex)
        .map((item) => item.id),
    ).toEqual(['second', 'first']);
  });

  // 每次移动操作都会重排文档 zIndex（mutate 当前文档），因此每个场景用独立
  // controller 验证一次，避免前序事务污染兄弟顺序。onClick 匹配到
  // [data-layer-move] 即返回 true（按钮存在感），不反映 canMove 的决策；
  // 因此通过 transactions 是否追加来判断移动是否实际执行。
  function clickMove(
    state: {
      controller: DesignerLayersController;
      transactions: ScreenDocumentTransaction[];
      document: () => ScreenDocument;
    },
    id: string,
    direction: 'up' | 'down',
  ): void {
    const move = new FakeElement();
    move.dataset.layerId = id;
    move.dataset.layerMove = direction;
    move.matches['[data-layer-move]'] = move;
    state.controller.onClick({ target: move } as unknown as Event);
  }

  it('allows a move past unlocked siblings and blocks a move crossing a locked sibling', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    // 面板按前到后显示 [second(2), first(1), locked(0)]：上移朝绘制前层移动。
    const state = createController(
      createDocument([
        component('locked', null, 0, { locked: true }),
        component('first', null, 1),
        component('second', null, 2),
      ]),
    );

    // first 上移跨过 second（未锁定）→ 执行移动。
    clickMove(state, 'first', 'up');
    expect(state.transactions).toHaveLength(1);

    // first 下移跨过 locked（锁定）→ 不执行移动。
    const blocked = createController(
      createDocument([
        component('locked', null, 0, { locked: true }),
        component('first', null, 1),
        component('second', null, 2),
      ]),
    );
    clickMove(blocked, 'first', 'down');
    expect(blocked.transactions).toEqual([]);
  });

  it('blocks a move whose only crossing target is a locked sibling', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    // 面板顺序 [second(2), locked(1), first(0)]：锁定组件夹在中间。
    // second 下移会直接交换 locked → 禁；first 上移也会交换 locked → 禁。
    const secondUp = createController(
      createDocument([
        component('first', null, 0),
        component('locked', null, 1, { locked: true }),
        component('second', null, 2),
      ]),
    );
    // 前置探针：确认锁定语义在测试文档上按预期生效。
    expect(isScreenComponentEffectivelyLocked(secondUp.document(), 'locked')).toBe(true);
    expect(isScreenComponentEffectivelyLocked(secondUp.document(), 'second')).toBe(false);
    clickMove(secondUp, 'second', 'down');
    expect(secondUp.transactions).toEqual([]);

    const firstDown = createController(
      createDocument([
        component('first', null, 0),
        component('locked', null, 1, { locked: true }),
        component('second', null, 2),
      ]),
    );
    clickMove(firstDown, 'first', 'up');
    expect(firstDown.transactions).toEqual([]);
  });

  it('blocks moves of the locked component itself and out-of-range moves', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const lockedSelf = createController(
      createDocument([component('locked', null, 0, { locked: true }), component('other', null, 1)]),
    );
    clickMove(lockedSelf, 'locked', 'up');
    clickMove(lockedSelf, 'locked', 'down');
    expect(lockedSelf.transactions).toEqual([]);

    const outOfRange = createController(createDocument([component('only', null, 0)]));
    clickMove(outOfRange, 'only', 'up');
    clickMove(outOfRange, 'only', 'down');
    expect(outOfRange.transactions).toEqual([]);
  });

  it('R6 allows root drops and rejects cycles, unavailable parents, hidden targets, and locked selections', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const rootState = createController(
      createDocument([
        component('container', null, 0, { type: 'base.container' }),
        component('child', 'container', 0),
      ]),
      ['child'],
    );
    const root = new FakeElement();
    root.matches['[data-layer-root]'] = root;

    expect(
      rootState.controller.onDragStart({ target: layerRow('child') } as unknown as DragEvent),
    ).toBe(true);
    expect(
      rootState.controller.onDrop({
        target: root,
        preventDefault: () => undefined,
      } as unknown as DragEvent),
    ).toBe(true);
    expect(
      rootState.document().components.find((item) => item.id === 'child')?.parentId,
    ).toBeNull();
    expect(rootState.transactions).toHaveLength(1);

    const largeState = createController(
      createDocument([
        component('container', null, 0, { type: 'base.container' }),
        ...Array.from({ length: 100 }, (_, index) => component(`layer-${index}`, null, index + 1)),
        component('child', 'container', 0),
      ]),
      ['child'],
    );
    expect(
      largeState.controller.onDragStart({ target: layerRow('child') } as unknown as DragEvent),
    ).toBe(true);
    expect(
      largeState.controller.onDrop({
        target: root,
        preventDefault: () => undefined,
      } as unknown as DragEvent),
    ).toBe(true);
    expect(largeState.transactions).toHaveLength(1);

    const cycle = createController(
      createDocument([
        component('container', null, 0, { type: 'base.container' }),
        component('child', 'container', 0, { type: 'base.container' }),
      ]),
      ['container'],
    );
    expect(
      cycle.controller.onDragStart({ target: layerRow('container') } as unknown as DragEvent),
    ).toBe(true);
    expect(cycle.controller.onDrop({ target: layerRow('child') } as unknown as DragEvent)).toBe(
      false,
    );
    expect(cycle.transactions).toEqual([]);

    const unavailableParent = createController(
      createDocument([component('source', null, 0), component('leaf-parent', null, 1)]),
      ['source'],
    );
    expect(
      unavailableParent.controller.onDragStart({
        target: layerRow('source'),
      } as unknown as DragEvent),
    ).toBe(true);
    expect(
      unavailableParent.controller.onDrop({
        target: layerRow('leaf-parent'),
      } as unknown as DragEvent),
    ).toBe(false);
    expect(unavailableParent.transactions).toEqual([]);

    const hiddenTarget = createController(
      createDocument([
        component('source', null, 0),
        component('hidden-container', null, 1, { hidden: true, type: 'base.container' }),
      ]),
      ['source'],
    );
    expect(
      hiddenTarget.controller.onDragStart({ target: layerRow('source') } as unknown as DragEvent),
    ).toBe(true);
    expect(
      hiddenTarget.controller.onDrop({
        target: layerRow('hidden-container'),
      } as unknown as DragEvent),
    ).toBe(false);
    expect(hiddenTarget.transactions).toEqual([]);

    const lockedSelection = createController(
      createDocument([
        component('source', null, 0),
        component('locked-sibling', null, 1, { locked: true }),
      ]),
      ['source', 'locked-sibling'],
    );
    expect(
      lockedSelection.controller.onDragStart({
        target: layerRow('source'),
      } as unknown as DragEvent),
    ).toBe(true);
    expect(lockedSelection.controller.onDrop({ target: root } as unknown as DragEvent)).toBe(false);
    expect(lockedSelection.transactions).toEqual([]);

    const lockedParent = createController(
      createDocument([
        component('source', null, 0),
        component('locked-container', null, 1, { locked: true, type: 'base.container' }),
      ]),
      ['source'],
    );
    expect(
      lockedParent.controller.onDragStart({ target: layerRow('source') } as unknown as DragEvent),
    ).toBe(true);
    expect(
      lockedParent.controller.onDrop({
        target: layerRow('locked-container'),
      } as unknown as DragEvent),
    ).toBe(false);
    expect(lockedParent.transactions).toEqual([]);
  });
});
