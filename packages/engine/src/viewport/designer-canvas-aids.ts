import type { ScreenDocument } from '@base-screen/contracts';
import { isScreenComponentEffectivelyHidden } from '@base-screen/core';

export const DESIGNER_GRID_SIZE = 24;
export const DESIGNER_SMART_GUIDE_THRESHOLD = 5;

export interface DesignerCanvasAidsState {
  readonly gridEnabled: boolean;
  readonly gridSnapEnabled: boolean;
  readonly smartGuidesEnabled: boolean;
}

export const DEFAULT_DESIGNER_CANVAS_AIDS: DesignerCanvasAidsState = {
  gridEnabled: true,
  gridSnapEnabled: true,
  smartGuidesEnabled: true,
};

export interface DesignerSnapCandidates {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

export interface DesignerSnapPoint {
  readonly x: number;
  readonly y: number;
  readonly snappedX?: number | undefined;
  readonly snappedY?: number | undefined;
}

export interface DesignerRulerMark {
  readonly label: string;
  readonly position: number;
  readonly value: number;
}

export interface DesignerRulerOptions {
  readonly devicePixelRatio: number;
  readonly length: number;
  readonly origin: number;
  readonly zoom: number;
}

export function snapDesignerCanvasPoint(
  point: { readonly x: number; readonly y: number },
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapCandidates = { x: [], y: [] },
  zoom = 1,
): DesignerSnapPoint {
  const threshold = DESIGNER_SMART_GUIDE_THRESHOLD / Math.max(zoom, Number.EPSILON);
  const smartX = state.smartGuidesEnabled
    ? nearestSnapCandidate(point.x, candidates.x, threshold)
    : undefined;
  const smartY = state.smartGuidesEnabled
    ? nearestSnapCandidate(point.y, candidates.y, threshold)
    : undefined;
  const gridX = state.gridSnapEnabled
    ? Math.round(point.x / DESIGNER_GRID_SIZE) * DESIGNER_GRID_SIZE
    : undefined;
  const gridY = state.gridSnapEnabled
    ? Math.round(point.y / DESIGNER_GRID_SIZE) * DESIGNER_GRID_SIZE
    : undefined;
  return {
    x: smartX ?? gridX ?? point.x,
    y: smartY ?? gridY ?? point.y,
    ...((smartX ?? gridX) === undefined ? {} : { snappedX: smartX ?? gridX }),
    ...((smartY ?? gridY) === undefined ? {} : { snappedY: smartY ?? gridY }),
  };
}

export function collectDesignerSnapCandidates(
  document: ScreenDocument,
  guides: DesignerSnapCandidates,
  excludedComponentIds: readonly string[] = [],
): DesignerSnapCandidates {
  const excluded = new Set(excludedComponentIds);
  const x = [0, document.canvas.width / 2, document.canvas.width, ...guides.x];
  const y = [0, document.canvas.height / 2, document.canvas.height, ...guides.y];
  for (const component of document.components) {
    if (excluded.has(component.id) || isScreenComponentEffectivelyHidden(document, component.id)) {
      continue;
    }
    const bounds = componentSnapBounds(component);
    x.push(bounds.left, bounds.centerX, bounds.right);
    y.push(bounds.top, bounds.centerY, bounds.bottom);
  }
  return { x: sortedUniqueNumbers(x), y: sortedUniqueNumbers(y) };
}

export function getDesignerRulerMarks(options: DesignerRulerOptions): readonly DesignerRulerMark[] {
  const { devicePixelRatio, length, origin, zoom } = options;
  if (!Number.isFinite(length) || !Number.isFinite(origin) || length <= 0 || zoom <= 0) {
    return [];
  }
  const increment = rulerIncrement(zoom);
  const first = Math.ceil(-origin / zoom / increment) * increment;
  const last = Math.floor((length - origin) / zoom / increment) * increment;
  const pixelRatio = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);
  const precision = 10 ** Math.max(0, -Math.floor(Math.log10(increment)));
  const marks: DesignerRulerMark[] = [];
  for (let value = first; value <= last && marks.length < 200; value += increment) {
    const roundedValue = Math.round(value * precision) / precision;
    const normalizedValue = roundedValue === 0 ? 0 : roundedValue;
    const position = Math.round((origin + normalizedValue * zoom) * pixelRatio) / pixelRatio;
    marks.push({ label: String(normalizedValue), position, value: normalizedValue });
  }
  return marks;
}

function nearestSnapCandidate(
  value: number,
  candidates: readonly number[],
  threshold: number,
): number | undefined {
  let nearest: number | undefined;
  for (const candidate of sortedUniqueNumbers(candidates)) {
    if (Math.abs(candidate - value) > threshold) continue;
    if (
      nearest === undefined ||
      Math.abs(candidate - value) < Math.abs(nearest - value) ||
      (Math.abs(candidate - value) === Math.abs(nearest - value) && candidate < nearest)
    ) {
      nearest = candidate;
    }
  }
  return nearest;
}

function rulerIncrement(zoom: number): number {
  const target = 48 / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 5, 10].find((factor) => factor * magnitude >= target) ?? 10) * magnitude;
}

function componentSnapBounds(component: ScreenDocument['components'][number]): {
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
} {
  const centerX = component.position.x + component.size.width / 2;
  const centerY = component.position.y + component.size.height / 2;
  const radians = (component.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfWidth = (component.size.width * cosine + component.size.height * sine) / 2;
  const halfHeight = (component.size.width * sine + component.size.height * cosine) / 2;
  return {
    bottom: normalizeCoordinate(centerY + halfHeight),
    centerX: normalizeCoordinate(centerX),
    centerY: normalizeCoordinate(centerY),
    left: normalizeCoordinate(centerX - halfWidth),
    right: normalizeCoordinate(centerX + halfWidth),
    top: normalizeCoordinate(centerY - halfHeight),
  };
}

function normalizeCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sortedUniqueNumbers(values: readonly number[]): readonly number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort(
    (left, right) => left - right,
  );
}
