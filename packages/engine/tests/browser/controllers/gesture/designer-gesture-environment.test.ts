import { describe, expect, it, vi } from 'vitest';
import type { DesignerGestureCallbacks } from '../../../../src/browser/controllers/gesture/designer-gesture-callbacks.js';
import {
  DesignerGestureEnvironment,
  isDesignerSnapBypassed,
} from '../../../../src/browser/controllers/gesture/designer-gesture-environment.js';
import type { DesignerSnapPoint } from '../../../../src/browser/viewport/designer-canvas-aids.js';

const snapped: DesignerSnapPoint = {
  x: 0,
  y: 0,
  snappedX: 0,
  guides: { x: [{ value: 0, start: 0, size: 540, points: [0, 1, 540] }] },
};
const resizedGuides = { x: [{ value: 0, start: 0, size: 540, points: [0, 40, 540] }] };

function environment() {
  const renderSnapPreview = vi.fn();
  const snapCanvasPoint = vi.fn(() => snapped);
  const snapCanvasSelection = vi.fn((_bounds, offset) => ({ ...offset, x: 0, snappedX: 0 }));
  const snapCanvasGuides = vi.fn(() => resizedGuides);
  const callbacks = {
    getViewport: () => ({ zoom: 1 }),
    snapCanvasPoint,
    snapCanvasSelection,
    snapCanvasGuides,
    renderSnapPreview,
  } as unknown as DesignerGestureCallbacks;
  const target = new DesignerGestureEnvironment(callbacks);
  target.setCanvas({
    clientLeft: 0,
    clientTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLDivElement);
  return { target, renderSnapPreview, snapCanvasPoint, snapCanvasSelection, snapCanvasGuides };
}

const pointer = (extra: Partial<PointerEvent> = {}) =>
  ({ clientX: 2, clientY: 1, ...extra }) as PointerEvent;

describe('DesignerGestureEnvironment snapping', () => {
  it('treats Ctrl and Cmd as the snap bypass', () => {
    expect(isDesignerSnapBypassed({})).toBe(false);
    expect(isDesignerSnapBypassed({ ctrlKey: true })).toBe(true);
    expect(isDesignerSnapBypassed({ metaKey: true })).toBe(true);
  });

  it('previews a snapped point, and returns the raw point without a preview when bypassed', () => {
    const { target, renderSnapPreview, snapCanvasPoint } = environment();
    expect(target.snapCanvasPoint(pointer())).toBe(snapped);
    expect(renderSnapPreview).toHaveBeenLastCalledWith(snapped);
    expect(target.snapCanvasPoint(pointer({ ctrlKey: true }))).toEqual({ x: 2, y: 1 });
    expect(renderSnapPreview).toHaveBeenLastCalledWith(undefined);
    expect(snapCanvasPoint).toHaveBeenCalledTimes(1);
  });

  it('resolves a pointer without previewing so gestures can preview what they derive', () => {
    const { target, renderSnapPreview } = environment();
    expect(target.resolveCanvasPoint(pointer())).toBe(snapped);
    expect(target.resolveCanvasPoint(pointer({ metaKey: true }))).toEqual({ x: 2, y: 1 });
    expect(renderSnapPreview).not.toHaveBeenCalled();
  });

  it('previews derived geometry with its own guides and keeps the attached line', () => {
    const { target, renderSnapPreview, snapCanvasGuides } = environment();
    const bounds = { left: 0, right: 100, top: 0, bottom: 40 };
    target.previewGeometry(bounds, ['a'], snapped);
    expect(snapCanvasGuides).toHaveBeenCalledWith(bounds, ['a']);
    expect(renderSnapPreview).toHaveBeenLastCalledWith({
      x: 0,
      y: 0,
      snappedX: 0,
      guides: resizedGuides,
    });
    target.previewGeometry(undefined, ['a'], snapped);
    expect(renderSnapPreview).toHaveBeenLastCalledWith(undefined);
  });

  it('bypasses selection snapping with Ctrl / Cmd and clears the preview', () => {
    const { target, renderSnapPreview, snapCanvasSelection } = environment();
    const bounds = { left: 10, right: 110, top: 10, bottom: 50 };
    expect(target.snapSelection(bounds, { x: 3, y: 4 }, [], { ctrlKey: true })).toEqual({
      x: 3,
      y: 4,
    });
    expect(snapCanvasSelection).not.toHaveBeenCalled();
    expect(renderSnapPreview).toHaveBeenLastCalledWith(undefined);
    expect(target.snapSelection(bounds, { x: 3, y: 4 }, [])).toEqual({
      x: 0,
      y: 4,
      snappedX: 0,
    });
  });
});
