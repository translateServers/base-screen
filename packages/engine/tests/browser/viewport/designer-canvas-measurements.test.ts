import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import type { DesignerSelectionSnapBounds } from '../../../src/browser/viewport/designer-canvas-aids-types.js';
import {
  collectDesignerCanvasMeasurements,
  DesignerCanvasMeasurementIndex,
} from '../../../src/browser/viewport/designer-canvas-measurements.js';

describe('collectDesignerCanvasMeasurements', () => {
  it('R2 renders each adjacent gap along the selected alignment rails', () => {
    const document: ScreenDocument = {
      canvas: { width: 400, height: 700, backgroundColor: '#000000' },
      components: [
        component('top', 0, 0, 260, 100),
        component('selected', 0, 146, 200, 34),
        component('upper-left', 0, 228, 100, 120),
        component('upper-right', 100, 228, 100, 120),
        component('lower-left', 0, 407, 100, 120),
        component('lower-right', 100, 407, 100, 120),
      ],
      variables: [],
      blueprint: { relations: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(document, { left: 0, right: 200, top: 146, bottom: 180 }, [
        'selected',
      ]),
    ).toEqual([
      { axis: 'y', position: 0, from: 100, to: 146, distance: 46 },
      { axis: 'y', position: 0, from: 180, to: 228, distance: 48 },
      { axis: 'y', position: 0, from: 348, to: 407, distance: 59 },
      { axis: 'y', position: 100, from: 180, to: 228, distance: 48 },
      { axis: 'y', position: 100, from: 348, to: 407, distance: 59 },
      { axis: 'y', position: 200, from: 180, to: 228, distance: 48 },
      { axis: 'y', position: 200, from: 348, to: 407, distance: 59 },
    ]);
  });

  it('R2 uses visual bounds and excludes hidden components from measurements', () => {
    const document: ScreenDocument = {
      canvas: { width: 400, height: 400, backgroundColor: '#000000' },
      components: [
        component('rotated', 0, 200, 100, 40, 90),
        component('hidden', 0, 130, 100, 20, 0, true),
      ],
      variables: [],
      blueprint: { relations: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(document, { left: 0, right: 100, top: 0, bottom: 100 }, [
        'selected',
      ]),
    ).toEqual([{ axis: 'y', position: 50, from: 100, to: 170, distance: 70 }]);
  });

  it('R2 excludes lanes whose components only meet the selection at an edge or corner', () => {
    const document: ScreenDocument = {
      canvas: { width: 800, height: 500, backgroundColor: '#000000' },
      components: [component('above-left', 115, 22, 242, 120)],
      variables: [],
      blueprint: { relations: [] },
    };

    expect(
      collectDesignerCanvasMeasurements(
        document,
        { left: 490, right: 730, top: 142, bottom: 262 },
        ['selected'],
      ),
    ).toEqual([]);
  });

  it.each([0.1, 0.5, 1, 1.25, 3])(
    'indexed rails match the full per-rail scan on seeded layouts at zoom %s',
    (zoom) => {
      let seed = 0x3a5e + Math.round(zoom * 100);
      const random = () => {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
      };
      // Snapped-to-10 coordinates plus sub-pixel jitter exercise both exact and boundary matches.
      const components = Array.from({ length: 800 }, () => {
        const left = Math.round(random() * 200) * 10 + (random() < 0.3 ? random() : 0);
        const top = Math.round(random() * 200) * 10;
        const width = [50, 100, 100.5, 200][Math.floor(random() * 4)]!;
        const height = [20, 40, 120][Math.floor(random() * 3)]!;
        return { left, top, right: left + width, bottom: top + height };
      });
      const index = new DesignerCanvasMeasurementIndex(components);
      for (let frame = 0; frame < 80; frame++) {
        const anchor = components[Math.floor(random() * components.length)]!;
        const left = anchor.left + [0, 0, 0.3, -0.5, 2][frame % 5]!;
        const top = random() * 2_000;
        const selection = {
          left,
          right: left + [50, 100, 200][frame % 3]!,
          top,
          bottom: top + [20, 40][frame % 2]!,
        };
        expect(index.measure(selection, zoom)).toEqual(scanRails(components, selection, zoom));
      }
    },
  );
});

// The pre-index algorithm, kept verbatim as the reference for the indexed gesture path.
function scanRails(
  components: readonly DesignerSelectionSnapBounds[],
  selection: DesignerSelectionSnapBounds,
  zoom: number,
) {
  const tolerance = 1 / Math.max(zoom, Number.EPSILON);
  const anchors = (start: number, end: number) => [...new Set([start, (start + end) / 2, end])];
  const matches = (position: number, start: number, end: number) =>
    Math.abs(start - position) <= tolerance ||
    Math.abs((start + end) / 2 - position) <= tolerance ||
    Math.abs(end - position) <= tolerance;
  const overlaps = (a0: number, a1: number, b0: number, b1: number) =>
    Math.min(a1, b1) - Math.max(a0, b0) > tolerance;
  const gaps = (
    axis: 'x' | 'y',
    position: number,
    intervals: readonly { start: number; end: number }[],
  ) => {
    const merged: { start: number; end: number }[] = [];
    for (const interval of [...intervals].sort((left, right) => left.start - right.start)) {
      const previous = merged.at(-1);
      if (previous === undefined || interval.start > previous.end + tolerance) {
        merged.push({ ...interval });
      } else if (interval.end > previous.end) {
        merged[merged.length - 1] = { start: previous.start, end: interval.end };
      }
    }
    return merged.slice(1).flatMap((next, index) => {
      const distance = next.start - merged[index]!.end;
      return distance <= tolerance
        ? []
        : [{ axis, distance, from: merged[index]!.end, position, to: next.start }];
    });
  };
  return [
    ...anchors(selection.left, selection.right).flatMap((position) =>
      gaps('y', position, [
        { start: selection.top, end: selection.bottom },
        ...components
          .filter(
            (bounds) =>
              matches(position, bounds.left, bounds.right) &&
              overlaps(selection.left, selection.right, bounds.left, bounds.right),
          )
          .map((bounds) => ({ start: bounds.top, end: bounds.bottom })),
      ]),
    ),
    ...anchors(selection.top, selection.bottom).flatMap((position) =>
      gaps('x', position, [
        { start: selection.left, end: selection.right },
        ...components
          .filter(
            (bounds) =>
              matches(position, bounds.top, bounds.bottom) &&
              overlaps(selection.top, selection.bottom, bounds.top, bounds.bottom),
          )
          .map((bounds) => ({ start: bounds.left, end: bounds.right })),
      ]),
    ),
  ];
}

function component(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  hidden = false,
) {
  return {
    id,
    type: 'base.rectangle',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation,
    zIndex: 0,
    status: { locked: false, hidden },
    props: {},
    style: {},
    dataSource: null,
  } as const;
}
