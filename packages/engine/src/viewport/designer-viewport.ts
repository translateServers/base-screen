import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenPoint, ScreenViewportState } from '@base-screen/core';

export const DESIGNER_MIN_ZOOM = 0.1;
export const DESIGNER_MAX_ZOOM = 5;
export const DESIGNER_FIT_MARGIN = 30;

export interface DesignerViewportSize {
  readonly width: number;
  readonly height: number;
}

export function clampDesignerZoom(zoom: number): number {
  return Math.max(DESIGNER_MIN_ZOOM, Math.min(DESIGNER_MAX_ZOOM, zoom));
}

export function getFitDesignerZoom(
  document: ScreenDocument,
  viewport: DesignerViewportSize,
): number {
  const width = Math.max(1, viewport.width - DESIGNER_FIT_MARGIN * 2);
  const height = Math.max(1, viewport.height - DESIGNER_FIT_MARGIN * 2);
  return clampDesignerZoom(
    Math.min(width / document.canvas.width, height / document.canvas.height),
  );
}

export function getViewportAnchor(event: WheelEvent, viewport: HTMLElement): ScreenPoint {
  const bounds = viewport.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function getPanDelta(event: PointerEvent, start: ScreenPoint): ScreenPoint {
  return { x: event.clientX - start.x, y: event.clientY - start.y };
}

export function viewportTransform(viewport: ScreenViewportState): string {
  return `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.zoom})`;
}
