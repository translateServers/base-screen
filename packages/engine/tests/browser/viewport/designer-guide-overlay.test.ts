import { describe, expect, it, vi } from 'vitest';
import type { DesignerGuideSnapPreview } from '../../../src/browser/viewport/designer-canvas-snap-preview.js';
import {
  DesignerGuideOverlay,
  type DesignerGuideOverlayOptions,
} from '../../../src/browser/viewport/designer-guide-overlay.js';
import { WorkbenchElement } from '../controllers/workbench/designer-workbench-element.js';

describe('DesignerGuideOverlay incremental rendering', () => {
  it('performs zero DOM writes and allocations for unchanged frames', () => {
    const { overlay, container, canvas, options } = fixture();
    const create = vi.spyOn(canvas.ownerDocument, 'createElement');
    overlay.render(options);
    const nodes = allNodes(container);
    const writes = nodes.map((node) => node.writes);
    const created = create.mock.calls.length;
    for (let frame = 0; frame < 20; frame++) {
      overlay.render({ ...options, snapPreview: structuredClone(options.snapPreview) });
    }
    allNodes(container).forEach((node, index) => expect(node).toBe(nodes[index]));
    expect(nodes.map((node) => node.writes)).toEqual(writes);
    expect(create).toHaveBeenCalledTimes(created);
    expect(container.replaceChildrenCalls).toBe(0);
  });

  it('reuses guide, measurement and label nodes while leaving persistent guides untouched', () => {
    const { overlay, container, options } = fixture();
    overlay.render(options);
    const before = [...container.children];
    const persistent = before.filter((node) => node.dataset.canvasGuide === 'true');
    const writes = persistent.map((node) => node.writes);
    const marker = before.find((node) => node.className === 'canvas-measurement')!;
    const label = marker.children[0]!;
    overlay.render({
      ...options,
      snapPreview: preview({
        x: [{ value: 101, start: 21, size: 30 }],
        activeX: 101,
        measurements: [{ axis: 'x', from: 150, to: 201, position: 80, distance: 51 }],
      }),
    });
    container.children.forEach((node, index) => expect(node).toBe(before[index]));
    expect(persistent.map((node) => node.writes)).toEqual(writes);
    expect(marker.children[0]).toBe(label);
    expect(label.textContent).toBe('51');
    expect(marker.style.width).toBe('51px');
  });

  it('clears obsolete local geometry and active classes without replacing either axis', () => {
    const { overlay, container, options } = fixture();
    overlay.render(options);
    const x = container.children.find(
      (node) => node.className.includes('guide-snap') && node.dataset.axis === 'x',
    )!;
    const y = container.children.find(
      (node) => node.className.includes('guide-snap') && node.dataset.axis === 'y',
    )!;
    expect(x.style.top).toBe('20px');
    expect(y.style.width).toBe('50px');
    overlay.render({
      ...options,
      snapPreview: preview({
        x: [{ value: 110 }],
        y: [{ value: 90 }],
        activeX: undefined,
        activeY: undefined,
      }),
    });
    expect(container.children).toContain(x);
    expect(container.children).toContain(y);
    expect(x.style.top).toBe('');
    expect(x.style.height).toBe('');
    expect(x.style.left).toBe('110px');
    expect(y.style.left).toBe('');
    expect(y.style.width).toBe('');
    expect(y.style.top).toBe('90px');
    expect(x.className).toBe('canvas-guide canvas-guide-snap');
    expect(y.className).toBe('canvas-guide canvas-guide-snap');
  });

  it('places × markers on snap points and reuses them across frames', () => {
    const { overlay, container, options } = fixture();
    const withPoints = (points: readonly number[]) => ({
      ...options,
      snapPreview: preview({
        x: [{ value: 100, start: 20, size: 100, points }],
        y: undefined,
        measurements: undefined,
      }),
    });
    overlay.render(withPoints([20, 60, 120]));
    const guide = container.children.find((node) => node.className.includes('guide-snap'))!;
    expect(guide.children.map((marker) => marker.className)).toEqual([
      'canvas-guide-marker',
      'canvas-guide-marker',
      'canvas-guide-marker',
    ]);
    expect(guide.children.map((marker) => marker.style.top)).toEqual(['0px', '40px', '100px']);
    const markers = [...guide.children];
    const writes = markers.map((marker) => marker.writes);
    overlay.render(withPoints([20, 60, 120]));
    guide.children.forEach((marker, index) => expect(marker).toBe(markers[index]));
    expect(markers.map((marker) => marker.writes)).toEqual(writes);
    overlay.render(withPoints([20, 120]));
    expect(guide.children).toHaveLength(2);
    guide.children.forEach((marker, index) => expect(marker).toBe(markers[index]));
    expect(guide.children[1]?.style.top).toBe('100px');
  });

  it('styles equal-spacing marks apart from rail gaps and switches in place', () => {
    const { overlay, container, options } = fixture();
    overlay.render(options);
    const marker = container.children.find((node) => node.className === 'canvas-measurement')!;
    overlay.render({
      ...options,
      snapPreview: preview({
        measurements: [
          { axis: 'x', from: 150, to: 200, position: 80, distance: 50, kind: 'equal' },
        ],
      }),
    });
    expect(marker.className).toBe('canvas-measurement canvas-measurement-equal');
    expect(container.children).toContain(marker);
    overlay.render(options);
    expect(marker.className).toBe('canvas-measurement');
  });

  it('draws a reading only when the gap holds one line on screen', () => {
    const { overlay, container, options } = fixture();
    const marker = (distance: number) => {
      overlay.render({
        ...options,
        zoom: 2,
        snapPreview: preview({
          measurements: [{ axis: 'y', from: 100, to: 100 + distance, position: 80, distance }],
        }),
      });
      return container.children.find((node) => node.className.includes('canvas-measurement'))!;
    };
    // 6 document px at zoom 2 is 12 screen px: shorter than the 14px reading line.
    expect(marker(6).children[0]?.textContent).toBe('');
    expect(marker(8).children[0]?.textContent).toBe('8');
  });

  it('keeps a zero-length guide local instead of spanning the canvas', () => {
    const { overlay, container, options } = fixture();
    overlay.render({
      ...options,
      snapPreview: preview({
        x: [{ value: 120, start: 120, size: 0, points: [120] }],
        y: undefined,
      }),
    });
    const guide = container.children.find((node) => node.className.includes('guide-snap'))!;
    expect(guide.style.top).toBe('120px');
    expect(guide.style.height).toBe('0px');
  });

  it('changes only the owned scale declarations when zoom changes', () => {
    const { overlay, container, options } = fixture();
    overlay.render(options);
    const writes = container.writes;
    const nodes = allNodes(container).slice(1);
    const childWrites = nodes.map((node) => node.writes);
    overlay.render({ ...options, zoom: 5 });
    expect(container.writes).toBe(writes + 1);
    expect(nodes.map((node) => node.writes)).toEqual(childWrites);
    expect(container.style.getPropertyValue('--designer-overlay-pixel')).toBe('0.2px');
    overlay.render({ ...options, zoom: 5 });
    expect(container.writes).toBe(writes + 1);
  });

  it.each(['snap', 'smart'] as const)(
    'gates stale lines and measurements when %s is disabled',
    (toggle) => {
      const { overlay, container, options } = fixture();
      overlay.render(options);
      const persistent = container.children.filter((node) => node.dataset.canvasGuide === 'true');
      overlay.render({
        ...options,
        snapEnabled: toggle !== 'snap',
        canvasAids: { ...options.canvasAids, smartGuidesEnabled: toggle !== 'smart' },
      });
      expect(container.children).toHaveLength(2);
      container.children.forEach((node, index) => expect(node).toBe(persistent[index]));
    },
  );

  it('preserves node order and unaffected axes when lines disappear and return', () => {
    const { overlay, container, options } = fixture();
    overlay.render(options);
    const yGuide = container.children.find(
      (node) => node.dataset.axis === 'y' && node.className.includes('guide-snap'),
    );
    const marker = container.children.at(-1);
    overlay.render({ ...options, snapPreview: preview({ x: undefined }) });
    expect(container.children.at(-2)).toBe(yGuide);
    expect(container.children.at(-1)).toBe(marker);
    overlay.render(options);
    expect(container.children.at(-2)).toBe(yGuide);
    expect(container.children.at(-1)).toBe(marker);
    expect(container.children.map((node) => node.dataset.axis)).toEqual(['x', 'x', 'y', 'y', 'x']);
  });

  it('keeps the untouched guide during preview, out-of-bounds drag and cancellation', () => {
    const { overlay, container, options } = fixture();
    const withoutSnap = { ...options, snapPreview: undefined };
    overlay.render(withoutSnap);
    const yGuide = container.children[1];
    const dragging = { ...withoutSnap, drag: { axis: 'x' as const, guideIndex: 0 } };
    overlay.render({ ...dragging, guidePreview: { axis: 'x', value: 45 } });
    expect(container.children[0]?.className).toBe('canvas-guide canvas-guide-preview');
    expect(container.children[1]).toBe(yGuide);
    overlay.render({ ...dragging, guidePreview: { axis: 'x', value: -1 } });
    expect(container.children).toEqual([yGuide]);
    overlay.render(withoutSnap);
    expect(container.children[0]?.style.left).toBe('40px');
    expect(container.children[0]?.dataset.guideIndex).toBe('0');
    expect(container.children[1]).toBe(yGuide);
    expect(options.guides.x).toEqual([40]);
  });

  it('removes owned nodes on disconnect and reconnects without sharing another instance', () => {
    const first = fixture();
    const second = fixture();
    first.overlay.render(first.options);
    second.overlay.render(second.options);
    const oldNodes = [...first.container.children];
    const secondNodes = [...second.container.children];
    first.overlay.disconnect();
    expect(first.container.children).toHaveLength(0);
    expect(oldNodes.every((node) => node.parentElement === null)).toBe(true);
    first.overlay.render(first.options);
    expect(first.container.children[0]).not.toBe(oldNodes[0]);
    second.container.children.forEach((node, index) => expect(node).toBe(secondNodes[index]));
  });

  it('drops the old node cache when the canvas layer is replaced', () => {
    const { overlay, container, options } = fixture();
    overlay.render(options);
    const replacement = new WorkbenchElement();
    overlay.render({
      ...options,
      root: { querySelector: () => replacement } as unknown as ShadowRoot,
    });
    expect(container.children).toHaveLength(0);
    expect(replacement.children).toHaveLength(5);
    overlay.render({ ...options, root: { querySelector: () => null } as unknown as ShadowRoot });
    expect(replacement.children).toHaveLength(0);
  });
});

function fixture() {
  const canvas = new WorkbenchElement();
  const container = new WorkbenchElement();
  const options: DesignerGuideOverlayOptions = {
    canvas: canvas as unknown as HTMLDivElement,
    canvasAids: { gridEnabled: true, smartGuidesEnabled: true },
    canvasSize: { width: 960, height: 540 },
    drag: undefined,
    guidePreview: undefined,
    guides: { x: [40], y: [60] },
    guidesVisible: true,
    root: { querySelector: () => container } as unknown as ShadowRoot,
    snapEnabled: true,
    snapPreview: preview(),
    zoom: 1,
  };
  return { overlay: new DesignerGuideOverlay(), container, canvas, options };
}

function preview(overrides: Partial<DesignerGuideSnapPreview> = {}): DesignerGuideSnapPreview {
  return {
    x: [{ value: 100, start: 20, size: 30 }],
    y: [{ value: 80, start: 150, size: 50 }],
    activeX: 100,
    activeY: 80,
    measurements: [{ axis: 'x', from: 150, to: 200, position: 80, distance: 50 }],
    ...overrides,
  };
}

function allNodes(root: WorkbenchElement): WorkbenchElement[] {
  return [root, ...root.children.flatMap(allNodes)];
}
