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
    blueprint: { nodes: [], edges: [] },
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

  // 以前的特征测试记录的是「任何事务都把组壳吸附到子项并集」，带内边距的容器因此在第一次无关编辑
  // 后被压平（组合分片的卡片外壳、作者手搭的面板都会中招）。现在逐边判断：留有内边距的边保持。
  it('keeps the padding of a container on an unrelated edit', () => {
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

    expect(transaction.commands).toHaveLength(1);
    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.find((item) => item.id === 'group')).toEqual(
      expect.objectContaining({ position: { x: 10, y: 10 }, size: { width: 200, height: 120 } }),
    );
  });

  it('keeps a padded container when a child moves inside it, and grows only where it overflows', () => {
    const source = document([
      component('group', { x: 10, y: 10 }, { width: 200, height: 120 }),
      component('child', { x: 30, y: 30 }, { width: 40, height: 20 }, 'group'),
    ]);
    const move = (position: { readonly x: number; readonly y: number }) => {
      const result = applyScreenDocumentTransaction(
        source,
        withDerivedDesignerGroupBounds(
          source,
          {
            commands: [{ type: 'update-components', componentIds: ['child'], patch: { position } }],
          },
          'base.group',
        ),
      );
      if (!result.ok) throw new Error('transaction must apply');
      return result.document.components.find((item) => item.id === 'group');
    };

    expect(move({ x: 60, y: 50 })).toEqual(
      expect.objectContaining({ position: { x: 10, y: 10 }, size: { width: 200, height: 120 } }),
    );
    // 拖出右下角：右边与下边外扩到包住子项，左边与上边的内边距不动。
    expect(move({ x: 190, y: 120 })).toEqual(
      expect.objectContaining({ position: { x: 10, y: 10 }, size: { width: 220, height: 130 } }),
    );
  });

  it('follows the children on the sides that touched them and keeps the padded sides', () => {
    // 子项贴着左边与上边，右边与下边留白。
    const source = document([
      component('group', { x: 10, y: 10 }, { width: 200, height: 120 }),
      component('child', { x: 10, y: 10 }, { width: 40, height: 20 }, 'group'),
    ]);
    const transaction = withDerivedDesignerGroupBounds(
      source,
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['child'],
            patch: { position: { x: 30, y: 40 } },
          },
        ],
      },
      'base.group',
    );
    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.find((item) => item.id === 'group')).toEqual(
      expect.objectContaining({ position: { x: 30, y: 40 }, size: { width: 180, height: 90 } }),
    );
  });

  it('keeps the size of a container that had no children before the edit', () => {
    const source = document([
      component('group', { x: 0, y: 0 }, { width: 300, height: 200 }),
      component('child', { x: 40, y: 40 }, { width: 40, height: 20 }),
    ]);
    const transaction = withDerivedDesignerGroupBounds(
      source,
      { commands: [{ type: 'reparent-components', componentIds: ['child'], parentId: 'group' }] },
      'base.group',
    );
    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.find((item) => item.id === 'group')).toEqual(
      expect.objectContaining({ position: { x: 0, y: 0 }, size: { width: 300, height: 200 } }),
    );
  });
});
