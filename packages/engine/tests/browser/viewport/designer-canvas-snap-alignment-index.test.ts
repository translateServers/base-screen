import { describe, expect, it } from 'vitest';
import { DesignerAlignmentIndex } from '../../../src/browser/viewport/designer-canvas-snap-alignment-index.js';
import type { DesignerSnapCandidates } from '../../../src/browser/viewport/designer-canvas-snap-candidates.js';
import type { DesignerSnapComponentBounds } from '../../../src/browser/viewport/designer-canvas-snap-geometry.js';
import { checkSnapPoses } from '../../../src/common/vendor/moveable/snappable/snap.js';
import type { SnapGuideline } from '../../../src/common/vendor/moveable/types.js';

const CANVAS = { width: 960, height: 540, backgroundColor: '#000000' } as const;
const NO_GUIDES = { x: [], y: [] } as const;

describe('DesignerAlignmentIndex competition input', () => {
  it.each([0.1, 0.25, 1, 1.25, 2, 5])(
    'matches Moveable over every unique coordinate for seeded point and selection queries at zoom %s',
    (zoom) => {
      let seed = 0x4a17 + Math.round(zoom * 100);
      const random = () => {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
      };
      const values = () =>
        Array.from({ length: 160 }, () => Math.round(random() * 2_000) / 4 - 250);
      const candidates = targets(values(), values());
      const index = DesignerAlignmentIndex.fromCandidates(candidates);
      const full = allCoordinates(candidates);
      const threshold = 8 / zoom;
      for (let frame = 0; frame < 80; frame++) {
        const x = random() * 600 - 300;
        const y = random() * 600 - 300;
        const posesX = frame % 2 === 0 ? [x] : [x, x + 25, x + 50];
        const posesY = frame % 2 === 0 ? [y] : [y, y + 17, y + 34];
        expect(winner(index.query(posesX, posesY, threshold), posesX, posesY, threshold)).toEqual(
          winner(full, posesX, posesY, threshold),
        );
      }
    },
  );

  it('uses the original subtraction at exact and fractional threshold boundaries', () => {
    const candidates = targets([0.3, -0.3, 1e9, -1e9, 0, Number.EPSILON], [100]);
    const index = DesignerAlignmentIndex.fromCandidates(candidates);
    for (const threshold of [0, 0.2, 1 / 1.25, 8, 50]) {
      for (const { value } of candidates.x) {
        for (const offset of [-threshold, threshold, threshold + 1e-6, -threshold - 1e-6]) {
          const poses = [value + offset];
          expect(winner(index.query(poses, [], threshold), poses, [], threshold)).toEqual(
            winner(allCoordinates(candidates), poses, [], threshold),
          );
        }
      }
    }
  });

  it('returns each coordinate once, shares guideline objects and excludes distant targets', () => {
    const index = DesignerAlignmentIndex.fromScene(CANVAS, NO_GUIDES, [
      box(100, 0, 100, 40),
      box(100, 400, 100, 40),
    ]);
    const first = index.query([101], [], 8);
    expect(first.map((line) => line.pos[0])).toEqual([100]);
    expect(index.query([101], [], 8)[0]).toBe(first[0]);
    expect(index.query([300], [], 8)).toEqual([]);
  });
});

describe('DesignerAlignmentIndex reach', () => {
  // Two components share x = 100, 210 apart vertically; the focus sits between them.
  const index = DesignerAlignmentIndex.fromScene(CANVAS, NO_GUIDES, [
    box(100, 0, 100, 40),
    box(100, 500, 100, 40),
  ]);

  it('drops component lines whose component is farther than the reach on the other axis', () => {
    const focus = (y: number) => ({ left: 101, right: 101, top: y, bottom: y });
    const values = (y: number, reach: number) =>
      index.query([101], [], 8, focus(y), reach).map((line) => line.pos[0]);
    expect(values(250, 180)).toEqual([]);
    expect(values(250, 250)).toEqual([100]);
    expect(values(1_000, 180)).toEqual([]);
    // Without a focus nothing is filtered.
    expect(index.query([101], [], 8).map((line) => line.pos[0])).toEqual([100]);
  });

  it('only joins components within the reach into a guide', () => {
    const bounds = { left: 100, right: 160, top: 250, bottom: 290 };
    expect(index.guides(bounds, 0.5, 186)).toBeUndefined();
    expect(index.guides(bounds, 0.5, 250)).toEqual({
      x: [{ value: 100, start: 0, size: 540, points: [0, 40, 250, 290, 500, 540] }],
    });
  });

  it('never limits canvas edges or user guides', () => {
    const edges = DesignerAlignmentIndex.fromScene(CANVAS, { x: [480], y: [] }, []);
    const far = { left: 0, right: 0, top: 2_000, bottom: 2_000 };
    expect(edges.query([1, 479], [], 8, far, 10).map((line) => line.pos[0])).toEqual([0, 480]);
    expect(edges.guides(far, 0.5, 10)?.x?.map((line) => line.value)).toEqual([0]);
  });
});

