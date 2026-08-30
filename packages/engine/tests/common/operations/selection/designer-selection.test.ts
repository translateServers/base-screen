import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  hasSelectedAncestor,
  selectedComponents,
  selectedRootIds,
  selectionSubtree,
} from '../../../../src/common/operations/selection/designer-selection.js';

function component(
  id: string,
  parentId: string | null = null,
  position: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId,
    position,
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

describe('designer selection helpers', () => {
  const doc = document([
    component('group'),
    component('child', 'group', { x: 10, y: 10 }),
    component('grandchild', 'child', { x: 20, y: 20 }),
    component('sibling', null, { x: 300, y: 0 }),
  ]);

  it('returns only explicitly selected components', () => {
    expect(selectedComponents(doc, ['group']).map((item) => item.id)).toEqual(['group']);
  });

  it('expands a selection to the full subtree', () => {
    expect(selectionSubtree(doc, ['group']).map((item) => item.id)).toEqual([
      'group',
      'child',
      'grandchild',
    ]);
    expect(selectionSubtree(doc, ['child']).map((item) => item.id)).toEqual([
      'child',
      'grandchild',
    ]);
    expect(selectionSubtree(doc, ['sibling']).map((item) => item.id)).toEqual(['sibling']);
  });

  it('expands a mixed selection without duplicating shared descendants', () => {
    expect(selectionSubtree(doc, ['group', 'child']).map((item) => item.id)).toEqual([
      'group',
      'child',
      'grandchild',
    ]);
  });

  it('detects a selected ancestor', () => {
    const selected = new Set(['group']);
    expect(hasSelectedAncestor(doc, selected, 'child')).toBe(true);
    expect(hasSelectedAncestor(doc, selected, 'grandchild')).toBe(true);
    expect(hasSelectedAncestor(doc, selected, 'sibling')).toBe(false);
    expect(hasSelectedAncestor(doc, selected, 'group')).toBe(false);
  });

  it('prunes selection to top-level roots', () => {
    expect(selectedRootIds(doc, ['group', 'child', 'grandchild'])).toEqual(['group']);
    expect(selectedRootIds(doc, ['child', 'sibling'])).toEqual(['child', 'sibling']);
    expect(selectedRootIds(doc, ['group', 'sibling'])).toEqual(['group', 'sibling']);
  });
});
