import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  collectDesignerSnapCandidates,
  DEFAULT_DESIGNER_CANVAS_AIDS,
  type DesignerCanvasAidsState,
  type DesignerCanvasMeasurement,
  type DesignerSnapCandidates,
  type DesignerSnapGuideLine,
  type DesignerSnapPoint,
  type DesignerSnapPreview,
  type DesignerSnapSession,
  type DesignerSnapTranslation,
  getDesignerRulerMarks,
  snapDesignerCanvasPoint,
  snapDesignerSelectionTranslation,
} from '../viewport/designer-canvas-aids.js';
import {
  clientPointToDesignerCanvasPoint,
  type DesignerCanvasBounds,
  getDesignerCanvasBounds,
  getDesignerCanvasClientOrigin,
} from '../viewport/designer-canvas-coordinates.js';
import { collectDesignerCanvasMeasurements } from '../viewport/designer-canvas-measurements.js';

interface DesignerWorkbenchCallbacks {
  readonly getCanvas: () => HTMLDivElement | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog?: () => BaseScreenMaterialCatalog | undefined;
  readonly getRoot: () => ShadowRoot | null;
  readonly getZoom: () => number;
  /** 状态栏「事件」开关切换回调：组合根据此切换渲染器 interactive 状态。 */
  readonly onNativeEventsChange?: (enabled: boolean) => void;
}

type PanelSide = 'left' | 'right';
type GuideAxis = 'x' | 'y';
type LeftTab = 'materials' | 'layers' | 'variables';
type RightTab = 'appearance' | 'data' | 'interaction' | 'events';
type WorkbenchMode = 'standard' | 'with-menu' | 'fullscreen';

// 双击移除参考线的判定窗口：同一参考线（轴 + 索引）的两次 pointerdown 间隔不超过该值。
// 不能在浏览器 dblclick 事件上实现：guide 拖拽在 pointerdown 时 setPointerCapture 接管指针，
// Chromium 此后不再合成 click/dblclick（仅派发 pointerdown/up），dblclick 处理器只作兜底。
const DESIGNER_GUIDE_DOUBLE_CLICK_MS = 500;
const DESIGNER_GUIDE_DRAG_THRESHOLD = 3;

/** 折叠态面板宽度（px），与 designer-base.css 折叠变量保持一致（ADR-0037）。 */
const DESIGNER_COLLAPSED_PANEL_WIDTH = 48;

/** 折叠态拖拽展开阈值（px）：往外拖到超过 48+阈值 的宽度才展开（参考 VSCode），
 *  阈值内保持折叠且不写宽度，避免微小移动误展开。 */
const DESIGNER_COLLAPSED_EXPAND_THRESHOLD = 24;

interface SnapPreviewState {
  readonly x: readonly DesignerSnapGuideLine[] | undefined;
  readonly y: readonly DesignerSnapGuideLine[] | undefined;
  readonly activeX: number | undefined;
  readonly activeY: number | undefined;
  readonly measurements: readonly DesignerCanvasMeasurement[] | undefined;
}

