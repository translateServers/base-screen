/**
 * 单例提示气泡：把设计器内部的 [data-tip] 悬停/聚焦提示收敛到一个固定定位浮层。
 *
 * 为什么不用原生 title：原生提示延迟不可控、无法随主题换色、在禁用控件上完全不出现，
 * 且视觉语言与自绘 UI 不一致。设计原型（form-controls.html §07）明确以本浮层替代 title：
 * 悬停约 420ms 浮现，持续悬停中切换目标降为 90ms；键盘聚焦（:focus-visible）立即显示；
 * Esc 关闭并在本次悬停/聚焦结束前抑制重弹；移出有 90ms 宽限避免穿过缝隙时闪断。
 *
 * 禁用控件不派发指针事件，控件级 data-tip 永远收不到 pointerover；此时回退到
 * 容器级命中扫描：在指针所在容器内按坐标查找 [data-tip][disabled]，命中即计时显示。
 */
const TIP_SHOW_DELAY = 420;
const TIP_SWITCH_DELAY = 90;
const TIP_HIDE_GRACE = 90;
/** 距上次显示 600ms 内再次悬停视为「连续浏览」，用更短的切换延迟。 */
const TIP_RECENT_WINDOW = 600;
const TIP_MARGIN = 8;
const TIP_GAP = 9;
const TIP_CARET_EDGE = 14;
const TIP_LAYER_ID = 'designer-tooltip';

interface TooltipWindow {
  readonly innerWidth: number;
  readonly innerHeight: number;
  setTimeout(handler: () => void, timeout?: number): number;
  clearTimeout(handle: number): void;
  addEventListener(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions | boolean,
  ): void;
}

export class DesignerTooltipController {
  #root: ShadowRoot | undefined;
  #layer: HTMLElement | undefined;
  #ownerWindow: TooltipWindow | undefined;
  #current: Element | undefined;
  #pending: Element | undefined;
  #suppressed: Element | undefined;
  #showTimer: number | undefined;
  #hideTimer: number | undefined;
  #lastShownAt = 0;
  #described: Element | undefined;
  #describedPrevious: string | null = null;
  #scanRoot: Element | undefined;

