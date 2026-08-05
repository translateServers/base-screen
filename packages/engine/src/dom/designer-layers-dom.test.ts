import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createDesignerLayerView } from './designer-layers-dom.js';

function component(
  id: string,
  parentId: string | null,
  zIndex: number,
  hidden = false,
): ScreenComponentNode {
  return {
    id,
    parentId,
    zIndex,
    type: `${id}.material`,
    name: id,
    position: { x: 0, y: 0 },
    size: { width: 10, height: 10 },
    rotation: 0,
    status: { hidden, locked: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

describe('designer layers view', () => {
  it('uses canonical painter order and preserves missing-material nodes with diagnostics', () => {
    const view = createDesignerLayerView(
      document([
        component('root', null, 1, true),
        component('child', 'root', 0),
        component('back', null, 0),
      ]),
      undefined,
    );

    expect(view.items.map((item) => [item.id, item.depth, item.hidden])).toEqual([
      ['back', 0, false],
      ['root', 0, true],
      ['child', 1, true],
    ]);
    expect(view.items).toHaveLength(3);
    expect(view.diagnostics).toHaveLength(3);
  });
});
