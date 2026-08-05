import { describe, expect, it } from 'vitest';
import {
  buildComponentIndex,
  getAncestorDepth,
  getAncestorIds,
  getDescendantIds,
  getDescendantSet,
  getPainterOrder,
  getRootIds,
  isEffectiveHidden,
  isEffectiveLocked,
} from '../../src/hierarchy/hierarchy.js';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from '../../src/hierarchy/query.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

describe('buildComponentIndex', () => {
  it('indexes components by id and parent', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'root' }), makeComponent({ id: 'child', parentId: 'root' })],
    });
    const index = buildComponentIndex(document);

    expect(index.byId.get('root')?.index).toBe(0);
    expect(index.byId.get('child')?.index).toBe(1);
    expect(index.byId.get('missing')).toBeUndefined();
    expect(index.childrenByParent.get(null)).toEqual(['root']);
    expect(index.childrenByParent.get('root')).toEqual(['child']);
  });

  it('preserves document order within sibling groups', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'a', parentId: 'parent' }),
        makeComponent({ id: 'b', parentId: 'parent' }),
        makeComponent({ id: 'c', parentId: 'parent' }),
        makeComponent({ id: 'parent' }),
      ],
    });
    const index = buildComponentIndex(document);
    expect(index.childrenByParent.get('parent')).toEqual(['a', 'b', 'c']);
  });

  it('returns undefined for parents with no children', () => {
    const index = buildComponentIndex(makeDocument());
    expect(index.childrenByParent.get(null)).toBeUndefined();
    expect(index.childrenByParent.get('missing')).toBeUndefined();
  });
});

describe('getRootIds', () => {
  it('returns root component ids in document order', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root1' }),
        makeComponent({ id: 'child', parentId: 'root1' }),
        makeComponent({ id: 'root2' }),
      ],
    });
    const index = buildComponentIndex(document);
    expect(getRootIds(index)).toEqual(['root1', 'root2']);
  });

  it('returns empty array when no roots exist', () => {
    const index = buildComponentIndex(makeDocument());
    expect(getRootIds(index)).toEqual([]);
  });
});

describe('getAncestorIds', () => {
  it('returns ancestor chain from immediate parent to root', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root' }),
        makeComponent({ id: 'mid', parentId: 'root' }),
        makeComponent({ id: 'leaf', parentId: 'mid' }),
      ],
    });
    const index = buildComponentIndex(document);
    expect(getAncestorIds(index, 'leaf')).toEqual(['mid', 'root']);
  });

  it('returns empty array for root component', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'root' })],
    });
    const index = buildComponentIndex(document);
    expect(getAncestorIds(index, 'root')).toEqual([]);
  });

  it('returns empty array for unknown component', () => {
    const index = buildComponentIndex(makeDocument());
    expect(getAncestorIds(index, 'missing')).toEqual([]);
  });
});

describe('getAncestorDepth', () => {
  it('returns zero for root components', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'root' })],
    });
    const index = buildComponentIndex(document);
    expect(getAncestorDepth(index, 'root')).toBe(0);
  });

  it('counts each ancestor exactly once', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'a' }),
        makeComponent({ id: 'b', parentId: 'a' }),
        makeComponent({ id: 'c', parentId: 'b' }),
        makeComponent({ id: 'd', parentId: 'c' }),
      ],
    });
    const index = buildComponentIndex(document);
    expect(getAncestorDepth(index, 'd')).toBe(3);
  });
});

describe('getDescendantIds', () => {
  it('returns all descendants in pre-order traversal', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root' }),
        makeComponent({ id: 'a', parentId: 'root' }),
        makeComponent({ id: 'b', parentId: 'root' }),
        makeComponent({ id: 'a1', parentId: 'a' }),
        makeComponent({ id: 'a2', parentId: 'a' }),
      ],
    });
    const index = buildComponentIndex(document);
    const descendants = getDescendantIds(index, 'root');
    expect(descendants).toEqual(['a', 'a1', 'a2', 'b']);
  });

  it('returns empty array for leaf component', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'leaf' })],
    });
    const index = buildComponentIndex(document);
    expect(getDescendantIds(index, 'leaf')).toEqual([]);
  });

  it('returns empty array for unknown component', () => {
    const index = buildComponentIndex(makeDocument());
    expect(getDescendantIds(index, 'missing')).toEqual([]);
  });
});

