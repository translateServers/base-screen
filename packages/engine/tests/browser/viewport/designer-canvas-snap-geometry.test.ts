import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  collectDesignerSnapComponentBounds,
  resolveDesignerSnapScope,
} from '../../../src/browser/viewport/designer-canvas-snap-geometry.js';

const document: ScreenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#000000' },
  components: [
    node('frame', null, 100, 100, 400, 300),
    node('a', 'frame', 150, 150),
    node('b', 'frame', 300, 150),
    node('b-child', 'b', 320, 160),
    node('other-frame', null, 600, 100, 300, 300),
    node('c', 'other-frame', 650, 150),
    node('root', null, 20, 450),
    { ...node('hidden', 'frame', 150, 300), status: { locked: false, hidden: true } },
  ],
  variables: [],
  blueprint: { relations: [] },
};

describe('resolveDesignerSnapScope', () => {
  it('uses the common parent of the selection roots, ignoring dragged descendants', () => {
    expect(resolveDesignerSnapScope(document, new Set(['a']))).toBe('frame');
    expect(resolveDesignerSnapScope(document, new Set(['b', 'b-child']))).toBe('frame');
    expect(resolveDesignerSnapScope(document, new Set(['frame', 'a', 'b', 'b-child']))).toBe(
      null,
    );
  });

  it('falls back to the canvas root for mixed parents and for no selection', () => {
    expect(resolveDesignerSnapScope(document, new Set(['a', 'c']))).toBeNull();
    expect(resolveDesignerSnapScope(document, new Set())).toBeNull();
  });
});

describe('collectDesignerSnapComponentBounds scope', () => {
  const ids = (scope: string | null | undefined, excluded: readonly string[]) =>
    collectDesignerSnapComponentBounds(document, new Set(excluded), scope).map(
      (bounds) => bounds.left,
    );

  it('collects the siblings and the parent container, not nested or foreign children', () => {
    // frame 100, b 300; not b-child (320), c (650), root (20) or the hidden sibling.
    expect(ids('frame', ['a'])).toEqual([100, 300]);
  });

  it('treats containers as a whole at the root', () => {
    expect(ids(null, ['root'])).toEqual([100, 600]);
  });

  it('keeps every visible component without a scope', () => {
    expect(ids(undefined, ['a'])).toEqual([100, 300, 320, 600, 650, 20]);
  });
});

function node(
  id: string,
  parentId: string | null,
  x: number,
  y: number,
  width = 100,
  height = 40,
) {
  return {
    id,
    type: 'base.rectangle',
    name: id,
    parentId,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}
