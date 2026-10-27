import { describe, expect, it } from 'vitest';
import {
  calculateScreenAlignment,
  calculateScreenDistribution,
  canvasPointToViewport,
  chooseScreenSnapCandidate,
  getScreenComponentBounds,
  getScreenSelectionBounds,
  hitTestScreenComponents,
  queryScreenComponentsInRect,
  viewportPointToCanvas,
} from '../../src/geometry/geometry.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

describe('geometry transforms and bounds', () => {
  it('round trips canvas points through the viewport transform', () => {
    const viewport = { zoom: 2, offset: { x: 10, y: -20 } };
    const viewportPoint = canvasPointToViewport({ x: 15, y: 25 }, viewport);

    expect(viewportPoint).toEqual({ x: 40, y: 30 });
    expect(viewportPointToCanvas(viewportPoint, viewport)).toEqual({ x: 15, y: 25 });
  });

  it('rejects coordinate transforms that overflow finite geometry', () => {
    expect(() =>
      canvasPointToViewport({ x: Number.MAX_VALUE, y: 0 }, { zoom: 64, offset: { x: 0, y: 0 } }),
    ).toThrow(RangeError);
  });

  it('calculates rotated component and selection bounds', () => {
    const first = makeComponent({ id: 'first', size: { width: 100, height: 100 }, rotation: 45 });
    const second = makeComponent({
      id: 'second',
      position: { x: 200, y: 100 },
      size: { width: 50, height: 100 },
    });

    const bounds = getScreenComponentBounds(first);
    expect(bounds.left).toBeCloseTo(-20.71, 2);
    expect(bounds.right).toBeCloseTo(120.71, 2);
    expect(getScreenSelectionBounds([first, second])?.right).toBe(250);
    expect(getScreenSelectionBounds([])).toBeNull();
  });

  it('rejects geometry outside Contracts ranges', () => {
    expect(() =>
      getScreenComponentBounds(makeComponent({ position: { x: 1_000_001, y: 0 } })),
    ).toThrow(RangeError);
    expect(() =>
      viewportPointToCanvas({ x: 0, y: 0 }, { zoom: 0, offset: { x: 0, y: 0 } }),
    ).toThrow(RangeError);
  });
});

describe('hit testing and rectangle queries', () => {
  it('returns painter order in reverse and ignores effective hidden components', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'bottom', zIndex: 1, size: { width: 100, height: 100 } }),
        makeComponent({ id: 'top', zIndex: 2, size: { width: 100, height: 100 } }),
        makeComponent({ id: 'hidden-parent', status: { locked: false, hidden: true } }),
        makeComponent({
          id: 'hidden-child',
          parentId: 'hidden-parent',
          size: { width: 100, height: 100 },
        }),
      ],
    });

    expect(hitTestScreenComponents(document, { x: 10, y: 10 })).toEqual(['top', 'bottom']);
  });

  it('does not hit the empty AABB corner of a rotated component', () => {
    const document = makeDocument({
      components: [makeComponent({ size: { width: 100, height: 100 }, rotation: 45 })],
    });

    expect(hitTestScreenComponents(document, { x: -15, y: -15 })).toEqual([]);
    expect(hitTestScreenComponents(document, { x: 50, y: 50 })).toEqual(['c1']);
  });

  it('expands thin components to a minimum hit thickness on the thin axis only', () => {
    const document = makeDocument({
      components: [
        makeComponent({
          id: 'rule',
          position: { x: 100, y: 200 },
          size: { width: 320, height: 2 },
        }),
        makeComponent({
          id: 'panel',
          position: { x: 500, y: 0 },
          size: { width: 100, height: 200 },
        }),
      ],
    });

    // 严格命中：线只有 2px 厚，离中心 4px 就落空。
    expect(hitTestScreenComponents(document, { x: 200, y: 205 })).toEqual([]);
    expect(hitTestScreenComponents(document, { x: 200, y: 205 }, { minimumThickness: 10 })).toEqual(
      ['rule'],
    );
    // 长轴不加宽：命中带只把 2px 撑到 10px，不越过线的两端。
    expect(hitTestScreenComponents(document, { x: 424, y: 201 }, { minimumThickness: 10 })).toEqual(
      [],
    );
    // 厚轴不享受最小厚度：正常组件边界外 5px 仍然不是命中目标。
    expect(hitTestScreenComponents(document, { x: 605, y: 100 }, { minimumThickness: 10 })).toEqual(
      [],
    );
  });

  it('measures the minimum hit thickness in the component local frame', () => {
    const document = makeDocument({
      components: [
        makeComponent({
          id: 'vertical-rule',
          position: { x: 100, y: 100 },
          size: { width: 200, height: 2 },
          rotation: 90,
        }),
      ],
    });

    // 旋转 90° 后线的"薄轴"指向 x：横向偏 4px 命中，纵向偏出线的长度就落空。
    expect(hitTestScreenComponents(document, { x: 204, y: 200 }, { minimumThickness: 10 })).toEqual(
      ['vertical-rule'],
    );
    expect(hitTestScreenComponents(document, { x: 100, y: 304 }, { minimumThickness: 10 })).toEqual(
      [],
    );
  });

  it('rejects a negative minimum hit thickness', () => {
    const document = makeDocument({ components: [makeComponent()] });

    expect(() =>
      hitTestScreenComponents(document, { x: 10, y: 10 }, { minimumThickness: -1 }),
    ).toThrow(RangeError);
  });

  it('uses rotated geometry for intersect and contain queries', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'rotated', size: { width: 100, height: 100 }, rotation: 45 }),
        makeComponent({ id: 'outside', position: { x: 300, y: 300 } }),
      ],
    });

    expect(
      queryScreenComponentsInRect(document, { x: 40, y: -5, width: 20, height: 20 }, 'intersect'),
    ).toEqual(['rotated']);
    expect(
      queryScreenComponentsInRect(document, { x: 0, y: 0, width: 100, height: 100 }, 'contain'),
    ).toEqual([]);
  });
});