describe('getDescendantSet', () => {
  it('unions descendants of multiple roots', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'r1' }),
        makeComponent({ id: 'r1c', parentId: 'r1' }),
        makeComponent({ id: 'r2' }),
        makeComponent({ id: 'r2c', parentId: 'r2' }),
      ],
    });
    const index = buildComponentIndex(document);
    const set = getDescendantSet(index, ['r1', 'r2']);
    expect(set).toEqual(new Set(['r1c', 'r2c']));
  });

  it('deduplicates when targets share descendants', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root' }),
        makeComponent({ id: 'mid', parentId: 'root' }),
        makeComponent({ id: 'leaf', parentId: 'mid' }),
      ],
    });
    const index = buildComponentIndex(document);
    const set = getDescendantSet(index, ['root', 'mid']);
    expect(set).toEqual(new Set(['mid', 'leaf']));
  });
});

describe('isEffectiveHidden', () => {
  it('returns false for visible components with visible ancestors', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'root' }), makeComponent({ id: 'child', parentId: 'root' })],
    });
    const index = buildComponentIndex(document);
    expect(isEffectiveHidden(index, 'child')).toBe(false);
  });

  it('returns true when component itself is hidden', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'root', status: { locked: false, hidden: true } })],
    });
    const index = buildComponentIndex(document);
    expect(isEffectiveHidden(index, 'root')).toBe(true);
  });

  it('returns true when any ancestor is hidden', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root', status: { locked: false, hidden: true } }),
        makeComponent({ id: 'mid', parentId: 'root' }),
        makeComponent({ id: 'leaf', parentId: 'mid' }),
      ],
    });
    const index = buildComponentIndex(document);
    expect(isEffectiveHidden(index, 'leaf')).toBe(true);
    expect(isEffectiveHidden(index, 'mid')).toBe(true);
  });

  it('returns false for unknown component', () => {
    const index = buildComponentIndex(makeDocument());
    expect(isEffectiveHidden(index, 'missing')).toBe(false);
  });
});

describe('isEffectiveLocked', () => {
  it('returns true when any ancestor is locked', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root', status: { locked: true, hidden: false } }),
        makeComponent({ id: 'child', parentId: 'root' }),
      ],
    });
    const index = buildComponentIndex(document);
    expect(isEffectiveLocked(index, 'child')).toBe(true);
  });

  it('returns false when no ancestor is locked', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'root' }), makeComponent({ id: 'child', parentId: 'root' })],
    });
    const index = buildComponentIndex(document);
    expect(isEffectiveLocked(index, 'child')).toBe(false);
  });
});

describe('public effective state queries', () => {
  it('uses the same ancestor inheritance semantics as internal hierarchy queries', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'parent', status: { locked: true, hidden: true } }),
        makeComponent({ id: 'child', parentId: 'parent' }),
      ],
    });

    expect(isScreenComponentEffectivelyHidden(document, 'child')).toBe(true);
    expect(isScreenComponentEffectivelyLocked(document, 'child')).toBe(true);
  });
});

describe('getPainterOrder', () => {
  it('traverses roots in document order then recurses pre-order', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root1', zIndex: 0 }),
        makeComponent({ id: 'root2', zIndex: 0 }),
        makeComponent({ id: 'r2child', parentId: 'root2' }),
        makeComponent({ id: 'r1child', parentId: 'root1' }),
      ],
    });
    expect(getPainterOrder(document)).toEqual(['root1', 'r1child', 'root2', 'r2child']);
  });

  it('sorts siblings by zIndex ascending then document order', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'a', zIndex: 5 }),
        makeComponent({ id: 'b', zIndex: 1 }),
        makeComponent({ id: 'c', zIndex: 5 }),
        makeComponent({ id: 'd', zIndex: 1 }),
      ],
    });
    expect(getPainterOrder(document)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps same-zIndex siblings in document order', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'a', zIndex: 1 }),
        makeComponent({ id: 'b', zIndex: 1 }),
        makeComponent({ id: 'c', zIndex: 1 }),
      ],
    });
    expect(getPainterOrder(document)).toEqual(['a', 'b', 'c']);
  });

  it('treats each root subtree as a complete drawing span', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'root1', zIndex: 0 }),
        makeComponent({ id: 'root2', zIndex: 0 }),
        makeComponent({ id: 'r1child', parentId: 'root1', zIndex: 100 }),
      ],
    });
    const order = getPainterOrder(document);
    // root2 subtree paints entirely above root1 subtree, even though r1child
    // has a higher zIndex than root2.
    expect(order).toEqual(['root1', 'r1child', 'root2']);
    expect(order.indexOf('root1')).toBeLessThan(order.indexOf('root2'));
    expect(order.indexOf('r1child')).toBeLessThan(order.indexOf('root2'));
  });

  it('handles deep pre-order traversal', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'a' }),
        makeComponent({ id: 'b', parentId: 'a' }),
        makeComponent({ id: 'c', parentId: 'b' }),
        makeComponent({ id: 'd', parentId: 'c' }),
      ],
    });
    expect(getPainterOrder(document)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns empty array for empty document', () => {
    expect(getPainterOrder(makeDocument())).toEqual([]);
  });
});
