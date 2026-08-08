import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  createGroupRotationTransaction,
  createGroupSizeTransaction,
  withDerivedDesignerGroupBounds,
} from '../../../src/common/operations/designer-group.js';

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
});
