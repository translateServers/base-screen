import type { ScreenDocument } from '@base-screen/contracts';
import {
  isDesignerAutoWidthText,
  projectDesignerAutoWidths,
} from '../../common/operations/element/designer-auto-width.js';
import {
  clampScreenSize,
  roundScreenGeometry,
} from '../../common/operations/element/designer-geometry.js';

interface DesignerAutoWidthCallbacks {
  readonly getCanvas: () => HTMLElement | undefined;
  readonly onGeometryChange: () => void;
}

/** Observes material host boxes only; never writes material geometry or canonical state. */
export class DesignerAutoWidthController {
  readonly #widths = new Map<string, number>();
  readonly #elements = new Map<string, HTMLElement>();
  #document: ScreenDocument | undefined;
  #observer: ResizeObserver | undefined;
  #frozen = false;
  #generation = 0;
  #cachedInput: ScreenDocument | undefined;
  #cachedProjection: ScreenDocument | undefined;

  constructor(private readonly callbacks: DesignerAutoWidthCallbacks) {}

  project(document: ScreenDocument | undefined): ScreenDocument | undefined {
    if (document === undefined) return undefined;
    if (document !== this.#cachedInput || this.#cachedProjection === undefined) {
      this.#cachedInput = document;
      this.#cachedProjection = projectDesignerAutoWidths(document, this.#widths);
    }
    return this.#cachedProjection;
  }

  /** Called with the just-rendered document, before DesignerSession commits it. */
  sync(document: ScreenDocument | undefined): void {
    this.#document = document;
    const canvas = this.callbacks.getCanvas();
    const ids = new Set(
      document?.components.filter(isDesignerAutoWidthText).map((item) => item.id),
    );
    for (const [id, element] of this.#elements) {
      if (ids.has(id) && element.isConnected && canvas?.contains(element)) continue;
      this.#observer?.unobserve(element);
      this.#elements.delete(id);
      this.#widths.delete(id);
      this.#cachedProjection = undefined;
    }
    if (canvas === undefined || ids.size === 0) return;
    if (this.#observer === undefined && typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(this.onResize);
    }
    for (const element of canvas.querySelectorAll<HTMLElement>('[data-base-screen-component-id]')) {
      const id = element.dataset.baseScreenComponentId;
      if (id === undefined || !ids.has(id)) continue;
      if (this.#elements.get(id) !== element) {
        this.#elements.set(id, element);
        this.#observer?.observe(element, { box: 'border-box' });
      }
      if (!this.#frozen) this.measure(id, element);
    }
  }

  setFrozen(frozen: boolean): void {
    const generation = ++this.#generation;
    if (frozen) {
      this.sync(this.#document);
      this.#frozen = true;
      return;
    }
    // Finish/cancel restores DOM and commits the gesture in this task. Keep its geometry
    // baseline until both have completed, including any queued ResizeObserver callbacks.
    queueMicrotask(() => {
      if (generation !== this.#generation) return;
      this.#frozen = false;
      this.sync(this.#document);
      this.callbacks.onGeometryChange();
    });
  }

  clear(): void {
    this.#generation++;
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#document = undefined;
    this.#elements.clear();
    this.#widths.clear();
    this.#cachedInput = undefined;
    this.#cachedProjection = undefined;
    this.#frozen = false;
  }

  private readonly onResize = (entries: readonly ResizeObserverEntry[]): void => {
    if (this.#frozen) return;
    let changed = false;
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      const id = element.dataset.baseScreenComponentId;
      if (id === undefined || this.#elements.get(id) !== element) continue;
      changed = this.measure(id, element) || changed;
    }
    if (changed) this.callbacks.onGeometryChange();
  };

  private measure(id: string, element: HTMLElement): boolean {
    if (!element.isConnected) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style === undefined || style.display === 'none') return false;
    const width = Number.parseFloat(style.width);
    if (!Number.isFinite(width) || width <= 0) return false;
    const normalized = roundScreenGeometry(clampScreenSize(width));
    if (this.#widths.get(id) === normalized) return false;
    this.#widths.set(id, normalized);
    this.#cachedProjection = undefined;
    return true;
  }
}