export class DesignerWorkbenchController {
  #leftCollapsed = false;
  #rightCollapsed = false;
  /** 用户拖拽后的面板宽度（undefined = 从未拖拽，使用宿主 CSS 默认）。 */
  #leftPanelWidth: number | undefined;
  #rightPanelWidth: number | undefined;
  #leftTab: LeftTab = 'materials';
  #rightTab: RightTab = 'appearance';
  #mode: WorkbenchMode = 'standard';
  #canvasAids: DesignerCanvasAidsState = DEFAULT_DESIGNER_CANVAS_AIDS;
  #guides: { x: number[]; y: number[] } = { x: [], y: [] };
  #guidesVisible = true;
  #snapEnabled = true;
  #nativeEventsEnabled = false;
  #guideDrag:
    | {
        readonly axis: GuideAxis;
        readonly guideIndex: number | undefined;
        readonly pointerId: number;
        /** 拖拽起始的参考线坐标：指针移动偏离时视为拖拽而非双击点击。 */
        readonly value: number;
      }
    | undefined;
  /** 上一次落在参考线上的 pointerdown（轴 + 索引 + 时间戳），用于双击移除判定。 */
  #lastGuidePointerDown:
    | { readonly axis: GuideAxis; readonly index: number; readonly time: number }
    | undefined;
  #guidePreview: { readonly axis: GuideAxis; readonly value: number } | undefined;
  #snapPreview: SnapPreviewState | undefined;
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
    canvas.addEventListener('lostpointercapture', (event) => this.onPointerCancel(event));
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
  ): DesignerSnapTranslation {
    if (!this.#snapEnabled) return { x: offset.x, y: offset.y };
    const document = this.callbacks.getDocument();
    const candidates =
      document === undefined
        ? this.#guidesCandidates()
        : this.resolveSnapCandidates(document, excludedComponentIds);
    const snapped = snapDesignerSelectionTranslation(
      bounds,
      offset,
      this.#canvasAids,
      candidates,
      this.callbacks.getZoom(),
      this.#snapSessionActive ? this.#snapSession : undefined,
    );
    return {
      ...snapped,
      // 选区路径显式传入空 guides，避免已精确重合（零校正）时被单点/变换路径的回退线误渲染。
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
      const excludedKey = JSON.stringify([...new Set(excludedComponentIds)].sort());
      if (this.#snapCache !== undefined && this.#snapCache.excludedKey === excludedKey) {
        return this.#snapCache.candidates;
      }
      // 候选集合变化时旧吸附目标失效，重置滞后状态。
      this.#snapSession = {};
      const candidates = collectDesignerSnapCandidates(
        document,
        this.#guides,
        excludedComponentIds,
      );
      this.#snapCache = { candidates, excludedKey };
      return candidates;
    }
    return collectDesignerSnapCandidates(document, this.#guides, excludedComponentIds);
  }

  // 吸附预览：选区平移始终传入 guides（可能为空），单点/变换路径无 guides 时才回退到
  // snappedX/snappedY 单线，避免已重合的选区边界被回退路径画成贯穿画布的辅助线。
  renderSnapPreview(point: DesignerSnapPreview | undefined): void {
    if (!this.#snapEnabled) {
      if (this.#snapPreview === undefined) return;
      this.#snapPreview = undefined;
      this.renderGuides();
      return;
    }
    const nextPreview = toSnapPreviewState(point);
    if (snapPreviewRenderKey(this.#snapPreview) === snapPreviewRenderKey(nextPreview)) {
      this.#snapPreview = nextPreview;
      return;
    }
    this.#snapPreview = nextPreview;
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

  /** 画布辅助开关当前值：菜单勾选状态与状态栏开关共用同一状态源。 */
  isCanvasAidEnabled(aid: 'gridEnabled'): boolean {
    return this.#canvasAids[aid];
  }

  /** 用户参考线显示开关（视图 > 画布辅助 > 参考线，与状态栏 Guide 开关共用）。 */
  get guidesVisible(): boolean {
    return this.#guidesVisible;
  }

  /** 边框参考线（智能吸附参考线/测量标注）开关当前值。 */
  get borderGuidesEnabled(): boolean {
    return this.#canvasAids.smartGuidesEnabled;
  }

  toggleSnap(): void {
    this.#snapEnabled = !this.#snapEnabled;
    this.#snapCache = undefined;
    this.#snapSession = {};
    this.#snapPreview = undefined;
    this.renderGuides();
    this.renderStatusToggles();
  }

  toggleGuides(): void {
    this.#guidesVisible = !this.#guidesVisible;
    this.renderGuides();
    this.renderStatusToggles();
  }

  /** 状态栏「事件」开关当前值（设计态画布 interactive 状态的唯一来源）。 */
  get nativeEventsEnabled(): boolean {
    return this.#nativeEventsEnabled;
  }

  /** 切换设计态画布原生事件（interactive）开关，并通知组合根应用新状态。 */
  toggleNativeEvents(): void {
    this.#nativeEventsEnabled = !this.#nativeEventsEnabled;
    this.callbacks.onNativeEventsChange?.(this.#nativeEventsEnabled);
    this.renderStatusToggles();
  }

  toggleBorderGuides(): void {
    this.#canvasAids = {
      ...this.#canvasAids,
      smartGuidesEnabled: !this.#canvasAids.smartGuidesEnabled,
    };
    this.#snapCache = undefined;
    this.#snapSession = {};
    this.#snapPreview = undefined;
    this.renderCanvasAids();
    this.renderGuides();
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
    if (leftTab === 'materials' || leftTab === 'layers' || leftTab === 'variables') {
      // 折叠图标轨：点击图标 Tab 先展开面板再切换，保证折叠态也能完成导航。
      if (this.#leftCollapsed) {
        this.#leftCollapsed = false;
        this.renderLayout();
      }
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
      if (!this.rightTabAvailable(rightTab)) return true;
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
    if (statusToggle === 'native-events') {
      this.toggleNativeEvents();
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
    const controls = Array.from(tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const current = controls.findIndex((tab) => tab === target);
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
    if (!isPrimaryPointer(event)) return;
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

  onPointerCancel(event: PointerEvent): void {
    if (
      event.type === 'lostpointercapture' &&
      this.#panelResize?.pointerId !== event.pointerId &&
      this.#guideDrag?.pointerId !== event.pointerId
    ) {
      return;
    }
    this.cancelTransientState();
  }

  onDoubleClick(event: MouseEvent): void {
    this.onCanvasDoubleClick(event);
  }

  cancelTransientState(): void {
    this.releaseGuideDrag();
    this.releasePanelResize();
    this.#lastGuidePointerDown = undefined;
    this.#guidePreview = undefined;
    this.#snapPreview = undefined;
    this.renderGuides();
  }

  // 选中变化时刷新右侧检查器：只有单选显示"外观/数据/交互/事件"tab 栏。
  // 画布和多选只保留外观 pane，避免暴露单组件才有意义的检查器页签。
  renderInspectorTabs(): void {
    this.renderTabs();
  }

  clearGuides(): void {
    this.cancelTransientState();
    this.#guides = { x: [], y: [] };
    // 参考线集合整体替换后，旧的轴+索引命中可能落到新参考线上：清除双击判定状态。
    this.#lastGuidePointerDown = undefined;
    this.#snapCache = undefined;
    this.#snapSession = {};
    this.renderGuides();
  }

  private renderLayout(): void {
    const layout = this.callbacks.getRoot()?.querySelector<HTMLElement>('.designer');
    if (layout === null || layout === undefined) return;
    layout.dataset.leftCollapsed = String(this.#leftCollapsed);
    layout.dataset.rightCollapsed = String(this.#rightCollapsed);
    layout.dataset.workbenchMode = this.#mode;
    this.applyPanelWidth(layout, 'left', this.#leftCollapsed, this.#leftPanelWidth);
    this.applyPanelWidth(layout, 'right', this.#rightCollapsed, this.#rightPanelWidth);
    this.renderCollapseControls();
  }

  /**
   * 面板宽度唯一写回点（ADR-0037）：折叠写 48px（覆盖任何拖拽宽度）、展开恢复拖拽宽度、
   * 从未拖拽时移除内联变量以保留宿主 CSS 默认。内联变量是折叠收敛的唯一权威来源，
   * 否则拖拽后的内联宽度会压过 CSS 折叠规则导致折叠失效。
   */
  private applyPanelWidth(
    layout: HTMLElement,
    side: PanelSide,
    collapsed: boolean,
    width: number | undefined,
  ): void {
    const property = side === 'left' ? '--left-panel-width' : '--right-panel-width';
    if (collapsed) {
      layout.style.setProperty(property, `${DESIGNER_COLLAPSED_PANEL_WIDTH}px`);
      return;
    }
    if (width === undefined) {
      layout.style.removeProperty(property);
      return;
    }
    layout.style.setProperty(property, `${width}px`);
  }

  /** 折叠按钮语义随状态切换：收起↔展开（title/aria-label，文案入 designer-ui-text）。 */
  private renderCollapseControls(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const setControl = (side: PanelSide, label: string) => {
      const control = root.querySelector<HTMLElement>(`[data-panel-collapse="${side}"]`);
      if (control === null || control === undefined) return;
      control.title = label;
      control.setAttribute('aria-label', label);
    };
    setControl(
      'left',
      this.#leftCollapsed ? DESIGNER_UI_TEXT.expandMaterials : DESIGNER_UI_TEXT.collapseMaterials,
    );
    setControl(
      'right',
      this.#rightCollapsed ? DESIGNER_UI_TEXT.expandInspector : DESIGNER_UI_TEXT.collapseInspector,
    );
  }

  private renderTabs(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const selection = this.callbacks.getInteraction();
    const singleComponentSelected =
      selection.focusedComponentId !== null && selection.selectedComponentIds.length === 1;
    const dataTabAvailable = singleComponentSelected && this.rightTabAvailable('data');
    if (!singleComponentSelected || (this.#rightTab === 'data' && !dataTabAvailable)) {
      this.#rightTab = 'appearance';
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-panel-tab]')) {
      control.ariaSelected = String(control.dataset.panelTab === this.#leftTab);
    }
    const materials = root.querySelector<HTMLElement>('[data-materials]');
    const layers = root.querySelector<HTMLElement>('[data-layers]');
    const variables = root.querySelector<HTMLElement>('[data-variables]');
    if (materials !== null) materials.hidden = this.#leftTab !== 'materials';
    if (layers !== null) layers.hidden = this.#leftTab !== 'layers';
    if (variables !== null) variables.hidden = this.#leftTab !== 'variables';
    const inspectorTabs = root.querySelector<HTMLElement>('.inspector-tabs');
    if (inspectorTabs !== null) inspectorTabs.hidden = !singleComponentSelected;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) {
      control.hidden = control.dataset.inspectorTab === 'data' && !dataTabAvailable;
      control.ariaSelected = String(control.dataset.inspectorTab === this.#rightTab);
    }
    for (const pane of root.querySelectorAll<HTMLElement>('[data-inspector-pane]')) {
      const active = pane.dataset.inspectorPane === this.#rightTab;
      pane.hidden = !active;
      if (singleComponentSelected) {
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', `designer-${pane.dataset.inspectorPane}-tab`);
        pane.removeAttribute('aria-label');
      } else if (active) {
        pane.setAttribute('role', 'region');
        pane.removeAttribute('aria-labelledby');
        pane.setAttribute('aria-label', nonTabbedInspectorLabel(selection.selectedComponentIds));
      } else {
        pane.removeAttribute('role');
        pane.removeAttribute('aria-labelledby');
        pane.removeAttribute('aria-label');
      }
    }
  }

  private rightTabAvailable(tab: RightTab): boolean {
    if (tab !== 'data' || this.callbacks.getCatalog === undefined) return true;
    const catalog = this.callbacks.getCatalog();
    const focusedId = this.callbacks.getInteraction().focusedComponentId;
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === focusedId);
    if (catalog === undefined || component === undefined) return false;
    return (catalog.get(component.type)?.manifest.dataCapabilities.length ?? 0) > 0;
  }

  private resizePanel(event: PointerEvent): void {
    const resize = this.#panelResize;
    const root = this.callbacks.getRoot();
    if (resize?.pointerId !== event.pointerId || root === null) return;
    const layout = root.querySelector<HTMLElement>('.designer');
    if (layout === null) return;
    const bounds = layout.getBoundingClientRect();
    // 高亮线是分隔列内居中的 1px 竖线（.panel-handle::before）：以分隔列中线为基准
    // 计算面板宽度，让拖拽全程高亮线与指针精确重合（扣除 .designer 边框）。
    // 历史实现硬编码 -48 偏移：早期布局在面板左侧有 56px 图标轨，布局重构后该常量
    // 未同步更新，导致高亮线始终滞后指针约 45px。
    const handle = root.querySelector<HTMLElement>(`[data-panel-handle="${resize.side}"]`);
    const handleCenter = (handle?.getBoundingClientRect().width ?? 0) / 2;
    const width =
      resize.side === 'left'
        ? event.clientX - bounds.left - layout.clientLeft - handleCenter
        : bounds.right - event.clientX - layout.clientLeft - handleCenter;
    const clamped = Math.max(
      resize.side === 'left' ? 200 : 220,
      Math.min(resize.side === 'left' ? 480 : 520, width),
    );
    if (resize.side === 'left') {
      // 折叠态拖拽展开阈值（ADR-0037，参考 VSCode）：以未钳制的目标宽度判定，
      // 往外拖出超过 48+阈值 才展开并应用宽度；阈值内保持折叠（不写宽度）。
      if (this.#leftCollapsed) {
        if (width <= DESIGNER_COLLAPSED_PANEL_WIDTH + DESIGNER_COLLAPSED_EXPAND_THRESHOLD) return;
        this.#leftCollapsed = false;
      }
      this.#leftPanelWidth = clamped;
    } else {
      if (this.#rightCollapsed) {
        if (width <= DESIGNER_COLLAPSED_PANEL_WIDTH + DESIGNER_COLLAPSED_EXPAND_THRESHOLD) return;
        this.#rightCollapsed = false;
      }
      this.#rightPanelWidth = clamped;
    }
    // 折叠态拖拽分隔条视为先展开再调整宽度（ADR-0037）：renderLayout 统一写回
    // 折叠 48px / 展开拖拽宽度的内联变量。
    this.renderLayout();
  }

  private moveGuide(event: PointerEvent): void {
    const drag = this.#guideDrag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const point = clientPointToDesignerCanvasPoint(
      event,
      getDesignerCanvasBounds(canvas),
      this.callbacks.getZoom(),
    );
    const value = drag.axis === 'x' ? point.x : point.y;
    // 拖拽实际发生位移时，本次 pointerdown 不算双击点击：清除双击判定状态。
    if (
      this.#lastGuidePointerDown !== undefined &&
      this.#lastGuidePointerDown.axis === drag.axis &&
      this.#lastGuidePointerDown.index === drag.guideIndex &&
      Math.abs(value - drag.value) * Math.max(this.callbacks.getZoom(), Number.EPSILON) >=
        DESIGNER_GUIDE_DRAG_THRESHOLD
    ) {
      this.#lastGuidePointerDown = undefined;
    }
    this.#guidePreview = { axis: drag.axis, value };
    this.renderGuides();
  }

  private commitGuide(event: PointerEvent): void {
    const drag = this.#guideDrag;
    const canvas = this.callbacks.getCanvas();
    if (drag?.pointerId !== event.pointerId || canvas === undefined) return;
    const point = clientPointToDesignerCanvasPoint(
      event,
      getDesignerCanvasBounds(canvas),
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
    this.#snapCache = undefined;
    this.#snapSession = {};
    this.releaseGuideDrag();
    this.#guidePreview = undefined;
    this.renderGuides();
  }

  private releasePanelResize(pointerId?: number): void {
    const resize = this.#panelResize;
    if (resize === undefined || (pointerId !== undefined && resize.pointerId !== pointerId)) return;
    const captureTarget = this.#panelResizeCaptureTarget;
    this.#panelResize = undefined;
    this.#panelResizeCaptureTarget = undefined;
    if (captureTarget?.hasPointerCapture(resize.pointerId)) {
      captureTarget.releasePointerCapture(resize.pointerId);
    }
  }

  private releaseGuideDrag(pointerId?: number): void {
    const drag = this.#guideDrag;
    if (drag === undefined || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    const captureTarget = this.#guideCaptureTarget;
    this.#guideDrag = undefined;
    this.#guideCaptureTarget = undefined;
    if (captureTarget?.hasPointerCapture(drag.pointerId)) {
      captureTarget.releasePointerCapture(drag.pointerId);
    }
  }

  private startGuideDrag(
    axis: GuideAxis,
    guideIndex: number | undefined,
    event: PointerEvent,
    canvas: HTMLDivElement,
  ): void {
    canvas.setPointerCapture(event.pointerId);
    this.#guideCaptureTarget = canvas;
    const value = this.guideDragValue(event, axis, canvas);
    this.#guideDrag = {
      axis,
      guideIndex,
      pointerId: event.pointerId,
      value,
    };
    this.#guidePreview = { axis, value };
    this.renderGuides();
  }

  private guideDragValue(event: PointerEvent, axis: GuideAxis, canvas: HTMLDivElement): number {
    const point = clientPointToDesignerCanvasPoint(
      event,
      getDesignerCanvasBounds(canvas),
      this.callbacks.getZoom(),
    );
    return axis === 'x' ? point.x : point.y;
  }

  private onCanvasPointerDown(event: PointerEvent): void {
    if (!isPrimaryPointer(event)) return;
    const target = event.target as HTMLElement | null;
    const guide = target?.closest<HTMLElement>('[data-canvas-guide]');
    const axis = guide?.dataset.axis;
    const index = Number(guide?.dataset.guideIndex);
    const canvas = this.callbacks.getCanvas();
    if ((axis !== 'x' && axis !== 'y') || !Number.isInteger(index) || canvas === undefined) return;
    // 保持键盘焦点停留在 viewport；否则首次点击参考线会触发 blur 并清空双击状态。
    event.preventDefault();
    event.stopImmediatePropagation();
    const previous = this.#lastGuidePointerDown;
    this.#lastGuidePointerDown = { axis, index, time: event.timeStamp };
    if (
      previous !== undefined &&
      previous.axis === axis &&
      previous.index === index &&
      event.timeStamp - previous.time <= DESIGNER_GUIDE_DOUBLE_CLICK_MS
    ) {
      // 同一参考线上 500ms 内的第二次 pointerdown = 双击：移除参考线（不再进入拖拽）。
      this.#lastGuidePointerDown = undefined;
      this.#guides[axis].splice(index, 1);
      this.renderGuides();
      return;
    }
    this.startGuideDrag(axis, index, event, canvas);
  }

  // 双击移除参考线。注意不能用 dblclick 的 event target 定位：guide 拖拽通过
  // setPointerCapture 接管指针，pointerdown/up 被重定向到画布，浏览器合成的 click/dblclick
  // 会派发到捕获元素（画布）而非参考线。因此按 clientX/Y 做位置命中（elementsFromPoint），
  // 按绘制顺序取第一个落在参考线上的元素；无命中时回退 composed path target（合成事件/边界）。
  private onCanvasDoubleClick(event: MouseEvent): void {
    const root = this.callbacks.getRoot();
    const target = event.composedPath?.()[0] ?? event.target;
    const candidates: readonly (Element | EventTarget)[] =
      root !== null && typeof root.elementsFromPoint === 'function'
        ? root.elementsFromPoint(event.clientX, event.clientY)
        : [];
    for (const hit of [...candidates, target]) {
      const element = hit as { closest?: (selector: string) => HTMLElement | null } | null;
      const guide = element?.closest?.('[data-canvas-guide]');
      const axis = guide?.dataset.axis;
      const index = Number(guide?.dataset.guideIndex);
      if ((axis !== 'x' && axis !== 'y') || !Number.isInteger(index)) continue;
      this.#guides[axis].splice(index, 1);
      event.stopImmediatePropagation();
      this.renderGuides();
      return;
    }
  }

  private isGuideWithinCanvas(axis: GuideAxis, value: number): boolean {
    const document = this.callbacks.getDocument();
    const limit = axis === 'x' ? document?.canvas.width : document?.canvas.height;
    return limit !== undefined && Number.isFinite(value) && value >= 0 && value <= limit;
  }

  private renderGuides(): void {
    const container = this.callbacks.getRoot()?.querySelector<HTMLElement>('[data-canvas-guides]');
    if (container === null || container === undefined) return;
    setCanvasOverlayScale(container, this.callbacks.getZoom());
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
    if (this.#snapEnabled && this.#canvasAids.smartGuidesEnabled) {
      const measurements = this.#snapPreview?.measurements ?? [];
      for (const measurement of measurements) {
        container.appendChild(this.createMeasurement(measurement));
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
    // 画布/guide（全画布尺寸）与单点回退线保持 CSS 全画布默认（size 0 或未定义）。
    if (line.start !== undefined && line.size !== undefined && line.size > 0) {
      guide.style[axis === 'x' ? 'top' : 'left'] = `${line.start}px`;
      guide.style[axis === 'x' ? 'height' : 'width'] = `${line.size}px`;
    }
    if (active) guide.classList.add('canvas-guide-snap-active');
    return guide;
  }

  private createMeasurement(measurement: DesignerCanvasMeasurement): HTMLElement {
    const marker = this.callbacks.getCanvas()!.ownerDocument.createElement('div');
    marker.className = 'canvas-measurement';
    marker.dataset.axis = measurement.axis;
    if (measurement.axis === 'x') {
      marker.style.left = `${measurement.from}px`;
      marker.style.top = `${measurement.position}px`;
      marker.style.width = `${measurement.to - measurement.from}px`;
    } else {
      marker.style.left = `${measurement.position}px`;
      marker.style.top = `${measurement.from}px`;
      marker.style.height = `${measurement.to - measurement.from}px`;
    }
    const label = marker.ownerDocument.createElement('span');
    label.className = 'canvas-measurement-label';
    label.textContent = formatMeasurement(measurement.distance);
    marker.appendChild(label);
    return marker;
  }

  private renderRulers(): void {
    const root = this.callbacks.getRoot();
    const canvas = this.callbacks.getCanvas();
    if (root === null || canvas === undefined) return;
    const canvasBounds = getDesignerCanvasBounds(canvas);
    this.renderRuler(root.querySelector<HTMLElement>('.ruler-horizontal'), 'x', canvasBounds);
    this.renderRuler(root.querySelector<HTMLElement>('.ruler-vertical'), 'y', canvasBounds);
  }

  private renderRuler(
    ruler: HTMLElement | null,
    axis: GuideAxis,
    canvasBounds: DesignerCanvasBounds,
  ): void {
    if (ruler === null) return;
    const canvas = ruler.querySelector<HTMLCanvasElement>('canvas[data-ruler-canvas]');
    if (canvas === null) return;
    // 容器带 1px 边框（border-box），canvas 的 100% 实际内容区比容器小 1px；
    // 必须以 canvas 自身的显示尺寸为绘制坐标系，否则刻度/文字会被裁掉 1px。
    const canvasRect = canvas.getBoundingClientRect();
    const length = axis === 'x' ? canvasRect.width : canvasRect.height;
    if (length <= 0) return;
    const canvasOrigin = getDesignerCanvasClientOrigin(canvasBounds, this.callbacks.getZoom());
    const origin =
      axis === 'x' ? canvasOrigin.left - canvasRect.left : canvasOrigin.top - canvasRect.top;
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

  // 状态栏 Snap/Guide/Native Events 开关的开合态与 aria-checked 同步（开关与菜单/快捷键共用同一状态源）。
  private renderStatusToggles(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const setToggle = (name: 'snap' | 'guides' | 'native-events', active: boolean) => {
      root
        .querySelector<HTMLButtonElement>(`[data-status-toggle="${name}"]`)
        ?.setAttribute('aria-checked', String(active));
    };
    setToggle('snap', this.#snapEnabled);
    setToggle('guides', this.#guidesVisible);
    setToggle('native-events', this.#nativeEventsEnabled);
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

function toSnapPreviewState(point: DesignerSnapPreview | undefined): SnapPreviewState | undefined {
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

function snapPreviewRenderKey(preview: SnapPreviewState | undefined): string {
  if (preview === undefined) return '';
  return JSON.stringify({
    x: preview.x,
    y: preview.y,
    activeX: preview.activeX,
    activeY: preview.activeY,
    measurements: preview.measurements,
  });
}

function translateSelectionBounds(
  bounds: {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  },
  translation: { readonly x: number; readonly y: number },
): {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
} {
  return {
    bottom: bounds.bottom + translation.y,
    left: bounds.left + translation.x,
    right: bounds.right + translation.x,
    top: bounds.top + translation.y,
  };
}

function formatMeasurement(distance: number): string {
  // Match Moveable's default `snapDigit: 0`: visual measurements are whole, unitless pixels.
  return String(Math.round(distance));
}

function setCanvasOverlayScale(container: HTMLElement, zoom: number): void {
  const unit = 1 / Math.max(zoom, Number.EPSILON);
  const sizes = {
    '--designer-overlay-active': 2,
    '--designer-overlay-cap-offset': 4,
    '--designer-overlay-cap-size': 7,
    '--designer-overlay-font-size': 10,
    '--designer-overlay-glow-large': 6,
    '--designer-overlay-glow-small': 2,
    '--designer-overlay-hit-size': 9,
    '--designer-overlay-label-offset': 5,
    '--designer-overlay-line-height': 14,
    '--designer-overlay-pixel': 1,
  } as const;
  for (const [property, multiplier] of Object.entries(sizes)) {
    container.style.setProperty(property, `${unit * multiplier}px`);
  }
}

function tabDirection(key: string): -1 | 1 | 'first' | 'last' | undefined {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return undefined;
}

function nonTabbedInspectorLabel(selectedComponentIds: readonly string[]): string {
  return selectedComponentIds.length > 1
    ? DESIGNER_UI_TEXT.propertiesPanel.selectionSummary
    : DESIGNER_UI_TEXT.propertiesPanel.canvas;
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}
