import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export type DesignerPanelSide = 'left' | 'right';
type DesignerWorkbenchMode = 'standard' | 'with-menu' | 'fullscreen';

interface DesignerPanelLayoutCallbacks {
  readonly getRoot: () => ShadowRoot | null;
}

interface DesignerPanelState {
  collapsed: boolean;
  width: number | undefined;
}

interface DesignerPanelCssDefaults {
  readonly key: string;
  readonly left: number;
  readonly right: number;
}

const COLLAPSED_PANEL_WIDTH = 48;
const COLLAPSED_EXPAND_THRESHOLD = 24;
const PANEL_HANDLE_WIDTH = 5;
const PANEL_WIDTH_STEP = 8;
const PANEL_WIDTH_LARGE_STEP = 32;
const LEFT_PANEL_DEFAULT_WIDTH = 336;
const RIGHT_PANEL_DEFAULT_WIDTH = 336;
const LEFT_PANEL_MIN_WIDTH = 200;
const LEFT_PANEL_MAX_WIDTH = 480;
/** 与 CSS `minmax(360px, 1fr)` 的画布下限一致，夹紧时不可压缩。 */
const CANVAS_MIN_WIDTH = 360;
/** 与窄栏档 CSS 默认值一致：容器变窄时右侧先缩到这里。 */
const INSPECTOR_MIN_WIDTH = 276;
const INSPECTOR_MAX_WIDTH = 480;
/** 容器尺寸变化小于该值不重算，避免边界处反复写变量。 */
const LAYOUT_RESIZE_HYSTERESIS = 2;
const INSPECTOR_WIDTH_STORAGE_KEY = 'base-screen.designer.inspector-width';
const LEFT_PANEL_WIDTH_STORAGE_KEY = 'base-screen.designer.left-panel-width';

export class DesignerPanelLayoutController {
  readonly #left: DesignerPanelState = { collapsed: false, width: undefined };
  readonly #right: DesignerPanelState = { collapsed: false, width: undefined };
  #mode: DesignerWorkbenchMode = 'standard';
  #resize: { readonly side: DesignerPanelSide; readonly pointerId: number } | undefined;
  #captureTarget: HTMLElement | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #resizeFrame: number | undefined;
  #observedWidth = -1;
  #cssDefaults: DesignerPanelCssDefaults | undefined;

  constructor(private readonly callbacks: DesignerPanelLayoutCallbacks) {}

  initialize(): void {
    this.restorePanelWidths();
    this.render();
    this.observeLayout();
  }

  /** 元素重新连回文档后恢复观察（断连时观察器已释放）。 */
  reconnect(): void {
    this.disposeLayoutObserver();
    this.#observedWidth = -1;
    this.#cssDefaults = undefined;
    this.render();
    this.observeLayout();
  }

  dispose(): void {
    this.disposeLayoutObserver();
    this.#observedWidth = -1;
    this.#cssDefaults = undefined;
  }

  cycleMode(): void {
    this.#mode =
      this.#mode === 'standard'
        ? 'with-menu'
        : this.#mode === 'with-menu'
          ? 'fullscreen'
          : 'standard';
    this.render();
  }

  toggle(side: DesignerPanelSide): void {
    const state = this.state(side);
    state.collapsed = !state.collapsed;
    this.render();
  }

  expand(side: DesignerPanelSide): boolean {
    const state = this.state(side);
    if (!state.collapsed) return false;
    state.collapsed = false;
    this.render();
    return true;
  }

  onPointerDown(event: PointerEvent, side: DesignerPanelSide): void {
    event.preventDefault();
    const layout = this.layout();
    layout?.setPointerCapture(event.pointerId);
    this.#captureTarget = layout ?? undefined;
    this.#resize = { side, pointerId: event.pointerId };
  }

