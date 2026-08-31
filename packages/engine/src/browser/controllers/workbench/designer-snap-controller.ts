import type { ScreenDocument } from '@base-screen/contracts';
import {
  DEFAULT_DESIGNER_CANVAS_AIDS,
  type DesignerCanvasAidsState,
  type DesignerSelectionSnapBounds,
  type DesignerSnapPoint,
  type DesignerSnapPreview,
  type DesignerSnapSession,
  type DesignerSnapTranslation,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../../viewport/designer-canvas-aids.js';
import { measureDesignerCanvasBounds } from '../../viewport/designer-canvas-measurements.js';
import { createDesignerSnapCandidates } from '../../viewport/designer-canvas-snap-candidates.js';
import {
  collectDesignerSnapComponentBounds,
  type DesignerSnapComponentBounds,
} from '../../viewport/designer-canvas-snap-geometry.js';
import { DesignerSnapIndex } from '../../viewport/designer-canvas-snap-index.js';
import {
  type DesignerGuideSnapPreview,
  equalDesignerSnapPreviews,
  projectDesignerSnapPreview,
} from '../../viewport/designer-canvas-snap-preview.js';

interface DesignerSnapCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getGuides: () => { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly getRoot: () => ShadowRoot | null;
  readonly getZoom: () => number;
  readonly renderGuides: () => void;
  readonly renderRulers: () => void;
  readonly renderStatus: () => void;
}

interface DesignerSnapGeometry {
  readonly components: readonly DesignerSnapComponentBounds[] | undefined;
  readonly excluded: ReadonlySet<string>;
  readonly index: DesignerSnapIndex;
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
    return snapDesignerCanvasPoint(
      point,
      this.#canvasAids,
      this.resolveGeometry(excludedComponentIds).index,
      this.callbacks.getZoom(),
      this.#sessionActive ? this.#session : undefined,
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
    const snapped = snapDesignerSelectionTranslation(
      bounds,
      offset,
      this.#canvasAids,
      geometry.index,
      zoom,
      this.#sessionActive ? this.#session : undefined,
    );
    return {
      ...snapped,
      ...(geometry.components === undefined
        ? {}
        : {
            measurements: measureDesignerCanvasBounds(
              geometry.components,
              translateSelectionBounds(bounds, snapped),
              zoom,
            ),
          }),
    };
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
    const excluded = new Set(excludedComponentIds);
    if (
      this.#sessionActive &&
      this.#cache !== undefined &&
      this.#cache.excluded.size === excluded.size &&
      excludedComponentIds.every((id) => this.#cache!.excluded.has(id))
    ) {
      return this.#cache;
    }
    const document = this.callbacks.getDocument();
    const components =
      document === undefined ? undefined : collectDesignerSnapComponentBounds(document, excluded);
    const geometry: DesignerSnapGeometry = {
      components,
      excluded,
      index: new DesignerSnapIndex(
        createDesignerSnapCandidates(
          document?.canvas,
          this.callbacks.getGuides(),
          components ?? [],
        ),
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
