import type { ScreenDocument } from '@base-screen/contracts';
import {
  collectDesignerAlignmentGuides,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  DesignerAlignmentIndex,
  type DesignerCanvasAidsState,
  type DesignerSelectionSnapBounds,
  type DesignerSnapGuides,
  type DesignerSnapPoint,
  type DesignerSnapPreview,
  type DesignerSnapSession,
  type DesignerSnapTranslation,
  DesignerSpacingIndex,
  resolveDesignerSnapTuning,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../../viewport/designer-canvas-aids.js';
import { DesignerCanvasMeasurementIndex } from '../../viewport/designer-canvas-measurements.js';
import {
  collectDesignerSnapComponentBounds,
  type DesignerSnapComponentBounds,
  resolveDesignerSnapScope,
} from '../../viewport/designer-canvas-snap-geometry.js';
import {
  type DesignerGuideSnapPreview,
  equalDesignerSnapPreviews,
  projectDesignerSnapPreview,
} from '../../viewport/designer-canvas-snap-preview.js';

interface DesignerSnapCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getGuides: () => { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly getRoot: () => ShadowRoot | null;
  /** Visible canvas region in document coordinates; undefined when it cannot be measured. */
  readonly getVisibleRegion?: () => DesignerSelectionSnapBounds | undefined;
  readonly getZoom: () => number;
  readonly renderGuides: () => void;
  readonly renderRulers: () => void;
  readonly renderStatus: () => void;
}

// One snapshot per gesture: static component geometry feeds the alignment index and, built
// lazily on the first selection drag frame, the equal-spacing and measurement indexes.
interface DesignerSnapGeometry {
  readonly components: readonly DesignerSnapComponentBounds[] | undefined;
  readonly excluded: ReadonlySet<string>;
  /** Last exclusion list seen, so per-frame calls with the same array skip the set comparison. */
  excludedIds: readonly string[];
  readonly index: DesignerAlignmentIndex;
  spacing?: DesignerSpacingIndex;
  measurements?: DesignerCanvasMeasurementIndex;
}

export class DesignerSnapController {
  #canvasAids: DesignerCanvasAidsState = DEFAULT_DESIGNER_CANVAS_AIDS;
  #enabled = true;
  #preview: DesignerGuideSnapPreview | undefined;
  #session: DesignerSnapSession = {};
  #cache: DesignerSnapGeometry | undefined;
  #sessionActive = false;

  constructor(private readonly callbacks: DesignerSnapCallbacks) {}

  initialize(): void {
    this.renderCanvasAids();
  }

  get canvasAids(): DesignerCanvasAidsState {
    return this.#canvasAids;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  get preview(): DesignerGuideSnapPreview | undefined {
    return this.#preview;
  }

  get borderGuidesEnabled(): boolean {
    return this.#canvasAids.smartGuidesEnabled;
  }

  isCanvasAidEnabled(aid: 'gridEnabled'): boolean {
    return this.#canvasAids[aid];
  }

  setSessionActive(active: boolean): void {
    this.#sessionActive = active;
    this.invalidateCandidates();
  }

  invalidateCandidates(): void {
    this.#cache = undefined;
    this.#session = {};
  }

  clearPreview(): void {
    this.#preview = undefined;
  }

  snapPoint(
    point: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapPoint {
    if (!this.#enabled || !this.#canvasAids.smartGuidesEnabled) return { x: point.x, y: point.y };
    const geometry = this.resolveGeometry(excludedComponentIds);
    const zoom = this.callbacks.getZoom();
    return snapDesignerCanvasPoint(
      point,
      this.#canvasAids,
      geometry.index,
      zoom,
      this.#sessionActive ? this.#session : undefined,
      resolveDesignerSnapTuning(geometry.components ?? [], around(point.x, point.y), zoom),
    );
  }

  snapSelectionOffset(
    bounds: DesignerSelectionSnapBounds,
    offset: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapTranslation {
    if (!this.#enabled || !this.#canvasAids.smartGuidesEnabled) return { x: offset.x, y: offset.y };
    const geometry = this.resolveGeometry(excludedComponentIds);
    const zoom = this.callbacks.getZoom();
    const components = geometry.components;
    if (components !== undefined) geometry.spacing ??= new DesignerSpacingIndex(components);
    // Density is read from where the selection is about to land, so the parameters follow the
    // pointer between sparse and crowded regions instead of being fixed per gesture.
    const tuning = resolveDesignerSnapTuning(
      components ?? [],
      translateSelectionBounds(bounds, offset),
      zoom,
    );
    const snapped = snapDesignerSelectionTranslation(
      bounds,
      offset,
      this.#canvasAids,
      geometry.index,
      zoom,
      this.#sessionActive ? this.#session : undefined,
      geometry.spacing,
      tuning,
    );
    // Equal spacing, when the final position has it, is the only spacing worth showing;
    // otherwise fall back to the nearest gap on each side of the selection.
    if (components === undefined || snapped.measurements !== undefined) return snapped;
    geometry.measurements ??= new DesignerCanvasMeasurementIndex(components);
    return {
      ...snapped,
      measurements: geometry.measurements.measure(
        translateSelectionBounds(bounds, snapped),
        zoom,
        tuning.reach + tuning.threshold,
      ),
    };
  }

  /** Guides for geometry the gesture derived from a snapped pointer (resize, drawing). */
  alignmentGuides(
    bounds: DesignerSelectionSnapBounds,
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapGuides | undefined {
    if (!this.#enabled || !this.#canvasAids.smartGuidesEnabled) return undefined;
    const geometry = this.resolveGeometry(excludedComponentIds);
    const zoom = this.callbacks.getZoom();
    return collectDesignerAlignmentGuides(
      bounds,
      this.#canvasAids,
      geometry.index,
      zoom,
      resolveDesignerSnapTuning(geometry.components ?? [], bounds, zoom),
    );
  }

  renderPreview(point: DesignerSnapPreview | undefined): void {
    if (!this.#enabled || !this.#canvasAids.smartGuidesEnabled) {
      if (this.#preview === undefined) return;
      this.#preview = undefined;
      this.callbacks.renderGuides();
      return;
    }
    const nextPreview = projectDesignerSnapPreview(point);
    if (equalDesignerSnapPreviews(this.#preview, nextPreview)) {
      this.#preview = nextPreview;
      return;
    }
    this.#preview = nextPreview;
    this.callbacks.renderGuides();
  }

  renderCanvasPrecision(): void {
    this.callbacks.renderGuides();
    this.callbacks.renderRulers();
  }

  toggleCanvasAid(aid: 'gridEnabled'): void {
    this.#canvasAids = { ...this.#canvasAids, [aid]: !this.#canvasAids[aid] };
    this.renderCanvasAids();
  }

  toggleSnap(): void {
    this.#enabled = !this.#enabled;
    this.invalidateCandidates();
    this.#preview = undefined;
    this.callbacks.renderGuides();
    this.callbacks.renderStatus();
  }

  toggleBorderGuides(): void {
    this.#canvasAids = {
      ...this.#canvasAids,
      smartGuidesEnabled: !this.#canvasAids.smartGuidesEnabled,
    };
    this.invalidateCandidates();
    this.#preview = undefined;
    this.renderCanvasAids();
    this.callbacks.renderGuides();
  }

  private resolveGeometry(excludedComponentIds: readonly string[]): DesignerSnapGeometry {
    const cache = this.#cache;
    if (this.#sessionActive && cache !== undefined && cache.excludedIds === excludedComponentIds) {
      return cache;
    }
    const excluded = new Set(excludedComponentIds);
    if (
      this.#sessionActive &&
      cache !== undefined &&
      cache.excluded.size === excluded.size &&
      excludedComponentIds.every((id) => cache.excluded.has(id))
    ) {
      cache.excludedIds = excludedComponentIds;
      return cache;
    }
    const document = this.callbacks.getDocument();
    const region = this.callbacks.getVisibleRegion?.();
    // Targets: the selection's siblings under their common parent, plus that parent (tldraw /
    // Penpot), limited to what is visible; the reach is applied per frame by the solver.
    const components =
      document === undefined
        ? undefined
        : visibleComponents(
            collectDesignerSnapComponentBounds(
              document,
              excluded,
              resolveDesignerSnapScope(document, excluded),
            ),
            region,
          );
    const geometry: DesignerSnapGeometry = {
      components,
      excluded,
      excludedIds: excludedComponentIds,
      index: DesignerAlignmentIndex.fromScene(
        document?.canvas,
        this.callbacks.getGuides(),
        components ?? [],
      ),
    };
    if (this.#sessionActive) {
      this.#session = {};
      this.#cache = geometry;
    }
    return geometry;
  }

  private renderCanvasAids(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const viewport = root.querySelector<HTMLElement>('[data-viewport]');
    if (viewport !== null && viewport !== undefined) {
      viewport.dataset.grid = String(this.#canvasAids.gridEnabled);
    }
    root
      .querySelector<HTMLButtonElement>('[data-action="toggle-grid"]')
      ?.setAttribute('aria-pressed', String(this.#canvasAids.gridEnabled));
  }
}

// Like tldraw / Penpot / Excalidraw, only components the user can see are snap targets.
function visibleComponents(
  components: readonly DesignerSnapComponentBounds[],
  region: DesignerSelectionSnapBounds | undefined,
): readonly DesignerSnapComponentBounds[] {
  if (region === undefined) return components;
  return components.filter(
    (bounds) =>
      bounds.right >= region.left &&
      bounds.left <= region.right &&
      bounds.bottom >= region.top &&
      bounds.top <= region.bottom,
  );
}

function translateSelectionBounds(
  bounds: DesignerSelectionSnapBounds,
  translation: { readonly x: number; readonly y: number },
): DesignerSelectionSnapBounds {
  return {
    bottom: bounds.bottom + translation.y,
    left: bounds.left + translation.x,
    right: bounds.right + translation.x,
    top: bounds.top + translation.y,
  };
}

// A point has no extent; the density window still reads the components around it.
function around(x: number, y: number): DesignerSelectionSnapBounds {
  return { bottom: y, left: x, right: x, top: y };
}
