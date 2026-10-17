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

const COLLAPSED_PANEL_WIDTH = 48;
const COLLAPSED_EXPAND_THRESHOLD = 24;
const PANEL_HANDLE_WIDTH = 5;
const PANEL_WIDTH_STEP = 8;
const PANEL_WIDTH_LARGE_STEP = 32;
const LEFT_PANEL_DEFAULT_WIDTH = 336;
const RIGHT_PANEL_DEFAULT_WIDTH = 336;
const LEFT_PANEL_MIN_WIDTH = 200;
const LEFT_PANEL_MAX_WIDTH = 480;
const INSPECTOR_MIN_WIDTH = 288;
const INSPECTOR_MAX_WIDTH = 480;
const INSPECTOR_WIDTH_STORAGE_KEY = 'base-screen.designer.inspector-width';
const LEFT_PANEL_WIDTH_STORAGE_KEY = 'base-screen.designer.left-panel-width';

export class DesignerPanelLayoutController {
  readonly #left: DesignerPanelState = { collapsed: false, width: undefined };
  readonly #right: DesignerPanelState = { collapsed: false, width: undefined };
  #mode: DesignerWorkbenchMode = 'standard';
  #resize: { readonly side: DesignerPanelSide; readonly pointerId: number } | undefined;
  #captureTarget: HTMLElement | undefined;

  constructor(private readonly callbacks: DesignerPanelLayoutCallbacks) {}

  initialize(): void {
    this.restorePanelWidths();
    this.render();
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
    const maximum = side === 'left' ? LEFT_PANEL_MAX_WIDTH : this.maxInspectorWidth(layout);
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
    this.applyPanelWidth(layout, 'left');
    this.applyPanelWidth(layout, 'right');
    this.renderCollapseControls();
    this.renderResizeHandles(layout);
  }

  private layout(): HTMLElement | undefined {
    return this.callbacks.getRoot()?.querySelector<HTMLElement>('.designer') ?? undefined;
  }

  private state(side: DesignerPanelSide): DesignerPanelState {
    return side === 'left' ? this.#left : this.#right;
  }

  private applyPanelWidth(layout: HTMLElement, side: DesignerPanelSide): void {
    const state = this.state(side);
    const property = side === 'left' ? '--left-panel-width' : '--right-panel-width';
    if (state.collapsed) {
      layout.style.setProperty(property, `${COLLAPSED_PANEL_WIDTH}px`);
      return;
    }
    if (state.width === undefined) {
      layout.style.removeProperty(property);
      return;
    }
    const safeWidth =
      side === 'right' ? Math.min(state.width, this.maxInspectorWidth(layout)) : state.width;
    layout.style.setProperty(property, `${safeWidth}px`);
  }

  private currentWidth(layout: HTMLElement, side: DesignerPanelSide): number {
    const state = this.state(side);
    if (state.collapsed) return COLLAPSED_PANEL_WIDTH;
    const maximum = side === 'left' ? LEFT_PANEL_MAX_WIDTH : this.maxInspectorWidth(layout);
    const minimum = side === 'left' ? LEFT_PANEL_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
    if (state.width !== undefined) return clamp(state.width, minimum, maximum);
    const property = side === 'left' ? '--left-panel-width' : '--right-panel-width';
    const rootStyle = layout.ownerDocument.defaultView?.getComputedStyle(layout);
    const computed = Number.parseFloat(rootStyle?.getPropertyValue(property) ?? '');
    const fallback = side === 'left' ? LEFT_PANEL_DEFAULT_WIDTH : RIGHT_PANEL_DEFAULT_WIDTH;
    return clamp(Number.isFinite(computed) ? computed : fallback, minimum, maximum);
  }

  private maxInspectorWidth(layout: HTMLElement): number {
    const layoutWidth = layout.getBoundingClientRect().width;
    if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) return INSPECTOR_MAX_WIDTH;
    const leftWidth = this.#left.collapsed
      ? COLLAPSED_PANEL_WIDTH
      : this.currentLeftWidthForInspector(layout);
    const available = layoutWidth - leftWidth - PANEL_HANDLE_WIDTH * 2 - 360;
    return clamp(available, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH);
  }

  private currentLeftWidthForInspector(layout: HTMLElement): number {
    if (this.#left.width !== undefined) return this.#left.width;
    const rootStyle = layout.ownerDocument.defaultView?.getComputedStyle(layout);
    const computed = Number.parseFloat(rootStyle?.getPropertyValue('--left-panel-width') ?? '');
    return Number.isFinite(computed) ? computed : LEFT_PANEL_DEFAULT_WIDTH;
  }

  private commitWidth(side: DesignerPanelSide, width: number, layout: HTMLElement): void {
    const maximum = side === 'left' ? LEFT_PANEL_MAX_WIDTH : this.maxInspectorWidth(layout);
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
      const maximum = side === 'left' ? LEFT_PANEL_MAX_WIDTH : this.maxInspectorWidth(layout);
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
      const layout = this.layout();
      const maximum =
        side === 'left'
          ? LEFT_PANEL_MAX_WIDTH
          : layout === undefined
            ? INSPECTOR_MAX_WIDTH
            : this.maxInspectorWidth(layout);
      const minimum = side === 'left' ? LEFT_PANEL_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
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
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
