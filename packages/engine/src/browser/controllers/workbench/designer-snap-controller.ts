import type { ScreenDocument } from '@base-screen/contracts';
import {
  collectDesignerSnapCandidates,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  type DesignerCanvasAidsState,
  type DesignerSelectionSnapBounds,
  type DesignerSnapCandidates,
  type DesignerSnapGuideLine,
  type DesignerSnapPoint,
  type DesignerSnapPreview,
  type DesignerSnapSession,
  type DesignerSnapTranslation,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../../viewport/designer-canvas-aids.js';
import { collectDesignerCanvasMeasurements } from '../../viewport/designer-canvas-measurements.js';
import type { DesignerGuideSnapPreview } from '../../viewport/designer-guide-overlay.js';

interface DesignerSnapCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getGuides: () => { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly getRoot: () => ShadowRoot | null;
  readonly getZoom: () => number;
  readonly renderGuides: () => void;
  readonly renderRulers: () => void;
  readonly renderStatus: () => void;
}

export class DesignerSnapController {
  #canvasAids: DesignerCanvasAidsState = DEFAULT_DESIGNER_CANVAS_AIDS;
  #enabled = true;
  #preview: DesignerGuideSnapPreview | undefined;
  #session: DesignerSnapSession = {};
  #cache:
    | {
        readonly candidates: DesignerSnapCandidates;
        readonly excludedKey: string;
      }
    | undefined;
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
    this.#cache = undefined;
    if (!active) this.#session = {};
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
    if (!this.#enabled) return { x: point.x, y: point.y };
    const candidates = this.resolveCandidates(excludedComponentIds);
    return snapDesignerCanvasPoint(
      point,
      this.#canvasAids,
      candidates,
      this.callbacks.getZoom(),
      this.#sessionActive ? this.#session : undefined,
    );
  }

  snapSelectionOffset(
    bounds: DesignerSelectionSnapBounds,
    offset: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapTranslation {
    if (!this.#enabled) return { x: offset.x, y: offset.y };
    const document = this.callbacks.getDocument();
    const snapped = snapDesignerSelectionTranslation(
      bounds,
      offset,
      this.#canvasAids,
      this.resolveCandidates(excludedComponentIds, document),
      this.callbacks.getZoom(),
      this.#sessionActive ? this.#session : undefined,
    );
    return {
      ...snapped,
      // 选区路径显式传入空 guides，避免精确重合时被单点路径的回退线误渲染。
      guides: snapped.guides ?? {},
      ...(document === undefined || !this.#canvasAids.smartGuidesEnabled
        ? {}
        : {
            measurements: collectDesignerCanvasMeasurements(
              document,
              translateSelectionBounds(bounds, snapped),
              excludedComponentIds,
              this.callbacks.getZoom(),
            ),
          }),
    };
  }

  renderPreview(point: DesignerSnapPreview | undefined): void {
    if (!this.#enabled) {
      if (this.#preview === undefined) return;
      this.#preview = undefined;
      this.callbacks.renderGuides();
      return;
    }
    const nextPreview = toSnapPreviewState(point);
    if (snapPreviewRenderKey(this.#preview) === snapPreviewRenderKey(nextPreview)) {
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

  private resolveCandidates(
    excludedComponentIds: readonly string[],
    document = this.callbacks.getDocument(),
  ): DesignerSnapCandidates {
    if (document === undefined) return guidesCandidates(this.callbacks.getGuides());
    if (!this.#sessionActive) {
      return collectDesignerSnapCandidates(
        document,
        this.callbacks.getGuides(),
        excludedComponentIds,
      );
    }
    const excludedKey = JSON.stringify([...new Set(excludedComponentIds)].sort());
    if (this.#cache?.excludedKey === excludedKey) return this.#cache.candidates;
    this.#session = {};
    const candidates = collectDesignerSnapCandidates(
      document,
      this.callbacks.getGuides(),
      excludedComponentIds,
    );
    this.#cache = { candidates, excludedKey };
    return candidates;
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

function guidesCandidates(guides: {
  readonly x: readonly number[];
  readonly y: readonly number[];
}): DesignerSnapCandidates {
  return {
    x: guides.x.map((value) => ({ value, start: 0, size: 0 })),
    y: guides.y.map((value) => ({ value, start: 0, size: 0 })),
  };
}

function toSnapPreviewState(
  point: DesignerSnapPreview | undefined,
): DesignerGuideSnapPreview | undefined {
  if (point === undefined) return undefined;
  if (point.guides !== undefined) {
    const x = point.guides.x?.length === 0 ? undefined : point.guides.x;
    const y = point.guides.y?.length === 0 ? undefined : point.guides.y;
    return {
      x,
      y,
      activeX: x === undefined ? undefined : point.snappedX,
      activeY: y === undefined ? undefined : point.snappedY,
      measurements: point.measurements,
    };
  }
  const activeLine = (value: number | undefined): readonly DesignerSnapGuideLine[] | undefined =>
    value === undefined ? undefined : [{ value }];
  return {
    x: activeLine(point.snappedX),
    y: activeLine(point.snappedY),
    activeX: point.snappedX,
    activeY: point.snappedY,
    measurements: point.measurements,
  };
}

function snapPreviewRenderKey(preview: DesignerGuideSnapPreview | undefined): string {
  if (preview === undefined) return '';
  return JSON.stringify(preview);
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
