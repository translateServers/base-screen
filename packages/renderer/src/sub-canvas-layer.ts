import {
  resolveScreenPopupPosition,
  resolveScreenStartPageId,
  type ScreenCanvas,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenPopupCanvas,
  type ScreenSubCanvas,
  type ScreenSubCanvasDisplay,
} from '@base-screen/contracts';
import type { ScreenBlueprintCanvasEffect } from '@base-screen/core';
import { applyCanvasBackground } from './canvas-background.js';

/** 从画布开合的原因（ADR-0109 §2.3）。 */
export type BaseScreenCanvasChangeReason = 'blueprint' | 'host' | 'mask' | 'escape' | 'start';

/**
 * 从画布变化通知，按发生顺序：切页时依次是「各弹框关闭 → 旧页离开 → 新页进入 → 页面已切换」。
 * `payload` 是打开参数（只在 `open: true` 时出现）。
 */
export type BaseScreenCanvasChange =
  | {
      readonly type: 'canvas';
      readonly canvasId: string;
      readonly display: ScreenSubCanvasDisplay;
      readonly open: boolean;
      readonly reason: BaseScreenCanvasChangeReason;
      readonly payload?: ScreenJsonValue;
    }
  | {
      readonly type: 'page-changed';
      readonly from: string | null;
      readonly to: string | null;
      readonly reason: BaseScreenCanvasChangeReason;
    };

interface PopupLayer {
  readonly layer: HTMLElement;
  readonly panel: HTMLElement;
  readonly onMaskClick: (event: Event) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

/** 页面模式下画布根上的四个固定层（从下到上）。 */
interface PageLayers {
  readonly background: HTMLElement;
  readonly below: HTMLElement;
  readonly page: HTMLElement;
  readonly main: HTMLElement;
}

/** 弹框浮层叠在全部组件之上；多个弹框按打开顺序递增。 */
const POPUP_LAYER_Z_INDEX = 1_000_000;
const POPUP_TRANSITION_MS = 160;
const POPUP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
/** 弹框内可经 Tab 到达的元素（只看面板的 light DOM；物料自己的 shadow 内部由物料负责）。 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export interface SubCanvasControllerOptions {
  readonly root: HTMLElement;
  /** 设计态为 false：不建页面层与弹框浮层，设计器按画板视图自己编辑。 */
  readonly enabled: boolean;
  readonly onChange: ((change: BaseScreenCanvasChange) => void) | undefined;
  /** 当前页变化后需要按同一文档重新渲染（挂载新页组件、卸载旧页组件）。 */
  readonly requestRender: () => void;
  /** 宿主指定的起始页；不存在或不是页面时回落到文档的起始页。 */
  readonly initialPageId?: string;
}

/**
 * 从画布运行时（ADR-0109 §2.3，弹框部分沿用 ADR-0108 §2.3–§2.6）。
 *
 * 文档有页面时，画布根上铺四层（0×0 定位容器，不拦截指针）：页面背景 → 主画布「从画布下方」组件 →
 * 当前页组件 → 主画布其余组件；弹框各占一层浮层叠在最上。只挂载当前页的组件（`visibleDocument`），
 * 切页时由渲染器按同一文档重新渲染。文档没有页面时主画布组件仍直接挂在画布根上，与单页文档完全一致。
 */
export class SubCanvasController {
  readonly #layers = new Map<string, PopupLayer>();
  #pageLayers: PageLayers | undefined;
  #subCanvases = new Map<string, ScreenSubCanvas>();
  #componentCanvas = new Map<string, string>();
  #belowMain = new Set<string>();
  #pages: string[] = [];
  #canvas: { readonly width: number; readonly height: number } = { width: 0, height: 0 };
  #page: string | null = null;
  #pageStarted = false;
  #history: string[] = [];
  #open: string[] = [];
  /** 每个已打开弹框打开前的焦点，关闭时归还。 */
  readonly #returnFocus = new Map<string, Element>();
  readonly #animations = new Map<string, Animation>();
  #inertApplied = false;
  #visible:
    | {
        readonly source: ScreenDocument;
        readonly page: string | null;
        readonly value: ScreenDocument;
      }
    | undefined;

