import type { ScreenDocument } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
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

/** 行桩：整行就是拖拽把手，所以拖拽用例把指针落在行上即可。 */
function layerRow(id: string): FakeElement {
  const row = new FakeElement();
  row.dataset.layerId = id;
  row.matches['[data-layer-id]'] = row;
  return row;
}

/**
 * 带拖拽元数据的行桩：落点换算要读父级、物料类型与行矩形（上缘 / 下缘 / 容器中段）。
 * `ratio` 表示指针落在行高的哪个比例处，默认 0.25（上缘区带 → 插到该行之前）。
 */
function dragRow(
  id: string,
  options: {
    readonly parentId?: string | null;
    readonly type?: string;
    readonly ratio?: number;
    readonly height?: number;
  } = {},
): FakeElement & { getBoundingClientRect: () => { top: number; height: number } } {
  const row = layerRow(id) as FakeElement & {
    getBoundingClientRect: () => { top: number; height: number };
  };
  row.dataset.layerParent = options.parentId ?? '';
  row.dataset.layerType = options.type ?? 'base.leaf';
  // 行位于图层树内：落点换算会先确认目标仍在 [data-layer-root] 中。
  row.matches['[data-layer-root]'] = row;
  const height = options.height ?? 40;
  row.getBoundingClientRect = () => ({ top: 0, height });
  // clientY 由 ratio × height 反推，供 dragRowEvent 使用。
  (row as unknown as { dropClientY: number }).dropClientY = (options.ratio ?? 0.25) * height;
  return row;
}

function dragOver(row: FakeElement, clientY?: number): DragEvent {
  return {
    target: row,
    clientY: clientY ?? (row as unknown as { dropClientY?: number }).dropClientY ?? 0,
    dataTransfer: null,
    preventDefault: () => undefined,
  } as unknown as DragEvent;
}

