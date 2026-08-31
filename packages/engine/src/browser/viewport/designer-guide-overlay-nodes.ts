import type {
  DesignerCanvasMeasurement,
  DesignerSnapGuideLine,
} from './designer-canvas-aids-types.js';

export type DesignerGuideAxis = 'x' | 'y';

export type DesignerGuideOverlayItem =
  | {
      readonly key: string;
      readonly kind: 'guide';
      readonly axis: DesignerGuideAxis;
      readonly variant: 'persistent' | 'preview' | 'snap';
      readonly line: DesignerSnapGuideLine;
      readonly index?: number;
      readonly active?: boolean;
    }
  | {
      readonly key: string;
      readonly kind: 'measurement';
      readonly measurement: DesignerCanvasMeasurement;
    };

export interface DesignerGuideOverlayNode {
  readonly element: HTMLElement;
  readonly label: HTMLElement | undefined;
}

export function createDesignerGuideOverlayNode(
  document: Document,
  item: DesignerGuideOverlayItem,
): DesignerGuideOverlayNode {
  const element = document.createElement('div');
  const label = item.kind === 'measurement' ? document.createElement('span') : undefined;
  if (label !== undefined) {
    label.className = 'canvas-measurement-label';
    element.appendChild(label);
  }
  return { element, label };
}

/** Read inline state only; unchanged geometry, classes and labels perform no DOM writes. */
export function updateDesignerGuideOverlayNode(
  node: DesignerGuideOverlayNode,
  item: DesignerGuideOverlayItem,
): void {
  const { element, label } = node;
  if (item.kind === 'measurement') {
    const { axis, from, to, position, distance } = item.measurement;
    setClassName(element, 'canvas-measurement');
    setData(element, 'axis', axis);
    setGeometry(
      element,
      `${axis === 'x' ? from : position}px`,
      `${axis === 'x' ? position : from}px`,
      axis === 'x' ? `${to - from}px` : '',
      axis === 'y' ? `${to - from}px` : '',
    );
    const text = String(Math.round(distance));
    if (label !== undefined && label.textContent !== text) label.textContent = text;
    return;
  }

  const { axis, variant, line } = item;
  setClassName(
    element,
    `canvas-guide canvas-guide-${variant}${item.active ? ' canvas-guide-snap-active' : ''}`,
  );
  setData(element, 'axis', axis);
  setData(element, 'canvasGuide', variant === 'persistent' ? 'true' : undefined);
  setData(element, 'guideIndex', item.index === undefined ? undefined : String(item.index));
  const local = line.start !== undefined && line.size !== undefined && line.size > 0;
  const start = local ? `${line.start}px` : '';
  const size = local ? `${line.size}px` : '';
  // Empty strings restore CSS defaults when a reused local guide becomes canvas-spanning.
  setGeometry(
    element,
    axis === 'x' ? `${line.value}px` : start,
    axis === 'y' ? `${line.value}px` : start,
    axis === 'y' ? size : '',
    axis === 'x' ? size : '',
  );
}

function setClassName(element: HTMLElement, value: string): void {
  if (element.className !== value) element.className = value;
}

function setData(element: HTMLElement, name: string, value: string | undefined): void {
  if (element.dataset[name] === value) return;
  if (value === undefined) delete element.dataset[name];
  else element.dataset[name] = value;
}

function setGeometry(
  element: HTMLElement,
  left: string,
  top: string,
  width: string,
  height: string,
): void {
  const styles = { left, top, width, height };
  for (const property of ['left', 'top', 'width', 'height'] as const) {
    if (element.style[property] !== styles[property]) element.style[property] = styles[property];
  }
}
