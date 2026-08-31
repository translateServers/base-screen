// Persistent guides and transient previews share one instance-owned, incrementally updated layer.

import type { DesignerCanvasAidsState } from './designer-canvas-aids-types.js';
import type { DesignerGuideSnapPreview } from './designer-canvas-snap-preview.js';
import {
  createDesignerGuideOverlayNode,
  type DesignerGuideAxis,
  type DesignerGuideOverlayItem,
  type DesignerGuideOverlayNode,
  updateDesignerGuideOverlayNode,
} from './designer-guide-overlay-nodes.js';

export type { DesignerGuideAxis } from './designer-guide-overlay-nodes.js';

export interface DesignerGuideOverlayOptions {
  readonly canvas: HTMLDivElement;
  readonly canvasAids: DesignerCanvasAidsState;
  readonly canvasSize: { readonly height: number; readonly width: number } | undefined;
  readonly drag:
    | { readonly axis: DesignerGuideAxis; readonly guideIndex: number | undefined }
    | undefined;
  readonly guidePreview: { readonly axis: DesignerGuideAxis; readonly value: number } | undefined;
  readonly guides: { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly guidesVisible: boolean;
  readonly root: ShadowRoot;
  readonly snapEnabled: boolean;
  readonly snapPreview: DesignerGuideSnapPreview | undefined;
  readonly zoom: number;
}

export class DesignerGuideOverlay {
  #container: HTMLElement | undefined;
  #zoom: number | undefined;
  readonly #nodes = new Map<string, DesignerGuideOverlayNode>();

  render(options: DesignerGuideOverlayOptions): void {
    const container = options.root.querySelector<HTMLElement>('[data-canvas-guides]');
    if (container === null || container === undefined) {
      this.disconnect();
      return;
    }
    if (container !== this.#container) {
      this.disconnect();
      this.#container = container;
    }
    if (this.#zoom !== options.zoom) {
      setCanvasOverlayScale(container, options.zoom);
      this.#zoom = options.zoom;
    }
    const items = collectOverlayItems(options);
    const keys = new Set(items.map((item) => item.key));
    for (const [key, node] of this.#nodes) {
      if (keys.has(key)) continue;
      node.element.remove();
      this.#nodes.delete(key);
    }

    let cursor = container.firstElementChild;
    for (const item of items) {
      let node = this.#nodes.get(item.key);
      if (node === undefined) {
        node = createDesignerGuideOverlayNode(options.canvas.ownerDocument, item);
        this.#nodes.set(item.key, node);
      }
      updateDesignerGuideOverlayNode(node, item);
      if (node.element === cursor) cursor = cursor.nextElementSibling;
      else container.insertBefore(node.element, cursor);
    }
  }

  disconnect(): void {
    for (const node of this.#nodes.values()) node.element.remove();
    this.#nodes.clear();
    this.#container = undefined;
    this.#zoom = undefined;
  }
}

function collectOverlayItems(options: DesignerGuideOverlayOptions): DesignerGuideOverlayItem[] {
  const items: DesignerGuideOverlayItem[] = [];
  for (const axis of ['x', 'y'] as const) collectAxisGuides(items, axis, options);
  if (!options.snapEnabled || !options.canvasAids.smartGuidesEnabled) return items;
  const ordinals = { x: 0, y: 0 };
  for (const measurement of options.snapPreview?.measurements ?? []) {
    items.push({
      key: 'measurement:' + measurement.axis + ':' + ordinals[measurement.axis]++,
      kind: 'measurement',
      measurement,
    });
  }
  return items;
}

function collectAxisGuides(
  items: DesignerGuideOverlayItem[],
  axis: DesignerGuideAxis,
  options: DesignerGuideOverlayOptions,
): void {
  const preview = options.guidePreview;
  for (const [index, value] of options.guides[axis].entries()) {
    if (preview?.axis === axis && options.drag?.guideIndex === index) {
      if (isGuideWithinCanvas(axis, preview.value, options.canvasSize)) {
        items.push({
          key: 'preview:' + axis,
          kind: 'guide',
          axis,
          variant: 'preview',
          line: { value: preview.value },
        });
      }
      continue;
    }
    if (options.guidesVisible) {
      items.push({
        key: 'persistent:' + axis + ':' + index,
        kind: 'guide',
        axis,
        variant: 'persistent',
        index,
        line: { value },
      });
    }
  }
  if (
    preview?.axis === axis &&
    options.drag?.guideIndex === undefined &&
    isGuideWithinCanvas(axis, preview.value, options.canvasSize)
  ) {
    items.push({
      key: 'preview:' + axis,
      kind: 'guide',
      axis,
      variant: 'preview',
      line: { value: preview.value },
    });
  }
  if (!options.snapEnabled || !options.canvasAids.smartGuidesEnabled) return;
  const activeValue = options.snapPreview?.[axis === 'x' ? 'activeX' : 'activeY'];
  for (const [index, line] of (options.snapPreview?.[axis] ?? []).entries()) {
    items.push({
      key: 'snap:' + axis + ':' + index,
      kind: 'guide',
      axis,
      variant: 'snap',
      active: line.value === activeValue,
      line,
    });
  }
}

function isGuideWithinCanvas(
  axis: DesignerGuideAxis,
  value: number,
  canvasSize: DesignerGuideOverlayOptions['canvasSize'],
): boolean {
  const limit = axis === 'x' ? canvasSize?.width : canvasSize?.height;
  return limit !== undefined && Number.isFinite(value) && value >= 0 && value <= limit;
}

function setCanvasOverlayScale(container: HTMLElement, zoom: number): void {
  const unit = 1 / Math.max(zoom, Number.EPSILON);
  const sizes = {
    '--designer-overlay-active': 2,
    '--designer-overlay-cap-offset': 4,
    '--designer-overlay-cap-size': 7,
    '--designer-overlay-font-size': 10,
    '--designer-overlay-glow-large': 6,
    '--designer-overlay-glow-small': 2,
    '--designer-overlay-hit-size': 9,
    '--designer-overlay-label-offset': 5,
    '--designer-overlay-line-height': 14,
    '--designer-overlay-pixel': 1,
  } as const;
  // This layer owns its inline scale declarations; replace them atomically, only on zoom changes.
  container.style.cssText = Object.entries(sizes)
    .map(([property, multiplier]) => property + ':' + unit * multiplier + 'px')
    .join(';');
}
