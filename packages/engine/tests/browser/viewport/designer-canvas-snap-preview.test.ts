import { describe, expect, it } from 'vitest';
import {
  equalDesignerSnapPreviews,
  projectDesignerSnapPreview,
} from '../../../src/browser/viewport/designer-canvas-snap-preview.js';

describe('Designer snap visual projection', () => {
  it('normalizes absent and empty guides without inferring lines from snapped coordinates', () => {
    for (const guides of [undefined, {}, { x: [], y: [] }]) {
      expect(
        projectDesignerSnapPreview({ x: 40, y: 50, snappedX: 40, guides, measurements: [] }),
      ).toBeUndefined();
    }
  });

  it('compares only visible geometry, active targets and rounded measurement labels', () => {
    const point = {
      x: 40,
      y: 50,
      snappedX: 40,
      guides: { x: [{ value: 40, start: 100, size: 20 }] },
      measurements: [{ axis: 'x' as const, from: 0, to: 20, position: 40, distance: 20.1 }],
    };
    const previous = projectDesignerSnapPreview(point);
    const next = projectDesignerSnapPreview({
      ...point,
      x: 41,
      y: 60,
      guides: structuredClone(point.guides),
      measurements: [{ ...point.measurements[0]!, distance: 20.2 }],
    });
    expect(equalDesignerSnapPreviews(previous, next)).toBe(true);
    expect(
      equalDesignerSnapPreviews(
        previous,
        projectDesignerSnapPreview({ ...point, snappedX: undefined }),
      ),
    ).toBe(false);
    expect(
      equalDesignerSnapPreviews(
        previous,
        projectDesignerSnapPreview({
          ...point,
          measurements: [{ ...point.measurements[0]!, distance: 20.6 }],
        }),
      ),
    ).toBe(false);
    expect(
      equalDesignerSnapPreviews(
        previous,
        projectDesignerSnapPreview({
          ...point,
          guides: { x: [{ value: 40, start: 100, size: 21 }] },
        }),
      ),
    ).toBe(false);
    expect(equalDesignerSnapPreviews(previous, undefined)).toBe(false);
  });
});
