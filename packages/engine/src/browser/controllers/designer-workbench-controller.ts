import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import {
  collectDesignerSnapCandidates,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  DESIGNER_GRID_SIZE,
  type DesignerCanvasAidsState,
  type DesignerSnapCandidate,
  type DesignerSnapCandidates,
  type DesignerSnapGuideLine,
  type DesignerSnapGuides,
  type DesignerSnapPoint,
  type DesignerSnapSession,
  type DesignerSnapTranslation,
  getDesignerRulerMarks,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../viewport/designer-canvas-aids.js';
import { clientPointToDesignerCanvasPoint } from '../viewport/designer-canvas-coordinates.js';

interface DesignerWorkbenchCallbacks {
  readonly getCanvas: () => HTMLDivElement | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
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
  #snapEnabled = true;
  #guideDrag:
    | {
        readonly axis: GuideAxis;
        readonly guideIndex: number | undefined;
        readonly pointerId: number;
      }
    | undefined;
  #guidePreview: { readonly axis: GuideAxis; readonly value: number } | undefined;
  #snapPreview:
    | {
        readonly x: readonly DesignerSnapGuideLine[] | undefined;
        readonly y: readonly DesignerSnapGuideLine[] | undefined;
        readonly activeX: number | undefined;
        readonly activeY: number | undefined;
      }
    | undefined;
  #panelResize: { readonly side: PanelSide; readonly pointerId: number } | undefined;
  #panelResizeCaptureTarget: HTMLElement | undefined;
  #guideCaptureTarget: HTMLDivElement | undefined;
  #connectedCanvas: HTMLDivElement | undefined;
  #snapSession: DesignerSnapSession = {};
  #snapCache:
    | {
        readonly candidates: DesignerSnapCandidates;
        readonly excludedKey: string;
      }
    | undefined;
  #snapSessionActive = false;
  #resizeObserver: ResizeObserver | undefined;

  constructor(private readonly callbacks: DesignerWorkbenchCallbacks) {}

  initialize(): void {
    this.connect(this.callbacks.getCanvas());
    this.renderLayout();
    this.renderTabs();
    this.renderCanvasAids();
    this.renderStatusToggles();
    this.renderGuides();
    this.renderRulers();
    this.observeRulerResize();
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
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#connectedCanvas = undefined;
  }

  // 视窗尺寸变化（窗口 resize、面板折叠等）会改变标尺容器尺寸：
  // ResizeObserver 观察标尺容器，尺寸变化即重绘（渲染时机本身由缩放/平移驱动）。
  private observeRulerResize(): void {
    if (this.#resizeObserver !== undefined || globalThis.ResizeObserver === undefined) return;
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const observer = new ResizeObserver(() => this.renderRulers());
    for (const ruler of root.querySelectorAll<HTMLElement>('.ruler-horizontal, .ruler-vertical')) {
      observer.observe(ruler);
    }
    this.#resizeObserver = observer;
  }

  // 吸附会话生命周期：手势开始时启用（候选缓存 + 滞后状态），手势结束时清空。
  // 会话内文档与参考线不会变化，候选集合只需计算一次；滞后状态按轴独立，避免手势间残留。
  setSnapSessionActive(active: boolean): void {
    this.#snapSessionActive = active;
    this.#snapCache = undefined;
    if (!active) this.#snapSession = {};
  }

  snapPoint(
    point: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapPoint {
    if (!this.#snapEnabled) return { x: point.x, y: point.y };
    const document = this.callbacks.getDocument();
    const candidates =
      document === undefined
        ? this.#guidesCandidates()
        : this.resolveSnapCandidates(document, excludedComponentIds);
    return snapDesignerCanvasPoint(
      point,
      this.#canvasAids,
      candidates,
      this.callbacks.getZoom(),
      this.#snapSessionActive ? this.#snapSession : undefined,
    );
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
    options: { readonly gridSnapEnabled?: boolean } = {},
  ): DesignerSnapTranslation {
    if (!this.#snapEnabled) return { x: offset.x, y: offset.y };
    const document = this.callbacks.getDocument();
    const candidates =
      document === undefined
        ? this.#guidesCandidates()
        : this.resolveSnapCandidates(document, excludedComponentIds);
    const state =
      options.gridSnapEnabled === undefined
        ? this.#canvasAids
        : { ...this.#canvasAids, gridSnapEnabled: options.gridSnapEnabled };
    return snapDesignerSelectionTranslation(
      bounds,
      offset,
      state,
      candidates,
      this.callbacks.getZoom(),
      this.#snapSessionActive ? this.#snapSession : undefined,
    );
  }

  // 无文档时（罕见）仅用户参考线作为候选；size 0 表示渲染层按全画布线处理。
  #guidesCandidates(): DesignerSnapCandidates {
    return {
      x: this.#guides.x.map((value) => ({ value, start: 0, size: 0 })),
      y: this.#guides.y.map((value) => ({ value, start: 0, size: 0 })),
    };
  }

  private resolveSnapCandidates(
    document: ScreenDocument,
    excludedComponentIds: readonly string[],
  ): DesignerSnapCandidates {
    if (this.#snapSessionActive) {
      // 手势会话内文档与参考线不变（预览只写 CSS translate），候选集合只需收集一次；
      // 排除集合变化（候选语义变化）或会话结束时失效。
      const excludedKey = excludedComponentIds.join('\u0000');
      if (this.#snapCache !== undefined && this.#snapCache.excludedKey === excludedKey) {
        return this.#snapCache.candidates;
      }
      // 候选集合变化时旧吸附目标失效，重置滞后状态。
      this.#snapSession = {};
      const candidates = withGridLines(
        collectDesignerSnapCandidates(document, this.#guides, excludedComponentIds),
        this.#canvasAids,
        document,
      );
      this.#snapCache = { candidates, excludedKey };
      return candidates;
    }
    return withGridLines(
      collectDesignerSnapCandidates(document, this.#guides, excludedComponentIds),
      this.#canvasAids,
      document,
    );
  }

  // 吸附预览：选区平移传入 guides（显示阈值内的全部智能对齐线）与吸附目标值，
  // 单点/变换路径无 guides 时回退到 snappedX/snappedY 单线（既有行为）。
  renderSnapPreview(
    point: (DesignerSnapPoint & { readonly guides?: DesignerSnapGuides | undefined }) | undefined,
  ): void {
    if (point === undefined) {
      this.#snapPreview = undefined;
    } else if (point.guides !== undefined) {
      this.#snapPreview = {
        x: point.guides.x,
        y: point.guides.y,
        activeX: point.snappedX,
        activeY: point.snappedY,
      };
    } else {
      const activeLine = (value: number | undefined) =>
        value === undefined ? undefined : [{ value, distance: 0 }];
      this.#snapPreview = {
        x: activeLine(point.snappedX),
        y: activeLine(point.snappedY),
        activeX: point.snappedX,
        activeY: point.snappedY,
      };
    }
    this.renderGuides();
  }

  renderCanvasPrecision(): void {
    this.renderGuides();
    this.renderRulers();
  }

  toggleCanvasAid(aid: 'gridEnabled'): void {
    this.#canvasAids = { ...this.#canvasAids, [aid]: !this.#canvasAids[aid] };
    this.renderCanvasAids();
  }

  /** 吸附总开关（状态栏 Snap 开关）：关闭时 snapPoint/snapSelectionOffset 原样返回。 */
  get snapEnabled(): boolean {
    return this.#snapEnabled;
  }

  toggleSnap(): void {
    this.#snapEnabled = !this.#snapEnabled;
    this.renderStatusToggles();
  }

  toggleGuides(): void {
    this.#guidesVisible = !this.#guidesVisible;
    this.renderGuides();
    this.renderStatusToggles();
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
    // 状态栏 Snap/Guide 开关（Nebula 语义：VSCode 风格开关，状态栏开关与菜单/快捷键共享状态）。
    const statusToggle =
      target.closest<HTMLButtonElement>('[data-status-toggle]')?.dataset.statusToggle;
    if (statusToggle === 'snap') {
      this.toggleSnap();
      return true;
    }
    if (statusToggle === 'guides') {
      this.toggleGuides();
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
      // 阻止 pointerdown 默认聚焦行为把焦点从 viewport 移走，避免 blur 取消本次手势。
      event.preventDefault();
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
    // 阻止 pointerdown 默认聚焦行为把焦点从 viewport 移走，避免 blur 取消参考线拖拽。
    event.preventDefault();
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

  // 选中变化时刷新右侧检查器：无焦点组件时隐藏"外观/数据/交互/事件"tab 栏，只保留画布属性。
  renderInspectorTabs(): void {
    this.renderTabs();
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
    const focused = this.callbacks.getInteraction().focusedComponentId !== null;
    if (!focused) this.#rightTab = 'appearance';
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-panel-tab]')) {
      control.ariaSelected = String(control.dataset.panelTab === this.#leftTab);
    }
    const materials = root.querySelector<HTMLElement>('[data-materials]');
    const layers = root.querySelector<HTMLElement>('[data-layers]');
    if (materials !== null) materials.hidden = this.#leftTab !== 'materials';
    if (layers !== null) layers.hidden = this.#leftTab !== 'layers';
    const inspectorTabs = root.querySelector<HTMLElement>('.inspector-tabs');
    if (inspectorTabs !== null) inspectorTabs.hidden = !focused;
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
      const snapLines = this.#snapPreview?.[axis];
      if (snapLines !== undefined) {
        const activeValue = this.#snapPreview?.[axis === 'x' ? 'activeX' : 'activeY'];
        for (const line of snapLines) {
          container.appendChild(this.createSnapGuide(axis, line, line.value === activeValue));
        }
      }
    }
  }

  private createSnapGuide(
    axis: GuideAxis,
    line: DesignerSnapGuideLine,
    active: boolean,
  ): HTMLElement {
    const guide = this.createGuide(axis, line.value, 'snap');
    // 组件参考线只覆盖参考组件的正交范围（局部线，参考 Moveable element guidelines）；
    // 画布/guide/网格线（全画布尺寸）与单点回退线保持 CSS 全画布默认（size 0 或未定义）。
    if (line.start !== undefined && line.size !== undefined && line.size > 0) {
      guide.style[axis === 'x' ? 'top' : 'left'] = `${line.start}px`;
      guide.style[axis === 'x' ? 'height' : 'width'] = `${line.size}px`;
    }
    if (active) guide.classList.add('canvas-guide-snap-active');
    if (line.distance > 0) {
      const label = guide.ownerDocument.createElement('span');
      label.className = 'canvas-guide-snap-label';
      label.textContent = `${Math.round(line.distance * 10) / 10}px`;
      guide.appendChild(label);
    }
    return guide;
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
    const canvas = ruler.querySelector<HTMLCanvasElement>('canvas[data-ruler-canvas]');
    if (canvas === null) return;
    // 容器带 1px 边框（border-box），canvas 的 100% 实际内容区比容器小 1px；
    // 必须以 canvas 自身的显示尺寸为绘制坐标系，否则刻度/文字会被裁掉 1px。
    const canvasRect = canvas.getBoundingClientRect();
    const length = axis === 'x' ? canvasRect.width : canvasRect.height;
    if (length <= 0) return;
    const origin =
      axis === 'x' ? canvasBounds.left - canvasRect.left : canvasBounds.top - canvasRect.top;
    const devicePixelRatio = Math.max(1, globalThis.devicePixelRatio || 1);
    const widthPixels = Math.round(canvasRect.width * devicePixelRatio);
    const heightPixels = Math.round(canvasRect.height * devicePixelRatio);
    if (canvas.width !== widthPixels) canvas.width = widthPixels;
    if (canvas.height !== heightPixels) canvas.height = heightPixels;
    const zoom = this.callbacks.getZoom();
    // 对齐 Nebula（@scena/react-ruler 的 unit 语义）：主刻度间距为 50 画布单位
    // 除以缩放后向下取整（最小 1），次刻度（segment=2）在主刻度正中。
    const unit = Math.max(1, Math.floor(50 / zoom));
    const marks = getDesignerRulerMarks({
      devicePixelRatio,
      length,
      origin,
      zoom,
      increment: unit,
    });
    // 每次重绘递增版本号，供外部（浏览器 harness）验证 ruler 确实随缩放/平移更新。
    canvas.dataset.rulerVersion = String((Number(canvas.dataset.rulerVersion) || 0) + 1);
    const context = canvas.getContext('2d');
    if (context === null) return;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, canvasRect.width, canvasRect.height);
    const style = canvas.ownerDocument.defaultView?.getComputedStyle(ruler) ?? null;
    const line = style?.getPropertyValue('--designer-border-default').trim() || '#e4e4e7';
    const text = style?.getPropertyValue('--designer-text-muted').trim() || '#71717a';
    const barSize = axis === 'x' ? canvasRect.height : canvasRect.width;
    // 刻度：主刻度贯穿整条标尺，次刻度（unit/2）为贴端 7px 短刻度（segment=2）。
    context.strokeStyle = line;
    context.lineWidth = 1;
    context.beginPath();
    for (const mark of marks) {
      const mid = mark.position + (unit * zoom) / 2;
      if (axis === 'x') {
        context.moveTo(mark.position + 0.5, 0);
        context.lineTo(mark.position + 0.5, barSize);
        context.moveTo(mid + 0.5, barSize - 7);
        context.lineTo(mid + 0.5, barSize);
      } else {
        context.moveTo(0, mark.position + 0.5);
        context.lineTo(barSize, mark.position + 0.5);
        context.moveTo(barSize - 7, mid + 0.5);
        context.lineTo(barSize, mid + 0.5);
      }
    }
    context.stroke();
    // 数字：10px sans-serif、贴端对齐（direction=end → 底部基准线在 barSize - 17），
    // 水平数字在顶部左偏移 3px；垂直数字 rotate(-90°)（顶部朝左），与 scena 一致。
    context.fillStyle = text;
    context.font = '10px sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'bottom';
    for (const mark of marks) {
      if (axis === 'x') {
        context.fillText(mark.label, mark.position - 3, barSize - 7);
      } else {
        context.save();
        context.translate(barSize - 7, mark.position - 3);
        context.rotate(-Math.PI / 2);
        context.fillText(mark.label, 0, 0);
        context.restore();
      }
    }
  }

  private renderCanvasAids(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const viewport = root.querySelector<HTMLElement>('[data-viewport]');
    if (viewport !== null) viewport.dataset.grid = String(this.#canvasAids.gridEnabled);
    root
      .querySelector<HTMLButtonElement>('[data-action="toggle-grid"]')
      ?.setAttribute('aria-pressed', String(this.#canvasAids.gridEnabled));
  }

  // 状态栏 Snap/Guide 开关的开合态与 aria-checked 同步（开关与菜单/快捷键共用同一状态源）。
  private renderStatusToggles(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const setToggle = (name: 'snap' | 'guides', active: boolean) => {
      root
        .querySelector<HTMLButtonElement>(`[data-status-toggle="${name}"]`)
        ?.setAttribute('aria-checked', String(active));
    };
    setToggle('snap', this.#snapEnabled);
    setToggle('guides', this.#guidesVisible);
  }

  // 参考线以对齐坐标定位，由 CSS translate(-50%) 使任意线宽的中心与坐标精确重合，
  // 与选中框轮廓（outline 以边缘为中线）保持一致（参考 Moveable/Nebula 的居中语义）。
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

// 网格开启时把 24px 网格线并入智能候选（5px 阈值内吸附，参考 Moveable 的网格线 guidelines 语义）。
// 网格线为全画布参考（start 0，长度 = 画布正交尺寸）；选区平移关闭无阈值取整，
// 网格线作为普通候选与组件/画布/参考线统一按距离竞争。
function withGridLines(
  candidates: DesignerSnapCandidates,
  state: DesignerCanvasAidsState,
  document: ScreenDocument,
): DesignerSnapCandidates {
  if (!state.gridSnapEnabled) return candidates;
  const axis = (limit: number, orthogonalSize: number) => {
    const lines: DesignerSnapCandidate[] = [];
    for (let value = DESIGNER_GRID_SIZE; value < limit; value += DESIGNER_GRID_SIZE) {
      lines.push({ value, start: 0, size: orthogonalSize });
    }
    return lines;
  };
  return {
    x: sortedUniqueCandidates([
      ...candidates.x,
      ...axis(document.canvas.width, document.canvas.height),
    ]),
    y: sortedUniqueCandidates([
      ...candidates.y,
      ...axis(document.canvas.height, document.canvas.width),
    ]),
  };
}

// 同值候选合并（长度取更长者，全画布尺寸 > 组件局部尺寸），按 value 升序。
function sortedUniqueCandidates(
  candidates: readonly DesignerSnapCandidate[],
): readonly DesignerSnapCandidate[] {
  const byValue = new Map<number, DesignerSnapCandidate>();
  for (const candidate of candidates) {
    const existing = byValue.get(candidate.value);
    if (existing === undefined || candidate.size > existing.size) {
      byValue.set(candidate.value, candidate);
    }
  }
  return [...byValue.values()].sort((left, right) => left.value - right.value);
}

function tabDirection(key: string): -1 | 1 | 'first' | 'last' | undefined {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return undefined;
}