describe('DesignerAlignmentIndex guides', () => {
  it('draws one line per coordinate through every aligned snap point', () => {
    // Three components share x = 100; the selection lands on the same coordinate below them.
    const index = DesignerAlignmentIndex.fromScene(CANVAS, NO_GUIDES, [
      box(100, 0, 100, 40),
      box(100, 100, 60, 20),
      box(400, 300, 100, 40),
    ]);
    expect(index.guides({ left: 100, right: 180, top: 200, bottom: 240 }, 0.5)).toEqual({
      x: [{ value: 100, start: 0, size: 240, points: [0, 40, 100, 120, 200, 240] }],
    });
  });

  it('keeps centre lines to centre points and parallel lines separate', () => {
    const index = DesignerAlignmentIndex.fromScene(CANVAS, NO_GUIDES, [box(0, 300, 200, 40)]);
    expect(index.guides({ left: 50, right: 150, top: 100, bottom: 140 }, 0.5)).toEqual({
      x: [{ value: 100, start: 120, size: 200, points: [120, 320] }],
    });
    // Left and right edges both aligned: two parallel lines, each with its own points.
    expect(index.guides({ left: 0, right: 200, top: 100, bottom: 140 }, 0.5)?.x).toEqual([
      { value: 0, start: 0, size: 540, points: [0, 100, 140, 300, 340, 540] },
      { value: 100, start: 120, size: 200, points: [120, 320] },
      { value: 200, start: 100, size: 240, points: [100, 140, 300, 340] },
    ]);
  });

  it('spans canvas edges and user guides across the canvas, marking only real snap points', () => {
    const index = DesignerAlignmentIndex.fromScene(CANVAS, { x: [480], y: [] }, []);
    expect(index.guides({ left: 480, right: 480, top: 200, bottom: 200 }, 0.5)).toEqual({
      x: [{ value: 480, start: 0, size: 540, points: [200] }],
    });
    expect(index.guides({ left: 0, right: 0, top: 0, bottom: 0 }, 0.5)).toEqual({
      x: [{ value: 0, start: 0, size: 540, points: [0, 540] }],
      y: [{ value: 0, start: 0, size: 960, points: [0, 960] }],
    });
  });

  it('only collects coordinates within the tolerance and keeps zero-length segments local', () => {
    const index = DesignerAlignmentIndex.fromScene(undefined, NO_GUIDES, []);
    expect(index.guides({ left: 10, right: 10, top: 10, bottom: 10 }, 0.5)).toBeUndefined();
    const components = DesignerAlignmentIndex.fromScene(CANVAS, NO_GUIDES, [box(100, 100, 40, 40)]);
    // The centre point alone: a zero-length guide, never widened to the canvas.
    expect(components.guides({ left: 120, right: 120, top: 120, bottom: 120 }, 0.5)).toEqual({
      x: [{ value: 120, start: 120, size: 0, points: [120] }],
      y: [{ value: 120, start: 120, size: 0, points: [120] }],
    });
    expect(
      components.guides({ left: 100.6, right: 100.6, top: 400, bottom: 400 }, 0.5),
    ).toBeUndefined();
    expect(components.guides({ left: 100.4, right: 100.4, top: 400, bottom: 400 }, 0.5)).toEqual({
      x: [{ value: 100, start: 100, size: 300, points: [100, 140, 400] }],
    });
  });

  it('uses user guides without a canvas', () => {
    const index = DesignerAlignmentIndex.fromScene(undefined, { x: [50], y: [] }, []);
    expect(index.query([52], [], 8).map((line) => line.pos[0])).toEqual([50]);
    expect(index.guides({ left: 50, right: 50, top: 10, bottom: 10 }, 0.5)).toEqual({
      x: [{ value: 50, start: 10, size: 0, points: [10] }],
    });
  });
});

function box(
  left: number,
  top: number,
  width: number,
  height: number,
): DesignerSnapComponentBounds {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function targets(x: readonly number[], y: readonly number[] = []): DesignerSnapCandidates {
  const axis = (values: readonly number[]) =>
    values.map((value, order) => ({ value, start: order * 7, size: 20 + order }));
  return { x: axis(x), y: axis(y) };
}

// Every unique coordinate, ascending: the unfiltered competition input.
function allCoordinates(candidates: DesignerSnapCandidates): readonly SnapGuideline[] {
  const unique = (values: readonly number[]) => [...new Set(values)].sort((a, b) => a - b);
  return [
    ...unique(candidates.x.map((candidate) => candidate.value)).map((value) => ({
      type: 'vertical' as const,
      direction: '',
      pos: [value, 0],
      size: 0,
    })),
    ...unique(candidates.y.map((candidate) => candidate.value)).map((value) => ({
      type: 'horizontal' as const,
      direction: '',
      pos: [0, value],
      size: 0,
    })),
  ];
}

// Competition outcome only: which coordinate wins on each axis, from which anchor, at what distance.
function winner(
  guidelines: readonly SnapGuideline[],
  posesX: readonly number[],
  posesY: readonly number[],
  threshold: number,
) {
  const result = checkSnapPoses(guidelines, posesX, posesY, [], [], threshold, threshold, [1, 1]);
  const project = (info: typeof result.vertical, coordinate: 0 | 1) => {
    const hit = info.posInfos[0]?.guidelineInfos[0];
    return hit === undefined
      ? undefined
      : { index: info.posInfos[0]!.index, dist: hit.dist, value: hit.guideline.pos[coordinate] };
  };
  return { x: project(result.vertical, 0), y: project(result.horizontal, 1) };
}
