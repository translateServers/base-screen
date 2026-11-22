// Two-phase snapping (research/canvas-snap-guides-2026-11-22.md, same as tldraw / Excalidraw /
// Penpot): (1) Moveable owns point-snap competition and tie breaking per axis (ADR-0020); the
// alignment index only narrows its input. Selection drags also try equal spacing, which wins an
// axis only when strictly nearer than the point snap. (2) Guides and equal-spacing marks are
// recomputed from the final geometry. This adapter owns the session hold and preview projection.
import { checkSnapPoses } from '../../common/vendor/moveable/snappable/snap.js';
import type { SnapInfo } from '../../common/vendor/moveable/types.js';
import {
  DESIGNER_SMART_GUIDE_THRESHOLD,
  DESIGNER_SNAP_ALIGNMENT_TOLERANCE,
  DESIGNER_SNAP_REACH,
  DESIGNER_SNAP_RELEASE_MULTIPLIER,
  type DesignerCanvasAidsState,
  type DesignerSelectionSnapBounds,
  type DesignerSnapGuides,
  type DesignerSnapPoint,
  type DesignerSnapSession,
  type DesignerSnapSessionAxis,
  type DesignerSnapTranslation,
} from './designer-canvas-aids-types.js';
import { DesignerAlignmentIndex } from './designer-canvas-snap-alignment-index.js';
import type { DesignerSnapCandidates } from './designer-canvas-snap-candidates.js';
import type { DesignerSpacingIndex } from './designer-canvas-snap-spacing.js';

export * from './designer-canvas-aids-types.js';
export {
  type DesignerRulerMark,
  type DesignerRulerOptions,
  getDesignerRulerMarks,
} from './designer-canvas-ruler.js';
export { DesignerAlignmentIndex } from './designer-canvas-snap-alignment-index.js';
export {
  collectDesignerSnapCandidates,
  type DesignerSnapCandidate,
  type DesignerSnapCandidates,
} from './designer-canvas-snap-candidates.js';
export { DesignerSpacingIndex } from './designer-canvas-snap-spacing.js';

type DesignerSnapTargets = DesignerSnapCandidates | DesignerAlignmentIndex;
type DesignerSnapCoordinates = { readonly x: number; readonly y: number };
const EMPTY_CANDIDATES: DesignerSnapCandidates = { x: [], y: [] };
const SELECTION_DIRECTIONS = ['start', 'center', 'end'] as const;

export function snapDesignerCanvasPoint(
  point: DesignerSnapCoordinates,
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapTargets = EMPTY_CANDIDATES,
  zoom = 1,
  session?: DesignerSnapSession,
): DesignerSnapPoint {
  return resolveCanvasSnap(point, state, candidates, zoom, session, undefined, undefined);
}

export function snapDesignerSelectionTranslation(
  bounds: DesignerSelectionSnapBounds,
  translation: DesignerSnapCoordinates,
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapTargets = EMPTY_CANDIDATES,
  zoom = 1,
  session?: DesignerSnapSession,
  spacing?: DesignerSpacingIndex,
): DesignerSnapTranslation {
  return resolveCanvasSnap(translation, state, candidates, zoom, session, bounds, spacing);
}

/** Phase two alone, for geometry another step produced (resize, drawing a new component). */
export function collectDesignerAlignmentGuides(
  bounds: DesignerSelectionSnapBounds,
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapTargets = EMPTY_CANDIDATES,
  zoom = 1,
): DesignerSnapGuides | undefined {
  if (!state.smartGuidesEnabled) return undefined;
  return toIndex(candidates).guides(bounds, alignmentTolerance(zoom), designerSnapGuideReach(zoom));
}