describe('alignment, distribution, and snap', () => {
  it('uses locked items as the alignment reference without moving them', () => {
    const components = [
      makeComponent({ id: 'moving', position: { x: 100, y: 0 } }),
      makeComponent({
        id: 'locked',
        position: { x: 20, y: 0 },
        status: { locked: true, hidden: false },
      }),
    ];

    expect(calculateScreenAlignment(components, 'x', 'start')).toEqual([
      { componentId: 'moving', delta: { x: -80, y: 0 } },
    ]);
  });

  it('aligns end edges to the widest right edge instead of collapsing to the leftmost', () => {
    const components = [
      makeComponent({ id: 'left', position: { x: 20, y: 0 }, size: { width: 40, height: 10 } }),
      makeComponent({ id: 'wide', position: { x: 100, y: 0 }, size: { width: 120, height: 10 } }),
    ];

    expect(calculateScreenAlignment(components, 'x', 'end')).toEqual([
      { componentId: 'left', delta: { x: 160, y: 0 } },
    ]);
  });

  it('aligns centers to the union bounds center', () => {
    const components = [
      makeComponent({ id: 'left', position: { x: 0, y: 0 }, size: { width: 20, height: 10 } }),
      makeComponent({ id: 'right', position: { x: 80, y: 0 }, size: { width: 40, height: 10 } }),
    ];

    expect(calculateScreenAlignment(components, 'x', 'center')).toEqual([
      { componentId: 'left', delta: { x: 50, y: 0 } },
      { componentId: 'right', delta: { x: -40, y: 0 } },
    ]);
  });

  it('distributes movable items between fixed endpoints by edge gaps', () => {
    const components = [
      makeComponent({ id: 'first', position: { x: 0, y: 0 }, size: { width: 20, height: 10 } }),
      makeComponent({ id: 'middle', position: { x: 80, y: 0 }, size: { width: 20, height: 10 } }),
      makeComponent({ id: 'last', position: { x: 200, y: 0 }, size: { width: 20, height: 10 } }),
    ];

    expect(calculateScreenDistribution(components, 'x')).toEqual([
      { componentId: 'middle', delta: { x: 20, y: 0 } },
    ]);
  });

  it('uses the full snap total order while preserving duplicate input order', () => {
    const first = {
      axis: 'y' as const,
      movingValue: 10,
      targetValue: 12,
      sourceComponentId: 'z',
      targetComponentId: 'a',
    };
    const second = { ...first, axis: 'x' as const, sourceComponentId: 'b' };
    const third = { ...second };

    expect(chooseScreenSnapCandidate([first, second, third], 2)).toEqual(second);
    expect(chooseScreenSnapCandidate([first], 1)).toBeNull();
    expect(() => chooseScreenSnapCandidate([first], -1)).toThrow(RangeError);
  });
});