  onPointerMove(event: PointerEvent): void {
    const resize = this.#resize;
    const root = this.callbacks.getRoot();
    if (resize?.pointerId !== event.pointerId || root === null) return;
    const layout = root.querySelector<HTMLElement>('.designer');
    if (layout === null) return;
    const bounds = layout.getBoundingClientRect();
    const handle = root.querySelector<HTMLElement>(`[data-panel-handle="${resize.side}"]`);
    const handleCenter = (handle?.getBoundingClientRect().width ?? PANEL_HANDLE_WIDTH) / 2;
    const width =
      resize.side === 'left'
        ? event.clientX - bounds.left - layout.clientLeft - handleCenter
        : bounds.right - event.clientX - layout.clientLeft - handleCenter;
    const state = this.state(resize.side);
    if (state.collapsed) {
      if (width <= COLLAPSED_PANEL_WIDTH + COLLAPSED_EXPAND_THRESHOLD) return;
      state.collapsed = false;
    }
    this.commitWidth(resize.side, width, layout);
  }

  onPointerUp(pointerId: number): void {
    this.releaseResize(pointerId);
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target as {
      readonly closest?: (selector: string) => HTMLElement | null;
    } | null;
    const handle = target?.closest?.('[data-panel-handle]');
    const side = handle?.dataset.panelHandle;
    if (side !== 'left' && side !== 'right') return false;
    const layout = this.layout();
    if (layout === undefined) return false;
    const maximum = side === 'left' ? this.maxLeftWidth(layout) : this.maxInspectorWidth(layout);
    const minimum = side === 'left' ? LEFT_PANEL_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
    const state = this.state(side);
    const current = state.collapsed ? minimum : this.currentWidth(layout, side);
    const step = event.shiftKey ? PANEL_WIDTH_LARGE_STEP : PANEL_WIDTH_STEP;
    const direction = side === 'left' ? 1 : -1;
    const next =
      event.key === 'Home'
        ? minimum
        : event.key === 'End'
          ? maximum
          : event.key === 'ArrowLeft'
            ? current - step * direction
            : event.key === 'ArrowRight'
              ? current + step * direction
              : undefined;
    if (next === undefined) return false;
    event.preventDefault();
    state.collapsed = false;
    this.commitWidth(side, next, layout);
    return true;
  }

  isResizingPointer(pointerId: number): boolean {
    return this.#resize?.pointerId === pointerId;
  }

  cancelResize(): void {
    this.releaseResize();
  }