function resolveCanvasSnap(
  raw: DesignerSnapCoordinates,
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapTargets,
  zoom: number,
  session: DesignerSnapSession | undefined,
  bounds: DesignerSelectionSnapBounds | undefined,
  spacing: DesignerSpacingIndex | undefined,
): DesignerSnapTranslation {
  if (!state.smartGuidesEnabled) {
    if (session !== undefined) {
      session.x = undefined;
      session.y = undefined;
    }
    return { x: raw.x, y: raw.y };
  }
  const scale = Math.max(zoom, Number.EPSILON);
  const threshold = DESIGNER_SMART_GUIDE_THRESHOLD / scale;
  const releaseThreshold = threshold * DESIGNER_SNAP_RELEASE_MULTIPLIER;
  const anchors =
    bounds === undefined
      ? undefined
      : {
          x: [bounds.left, (bounds.left + bounds.right) / 2, bounds.right],
          y: [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom],
        };
  const posesX = anchors?.x.map((anchor) => anchor + raw.x) ?? [raw.x];
  const posesY = anchors?.y.map((anchor) => anchor + raw.y) ?? [raw.y];
  const directions = anchors === undefined ? [] : SELECTION_DIRECTIONS;
  const index = toIndex(candidates);
  const reach = DESIGNER_SNAP_REACH / scale;
  // The geometry being moved, before snapping: the reach is measured from it.
  const moved =
    bounds === undefined
      ? { left: raw.x, right: raw.x, top: raw.y, bottom: raw.y }
      : {
          left: bounds.left + raw.x,
          right: bounds.right + raw.x,
          top: bounds.top + raw.y,
          bottom: bounds.bottom + raw.y,
        };
  const snap = checkSnapPoses(
    index.query(posesX, posesY, threshold, moved, reach),
    posesX,
    posesY,
    directions,
    directions,
    threshold,
    threshold,
    [1, 1],
  );
  const gapX =
    bounds === undefined || spacing === undefined
      ? undefined
      : spacingSnap(spacing.snap('x', moved, threshold, reach), bounds.left);
  const gapY =
    bounds === undefined || spacing === undefined
      ? undefined
      : spacingSnap(spacing.snap('y', moved, threshold, reach), bounds.top);
  const x = resolveAxis(raw.x, anchors?.x, snap.vertical, 0, releaseThreshold, session?.x, gapX);
  const y = resolveAxis(raw.y, anchors?.y, snap.horizontal, 1, releaseThreshold, session?.y, gapY);
  if (session !== undefined) {
    session.x = x.next;
    session.y = y.next;
  }
  const final =
    bounds === undefined
      ? { left: x.value, right: x.value, top: y.value, bottom: y.value }
      : {
          left: bounds.left + x.value,
          right: bounds.right + x.value,
          top: bounds.top + y.value,
          bottom: bounds.bottom + y.value,
        };
  const tolerance = alignmentTolerance(zoom);
  const guides = index.guides(final, tolerance, designerSnapGuideReach(zoom));
  const equalSpacing = spacing?.measurements(final, tolerance, designerSnapGuideReach(zoom)) ?? [];
  return {
    x: x.value,
    y: y.value,
    ...(x.snapped === undefined ? {} : { snappedX: x.snapped }),
    ...(y.snapped === undefined ? {} : { snappedY: y.snapped }),
    ...(guides === undefined ? {} : { guides }),
    ...(equalSpacing.length === 0 ? {} : { measurements: equalSpacing }),
  };
}

interface SpacingSnap {
  /** Translation offset to apply on top of the raw translation. */
  readonly nudge: number;
  /** The selection edge (in original coordinates) whose snapped position the session holds. */
  readonly anchor: number;
}

function spacingSnap(nudge: number | undefined, anchor: number): SpacingSnap | undefined {
  return nudge === undefined ? undefined : { nudge, anchor };
}

function toIndex(candidates: DesignerSnapTargets): DesignerAlignmentIndex {
  return candidates instanceof DesignerAlignmentIndex
    ? candidates
    : DesignerAlignmentIndex.fromCandidates(candidates);
}

function alignmentTolerance(zoom: number): number {
  return DESIGNER_SNAP_ALIGNMENT_TOLERANCE / Math.max(zoom, Number.EPSILON);
}

/**
 * Reach for guides and marks on the final geometry: snapping may move it by up to the threshold,
 * so allow that much more, or a target that won the snap could lose its guide.
 */
export function designerSnapGuideReach(zoom: number): number {
  return (DESIGNER_SNAP_REACH + DESIGNER_SMART_GUIDE_THRESHOLD) / Math.max(zoom, Number.EPSILON);
}

interface AxisResolution {
  readonly next: DesignerSnapSessionAxis | undefined;
  readonly snapped: number | undefined;
  readonly value: number;
}

function resolveAxis(
  raw: number,
  anchors: readonly number[] | undefined,
  snap: SnapInfo,
  coordinate: 0 | 1,
  releaseThreshold: number,
  previous: DesignerSnapSessionAxis | undefined,
  spacing?: SpacingSnap,
): AxisResolution {
  const position = snap.posInfos[0];
  const hit = position?.guidelineInfos[0];
  // Equal spacing wins only when strictly nearer; ties keep the point snap (tldraw order).
  if (spacing !== undefined && (hit === undefined || Math.abs(spacing.nudge) < hit.dist)) {
    const value = raw + spacing.nudge;
    const snapped = spacing.anchor + value;
    return { value, snapped, next: { anchor: spacing.anchor, value: snapped } };
  }
  if (position !== undefined && hit !== undefined) {
    const value = hit.guideline.pos[coordinate]!;
    const anchor = anchors === undefined ? undefined : (anchors[position.index] ?? position.pos);
    return {
      value: anchor === undefined ? value : value - anchor,
      snapped: value,
      next: anchor === undefined ? { value } : { anchor, value },
    };
  }
  const heldAnchor = anchors === undefined ? 0 : previous?.anchor;
  if (
    previous !== undefined &&
    heldAnchor !== undefined &&
    Math.abs(previous.value - (heldAnchor + raw)) <= releaseThreshold
  ) {
    return { value: previous.value - heldAnchor, snapped: previous.value, next: previous };
  }
  return { value: raw, snapped: undefined, next: undefined };
}
