import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  createGroupRotationTransaction,
  createGroupSizeTransaction,
  withDerivedDesignerGroupBounds,
} from '../../../../src/common/operations/selection/designer-group.js';

function component(
  id: string,
  position: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  parentId: string | null = null,
  rotation = 0,
  locked = false,
): ScreenComponentNode {
  return {
    id,
    type: id === 'group' ? 'base.group' : 'base.text',
    name: id,
    parentId,
    position,
    size,
    rotation,
    zIndex: 0,
    status: { locked, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 1000, height: 600, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

describe('designer group operations', () => {
  it('scales a group subtree from the group top-left anchor', () => {
    const source = document([
      component('group', { x: 100, y: 100 }, { width: 200, height: 100 }),
      component('child', { x: 150, y: 125 }, { width: 40, height: 20 }, 'group'),
    ]);
    const transaction = createGroupSizeTransaction(source, 'group', {
      width: 400,
      height: 200,
    });

    expect(transaction).toBeDefined();
    const result = applyScreenDocumentTransaction(source, transaction!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components).toEqual([
      expect.objectContaining({
        id: 'group',
        position: { x: 100, y: 100 },
        size: { width: 400, height: 200 },
      }),
      expect.objectContaining({
        id: 'child',
        position: { x: 200, y: 150 },
        size: { width: 80, height: 40 },
      }),
    ]);
  });

  it('rotates the group subtree around the selection center', () => {
    const source = document([
      component('group', { x: 100, y: 100 }, { width: 200, height: 100 }),
      component('child', { x: 100, y: 100 }, { width: 40, height: 20 }, 'group'),
    ]);
    const transaction = createGroupRotationTransaction(source, 'group', 90);

    expect(transaction).toBeDefined();
    const result = applyScreenDocumentTransaction(source, transaction!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.components.find((item) => item.id === 'child')!;
    expect(child.rotation).toBe(90);
    expect(child.position.x).toBeCloseTo(220);
    expect(child.position.y).toBeCloseTo(60);
  });

  it('does not transform effectively locked descendants', () => {
    const source = document([
      component('group', { x: 100, y: 100 }, { width: 200, height: 100 }),
      component('child', { x: 150, y: 125 }, { width: 40, height: 20 }, 'group', 0, true),
    ]);
    const transaction = createGroupSizeTransaction(source, 'group', {
      width: 400,
      height: 200,
    });

    const result = applyScreenDocumentTransaction(source, transaction!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.find((item) => item.id === 'child')).toEqual(
      expect.objectContaining({ position: { x: 150, y: 125 }, size: { width: 40, height: 20 } }),
    );
  });

  it('derives group bounds after a child geometry transaction', () => {
    const source = document([
      component('group', { x: 100, y: 100 }, { width: 40, height: 20 }),
      component('child', { x: 100, y: 100 }, { width: 40, height: 20 }, 'group'),
    ]);
    const transaction = withDerivedDesignerGroupBounds(
      source,
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['child'],
            patch: { position: { x: 300, y: 220 } },
          },
        ],
      },
      'base.group',
    );

    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.find((item) => item.id === 'group')).toEqual(
      expect.objectContaining({ position: { x: 300, y: 220 }, size: { width: 40, height: 20 } }),
    );
  });

  it('re-derives every group shell on any transaction, including unrelated edits', () => {
    // 特征测试（不是期望行为）：组壳几何不接受作者意图——任何一次事务都会把它吸附到
    // 子项并集。之所以无条件运行，是 auto-width 文本的实测宽度变化根本不产生事务，
    // 只能靠下一次事务顺带同步（见 designer-auto-width 的同名派生用例）。
    // 后果：带内边距的容器不能当组壳用，否则第一次无关编辑就会把留白压平。
    const source = document([
      component('outside', { x: 0, y: 0 }, { width: 100, height: 20 }),
      component('group', { x: 10, y: 10 }, { width: 200, height: 120 }),
      component('child', { x: 30, y: 30 }, { width: 40, height: 20 }, 'group'),
    ]);
    const transaction = withDerivedDesignerGroupBounds(
      source,
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['outside'],
            patch: { style: { fontSize: 42 } },
          },
        ],
      },
      'base.group',
    );

    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.find((item) => item.id === 'group')).toEqual(
      expect.objectContaining({ position: { x: 30, y: 30 }, size: { width: 40, height: 20 } }),
    );
  });
});
