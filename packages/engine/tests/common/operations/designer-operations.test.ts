import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  createClipboard,
  createPasteTransaction,
} from '../../../src/common/operations/designer-clipboard.js';
import {
  createAlignmentTransaction,
  createDistributionTransaction,
  createReparentTransaction,
} from '../../../src/common/operations/designer-layout-operations.js';
import {
  selectionTargetInContext,
  selectionTargetsInContext,
} from '../../../src/common/operations/designer-selection.js';
import {
  resizeScreenComponents,
  rotateScreenComponents,
} from '../../../src/common/operations/designer-transform.js';

function component(id: string, x: number, y: number): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: { text: id },
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

describe('designer operations', () => {
  it('resizes a multi-selection from the opposite corner with a positive minimum size', () => {
    const before = [component('first', 0, 0), component('second', 120, 0)];
    const after = resizeScreenComponents(
      before,
      'south-east',
      { x: 440, y: 200 },
      {
        shift: false,
        alt: false,
      },
    );

    expect(after).toHaveLength(2);
    expect(after[0]?.size.width).toBeGreaterThan(100);
    expect(after[1]?.position.x).toBeGreaterThan(120);
    expect(after.every((item) => item.size.width >= 1 && item.size.height >= 1)).toBe(true);
  });

  it('snaps rotate results to fifteen degrees and normalizes rotation', () => {
    const before = [component('first', 0, 0)];
    const after = rotateScreenComponents(before, { x: 100, y: 25 }, { x: 75, y: 100 }, true);

    expect(after[0]?.rotation).toBe(75);
  });

  it('copies detached subtrees and rewrites ids and internal parents on paste', () => {
    const root = component('root', 0, 0);
    const child = { ...component('child', 10, 10), parentId: 'root' };
    const source = document([root, child]);
    const clipboard = createClipboard(source, ['root']);
    if (clipboard === null) {
      throw new Error('Expected clipboard contents.');
    }

    const transaction = createPasteTransaction(source, clipboard, { x: 20, y: 20 });
    expect(transaction.commands).toHaveLength(2);
    expect(transaction.commands[0]).toMatchObject({
      type: 'add-component',
      component: { id: 'root-copy-1', parentId: null, position: { x: 20, y: 20 } },
    });
    expect(transaction.commands[1]).toMatchObject({
      type: 'add-component',
      component: { id: 'child-copy-1', parentId: 'root-copy-1', position: { x: 10, y: 10 } },
    });
  });

  it('reparents without changing the canonical canvas position', () => {
    const parent = component('parent', 100, 200);
    const child = component('child', 320, 450);
    const transaction = createReparentTransaction(document([parent, child]), ['child'], 'parent');

    expect(transaction.commands).toEqual([
      { type: 'reparent-components', componentIds: ['child'], parentId: 'parent' },
    ]);
  });

  it('applies alignment deltas to the whole group subtree', () => {
    const group = { ...component('group', 0, 100) };
    const child = { ...component('child', 20, 130), parentId: 'group' };
    const sibling = component('sibling', 300, 0);
    const source = document([group, child, sibling]);

    const transaction = createAlignmentTransaction(source, ['group', 'sibling'], 'top');

    const positions = new Map(
      transaction.commands.map((command) => {
        const { componentIds, patch } = command as {
          readonly componentIds: readonly string[];
          readonly patch: { readonly position: { readonly x: number; readonly y: number } };
        };
        return [componentIds[0]!, patch.position];
      }),
    );
    // 组对齐到 sibling 顶部（y=0），子组件保持相对位置跟随。
    expect(positions.get('group')).toEqual({ x: 0, y: 0 });
    expect(positions.get('child')).toEqual({ x: 20, y: 30 });
    expect(transaction.commands).toHaveLength(2);
  });

  it('applies distribution deltas to the whole group subtree', () => {
    const group = { ...component('group', 400, 0) };
    const child = { ...component('child', 420, 30), parentId: 'group' };
    const middle = component('middle', 250, 0);
    const end = component('end', 800, 0);
    const source = document([group, child, middle, end]);

    const transaction = createDistributionTransaction(
      source,
      ['group', 'middle', 'end'],
      'horizontal',
    );

    const moved = new Map(
      transaction.commands.map((command) => {
        const { componentIds, patch } = command as {
          readonly componentIds: readonly string[];
          readonly patch: { readonly position: { readonly x: number; readonly y: number } };
        };
        return [componentIds[0]!, patch.position];
      }),
    );
    const groupDelta = moved.get('group')!.x - group.position.x;
    expect(groupDelta).toBe(125);
    // 组内子组件与组保持相同位移。
    expect(moved.get('child')).toEqual({ x: 420 + groupDelta, y: 30 });
  });

  it('skips directly locked descendants inside a moving group', () => {
    const group = { ...component('group', 0, 100) };
    const child = {
      ...component('child', 20, 130),
      parentId: 'group',
      status: { locked: true, hidden: false },
    };
    const sibling = component('sibling', 300, 0);
    const source = document([group, child, sibling]);

    const transaction = createAlignmentTransaction(source, ['group', 'sibling'], 'top');
    const movedIds = transaction.commands.map(
      (command) => (command as { readonly componentIds: readonly string[] }).componentIds[0],
    );

    expect(movedIds).toEqual(['group']);
    expect(movedIds).not.toContain('child');
  });

  it('R3 resolves canvas hits to the current group-editing context', () => {
    const group = { ...component('group', 0, 0), type: 'base.group' };
    const childGroup = {
      ...component('child-group', 20, 20),
      type: 'base.group',
      parentId: 'group',
    };
    const leaf = { ...component('leaf', 30, 30), parentId: 'child-group' };
    const source = document([group, childGroup, leaf]);

    expect(selectionTargetInContext(source, 'leaf', null)).toBe('group');
    expect(selectionTargetInContext(source, 'leaf', 'group')).toBe('child-group');
    expect(selectionTargetInContext(source, 'leaf', 'child-group')).toBe('leaf');
    expect(selectionTargetsInContext(source, ['group', 'child-group', 'leaf'], 'group')).toEqual([
      'child-group',
    ]);
  });
});
