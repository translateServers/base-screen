import {
  DEFAULT_DESIGNER_CANVAS_AIDS,
  type DesignerCanvasAidsState,
  snapDesignerCanvasPoint,
} from './designer-canvas-aids.js';

interface DesignerWorkbenchCallbacks {
  readonly getCanvas: () => HTMLDivElement | undefined;
  readonly getRoot: () => ShadowRoot | null;
  readonly getZoom: () => number;
}

type PanelSide = 'left' | 'right';
type GuideAxis = 'x' | 'y';
type LeftTab = 'materials' | 'layers';
type RightTab = 'appearance' | 'data' | 'interaction' | 'events';

export class DesignerWorkbenchController {
  #leftCollapsed = false;
  #rightCollapsed = false;
  #leftTab: LeftTab = 'materials';
  #rightTab: RightTab = 'appearance';
  #canvasAids: DesignerCanvasAidsState = DEFAULT_DESIGNER_CANVAS_AIDS;
  #guides: { x: number[]; y: number[] } = { x: [], y: [] };
  #guideDrag: { readonly axis: GuideAxis; readonly pointerId: number } | undefined;
  #panelResize: { readonly side: PanelSide; readonly pointerId: number } | undefined;
  #panelResizeCaptureTarget: HTMLElement | undefined;
  #guideCaptureTarget: HTMLDivElement | undefined;

  constructor(private readonly callbacks: DesignerWorkbenchCallbacks) {}

  initialize(): void {
    this.renderLayout();
    this.renderTabs();
    this.renderCanvasAids();
    this.renderGuides(this.#guides);
  }

  snapPoint(point: { readonly x: number; readonly y: number }): {
    readonly x: number;
    readonly y: number;
  } {
    return snapDesignerCanvasPoint(point, this.#canvasAids, this.#guides);
  }

  toggleCanvasAid(aid: 'gridEnabled' | 'gridSnapEnabled'): void {
    this.#canvasAids = { ...this.#canvasAids, [aid]: !this.#canvasAids[aid] };
    this.renderCanvasAids();
  }

  onClick(target: HTMLElement): boolean {
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
    canvas.setPointerCapture(event.pointerId);
    this.#guideCaptureTarget = canvas;
    this.#guideDrag = { axis, pointerId: event.pointerId };
    this.moveGuide(event);
  }

  onPointerMove(event: PointerEvent): void {
    this.resizePanel(event);
    this.moveGuide(event);
  }

  onPointerUp(event: PointerEvent): void {
    this.releasePanelResize(event.pointerId);
    this.commitGuide(event);
  }

  cancelTransientState(): void {
    this.releaseGuideDrag();
    this.releasePanelResize();
  }

  private renderLayout(): void {
    const layout = this.callbacks.getRoot()?.querySelector<HTMLElement>('.designer');
    if (layout === null || layout === undefined) return;
    layout.dataset.leftCollapsed = String(this.#leftCollapsed);
    layout.dataset.rightCollapsed = String(this.#rightCollapsed);
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
      resize.side === 'left' ? event.clientX - bounds.left - 56 : bounds.right - event.clientX;
    layout.style.setProperty(
      resize.side === 'left' ? '--left-panel-width' : '--right-panel-width',
      `${Math.max(resize.side === 'left' ? 200 : 240, Math.min(resize.side === 'left' ? 400 : 480, width))}px`,
    );
  }

  private moveGuide(event: PointerEvent): void {
    const drag = this.#guideDrag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const bounds = canvas.getBoundingClientRect();
    const value =
      (drag.axis === 'x' ? event.clientX - bounds.left : event.clientY - bounds.top) /
      this.callbacks.getZoom();
    this.renderGuides({ ...this.#guides, [drag.axis]: [value] });
  }

  private commitGuide(event: PointerEvent): void {
    const drag = this.#guideDrag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const bounds = canvas.getBoundingClientRect();
    const value =
      (drag.axis === 'x' ? event.clientX - bounds.left : event.clientY - bounds.top) /
      this.callbacks.getZoom();
    this.#guides[drag.axis].push(value);
    this.releaseGuideDrag();
    this.renderGuides(this.#guides);
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

  private renderGuides(guides: {
    readonly x: readonly number[];
    readonly y: readonly number[];
  }): void {
    const container = this.callbacks.getRoot()?.querySelector<HTMLElement>('[data-canvas-guides]');
    if (container === null || container === undefined) return;
    container.replaceChildren();
    for (const x of guides.x) container.appendChild(this.createGuide('x', x));
    for (const y of guides.y) container.appendChild(this.createGuide('y', y));
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

  private createGuide(axis: GuideAxis, value: number): HTMLElement {
    const guide = this.callbacks.getCanvas()!.ownerDocument.createElement('div');
    guide.className = 'canvas-guide';
    guide.dataset.axis = axis;
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