  constructor(private readonly options: SubCanvasControllerOptions) {}

  get currentPage(): string | null {
    return this.#page;
  }

  /** 按文档同步从画布表、组件归属与 DOM；当前页被删除 / 改为弹框时回落到起始页（不发事件）。 */
  prepare(document: ScreenDocument): void {
    this.#subCanvases = new Map((document.subCanvases ?? []).map((canvas) => [canvas.id, canvas]));
    const ownership = componentCanvasIndex(document);
    this.#componentCanvas = ownership.canvas;
    this.#belowMain = ownership.belowMain;
    this.#pages = (document.subCanvases ?? [])
      .filter((canvas) => canvas.display === 'page')
      .map((canvas) => canvas.id);
    this.#canvas = { width: document.canvas.width, height: document.canvas.height };
    if (this.#page !== null && !this.#pages.includes(this.#page)) {
      this.#page = null;
      this.#pageStarted = false;
    }
    if (this.#page === null && this.#pages.length > 0) {
      const initial = this.options.initialPageId;
      this.#page =
        initial !== undefined && this.#pages.includes(initial)
          ? initial
          : resolveScreenStartPageId(document);
    }
    this.#history = this.#history.filter((id) => this.#pages.includes(id));
    if (!this.options.enabled) return;
    for (const [canvasId, layer] of this.#layers) {
      if (this.#subCanvases.get(canvasId)?.display === 'popup') continue;
      this.#animations.get(canvasId)?.cancel();
      this.#animations.delete(canvasId);
      this.#returnFocus.delete(canvasId);
      detachLayer(layer);
      this.#layers.delete(canvasId);
    }
    this.#open = this.#open.filter((id) => this.#subCanvases.get(id)?.display === 'popup');
    this.#syncPageLayers();
    for (const canvas of this.#subCanvases.values()) {
      if (canvas.display === 'popup') this.#syncLayer(canvas);
    }
    this.#restack();
  }

  /**
   * 本次渲染要挂载的组件：主画布 + 当前页 + 全部弹框（弹框未打开时整层隐藏）。别的页不渲染、不取数。
   * 设计态与没有页面的文档原样返回。
   */
  visibleDocument(document: ScreenDocument): ScreenDocument {
    if (!this.options.enabled || this.#pages.length === 0) return document;
    const cached = this.#visible;
    if (cached !== undefined && cached.source === document && cached.page === this.#page) {
      return cached.value;
    }
    const components = document.components.filter((component) => {
      const canvasId = this.#componentCanvas.get(component.id);
      if (canvasId === undefined) return true;
      const canvas = this.#subCanvases.get(canvasId);
      return canvas?.display === 'popup' || canvasId === this.#page;
    });
    const value =
      components.length === document.components.length ? document : { ...document, components };
    this.#visible = { source: document, page: this.#page, value };
    return value;
  }

  /** 组件应挂载的容器；`undefined` = 直接挂在画布根上。 */
  containerFor(componentId: string): HTMLElement | undefined {
    if (!this.options.enabled) return undefined;
    const canvasId = this.#componentCanvas.get(componentId);
    if (canvasId !== undefined) {
      const canvas = this.#subCanvases.get(canvasId);
      if (canvas?.display === 'popup') return this.#layers.get(canvasId)?.panel;
      return this.#pageLayers?.page;
    }
    const layers = this.#pageLayers;
    if (layers === undefined) return undefined;
    return this.#belowMain.has(componentId) ? layers.below : layers.main;
  }

  isOpen(canvasId: string): boolean {
    return canvasId === this.#page || this.#open.includes(canvasId);
  }

  /**
   * 启动后发一次起始页的「已打开」与「页面已切换」（宿主在「实例就绪」之后调用）。
   * 已发过或没有页面时什么都不做。
   */
  announceStartPage(): void {
    if (this.#pageStarted || this.#page === null) return;
    this.#pageStarted = true;
    const page = this.#page;
    this.#emit({ type: 'canvas', canvasId: page, display: 'page', open: true, reason: 'start' });
    this.#emit({ type: 'page-changed', from: null, to: page, reason: 'start' });
  }

  /** 执行蓝图的从画布动作与页面导航，按顺序。 */
  apply(effects: readonly ScreenBlueprintCanvasEffect[]): void {
    for (const effect of effects) {
      if (effect.type === 'page-navigation') {
        this.navigate(effect.operation, 'blueprint');
        continue;
      }
      const canvas = this.#subCanvases.get(effect.canvasId);
      if (canvas === undefined) continue;
      const open =
        effect.operation === 'open'
          ? true
          : effect.operation === 'close'
            ? false
            : !this.isOpen(effect.canvasId);
      if (open) this.open(effect.canvasId, effect.payload, 'blueprint');
      else this.close(effect.canvasId, 'blueprint');
    }
  }

  /** 打开从画布：页面 = 切页（先关全部弹框），弹框 = 打开浮层。 */
  open(
    canvasId: string,
    payload: ScreenJsonValue | undefined,
    reason: BaseScreenCanvasChangeReason,
  ): boolean {
    const canvas = this.#subCanvases.get(canvasId);
    if (canvas === undefined) return false;
    if (canvas.display === 'popup') return this.#setPopup(canvasId, true, reason, payload);
    return this.#goPage(canvasId, payload, reason, true);
  }

  /** 关闭从画布：弹框 = 关闭浮层；当前页 = 返回历史中的上一页（没有历史时不动）。 */
  close(canvasId: string, reason: BaseScreenCanvasChangeReason): boolean {
    const canvas = this.#subCanvases.get(canvasId);
    if (canvas === undefined) return false;
    if (canvas.display === 'popup') return this.#setPopup(canvasId, false, reason);
    if (canvasId !== this.#page) return false;
    return this.navigate('back', reason);
  }

  /** 页面导航：按从画布顺序前后翻页（不循环），或返回历史中的上一页。 */
  navigate(operation: 'previous' | 'next' | 'back', reason: BaseScreenCanvasChangeReason): boolean {
    if (operation === 'back') {
      const previous = this.#history.pop();
      return previous === undefined ? false : this.#goPage(previous, undefined, reason, false);
    }
    const index = this.#page === null ? -1 : this.#pages.indexOf(this.#page);
    const target = this.#pages[operation === 'next' ? index + 1 : index - 1];
    return target === undefined ? false : this.#goPage(target, undefined, reason, true);
  }

  /**
   * 重新套用「弹框打开期间其余内容不可交互」：渲染器挂载新组件之后调用。
   */
  syncInert(): void {
    if (!this.options.enabled) return;
    const top = this.#open.at(-1);
    const topLayer = top === undefined ? undefined : this.#layers.get(top)?.layer;
    // 测试替身与非 DOM 宿主可能没有 children：没有可同步的子元素就什么也不做。
    const children = this.options.root.children as HTMLCollection | undefined;
    if (children === undefined || (topLayer === undefined && !this.#inertApplied)) return;
    for (const child of Array.from(children) as HTMLElement[]) {
      const inert = topLayer !== undefined && child !== topLayer;
      if (child.inert !== inert) child.inert = inert;
    }
    this.#inertApplied = topLayer !== undefined;
  }

  /** 关闭全部弹框、回到起始页且不发通知（文档替换、清空时用）。 */
  reset(): void {
    for (const animation of this.#animations.values()) animation.cancel();
    this.#animations.clear();
    this.#open = [];
    this.#returnFocus.clear();
    this.#page = null;
    this.#pageStarted = false;
    this.#history = [];
    this.#visible = undefined;
    for (const layer of this.#layers.values()) layer.layer.style.display = 'none';
    this.syncInert();
  }

  dispose(): void {
    this.reset();
    for (const layer of this.#layers.values()) detachLayer(layer);
    this.#layers.clear();
    this.#removePageLayers();
  }

  #goPage(
    pageId: string,
    payload: ScreenJsonValue | undefined,
    reason: BaseScreenCanvasChangeReason,
    remember: boolean,
  ): boolean {
    if (pageId === this.#page || !this.#pages.includes(pageId)) return false;
    for (const popupId of [...this.#open].reverse()) this.#setPopup(popupId, false, reason);
    const from = this.#page;
    if (from !== null && remember) this.#history.push(from);
    this.#page = pageId;
    this.#pageStarted = true;
    this.#syncPageBackground();
    this.options.requestRender();
    if (from !== null) {
      this.#emit({ type: 'canvas', canvasId: from, display: 'page', open: false, reason });
    }
    this.#emit({
      type: 'canvas',
      canvasId: pageId,
      display: 'page',
      open: true,
      reason,
      ...(payload === undefined ? {} : { payload }),
    });
    this.#emit({ type: 'page-changed', from, to: pageId, reason });
    return true;
  }

  #setPopup(
    canvasId: string,
    open: boolean,
    reason: BaseScreenCanvasChangeReason,
    payload?: ScreenJsonValue,
  ): boolean {
    if (this.#open.includes(canvasId) === open) return false;
    if (open) {
      const active = activeElementOf(this.options.root);
      if (active !== null) this.#returnFocus.set(canvasId, active);
      this.#open = [...this.#open, canvasId];
    } else {
      this.#open = this.#open.filter((candidate) => candidate !== canvasId);
    }
    if (this.options.enabled) {
      this.#restack();
      const layer = this.#layers.get(canvasId);
      if (layer !== undefined) {
        this.#animate(canvasId, layer, open);
        if (open) focusInto(layer);
        else this.#restoreFocus(canvasId);
      }
    }
    this.#emit({
      type: 'canvas',
      canvasId,
      display: 'popup',
      open,
      reason,
      ...(open && payload !== undefined ? { payload } : {}),
    });
    return true;
  }

  #emit(change: BaseScreenCanvasChange): void {
    this.options.onChange?.(change);
  }

  #restoreFocus(canvasId: string): void {
    const previous = this.#returnFocus.get(canvasId);
    this.#returnFocus.delete(canvasId);
    // 还有别的弹框开着：焦点交给新的最上层弹框，而不是退回画布。
    const top = this.#open.at(-1);
    const topLayer = top === undefined ? undefined : this.#layers.get(top);
    if (topLayer !== undefined) {
      focusInto(topLayer);
      return;
    }
    if (previous !== undefined && previous.isConnected && 'focus' in previous) {
      (previous as HTMLElement).focus({ preventScroll: true });
    }
  }

  /** 有页面时建四个固定层；没有页面时撤掉（主画布组件回到画布根上）。 */
  #syncPageLayers(): void {
    if (this.#pages.length === 0) {
      this.#removePageLayers();
      return;
    }
    if (this.#pageLayers === undefined) {
      const ownerDocument = this.options.root.ownerDocument;
      const make = (name: string, zIndex: number, fill: boolean): HTMLElement => {
        const element = ownerDocument.createElement('div');
        element.dataset.baseScreenCanvasLayer = name;
        element.style.position = 'absolute';
        element.style.left = '0';
        element.style.top = '0';
        element.style.zIndex = String(zIndex);
        if (fill) {
          element.style.width = '100%';
          element.style.height = '100%';
          element.style.pointerEvents = 'none';
        } else {
          // 0×0 定位容器：子组件按画布坐标绝对定位，容器本身不拦截指针。
          element.style.width = '0';
          element.style.height = '0';
          element.style.overflow = 'visible';
        }
        return element;
      };
      this.#pageLayers = {
        background: make('page-background', 0, true),
        below: make('below', 1, false),
        page: make('page', 2, false),
        main: make('main', 3, false),
      };
      // 倒序插到最前：DOM 顺序与层级一致（背景 → 下方 → 页面 → 主画布），弹框浮层始终在后面。
      const root = this.options.root;
      const { background, below, page, main } = this.#pageLayers;
      for (const layer of [main, page, below, background]) {
        root.insertBefore(layer, root.firstChild);
      }
    }
    this.#syncPageBackground();
  }

  #syncPageBackground(): void {
    const layers = this.#pageLayers;
    if (layers === undefined) return;
    const page = this.#page === null ? undefined : this.#subCanvases.get(this.#page);
    if (
      page?.display === 'page' &&
      (page.backgroundColor !== undefined || page.background !== undefined)
    ) {
      applyCanvasBackground(layers.background, {
        width: this.#canvas.width,
        height: this.#canvas.height,
        backgroundColor: page.backgroundColor ?? 'transparent',
        ...(page.background === undefined ? {} : { background: page.background }),
      });
    } else {
      applyCanvasBackground(layers.background, {
        width: this.#canvas.width,
        height: this.#canvas.height,
        backgroundColor: 'transparent',
      });
    }
  }

  #removePageLayers(): void {
    const layers = this.#pageLayers;
    if (layers === undefined) return;
    for (const layer of Object.values(layers)) layer.remove();
    this.#pageLayers = undefined;
  }

  #syncLayer(popup: ScreenPopupCanvas): void {
    let entry = this.#layers.get(popup.id);
    if (entry === undefined) {
      const ownerDocument = this.options.root.ownerDocument;
      const layer = ownerDocument.createElement('div');
      layer.dataset.baseScreenPopup = popup.id;
      layer.setAttribute('role', 'dialog');
      layer.setAttribute('aria-modal', 'true');
      // 能接住焦点（面板里没有可聚焦元素时焦点落在浮层本身），但不进入 Tab 序列。
      layer.setAttribute('tabindex', '-1');
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.outline = 'none';
      layer.style.display = 'none';
      const panel = ownerDocument.createElement('div');
      panel.dataset.baseScreenPopupPanel = popup.id;
      panel.style.position = 'absolute';
      panel.style.overflow = 'hidden';
      panel.style.transformOrigin = 'center';
      panel.style.boxShadow = '0 24px 64px rgb(0 0 0 / 45%)';
      layer.appendChild(panel);
      const onMaskClick = (event: Event): void => {
        if (event.target !== layer) return;
        const current = this.#subCanvases.get(popup.id);
        if (current?.display === 'popup' && current.closeOnMaskClick) {
          this.#setPopup(popup.id, false, 'mask');
        }
      };
      const onKeyDown = (event: KeyboardEvent): void => this.#onKeyDown(popup.id, event);
      layer.addEventListener('click', onMaskClick);
      layer.addEventListener('keydown', onKeyDown as EventListener);
      this.options.root.appendChild(layer);
      entry = { layer, panel, onMaskClick, onKeyDown };
      this.#layers.set(popup.id, entry);
    }
    entry.layer.setAttribute('aria-label', popup.name);
    entry.layer.style.background = popup.maskColor;
    const position = resolveScreenPopupPosition(this.#canvas, popup, popup.placement);
    entry.panel.style.left = `${position.x}px`;
    entry.panel.style.top = `${position.y}px`;
    entry.panel.style.width = `${popup.width}px`;
    entry.panel.style.height = `${popup.height}px`;
    entry.panel.style.borderRadius = `${popup.borderRadius}px`;
    applyCanvasBackground(entry.panel, popupCanvas(popup));
    if (!this.#open.includes(popup.id) && !this.#animations.has(popup.id)) {
      entry.layer.style.display = 'none';
    }
  }

  /** 只有最上层弹框响应键盘：Esc 关闭（若允许），Tab 在弹框内循环。 */
  #onKeyDown(canvasId: string, event: KeyboardEvent): void {
    if (this.#open.at(-1) !== canvasId) return;
    const entry = this.#layers.get(canvasId);
    if (entry === undefined) return;
    if (event.key === 'Escape') {
      const canvas = this.#subCanvases.get(canvasId);
      if (canvas?.display !== 'popup' || !canvas.closeOnEscape) return;
      event.preventDefault();
      event.stopPropagation();
      this.#setPopup(canvasId, false, 'escape');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableIn(entry.panel);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      entry.layer.focus({ preventScroll: true });
      return;
    }
    const active = activeElementOf(this.options.root);
    if (event.shiftKey && (active === first || active === entry.layer)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  #restack(): void {
    for (const [canvasId, layer] of this.#layers) {
      const order = this.#open.indexOf(canvasId);
      layer.layer.style.zIndex = String(POPUP_LAYER_Z_INDEX + Math.max(0, order));
    }
    this.syncInert();
  }

  #animate(canvasId: string, entry: PopupLayer, open: boolean): void {
    this.#animations.get(canvasId)?.cancel();
    this.#animations.delete(canvasId);
    const view = this.options.root.ownerDocument.defaultView;
    const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion || typeof entry.layer.animate !== 'function') {
      entry.layer.style.display = open ? 'block' : 'none';
      return;
    }
    entry.layer.style.display = 'block';
    const animation = entry.layer.animate(
      open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: POPUP_TRANSITION_MS, easing: POPUP_EASING, fill: 'none' },
    );
    if (typeof entry.panel.animate === 'function') {
      entry.panel.animate(
        open
          ? [{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }]
          : [{ transform: 'scale(1)' }, { transform: 'scale(0.96)' }],
        { duration: POPUP_TRANSITION_MS, easing: POPUP_EASING, fill: 'none' },
      );
    }
    this.#animations.set(canvasId, animation);
    void animation.finished
      .then(() => {
        if (this.#animations.get(canvasId) !== animation) return;
        this.#animations.delete(canvasId);
        entry.layer.style.display = this.#open.includes(canvasId) ? 'block' : 'none';
      })
      .catch(() => undefined);
  }
}