  connect(root: ShadowRoot, layer: HTMLElement): void {
    const ownerWindow = root.ownerDocument.defaultView as TooltipWindow | null;
    if (ownerWindow === null) return;
    this.#root = root;
    this.#layer = layer;
    this.#ownerWindow = ownerWindow;
    root.addEventListener('pointerover', this.#onPointerOver, true);
    root.addEventListener('pointermove', this.#onPointerMove, true);
    root.addEventListener('pointerout', this.#onPointerOut, true);
    root.addEventListener('focusin', this.#onFocusIn);
    root.addEventListener('focusout', this.#onFocusOut);
    root.addEventListener('keydown', this.#onKeyDown, true);
    root.addEventListener('pointerdown', this.#onPointerDown, true);
    ownerWindow.addEventListener('scroll', this.#onViewportChange, {
      capture: true,
      passive: true,
    });
    ownerWindow.addEventListener('resize', this.#onViewportChange);
  }

  disconnect(): void {
    this.#clearTimers();
    this.#commitHide();
    const root = this.#root;
    const ownerWindow = this.#ownerWindow;
    if (root !== undefined) {
      root.removeEventListener('pointerover', this.#onPointerOver, true);
      root.removeEventListener('pointermove', this.#onPointerMove, true);
      root.removeEventListener('pointerout', this.#onPointerOut, true);
      root.removeEventListener('focusin', this.#onFocusIn);
      root.removeEventListener('focusout', this.#onFocusOut);
      root.removeEventListener('keydown', this.#onKeyDown, true);
      root.removeEventListener('pointerdown', this.#onPointerDown, true);
    }
    if (ownerWindow !== undefined) {
      ownerWindow.removeEventListener('scroll', this.#onViewportChange, { capture: true });
      ownerWindow.removeEventListener('resize', this.#onViewportChange);
    }
    this.#root = undefined;
    this.#layer = undefined;
    this.#ownerWindow = undefined;
    this.#scanRoot = undefined;
    this.#suppressed = undefined;
  }

  #onPointerOver = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType !== undefined && pointer.pointerType !== 'mouse') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-tip]');
    if (trigger !== null) {
      this.#scanRoot = undefined;
      this.#schedule(trigger, false);
      return;
    }
    const scanRoot =
      target.querySelectorAll('[data-tip][disabled]').length > 0 ? target : undefined;
    this.#scanRoot = scanRoot;
    if (scanRoot === undefined) return;
    const hit = this.#tipAtPoint(scanRoot, pointer.clientX, pointer.clientY);
    if (hit !== null) this.#schedule(hit, false);
  };

  #onPointerMove = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (this.#scanRoot === undefined) return;
    if (pointer.pointerType !== undefined && pointer.pointerType !== 'mouse') return;
    const hit = this.#tipAtPoint(this.#scanRoot, pointer.clientX, pointer.clientY);
    if (hit !== null) {
      if (hit !== this.#current) this.#schedule(hit, false);
      return;
    }
    if (this.#current !== undefined && this.#current.hasAttribute('disabled')) this.#hide(false);
  };

  #onPointerOut = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType !== undefined && pointer.pointerType !== 'mouse') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-tip]');
    if (trigger !== null) {
      if (pointer.relatedTarget !== null && trigger.contains(pointer.relatedTarget as Node)) return;
      if (trigger === this.#suppressed) this.#suppressed = undefined;
      if (trigger === this.#current || trigger === this.#pending) this.#hide(false);
      return;
    }
    if (this.#scanRoot === undefined) return;
    if (pointer.relatedTarget !== null && this.#scanRoot.contains(pointer.relatedTarget as Node)) {
      return;
    }
    this.#scanRoot = undefined;
    if (this.#current !== undefined && this.#current.hasAttribute('disabled')) this.#hide(false);
  };

  #onFocusIn = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-tip]');
    if (trigger === null) return;
    let keyboard = false;
    try {
      keyboard = trigger.matches(':focus-visible');
    } catch {
      keyboard = true;
    }
    if (keyboard) this.#schedule(trigger, true);
  };

  #onFocusOut = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-tip]');
    if (trigger === null) return;
    if (trigger === this.#suppressed) this.#suppressed = undefined;
    if (trigger === this.#current || trigger === this.#pending) this.#hide(true);
  };

  #onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    if (this.#current === undefined && this.#pending === undefined) return;
    this.#suppressed = this.#current ?? this.#pending;
    this.#hide(true);
  };

  #onPointerDown = (): void => {
    if (this.#current !== undefined || this.#pending !== undefined) this.#hide(true);
  };

  #onViewportChange = (): void => {
    if (this.#current !== undefined || this.#pending !== undefined) this.#hide(true);
  };

  #tipAtPoint(root: Element, x: number, y: number): Element | null {
    for (const candidate of root.querySelectorAll('[data-tip][disabled]')) {
      const rect = candidate.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return candidate;
    }
    return null;
  }

  #textOf(element: Element): string {
    return (element.getAttribute('data-tip') ?? '').trim();
  }

  #clearTimers(): void {
    const ownerWindow = this.#ownerWindow;
    if (this.#showTimer !== undefined) ownerWindow?.clearTimeout(this.#showTimer);
    if (this.#hideTimer !== undefined) ownerWindow?.clearTimeout(this.#hideTimer);
    this.#showTimer = undefined;
    this.#hideTimer = undefined;
  }

  #schedule(element: Element, immediate: boolean): void {
    const ownerWindow = this.#ownerWindow;
    if (ownerWindow === undefined) return;
    this.#clearTimers();
    if (element === this.#suppressed || this.#textOf(element) === '') return;
    if (element === this.#current && this.#layer?.classList.contains('is-open') === true) return;
    this.#pending = element;
    const recent = Date.now() - this.#lastShownAt < TIP_RECENT_WINDOW;
    const delay = immediate ? 0 : recent ? TIP_SWITCH_DELAY : TIP_SHOW_DELAY;
    this.#showTimer = ownerWindow.setTimeout(() => {
      this.#showTimer = undefined;
      this.#pending = undefined;
      this.#open(element);
    }, delay);
  }

  #open(element: Element): void {
    const layer = this.#layer;
    const ownerWindow = this.#ownerWindow;
    if (layer === undefined || ownerWindow === undefined) return;
    const text = this.#textOf(element);
    if (text === '' || !element.isConnected) return;
    if (this.#current !== undefined && this.#current !== element) this.#releaseDescribed();
    layer.textContent = text;
    this.#place(element, layer, ownerWindow);
    layer.classList.add('is-open');
    this.#current = element;
    this.#lastShownAt = Date.now();
    this.#acquireDescribed(element, layer);
  }

  #hide(immediate: boolean): void {
    const ownerWindow = this.#ownerWindow;
    this.#clearTimers();
    this.#pending = undefined;
    if (immediate || ownerWindow === undefined) {
      this.#commitHide();
      return;
    }
    this.#hideTimer = ownerWindow.setTimeout(() => {
      this.#hideTimer = undefined;
      this.#commitHide();
    }, TIP_HIDE_GRACE);
  }

  #commitHide(): void {
    if (this.#current === undefined && this.#layer?.classList.contains('is-open') !== true) return;
    this.#layer?.classList.remove('is-open');
    this.#releaseDescribed();
    this.#current = undefined;
  }

  #place(element: Element, layer: HTMLElement, ownerWindow: TooltipWindow): void {
    const rect = element.getBoundingClientRect();
    const width = layer.offsetWidth;
    const height = layer.offsetHeight;
    const viewWidth = ownerWindow.innerWidth;
    const viewHeight = ownerWindow.innerHeight;
    let side: 'top' | 'bottom' = 'top';
    let top = rect.top - height - TIP_GAP;
    if (top < TIP_MARGIN && rect.bottom + TIP_GAP + height <= viewHeight - TIP_MARGIN) {
      side = 'bottom';
      top = rect.bottom + TIP_GAP;
    }
    top = Math.min(
      Math.max(top, TIP_MARGIN),
      Math.max(TIP_MARGIN, viewHeight - height - TIP_MARGIN),
    );
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, TIP_MARGIN),
      Math.max(TIP_MARGIN, viewWidth - width - TIP_MARGIN),
    );
    const caret = Math.min(
      Math.max(rect.left + rect.width / 2 - left, TIP_CARET_EDGE),
      Math.max(TIP_CARET_EDGE, width - TIP_CARET_EDGE),
    );
    layer.dataset.side = side;
    layer.style.left = `${Math.round(left)}px`;
    layer.style.top = `${Math.round(top)}px`;
    layer.style.setProperty('--designer-tooltip-caret', `${Math.round(caret)}px`);
  }

  #acquireDescribed(element: Element, layer: HTMLElement): void {
    const layerId = layer.id === '' ? TIP_LAYER_ID : layer.id;
    const previous = element.getAttribute('aria-describedby');
    if (previous !== null && previous.split(/\s+/).includes(layerId)) return;
    this.#described = element;
    this.#describedPrevious = previous;
    element.setAttribute(
      'aria-describedby',
      previous === null ? layerId : `${previous} ${layerId}`,
    );
  }

  #releaseDescribed(): void {
    const described = this.#described;
    if (described === undefined) return;
    if (this.#describedPrevious === null) described.removeAttribute('aria-describedby');
    else described.setAttribute('aria-describedby', this.#describedPrevious);
    this.#described = undefined;
    this.#describedPrevious = null;
  }
}
