// Moveable owns capture-distance competition and tie breaking (ADR-0020).
// The prepared index only narrows its input; this adapter owns session and preview projection.
import { checkSnapPoses } from '../../common/vendor/moveable/snappable/snap.js';
import type { SnapInfo } from '../../common/vendor/moveable/types.js';
import {
  DESIGNER_SMART_GUIDE_THRESHOLD,
  DESIGNER_SNAP_RELEASE_MULTIPLIER,
  DESIGNER_SNAP_RENDER_THRESHOLD,
  type DesignerCanvasAidsState,
  type DesignerSelectionSnapBounds,
  type DesignerSnapGuideLine,
  type DesignerSnapPoint,
  type DesignerSnapSession,
  type DesignerSnapSessionAxis,
  type DesignerSnapTranslation,
} from './designer-canvas-aids-types.js';
import type { DesignerSnapCandidates } from './designer-canvas-snap-candidates.js';
import { DesignerSnapIndex } from './designer-canvas-snap-index.js';

export * from './designer-canvas-aids-types.js';
export {
  type DesignerRulerMark,
  type DesignerRulerOptions,
  getDesignerRulerMarks,
} from './designer-canvas-ruler.js';
export {
  collectDesignerSnapCandidates,
  type DesignerSnapCandidate,
  type DesignerSnapCandidates,
} from './designer-canvas-snap-candidates.js';

type DesignerSnapTargets = DesignerSnapCandidates | DesignerSnapIndex;
type DesignerSnapCoordinates = { readonly x: number; readonly y: number };
type DesignerSnapAnchors = { readonly x: readonly number[]; readonly y: readonly number[] };
const EMPTY_CANDIDATES: DesignerSnapCandidates = { x: [], y: [] };
const SELECTION_DIRECTIONS = ['start', 'center', 'end'] as const;

export function snapDesignerCanvasPoint(
  point: DesignerSnapCoordinates,
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapTargets = EMPTY_CANDIDATES,
  zoom = 1,
  session?: DesignerSnapSession,
): DesignerSnapPoint {
  return resolveCanvasSnap(point, state, candidates, zoom, session);
}

export function snapDesignerSelectionTranslation(
  bounds: DesignerSelectionSnapBounds,
  translation: DesignerSnapCoordinates,
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapTargets = EMPTY_CANDIDATES,
  zoom = 1,
  session?: DesignerSnapSession,
): DesignerSnapTranslation {
  return resolveCanvasSnap(translation, state, candidates, zoom, session, {
    x: [bounds.left, (bounds.left + bounds.right) / 2, bounds.right],
    y: [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom],
  });
}

function resolveCanvasSnap(
  raw: DesignerSnapCoordinates,
  state: DesignerCanvasAidsState,
  candidates: DesignerSnapTargets,
  zoom: number,
  session: DesignerSnapSession | undefined,
  anchors?: DesignerSnapAnchors,
): DesignerSnapPoint {
  if (!state.smartGuidesEnabled) {
    if (session !== undefined) {
      session.x = undefined;
      session.y = undefined;
    }
    return { x: raw.x, y: raw.y };
  }
  const scale = Math.max(zoom, Number.EPSILON);
  const threshold = DESIGNER_SMART_GUIDE_THRESHOLD / scale;
  const renderThreshold = DESIGNER_SNAP_RENDER_THRESHOLD / scale;
  const releaseThreshold = threshold * DESIGNER_SNAP_RELEASE_MULTIPLIER;
  const posesX = anchors?.x.map((anchor) => anchor + raw.x) ?? [raw.x];
  const posesY = anchors?.y.map((anchor) => anchor + raw.y) ?? [raw.y];
  const index =
    candidates instanceof DesignerSnapIndex ? candidates : new DesignerSnapIndex(candidates);
  const directions = anchors === undefined ? [] : SELECTION_DIRECTIONS;
  const snap = checkSnapPoses(
    index.query(posesX, posesY, threshold),
    posesX,
    posesY,
    directions,
    directions,
    threshold,
    threshold,
    [1, 1],
  );
  const x = resolveAxis(
    raw.x,
    anchors?.x,
    snap.vertical,
    0,
    releaseThreshold,
    renderThreshold,
    session?.x,
  );
  const y = resolveAxis(
    raw.y,
    anchors?.y,
    snap.horizontal,
    1,
    releaseThreshold,
    renderThreshold,
    session?.y,
  );
  if (session !== undefined) {
    session.x = x.next;
    session.y = y.next;
  }
  return {
    x: x.value,
    y: y.value,
    ...(x.snapped === undefined ? {} : { snappedX: x.snapped }),
    ...(y.snapped === undefined ? {} : { snappedY: y.snapped }),
    ...(x.guides.length === 0 && y.guides.length === 0
      ? {}
      : {
          guides: {
            ...(x.guides.length === 0 ? {} : { x: x.guides }),
            ...(y.guides.length === 0 ? {} : { y: y.guides }),
          },
        }),
  };
}

interface AxisResolution {
  readonly guides: readonly DesignerSnapGuideLine[];
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
  renderThreshold: number,
  previous: DesignerSnapSessionAxis | undefined,
): AxisResolution {
  const position = snap.posInfos[0];
  const hit = position?.guidelineInfos[0];
  if (position !== undefined && hit !== undefined) {
    const value = hit.guideline.pos[coordinate]!;
    const anchor = anchors === undefined ? undefined : (anchors[position.index] ?? position.pos);
    // Exact point hits confirm the transform anchor; unchanged selection edges stay unmarked.
    const visible =
      hit.dist <= renderThreshold && (anchors === undefined || hit.dist > Number.EPSILON);
    return {
      value: anchor === undefined ? value : value - anchor,
      snapped: value,
      next: anchor === undefined ? { value } : { anchor, value },
      guides: visible
        ? [{ value, start: hit.guideline.pos[coordinate === 0 ? 1 : 0]!, size: hit.guideline.size }]
        : [],
    };
  }
  const heldAnchor = anchors === undefined ? 0 : previous?.anchor;
  if (
    previous !== undefined &&
    heldAnchor !== undefined &&
    Math.abs(previous.value - (heldAnchor + raw)) <= releaseThreshold
  ) {
    return {
      value: previous.value - heldAnchor,
      snapped: previous.value,
      next: previous,
      guides: [],
    };
  }
  return { value: raw, snapped: undefined, next: undefined, guides: [] };
}