  render(): void {
    const layout = this.layout();
    if (layout === undefined) return;
    layout.dataset.leftCollapsed = String(this.#left.collapsed);
    layout.dataset.rightCollapsed = String(this.#right.collapsed);
    layout.dataset.workbenchMode = this.#mode;
    // 先读当前档位的 CSS 默认值（折叠态要参与键），再写入夹紧后的渲染宽度。
    const defaults = this.cssDefaults(layout);
    const widths = this.resolvedWidths(layout, defaults);
    this.applyPanelWidth(layout, 'left', widths, defaults);
    this.applyPanelWidth(layout, 'right', widths, defaults);
    this.renderCollapseControls();
    this.renderResizeHandles(layout);
  }

  private layout(): HTMLElement | undefined {
    return this.callbacks.getRoot()?.querySelector<HTMLElement>('.designer') ?? undefined;
  }

  private state(side: DesignerPanelSide): DesignerPanelState {
    return side === 'left' ? this.#left : this.#right;
  }

  /**
   * 读取 CSS 分档给出的默认面板宽度。先移除内联变量，否则读到的是上一次渲染写回的值。
   * 按「容器内容宽 + 折叠状态」缓存：拖拽期间容器宽不变，不必每次强制样式重算。
   */
  private cssDefaults(layout: HTMLElement): DesignerPanelCssDefaults {
    const key = `${layout.clientWidth}|${this.#left.collapsed}|${this.#right.collapsed}`;
    if (this.#cssDefaults?.key === key) return this.#cssDefaults;
    layout.style.removeProperty('--left-panel-width');
    layout.style.removeProperty('--right-panel-width');
    const style = layout.ownerDocument?.defaultView?.getComputedStyle(layout);
    const left = Number.parseFloat(style?.getPropertyValue('--left-panel-width') ?? '');
    const right = Number.parseFloat(style?.getPropertyValue('--right-panel-width') ?? '');
    const defaults: DesignerPanelCssDefaults = {
      key,
      left: Number.isFinite(left) && left > 0 ? left : LEFT_PANEL_DEFAULT_WIDTH,
      right: Number.isFinite(right) && right > 0 ? right : RIGHT_PANEL_DEFAULT_WIDTH,
    };
    this.#cssDefaults = defaults;
    return defaults;
  }

  private baseWidth(side: DesignerPanelSide, cssDefault: number): number {
    const minimum = side === 'left' ? LEFT_PANEL_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
    const maximum = side === 'left' ? LEFT_PANEL_MAX_WIDTH : INSPECTOR_MAX_WIDTH;
    return clamp(this.state(side).width ?? cssDefault, minimum, maximum);
  }

  /**
   * 把面板宽度夹进容器的真实预算：容器内容宽 − 两条手柄 − 画布下限。
   * 超预算时先缩右侧到检查器下限，再缩左侧到下限；两者都到下限后不再压缩，
   * 余下差额由栅格 `1fr` 画布承担（档位下限已保证不会为负）。
   * 只影响渲染宽度，持久化的用户宽度保持原值，容器变宽后自动恢复。
   */
  private resolvedWidths(
    layout: HTMLElement,
    defaults: DesignerPanelCssDefaults,
  ): { readonly left: number; readonly right: number } {
    const left = this.#left.collapsed
      ? COLLAPSED_PANEL_WIDTH
      : this.baseWidth('left', defaults.left);
    const right = this.#right.collapsed
      ? COLLAPSED_PANEL_WIDTH
      : this.baseWidth('right', defaults.right);
    const contentWidth = layout.clientWidth;
    if (!Number.isFinite(contentWidth) || contentWidth <= 0) return { left, right };
    const budget = contentWidth - PANEL_HANDLE_WIDTH * 2 - CANVAS_MIN_WIDTH;
    if (left + right <= budget) return { left, right };
    const rightMinimum = this.#right.collapsed ? COLLAPSED_PANEL_WIDTH : INSPECTOR_MIN_WIDTH;
    const leftMinimum = this.#left.collapsed ? COLLAPSED_PANEL_WIDTH : LEFT_PANEL_MIN_WIDTH;
    let overflow = left + right - budget;
    const takeRight = Math.min(overflow, Math.max(0, right - rightMinimum));
    overflow -= takeRight;
    const takeLeft = Math.min(overflow, Math.max(0, left - leftMinimum));
    return { left: left - takeLeft, right: right - takeRight };
  }

  private applyPanelWidth(
    layout: HTMLElement,
    side: DesignerPanelSide,
    widths: { readonly left: number; readonly right: number },
    defaults: DesignerPanelCssDefaults,
  ): void {
    const property = side === 'left' ? '--left-panel-width' : '--right-panel-width';
    if (this.state(side).collapsed) {
      layout.style.setProperty(property, `${COLLAPSED_PANEL_WIDTH}px`);
      return;
    }
    const width = side === 'left' ? widths.left : widths.right;
    // 与 CSS 分档默认值一致时不写内联变量，让容器查询继续拥有该属性。
    if (width === (side === 'left' ? defaults.left : defaults.right)) {
      layout.style.removeProperty(property);
      return;
    }
    layout.style.setProperty(property, `${width}px`);
  }

  private renderedWidth(layout: HTMLElement, side: DesignerPanelSide): number {
    const property = side === 'left' ? '--left-panel-width' : '--right-panel-width';
    const inline = Number.parseFloat(layout.style.getPropertyValue?.(property) ?? '');
    if (Number.isFinite(inline) && inline > 0) return inline;
    const computed = Number.parseFloat(
      layout.ownerDocument?.defaultView?.getComputedStyle(layout).getPropertyValue(property) ?? '',
    );
    const fallback = side === 'left' ? LEFT_PANEL_DEFAULT_WIDTH : RIGHT_PANEL_DEFAULT_WIDTH;
    return Number.isFinite(computed) && computed > 0 ? computed : fallback;
  }

  private currentWidth(layout: HTMLElement, side: DesignerPanelSide): number {
    if (this.state(side).collapsed) return COLLAPSED_PANEL_WIDTH;
    return this.renderedWidth(layout, side);
  }

  private maxInspectorWidth(layout: HTMLElement): number {
    const contentWidth = layout.clientWidth;
    if (!Number.isFinite(contentWidth) || contentWidth <= 0) return INSPECTOR_MAX_WIDTH;
    const leftWidth = this.#left.collapsed
      ? COLLAPSED_PANEL_WIDTH
      : this.renderedWidth(layout, 'left');
    const available = contentWidth - leftWidth - PANEL_HANDLE_WIDTH * 2 - CANVAS_MIN_WIDTH;
    return clamp(available, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH);
  }

  private maxLeftWidth(layout: HTMLElement): number {
    const contentWidth = layout.clientWidth;
    if (!Number.isFinite(contentWidth) || contentWidth <= 0) return LEFT_PANEL_MAX_WIDTH;
    const rightWidth = this.#right.collapsed
      ? COLLAPSED_PANEL_WIDTH
      : this.renderedWidth(layout, 'right');
    const available = contentWidth - rightWidth - PANEL_HANDLE_WIDTH * 2 - CANVAS_MIN_WIDTH;
    return clamp(available, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH);
  }

  private commitWidth(side: DesignerPanelSide, width: number, layout: HTMLElement): void {
    const maximum = side === 'left' ? this.maxLeftWidth(layout) : this.maxInspectorWidth(layout);
    const minimum = side === 'left' ? LEFT_PANEL_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
    const value = clamp(width, minimum, maximum);
    this.state(side).width = value;
    this.persistWidth(side, value);
    this.render();
  }

  private renderCollapseControls(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    // 每个方向可能有多处折叠入口（把手胶囊钮 + 顶栏按钮）：同步全部，避免其一读出过期标签。
    const setControl = (side: DesignerPanelSide, label: string, expanded: boolean) => {
      for (const control of root.querySelectorAll<HTMLElement>(`[data-panel-collapse="${side}"]`)) {
        control.setAttribute('data-tip', label);
        control.setAttribute('aria-label', label);
        control.setAttribute('aria-expanded', String(expanded));
      }
    };
    setControl(
      'left',
      this.#left.collapsed ? DESIGNER_UI_TEXT.expandMaterials : DESIGNER_UI_TEXT.collapseMaterials,
      !this.#left.collapsed,
    );
    setControl(
      'right',
      this.#right.collapsed ? DESIGNER_UI_TEXT.expandInspector : DESIGNER_UI_TEXT.collapseInspector,
      !this.#right.collapsed,
    );
  }

  private renderResizeHandles(layout: HTMLElement): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    for (const side of ['left', 'right'] as const) {
      const handle = root.querySelector<HTMLElement>(`[data-panel-handle="${side}"]`);
      if (handle === null || handle === undefined) continue;
      const state = this.state(side);
      const minimum = state.collapsed
        ? COLLAPSED_PANEL_WIDTH
        : side === 'left'
          ? LEFT_PANEL_MIN_WIDTH
          : INSPECTOR_MIN_WIDTH;
      const maximum = side === 'left' ? this.maxLeftWidth(layout) : this.maxInspectorWidth(layout);
      const label =
        side === 'left'
          ? DESIGNER_UI_TEXT.selection.resizeHandle(DESIGNER_UI_TEXT.leftPanel)
          : DESIGNER_UI_TEXT.selection.resizeHandle(DESIGNER_UI_TEXT.inspector);
      handle.setAttribute('data-tip', label);
      handle.setAttribute('aria-label', label);
      handle.setAttribute('aria-valuemin', String(minimum));
      handle.setAttribute('aria-valuemax', String(maximum));
      handle.setAttribute('aria-valuenow', String(this.currentWidth(layout, side)));
    }
  }

  private restorePanelWidths(): void {
    this.restoreWidth('left');
    this.restoreWidth('right');
  }

  private restoreWidth(side: DesignerPanelSide): void {
    try {
      const root = this.callbacks.getRoot();
      const storage = root?.ownerDocument.defaultView?.localStorage;
      const key = side === 'left' ? LEFT_PANEL_WIDTH_STORAGE_KEY : INSPECTOR_WIDTH_STORAGE_KEY;
      const stored = storage?.getItem(key);
      if (stored === null || stored === undefined || stored === '') return;
      const value = Number(stored);
      if (!Number.isFinite(value)) return;
      // 只按绝对范围净化；容器预算在渲染时夹紧，用户偏好留到容器变宽后恢复。
      const minimum = side === 'left' ? LEFT_PANEL_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
      const maximum = side === 'left' ? LEFT_PANEL_MAX_WIDTH : INSPECTOR_MAX_WIDTH;
      this.state(side).width = clamp(value, minimum, maximum);
    } catch {
      // Storage may be unavailable in sandboxed hosts; the CSS default remains authoritative.
    }
  }

  private persistWidth(side: DesignerPanelSide, width: number): void {
    try {
      const key = side === 'left' ? LEFT_PANEL_WIDTH_STORAGE_KEY : INSPECTOR_WIDTH_STORAGE_KEY;
      this.callbacks.getRoot()?.ownerDocument.defaultView?.localStorage.setItem(key, String(width));
    } catch {
      // Width persistence is an optional authoring preference.
    }
  }

  private releaseResize(pointerId?: number): void {
    const resize = this.#resize;
    if (resize === undefined || (pointerId !== undefined && resize.pointerId !== pointerId)) return;
    const captureTarget = this.#captureTarget;
    this.#resize = undefined;
    this.#captureTarget = undefined;
    if (captureTarget?.hasPointerCapture(resize.pointerId)) {
      captureTarget.releasePointerCapture(resize.pointerId);
    }
  }

  private observeLayout(): void {
    if (this.#resizeObserver !== undefined) return;
    const layout = this.layout();
    if (layout === undefined || typeof ResizeObserver === 'undefined') return;
    this.#observedWidth = layout.clientWidth;
    this.#resizeObserver = new ResizeObserver(this.onLayoutResize);
    this.#resizeObserver.observe(layout);
  }

  private disposeLayoutObserver(): void {
    if (this.#resizeFrame !== undefined) {
      const view = this.callbacks.getRoot()?.ownerDocument?.defaultView;
      view?.cancelAnimationFrame(this.#resizeFrame);
      this.#resizeFrame = undefined;
    }
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
  }

  private readonly onLayoutResize = (): void => {
    if (this.#resizeFrame !== undefined) return;
    const view = this.callbacks.getRoot()?.ownerDocument?.defaultView;
    if (view === null || view === undefined) {
      this.syncLayoutWidth();
      return;
    }
    this.#resizeFrame = view.requestAnimationFrame(() => {
      this.#resizeFrame = undefined;
      this.syncLayoutWidth();
    });
  };

  private syncLayoutWidth(): void {
    const layout = this.layout();
    if (layout === undefined) return;
    const width = layout.clientWidth;
    if (!Number.isFinite(width) || width <= 0) return;
    if (
      this.#observedWidth >= 0 &&
      Math.abs(width - this.#observedWidth) < LAYOUT_RESIZE_HYSTERESIS
    ) {
      return;
    }
    this.#observedWidth = width;
    this.#cssDefaults = undefined;
    this.render();
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