function renderedLayerRow(panel: FakePanel, id: string): FakePanel {
  // 外壳顺序：列表标题、层级操作条、紧凑搜索、图层树；按标记取树，不受外壳增减影响。
  const tree = panel.children.find((item) => item.dataset.layerRoot === 'true');
  if (tree === undefined) throw new Error('Missing rendered layer tree.');
  const row = tree.children.find((item) => item.dataset.layerId === id);
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
    // 没有渲染过的行序时 Shift 落不出一段区间，退化为单选（Windows 里没有锚点也是单选）。
    controller.onClick({ target, shiftKey: true } as unknown as MouseEvent);
    controller.onClick({ target, ctrlKey: true } as unknown as MouseEvent);
    controller.onClick({ target, metaKey: true } as unknown as MouseEvent);

    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['layer-1'], focusedComponentId: 'layer-1' },
      { type: 'replace-selection', componentIds: ['layer-1'], focusedComponentId: 'layer-1' },
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
      { type: 'replace-selection', componentIds: ['layer-1'], focusedComponentId: 'layer-1' },
    ]);
  });

  it('R7 extends the selection with Shift from a fixed anchor, the way a Windows list does', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const actions: ScreenInteractionAction[] = [];
    let selected: readonly string[] = [];
    const apply = (action: ScreenInteractionAction): void => {
      actions.push(action);
      if (action.type === 'replace-selection') {
        selected = [...action.componentIds];
        return;
      }
      if (action.type === 'toggle-selection') {
        selected = selected.includes(action.componentId)
          ? selected.filter((id) => id !== action.componentId)
          : [...selected, action.componentId];
      }
    };
    // 从上到下的行序 = zIndex 降序：a b c d。
    const controller = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () =>
        createDocument([
          component('a', null, 3),
          component('b', null, 2),
          component('c', null, 1),
          component('d', null, 0),
        ]),
      getInteraction: () => ({
        selectedComponentIds: selected,
        focusedComponentId: selected.at(-1) ?? null,
      }),
      reduceSelection: apply,
    });
    controller.render(new FakePanel() as unknown as HTMLElement);

    const row = (id: string): FakeElement => {
      const element = new FakeElement();
      element.dataset.layerSelect = id;
      element.matches['[data-layer-select]'] = element;
      return element;
    };
    const click = (id: string, modifiers: MouseEventInit = {}): void => {
      controller.onClick({ target: row(id), ...modifiers } as unknown as MouseEvent);
    };

    // 单击 a 建立锚点，Shift 点 c 选中 a..c 一整段。
    click('a');
    click('c', { shiftKey: true });
    expect(selected).toEqual(['a', 'b', 'c']);
    // 锚点还在 a：再 Shift 点 b 是收窄，不是从 c 继续吞一段。
    click('b', { shiftKey: true });
    expect(selected).toEqual(['a', 'b']);
    // 无 Shift 点 c 重新锚定，随后 Shift 点 a 是向上的区间。
    click('c');
    click('a', { shiftKey: true });
    expect(selected).toEqual(['a', 'b', 'c']);
    // Ctrl + Shift 把区间并入已有选区（从 c 到 d 只有 d 是新的）。
    click('b');
    click('d', { ctrlKey: true, shiftKey: true });
    expect(selected).toEqual(['b', 'c', 'd']);

    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['a'], focusedComponentId: 'a' },
      { type: 'replace-selection', componentIds: ['a', 'b', 'c'], focusedComponentId: 'c' },
      { type: 'replace-selection', componentIds: ['a', 'b'], focusedComponentId: 'b' },
      { type: 'replace-selection', componentIds: ['c'], focusedComponentId: 'c' },
      { type: 'replace-selection', componentIds: ['a', 'b', 'c'], focusedComponentId: 'a' },
      { type: 'replace-selection', componentIds: ['b'], focusedComponentId: 'b' },
      {
        type: 'replace-selection',
        componentIds: ['b', 'c', 'd'],
        focusedComponentId: 'd',
      },
    ]);
  });

  it('runs layer toolbar arrange, group, and locate actions through functional callbacks', () => {
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
    // 拖到自己的后代行上（行中段 = 成为该行的子图层）：形成环，必须拒绝。
    expect(
      cycle.controller.onDrop(
        dragOver(dragRow('child', { parentId: 'container', type: 'base.container', ratio: 0.5 })),
      ),
    ).toBe(false);
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
      unavailableParent.controller.onDrop(
        dragOver(dragRow('leaf-parent', { type: 'base.leaf', ratio: 0.5 })),
      ),
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
      hiddenTarget.controller.onDrop(
        dragOver(dragRow('hidden-container', { type: 'base.container', ratio: 0.5 })),
      ),
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
      lockedParent.controller.onDrop(
        dragOver(dragRow('locked-container', { type: 'base.container', ratio: 0.5 })),
      ),
    ).toBe(false);
    expect(lockedParent.transactions).toEqual([]);
  });

  it('reorders siblings by drag with the same zIndex rules as the arrange menu', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    // 面板自上而下：top(z=2) / middle(z=1) / bottom(z=0)。
    const state = createController(
      createDocument([
        component('bottom', null, 0),
        component('middle', null, 1),
        component('top', null, 2),
      ]),
    );
    expect(
      state.controller.onDragStart({ target: layerRow('bottom') } as unknown as DragEvent),
    ).toBe(true);
    // 拖到底部行…这里把 bottom 丢到 top 行的上缘：插到最前层。
    expect(state.controller.onDragOver(dragOver(dragRow('top', { ratio: 0.1 })))).toBe(true);
    expect(state.controller.dropIndicator).toEqual({ rowId: 'top', edge: 'before' });
    expect(
      state.controller.onDrop({
        ...dragOver(dragRow('top', { ratio: 0.1 })),
        dataTransfer: null,
      } as unknown as DragEvent),
    ).toBe(true);
    expect(state.transactions).toHaveLength(1);
    expect(orderByZIndex(state.document())).toEqual(['bottom', 'top', 'middle']);
    expect(state.controller.dropIndicator).toBeUndefined();

    // 上缘落点：把 bottom 丢到 middle 行的上缘 → 插到 top 与 middle 之间。
    const state2 = createController(
      createDocument([
        component('bottom', null, 0),
        component('middle', null, 1),
        component('top', null, 2),
      ]),
    );
    state2.controller.onDragStart({ target: layerRow('bottom') } as unknown as DragEvent);
    expect(state2.controller.onDragOver(dragOver(dragRow('middle', { ratio: 0.1 })))).toBe(true);
    expect(state2.controller.dropIndicator).toEqual({ rowId: 'middle', edge: 'before' });
    state2.controller.onDrop(dragOver(dragRow('middle', { ratio: 0.1 })));
    expect(orderByZIndex(state2.document())).toEqual(['top', 'bottom', 'middle']);

    // 原位落回（落在自己当前所在的间隙）不产生事务，也不给成功反馈。
    const noop = createController(
      createDocument([
        component('bottom', null, 0),
        component('middle', null, 1),
        component('top', null, 2),
      ]),
    );
    noop.controller.onDragStart({ target: layerRow('bottom') } as unknown as DragEvent);
    // dragover 在图层树内一律被接受（HTML5 拖拽要求，否则浏览器中止拖拽），
    // 但无效落点不画指示线、松手也不产生事务。
    noop.controller.onDragOver(dragOver(dragRow('middle', { ratio: 0.9 })));
    expect(noop.controller.dropIndicator).toBeUndefined();
    expect(noop.controller.onDrop(dragOver(dragRow('middle', { ratio: 0.9 })))).toBe(false);
    expect(noop.transactions).toEqual([]);
  });

  it('drops into a container row to reparent, and rejects dropping onto itself', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const state = createController(
      createDocument([
        component('container', null, 1, { type: 'base.container' }),
        component('leaf', null, 0),
      ]),
    );
    state.controller.onDragStart({ target: layerRow('leaf') } as unknown as DragEvent);
    expect(
      state.controller.onDragOver(
        dragOver(dragRow('container', { type: 'base.container', ratio: 0.5 })),
      ),
    ).toBe(true);
    expect(state.controller.dropIndicator).toEqual({ rowId: 'container', edge: 'inside' });
    expect(
      state.controller.onDrop(
        dragOver(dragRow('container', { type: 'base.container', ratio: 0.5 })),
      ),
    ).toBe(true);
    expect(state.document().components.find((item) => item.id === 'leaf')?.parentId).toBe(
      'container',
    );

    // 拖到自身行上不是合法落点：不产生事务，也不残留指示。
    const self = createController(
      createDocument([component('only', null, 0), component('other', null, 1)]),
    );
    self.controller.onDragStart({ target: layerRow('only') } as unknown as DragEvent);
    self.controller.onDragOver(dragOver(dragRow('only')));
    expect(self.controller.dropIndicator).toBeUndefined();
    expect(self.controller.onDrop(dragOver(dragRow('only')))).toBe(false);
    expect(self.transactions).toEqual([]);
  });

  it('starts a drag from anywhere on the row except its own controls', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const state = createController(
      createDocument([component('bottom', null, 0), component('top', null, 1)]),
    );

    // 行本身（名称区 / 图标 / 缩进留白）就是拖拽把手：整行起手，少一个装饰位。
    expect(
      state.controller.onDragStart({ target: layerRow('bottom') } as unknown as DragEvent),
    ).toBe(true);
    expect(state.controller.draggedId).toBe('bottom');
    state.controller.clearDrag();
    expect(state.controller.draggedId).toBeUndefined();

    // 行内控件各管各的语义：从折叠箭头 / 锁定 / 显隐按钮起手不算拖拽。
    for (const selector of [
      '[data-layer-collapse]',
      '[data-layer-toggle]',
      '[data-layer-rename]',
    ]) {
      const control = layerRow('bottom');
      control.matches[selector] = control;
      expect(state.controller.onDragStart({ target: control } as unknown as DragEvent)).toBe(false);
      expect(state.controller.draggedId).toBeUndefined();
    }
  });

  it('selects the right-clicked row unless it is already part of the selection', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const selectableRow = (id: string): FakeElement => {
      const row = layerRow(id);
      row.dataset.layerSelectable = 'true';
      row.matches['[data-layer-selectable="true"]'] = row;
      return row;
    };

    // 行不在选区里：右键先把选区换成这一行（菜单随后按单组件解析）。
    const actions: unknown[] = [];
    const single = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () => createDocument([component('layer-1', null, 0)]),
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      reduceSelection: (action) => actions.push(action),
    });
    expect(
      single.onContextMenu({ target: selectableRow('layer-1') } as unknown as MouseEvent),
    ).toBe('row');
    expect(actions).toEqual([
      { type: 'replace-selection', componentIds: ['layer-1'], focusedComponentId: 'layer-1' },
    ]);

    // 行已在多选里：保留选区，菜单升级为多选菜单，动作仍落在整段选区上。
    const kept: unknown[] = [];
    const multi = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () => createDocument([component('layer-1', null, 0)]),
      getInteraction: () => ({
        selectedComponentIds: ['layer-1', 'layer-2'],
        focusedComponentId: 'layer-2',
      }),
      reduceSelection: (action) => kept.push(action),
    });
    expect(multi.onContextMenu({ target: selectableRow('layer-2') } as unknown as MouseEvent)).toBe(
      'row',
    );
    expect(kept).toEqual([]);
  });

  it('leaves hidden rows and the rename input without an object menu', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const actions: unknown[] = [];
    const controller = new DesignerLayersController({
      emitDiagnostics: () => undefined,
      executeTransaction: () => ({ ok: true, value: document, diagnostics: [] }),
      getCatalog: () => undefined,
      getDocument: () => createDocument([component('layer-1', null, 0, { hidden: true })]),
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      reduceSelection: (action) => actions.push(action),
    });

    // 隐藏行没有 data-layer-selectable：core 的选择归约会剔除有效隐藏组件，
    // 右键认领它只会让菜单动作落到上一次选择上。
    expect(controller.onContextMenu({ target: layerRow('layer-1') } as unknown as MouseEvent)).toBe(
      'ignore',
    );

    const renaming = layerRow('layer-1');
    renaming.dataset.layerSelectable = 'true';
    renaming.matches['[data-layer-selectable="true"]'] = renaming;
    renaming.matches['[data-layer-rename]'] = renaming;
    expect(controller.onContextMenu({ target: renaming } as unknown as MouseEvent)).toBe('ignore');
    expect(actions).toEqual([]);

    // 树空白区没有行可认领：回落画布菜单，由调用方不传 componentId 打开。
    expect(controller.onContextMenu({ target: new FakeElement() } as unknown as MouseEvent)).toBe(
      'blank',
    );
  });
});

function orderByZIndex(document: ScreenDocument): readonly string[] {
  // 绘制顺序：zIndex 升序 = 后层 → 前层；反转后即面板自上而下的顺序。
  return [...document.components]
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((item) => item.id)
    .reverse();
}
