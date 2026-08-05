import type { ScreenDocument } from '@base-screen/contracts';
import {
  collectDesignerSnapCandidates,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  type DesignerCanvasAidsState,
  type DesignerSnapPoint,
  type DesignerSnapTranslation,
  getDesignerRulerMarks,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../viewport/designer-canvas-aids.js';
import { clientPointToDesignerCanvasPoint } from '../viewport/designer-canvas-coordinates.js';

interface DesignerWorkbenchCallbacks {
  readonly getCanvas: () => HTMLDivElement | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getRoot: () => ShadowRoot | null;
  readonly getZoom: () => number;
}

type PanelSide = 'left' | 'right';
type GuideAxis = 'x' | 'y';
type LeftTab = 'materials' | 'layers';
type RightTab = 'appearance' | 'data' | 'interaction' | 'events';
type WorkbenchMode = 'standard' | 'with-menu' | 'fullscreen';

export class DesignerWorkbenchController {
  #leftCollapsed = false;
  #rightCollapsed = false;
  #leftTab: LeftTab = 'materials';
  #rightTab: RightTab = 'appearance';
  #mode: WorkbenchMode = 'standard';
  #canvasAids: DesignerCanvasAidsState = DEFAULT_DESIGNER_CANVAS_AIDS;
  #guides: { x: number[]; y: number[] } = { x: [], y: [] };
  #guidesVisible = true;
  #guideDrag:
    | {
        readonly axis: GuideAxis;
        readonly guideIndex: number | undefined;
        readonly pointerId: number;
      }
    | undefined;
  #guidePreview: { readonly axis: GuideAxis; readonly value: number } | undefined;
  #snapPreview: { readonly x: number | undefined; readonly y: number | undefined } | undefined;
  #panelResize: { readonly side: PanelSide; readonly pointerId: number } | undefined;
  #panelResizeCaptureTarget: HTMLElement | undefined;
  #guideCaptureTarget: HTMLDivElement | undefined;
  #connectedCanvas: HTMLDivElement | undefined;

  constructor(private readonly callbacks: DesignerWorkbenchCallbacks) {}

  initialize(): void {
    this.connect(this.callbacks.getCanvas());
    this.renderLayout();
    this.renderTabs();
    this.renderCanvasAids();
    this.renderGuides();
    this.renderRulers();
  }

  connect(canvas: HTMLDivElement | undefined): void {
    if (canvas === undefined || this.#connectedCanvas === canvas) return;
    this.disconnect();
    this.#connectedCanvas = canvas;
    canvas.addEventListener('pointerdown', (event) => this.onCanvasPointerDown(event));
    canvas.addEventListener('dblclick', (event) => this.onDoubleClick(event));
    canvas.addEventListener('lostpointercapture', () => this.cancelTransientState());
  }

  disconnect(): void {
    this.cancelTransientState();
    this.#connectedCanvas = undefined;
  }

  snapPoint(
    point: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapPoint {
    const document = this.callbacks.getDocument();
    const candidates =
      document === undefined
        ? this.#guides
        : collectDesignerSnapCandidates(document, this.#guides, excludedComponentIds);
    return snapDesignerCanvasPoint(point, this.#canvasAids, candidates, this.callbacks.getZoom());
  }

  snapSelectionOffset(
    bounds: {
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
      readonly top: number;
    },
    offset: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapTranslation {
    const document = this.callbacks.getDocument();
    const candidates =
      document === undefined
        ? this.#guides
        : collectDesignerSnapCandidates(document, this.#guides, excludedComponentIds);
    return snapDesignerSelectionTranslation(
      bounds,
      offset,
      this.#canvasAids,
      candidates,
      this.callbacks.getZoom(),
    );
  }

  renderSnapPreview(point: DesignerSnapPoint | undefined): void {
    this.#snapPreview = point === undefined ? undefined : { x: point.snappedX, y: point.snappedY };
    this.renderGuides();
  }

  renderCanvasPrecision(): void {
    this.renderGuides();
    this.renderRulers();
  }

  toggleCanvasAid(aid: 'gridEnabled' | 'gridSnapEnabled'): void {
    this.#canvasAids = { ...this.#canvasAids, [aid]: !this.#canvasAids[aid] };
    this.renderCanvasAids();
  }

  toggleGuides(): void {
    this.#guidesVisible = !this.#guidesVisible;
    this.renderGuides();
  }

  toggleBorderGuides(): void {
    this.#canvasAids = {
      ...this.#canvasAids,
      smartGuidesEnabled: !this.#canvasAids.smartGuidesEnabled,
    };
    this.renderCanvasAids();
  }

  cycleMode(): void {
    this.#mode =
      this.#mode === 'standard'
        ? 'with-menu'
        : this.#mode === 'with-menu'
          ? 'fullscreen'
          : 'standard';
    this.renderLayout();
  }

  onClick(target: Element): boolean {
    const collapse =
      target.closest<HTMLButtonElement>('[data-panel-collapse]')?.dataset.panelCollapse;
    if (collapse === 'left' || collapse === 'right') {
      if (collapse === 'left') this.#leftCollapsed = !this.#leftCollapsed;
      else this.#rightCollapsed = !this.#rightCollapsed;
      this.renderLayout();
      return true;
    }
    const leftTab = target.closest<HTMLButtonElement>('[data-panel-tab]')?.dataset.panelTab;
    if (leftTab === 'materials' || leftTab === 'layers') {
      this.#leftTab = leftTab;
      this.renderTabs();
      return true;
    }
    const rightTab =
      target.closest<HTMLButtonElement>('[data-inspector-tab]')?.dataset.inspectorTab;
    if (
      rightTab === 'appearance' ||
      rightTab === 'data' ||
      rightTab === 'interaction' ||
      rightTab === 'events'
    ) {
      this.#rightTab = rightTab;
      this.renderTabs();
      return true;
    }
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.getAttribute('role') !== 'tab')
      return false;
    const direction = tabDirection(event.key);
    if (direction === undefined) return false;
    const tabList = target.closest<HTMLElement>('[role="tablist"]');
    if (tabList === null) return false;
    const controls = [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const current = controls.indexOf(target);
    const next =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? controls.length - 1
          : (current + direction + controls.length) % controls.length;
    const control = controls[next];
    if (control === undefined) return false;
    control.focus();
    event.preventDefault();
    return this.onClick(control);
  }

  onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    const side = target?.closest<HTMLElement>('[data-panel-handle]')?.dataset.panelHandle;
    if (side === 'left' || side === 'right') {
      const layout = this.callbacks.getRoot()?.querySelector<HTMLElement>('.designer');
      layout?.setPointerCapture(event.pointerId);
      this.#panelResizeCaptureTarget = layout ?? undefined;
      this.#panelResize = { side, pointerId: event.pointerId };
      return;
    }
    const ruler = target?.closest<HTMLElement>('.ruler');
    const axis = ruler?.classList.contains('ruler-horizontal')
      ? 'y'
      : ruler?.classList.contains('ruler-vertical')
        ? 'x'
        : undefined;
    const canvas = this.callbacks.getCanvas();
    if (axis === undefined || canvas === undefined) return;
    this.startGuideDrag(axis, undefined, event, canvas);
  }

  onPointerMove(event: PointerEvent): void {
    this.resizePanel(event);
    this.moveGuide(event);
  }

  onPointerUp(event: PointerEvent): void {
    this.releasePanelResize(event.pointerId);
    this.commitGuide(event);
  }

  onDoubleClick(event: MouseEvent): void {
    const target = event.composedPath?.()[0] ?? event.target;
    this.onCanvasDoubleClick(target, event);
  }

  cancelTransientState(): void {
    this.releaseGuideDrag();
    this.releasePanelResize();
    this.#guidePreview = undefined;
    this.#snapPreview = undefined;
    this.renderGuides();
  }

  clearGuides(): void {
    this.cancelTransientState();
    this.#guides = { x: [], y: [] };
    this.renderGuides();
  }

  private renderLayout(): void {
    const layout = this.callbacks.getRoot()?.querySelector<HTMLElement>('.designer');
    if (layout === null || layout === undefined) return;
    layout.dataset.leftCollapsed = String(this.#leftCollapsed);
    layout.dataset.rightCollapsed = String(this.#rightCollapsed);
    layout.dataset.workbenchMode = this.#mode;
  }

  private renderTabs(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-panel-tab]')) {
      control.ariaSelected = String(control.dataset.panelTab === this.#leftTab);
    }
    const materials = root.querySelector<HTMLElement>('[data-materials]');
    const layers = root.querySelector<HTMLElement>('[data-layers]');
    if (materials !== null) materials.hidden = this.#leftTab !== 'materials';
    if (layers !== null) layers.hidden = this.#leftTab !== 'layers';
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) {
      control.ariaSelected = String(control.dataset.inspectorTab === this.#rightTab);
    }
    for (const pane of root.querySelectorAll<HTMLElement>('[data-inspector-pane]')) {
      pane.hidden = pane.dataset.inspectorPane !== this.#rightTab;
    }
  }

  private resizePanel(event: PointerEvent): void {
    const resize = this.#panelResize;
    const root = this.callbacks.getRoot();
    if (resize?.pointerId !== event.pointerId || root === null) return;
    const layout = root.querySelector<HTMLElement>('.designer');
    if (layout === null) return;
    const bounds = layout.getBoundingClientRect();
    const width =
      resize.side === 'left' ? event.clientX - bounds.left - 48 : bounds.right - event.clientX;
    layout.style.setProperty(
      resize.side === 'left' ? '--left-panel-width' : '--right-panel-width',
      `${Math.max(resize.side === 'left' ? 160 : 200, Math.min(resize.side === 'left' ? 400 : 480, width))}px`,
    );
  }

  private moveGuide(event: PointerEvent): void {
    const drag = this.#guideDrag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const point = clientPointToDesignerCanvasPoint(
      event,
      canvas.getBoundingClientRect(),
      this.callbacks.getZoom(),
    );
    const value = drag.axis === 'x' ? point.x : point.y;
    this.#guidePreview = { axis: drag.axis, value };
    this.renderGuides();
  }

  private commitGuide(event: PointerEvent): void {
    const drag = this.#guideDrag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const point = clientPointToDesignerCanvasPoint(
      event,
      canvas.getBoundingClientRect(),
      this.callbacks.getZoom(),
    );
    const value = drag.axis === 'x' ? point.x : point.y;
    if (drag.guideIndex !== undefined) {
      if (this.isGuideWithinCanvas(drag.axis, value))
        this.#guides[drag.axis][drag.guideIndex] = value;
      else this.#guides[drag.axis].splice(drag.guideIndex, 1);
    } else if (this.isGuideWithinCanvas(drag.axis, value)) {
      this.#guides[drag.axis].push(value);
    }
    this.releaseGuideDrag();
    this.#guidePreview = undefined;
    this.renderGuides();
  }

  private releasePanelResize(pointerId?: number): void {
    const resize = this.#panelResize;
    if (resize === undefined || (pointerId !== undefined && resize.pointerId !== pointerId)) return;
    if (this.#panelResizeCaptureTarget?.hasPointerCapture(resize.pointerId)) {
      this.#panelResizeCaptureTarget.releasePointerCapture(resize.pointerId);
    }
    this.#panelResize = undefined;
    this.#panelResizeCaptureTarget = undefined;
  }

  private releaseGuideDrag(pointerId?: number): void {
    const drag = this.#guideDrag;
    if (drag === undefined || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    if (this.#guideCaptureTarget?.hasPointerCapture(drag.pointerId)) {
      this.#guideCaptureTarget.releasePointerCapture(drag.pointerId);
    }
    this.#guideDrag = undefined;
    this.#guideCaptureTarget = undefined;
  }

  private startGuideDrag(
    axis: GuideAxis,
    guideIndex: number | undefined,
    event: PointerEvent,
    canvas: HTMLDivElement,
  ): void {
    canvas.setPointerCapture(event.pointerId);
    this.#guideCaptureTarget = canvas;
    this.#guideDrag = { axis, guideIndex, pointerId: event.pointerId };
    this.moveGuide(event);
  }

  private onCanvasPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    const guide = target?.closest<HTMLElement>('[data-canvas-guide]');
    const axis = guide?.dataset.axis;
    const index = Number(guide?.dataset.guideIndex);
    const canvas = this.callbacks.getCanvas();
    if ((axis !== 'x' && axis !== 'y') || !Number.isInteger(index) || canvas === undefined) return;
    event.stopImmediatePropagation();
    this.startGuideDrag(axis, index, event, canvas);
  }

  private onCanvasDoubleClick(target: EventTarget | null, event: MouseEvent): void {
    const element = target as { closest?: (selector: string) => HTMLElement | null } | null;
    const guide = element?.closest?.('[data-canvas-guide]');
    const axis = guide?.dataset.axis;
    const index = Number(guide?.dataset.guideIndex);
    if ((axis !== 'x' && axis !== 'y') || !Number.isInteger(index)) return;
    this.#guides[axis].splice(index, 1);
    event.stopImmediatePropagation();
    this.renderGuides();
  }

  private isGuideWithinCanvas(axis: GuideAxis, value: number): boolean {
    const document = this.callbacks.getDocument();
    const limit = axis === 'x' ? document?.canvas.width : document?.canvas.height;
    return limit !== undefined && Number.isFinite(value) && value >= 0 && value <= limit;
  }

  private renderGuides(): void {
    const container = this.callbacks.getRoot()?.querySelector<HTMLElement>('[data-canvas-guides]');
    if (container === null || container === undefined) return;
    container.replaceChildren();
    for (const axis of ['x', 'y'] as const) {
      for (const [index, value] of this.#guides[axis].entries()) {
        const preview = this.#guidePreview;
        if (preview?.axis === axis && this.#guideDrag?.guideIndex === index) {
          if (this.isGuideWithinCanvas(axis, preview.value)) {
            container.appendChild(this.createGuide(axis, preview.value, 'preview'));
          }
          continue;
        }
        if (this.#guidesVisible) {
          container.appendChild(this.createGuide(axis, value, 'persistent', index));
        }
      }
      if (
        this.#guidePreview?.axis === axis &&
        this.#guideDrag?.guideIndex === undefined &&
        this.isGuideWithinCanvas(axis, this.#guidePreview.value)
      ) {
        container.appendChild(this.createGuide(axis, this.#guidePreview.value, 'preview'));
      }
      const snapValue = this.#snapPreview?.[axis];
      if (snapValue !== undefined) container.appendChild(this.createGuide(axis, snapValue, 'snap'));
    }
  }

  private renderRulers(): void {
    const root = this.callbacks.getRoot();
    const canvas = this.callbacks.getCanvas();
    if (root === null || canvas === undefined) return;
    const canvasBounds = canvas.getBoundingClientRect();
    this.renderRuler(root.querySelector<HTMLElement>('.ruler-horizontal'), 'x', canvasBounds);
    this.renderRuler(root.querySelector<HTMLElement>('.ruler-vertical'), 'y', canvasBounds);
  }

  private renderRuler(ruler: HTMLElement | null, axis: GuideAxis, canvasBounds: DOMRect): void {
    if (ruler === null) return;
    const bounds = ruler.getBoundingClientRect();
    const length = axis === 'x' ? bounds.width : bounds.height;
    const origin = axis === 'x' ? canvasBounds.left - bounds.left : canvasBounds.top - bounds.top;
    const marks = getDesignerRulerMarks({
      devicePixelRatio: globalThis.devicePixelRatio,
      length,
      origin,
      zoom: this.callbacks.getZoom(),
    });
    ruler.replaceChildren(
      ...marks.map((mark) => {
        const tick = ruler.ownerDocument.createElement('span');
        tick.className = 'ruler-mark';
        tick.dataset.rulerMark = String(mark.value);
        tick.style[axis === 'x' ? 'left' : 'top'] = `${mark.position}px`;
        tick.textContent = mark.label;
        return tick;
      }),
    );
  }

  private renderCanvasAids(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const viewport = root.querySelector<HTMLElement>('[data-viewport]');
    if (viewport !== null) viewport.dataset.grid = String(this.#canvasAids.gridEnabled);
    root
      .querySelector<HTMLButtonElement>('[data-action="toggle-grid"]')
      ?.setAttribute('aria-pressed', String(this.#canvasAids.gridEnabled));
    root
      .querySelector<HTMLButtonElement>('[data-action="toggle-snap"]')
      ?.setAttribute('aria-pressed', String(this.#canvasAids.gridSnapEnabled));
  }

  private createGuide(
    axis: GuideAxis,
    value: number,
    kind: 'persistent' | 'preview' | 'snap',
    index?: number,
  ): HTMLElement {
    const guide = this.callbacks.getCanvas()!.ownerDocument.createElement('div');
    guide.className = `canvas-guide canvas-guide-${kind}`;
    guide.dataset.axis = axis;
    if (kind === 'persistent' && index !== undefined) {
      guide.dataset.canvasGuide = 'true';
      guide.dataset.guideIndex = String(index);
    }
    guide.style[axis === 'x' ? 'left' : 'top'] = `${value}px`;
    return guide;
  }
}

function tabDirection(key: string): -1 | 1 | 'first' | 'last' | undefined {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return undefined;
}
