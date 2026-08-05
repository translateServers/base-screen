import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createClipboard, createPasteTransaction } from './designer-clipboard.js';
import { createReparentTransaction } from './designer-layout-operations.js';
import { resizeScreenComponents, rotateScreenComponents } from './designer-transform.js';

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
});
