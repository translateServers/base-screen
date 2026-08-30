// 画布参考线覆盖层渲染：把常驻 guide、拖拽预览线、吸附参考线与间距测量标注
// 绘制到 [data-canvas-guides] 容器（每次全量重建，用 CSS transform 对齐 zoom）。

import type {
  DesignerCanvasAidsState,
  DesignerCanvasMeasurement,
  DesignerSnapGuideLine,
} from './designer-canvas-aids.js';

export type DesignerGuideAxis = 'x' | 'y';

export interface DesignerGuideSnapPreview {
  readonly x: readonly DesignerSnapGuideLine[] | undefined;
  readonly y: readonly DesignerSnapGuideLine[] | undefined;
  readonly activeX: number | undefined;
  readonly activeY: number | undefined;
  readonly measurements: readonly DesignerCanvasMeasurement[] | undefined;
}

interface DesignerGuideOverlayOptions {
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

export function renderDesignerGuideOverlay(options: DesignerGuideOverlayOptions): void {
  const container = options.root.querySelector<HTMLElement>('[data-canvas-guides]');
  if (container === null || container === undefined) return;
  setCanvasOverlayScale(container, options.zoom);
  container.replaceChildren();
  for (const axis of ['x', 'y'] as const) {
    renderAxisGuides(container, axis, options);
  }
  if (!options.snapEnabled || !options.canvasAids.smartGuidesEnabled) return;
  for (const measurement of options.snapPreview?.measurements ?? []) {
    container.appendChild(createMeasurement(options.canvas.ownerDocument, measurement));
  }
}

function renderAxisGuides(
  container: HTMLElement,
  axis: DesignerGuideAxis,
  options: DesignerGuideOverlayOptions,
): void {
  for (const [index, value] of options.guides[axis].entries()) {
    const preview = options.guidePreview;
    if (preview?.axis === axis && options.drag?.guideIndex === index) {
      if (isGuideWithinCanvas(axis, preview.value, options.canvasSize)) {
        container.appendChild(
          createGuide(options.canvas.ownerDocument, axis, preview.value, 'preview'),
        );
      }
      continue;
    }
    if (options.guidesVisible) {
      container.appendChild(
        createGuide(options.canvas.ownerDocument, axis, value, 'persistent', index),
      );
    }
  }
  const preview = options.guidePreview;
  if (
    preview?.axis === axis &&
    options.drag?.guideIndex === undefined &&
    isGuideWithinCanvas(axis, preview.value, options.canvasSize)
  ) {
    container.appendChild(
      createGuide(options.canvas.ownerDocument, axis, preview.value, 'preview'),
    );
  }
  const snapLines = options.snapPreview?.[axis];
  if (snapLines === undefined) return;
  const activeValue = options.snapPreview?.[axis === 'x' ? 'activeX' : 'activeY'];
  for (const line of snapLines) {
    container.appendChild(
      createSnapGuide(options.canvas.ownerDocument, axis, line, line.value === activeValue),
    );
  }
}

function createSnapGuide(
  document: Document,
  axis: DesignerGuideAxis,
  line: DesignerSnapGuideLine,
  active: boolean,
): HTMLElement {
  const guide = createGuide(document, axis, line.value, 'snap');
  // 组件参考线只覆盖参考组件的正交范围；画布与用户参考线保持全画布默认。
  if (line.start !== undefined && line.size !== undefined && line.size > 0) {
    guide.style[axis === 'x' ? 'top' : 'left'] = `${line.start}px`;
    guide.style[axis === 'x' ? 'height' : 'width'] = `${line.size}px`;
  }
  if (active) guide.classList.add('canvas-guide-snap-active');
  return guide;
}

function createMeasurement(
  document: Document,
  measurement: DesignerCanvasMeasurement,
): HTMLElement {
  const marker = document.createElement('div');
  marker.className = 'canvas-measurement';
  marker.dataset.axis = measurement.axis;
  if (measurement.axis === 'x') {
    marker.style.left = `${measurement.from}px`;
    marker.style.top = `${measurement.position}px`;
    marker.style.width = `${measurement.to - measurement.from}px`;
  } else {
    marker.style.left = `${measurement.position}px`;
    marker.style.top = `${measurement.from}px`;
    marker.style.height = `${measurement.to - measurement.from}px`;
  }
  const label = document.createElement('span');
  label.className = 'canvas-measurement-label';
  // Match Moveable's default snapDigit: visual measurements are whole, unitless pixels.
  label.textContent = String(Math.round(measurement.distance));
  marker.appendChild(label);
  return marker;
}

function createGuide(
  document: Document,
  axis: DesignerGuideAxis,
  value: number,
  kind: 'persistent' | 'preview' | 'snap',
  index?: number,
): HTMLElement {
  const guide = document.createElement('div');
  guide.className = `canvas-guide canvas-guide-${kind}`;
  guide.dataset.axis = axis;
  if (kind === 'persistent' && index !== undefined) {
    guide.dataset.canvasGuide = 'true';
    guide.dataset.guideIndex = String(index);
  }
  guide.style[axis === 'x' ? 'left' : 'top'] = `${value}px`;
  return guide;
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
  for (const [property, multiplier] of Object.entries(sizes)) {
    container.style.setProperty(property, `${unit * multiplier}px`);
  }
}
