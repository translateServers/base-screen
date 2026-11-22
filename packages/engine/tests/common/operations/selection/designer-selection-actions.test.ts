import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction, type ScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerSelectionActions } from '../../../../src/common/operations/selection/designer-selection-actions.js';

function component(
  id: string,
  parentId: string | null = null,
  locked = false,
): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status: { locked, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function setup(components: readonly ScreenComponentNode[], selected: readonly string[]) {
  let document: ScreenDocument = {
    canvas: { width: 1000, height: 600, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { relations: [] },
  };
  const reduceSelection = vi.fn();
  const report = vi.fn();
  const run = (transaction: ScreenDocumentTransaction) => {
    const result = applyScreenDocumentTransaction(document, transaction);
    if (!result.ok) return { ok: false as const, diagnostics: result.diagnostics };
    document = result.document;
    return { ok: true as const, value: document, diagnostics: [] };
  };
  const actions = new DesignerSelectionActions({
    getDocument: () => document,
    getSelectedComponentIds: () => selected,
    executeCommand: (command) => run({ commands: [command] }),
    executeTransaction: run,
    reduceSelection,
    report,
  });
  return { actions, reduceSelection, report, current: () => document };
}

describe('designer selection delete', () => {
  // 回归：全选后选区里既有卡片外壳又有它的子组件，删除曾因「不同父级」被静默跳过。
  it('deletes a selection that mixes a parent and its children', () => {
    const { actions, reduceSelection, current } = setup(
      [component('card'), component('title', 'card'), component('note')],
      ['card', 'title', 'note'],
    );
    expect(actions.canDelete()).toBe(true);
    // 移动、对齐这类操作仍要求同属一个父级。
    expect(actions.canMutate()).toBe(false);
    actions.delete();
    expect(current().components).toEqual([]);
    expect(reduceSelection).toHaveBeenCalledWith({ type: 'clear-selection' });
  });

  it('refuses to delete when the selection contains a locked component', () => {
    const { actions, current } = setup(
      [component('card'), component('bg', null, true)],
      ['card', 'bg'],
    );
    expect(actions.canDelete()).toBe(false);
    actions.delete();
    expect(current().components.map((item) => item.id)).toEqual(['card', 'bg']);
  });
});
