import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  collectDesignerSnapCandidates,
  type DesignerSnapCandidates,
} from '../../../src/browser/viewport/designer-canvas-snap-candidates.js';
import { DesignerSnapIndex } from '../../../src/browser/viewport/designer-canvas-snap-index.js';
import { checkSnapPoses } from '../../../src/common/vendor/moveable/snappable/snap.js';
import type { SnapGuideline } from '../../../src/common/vendor/moveable/types.js';

describe('DesignerSnapIndex Moveable equivalence', () => {
  it('preserves unsorted candidate order, duplicate geometry, anchor ties and axis independence', () => {
    const candidates = targets([102, 98, 102, -2, 48, 52], [70, 30, 70, 110]);
    const index = new DesignerSnapIndex(candidates);
    const posesX = [0, 50, 100];
    const posesY = [32, 72, 112];
    const result = check(index.query(posesX, posesY, 5), posesX, posesY, 5);
    expect(result).toEqual(check(fullGuidelines(candidates), posesX, posesY, 5));
    const point = check(index.query([100], [72], 5), [100], [72], 5);
    expect(point.vertical.posInfos[0]?.guidelineInfos[0]?.guideline.pos[0]).toBe(102);
    expect(point.horizontal.posInfos[0]?.guidelineInfos).toHaveLength(2);
  });

  it.each([0.1, 0.25, 1, 1.25, 2, 5])(
    'matches full-input Moveable across seeded point and selection queries at zoom %s',
    (zoom) => {
      let seed = 0x4a17;
      const random = () => {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
      };
      const values = () =>
        Array.from({ length: 160 }, () => Math.round(random() * 2_000) / 4 - 250);
      const candidates = targets(values(), values());
      const index = new DesignerSnapIndex(candidates);
      const full = fullGuidelines(candidates);
      const threshold = 5 / zoom;
      for (let frame = 0; frame < 80; frame++) {
        const x = random() * 600 - 300;
        const y = random() * 600 - 300;
        const posesX = frame % 2 === 0 ? [x] : [x, x + 25, x + 50];
        const posesY = frame % 2 === 0 ? [y] : [y, y + 17, y + 34];
        expect(check(index.query(posesX, posesY, threshold), posesX, posesY, threshold)).toEqual(
          check(full, posesX, posesY, threshold),
        );
      }
    },
  );

  it('uses the original subtraction at exact and fractional threshold boundaries', () => {
    const candidates = targets([0.3, -0.3, 1e9, -1e9, 0, Number.EPSILON], [100]);
    const index = new DesignerSnapIndex(candidates);
    for (const threshold of [0, 0.2, 1 / 1.25, 5, 50]) {
      for (const { value } of candidates.x) {
        for (const offset of [-threshold, threshold, threshold + 1e-6, -threshold - 1e-6]) {
          const poses = [value + offset];
          expect(check(index.query(poses, [], threshold), poses, [], threshold)).toEqual(
            check(fullGuidelines(candidates), poses, [], threshold),
          );
        }
      }
    }
  });

  it('shares prepared guidelines and excludes distant targets from each frame', () => {
    const index = new DesignerSnapIndex(targets(Array.from({ length: 10_000 }, (_, n) => n * 10)));
    const first = index.query([12_345, 56_789], [], 5);
    const next = index.query([12_345, 56_789], [], 5);
    expect(first).toHaveLength(3);
    expect(next[0]).toBe(first[0]);
    expect(next[1]).toBe(first[1]);
    expect(next[2]).toBe(first[2]);
    expect(index.query([-100], [], 5)).toEqual([]);
  });

  it('retains rotated and locked targets while excluding selected and effectively hidden nodes', () => {
    const document: ScreenDocument = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [
        component('rotated', 80, 60, 37),
        { ...component('locked', 400, 100), status: { locked: true, hidden: false } },
        { ...component('parent', 700, 300), status: { locked: false, hidden: true } },
        { ...component('child', 725, 375), parentId: 'parent' },
        component('selected-a', 520, 20),
        component('selected-b', 620, 20),
      ],
      variables: [],
      blueprint: { rules: [] },
    };
    const candidates = collectDesignerSnapCandidates(document, { x: [75], y: [35] }, [
      'selected-a',
      'selected-b',
    ]);
    const values = candidates.x.map((entry) => entry.value);
    expect(values).toContain(400);
    expect(values).not.toContain(725);
    expect(values).not.toContain(700);
    expect(values).not.toContain(520);
    expect(values).not.toContain(620);
    const index = new DesignerSnapIndex(candidates);
    for (const target of candidates.x) {
      const x = [target.value + 0.5];
      const y = [target.start + 0.5];
      expect(check(index.query(x, y, 5), x, y, 5)).toEqual(
        check(fullGuidelines(candidates), x, y, 5),
      );
    }
  });
});

function targets(x: readonly number[], y: readonly number[] = []): DesignerSnapCandidates {
  const axis = (values: readonly number[]) =>
    values.map((value, order) => ({ value, start: order * 7, size: 20 + order }));
  return { x: axis(x), y: axis(y) };
}

// The unfiltered adapter used before indexing; the authority for competition remains the vendor.
function fullGuidelines(candidates: DesignerSnapCandidates): readonly SnapGuideline[] {
  return [
    ...candidates.x.map((candidate) => ({
      type: 'vertical' as const,
      direction: '',
      pos: [candidate.value, candidate.start],
      size: candidate.size,
    })),
    ...candidates.y.map((candidate) => ({
      type: 'horizontal' as const,
      direction: '',
      pos: [candidate.start, candidate.value],
      size: candidate.size,
    })),
  ];
}

function check(
  guidelines: readonly SnapGuideline[],
  x: readonly number[],
  y: readonly number[],
  threshold: number,
) {
  return checkSnapPoses(
    guidelines,
    x,
    y,
    ['start', 'center', 'end'],
    ['start', 'center', 'end'],
    threshold,
    threshold,
    [1, 1],
  );
}

function component(id: string, x: number, y: number, rotation = 0) {
  return {
    id,
    type: 'base.rectangle',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width: 100, height: 40 },
    rotation,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  } as const;
}