/**
 * 组件归属：组件 id → 所属从画布 id（沿父链找根组件的 `canvasId`），以及主画布中
 * 「置于从画布下方」的组件（含子组件）。
 */
export function componentCanvasIndex(document: ScreenDocument): {
  readonly canvas: Map<string, string>;
  readonly belowMain: Set<string>;
} {
  const byId = new Map(document.components.map((component) => [component.id, component]));
  const canvas = new Map<string, string>();
  const belowMain = new Set<string>();
  for (const component of document.components) {
    let current = component;
    const seen = new Set<string>();
    while (current.parentId !== null && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (parent === undefined) break;
      current = parent;
    }
    if (current.parentId !== null) continue;
    if (current.canvasId !== undefined) canvas.set(component.id, current.canvasId);
    else if (current.belowSubCanvas === true) belowMain.add(component.id);
  }
  return { canvas, belowMain };
}

function detachLayer(entry: PopupLayer): void {
  entry.layer.removeEventListener('click', entry.onMaskClick);
  entry.layer.removeEventListener('keydown', entry.onKeyDown as EventListener);
  entry.layer.remove();
}

/** 焦点移入弹框：先给面板里第一个可聚焦元素，没有就给浮层本身。 */
function focusInto(entry: PopupLayer): void {
  const target = focusableIn(entry.panel)[0] ?? entry.layer;
  if (typeof target.focus === 'function') target.focus({ preventScroll: true });
}

function focusableIn(panel: HTMLElement): HTMLElement[] {
  if (typeof panel.querySelectorAll !== 'function') return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  );
}

/** 渲染根所在树（document 或 shadow root）里的当前焦点。 */
function activeElementOf(root: HTMLElement): Element | null {
  const tree = typeof root.getRootNode === 'function' ? root.getRootNode() : undefined;
  const active =
    tree !== undefined && 'activeElement' in tree
      ? (tree as Document | ShadowRoot).activeElement
      : null;
  return active ?? root.ownerDocument?.activeElement ?? null;
}

function popupCanvas(popup: ScreenPopupCanvas): ScreenCanvas {
  return {
    width: popup.width,
    height: popup.height,
    backgroundColor: popup.backgroundColor,
    ...(popup.background === undefined ? {} : { background: popup.background }),
  };
}
