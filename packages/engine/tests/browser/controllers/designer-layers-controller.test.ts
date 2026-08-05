import type { ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction, type ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerLayersController } from '../../../src/browser/controllers/designer-layers-controller.js';

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly matches: Record<string, FakeElement> = {};

  closest<T extends Element>(selector: string): T | null {
    return (this.matches[selector] ?? null) as T | null;
  }
}

class FakeInput extends FakeElement {
  constructor(readonly value: string) {
    super();
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

describe('DesignerLayersController', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('R6 uses the Canvas selection reducer for plain and modifier layer clicks', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
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

  it('R6 normalizes duplicate sibling z-indexes when reordering in one transaction', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const state = createController(
      createDocument([component('first', null, 0), component('second', null, 0)]),
    );
    const move = new FakeElement();
    move.dataset.layerId = 'second';
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

  it('R6 allows root drops and rejects cycles, unavailable parents, hidden targets, and locked selections', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
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
