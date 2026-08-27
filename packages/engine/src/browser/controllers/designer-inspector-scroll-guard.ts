/**
 * 检查器点击滚动守卫：浏览器在真实指针按下时会把滚动容器内被裁剪的表单控件
 * 原生滚入视口（Chromium 内部逻辑，mousedown preventDefault 与
 * focus({ preventScroll: true }) 都无法取消）——这正是 checkbox/select 值变化时
 * 检查器面板滚动条被动跳动的根因。关键时序：该预滚动发生在 pointerdown 事件
 * 派发**之前**，页面无法在按下时刻看到滚动前的值，因此不能靠按下时快照恢复。
 *
 * 守卫同时维护滚动批次起点与用户 wheel 意图：pointerdown 前紧邻发生、且不属于
 * wheel 批次的滚动会被识别为浏览器隐式预滚动并回滚；控件提交后短窗口内由焦点或
 * 重渲染产生的滚动也会回到固定位置。正常 wheel/惯性滚动仍会成为新的稳定位置。
 */
export class DesignerInspectorScrollGuard {
  #armed:
    | { readonly pane: HTMLElement; readonly scrollTop: number; readonly until: number }
    | undefined;
  #snapshots = new WeakMap<HTMLElement, InspectorScrollSnapshot>();
  #pendingUserScroll = new WeakSet<HTMLElement>();
  #attached = new WeakSet<HTMLElement>();
  readonly #cleanups: Array<() => void> = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  /**
   * 控件 pointerdown 时调用。若浏览器刚在事件派发前隐式滚动了容器，先回到该滚动
   * 批次之前的位置；随后武装守卫，继续拦截焦点与重渲染产生的滚动。
   */
  begin(pane: HTMLElement, control?: HTMLElement): void {
    this.ensureListeners(pane);
    const now = this.now();
    const snapshot = this.#snapshot(pane);
    // Chromium can mutate scrollTop before pointerdown while deferring the corresponding
    // scroll event until after pointerdown/change. Only undo the small reveal of a control that
    // was already mostly visible; a fully offscreen control must still scroll into view so the
    // subsequent pointerup lands on the same target.
    const hasPendingUserScroll = this.#pendingUserScroll.has(pane);
    const hasDeferredImplicitScroll =
      pane.scrollTop !== snapshot.scrollTop &&
      !hasPendingUserScroll &&
      (control === undefined ||
        wasControlMostlyVisibleBeforeScroll(pane, control, snapshot.scrollTop));
    const hasRecentImplicitScroll =
      !hasPendingUserScroll &&
      !snapshot.intentional &&
      now - snapshot.lastScrollAt <= INSPECTOR_PRE_POINTER_SCROLL_WINDOW_MS;
    const deferredScrollStart = snapshot.intentional ? snapshot.scrollTop : snapshot.batchStart;
    const scrollTop = hasDeferredImplicitScroll
      ? deferredScrollStart
      : hasRecentImplicitScroll
        ? snapshot.batchStart
        : pane.scrollTop;
    this.#arm(pane, scrollTop, now);
  }

  /**
   * change 提交前调用：native select 可以在 pointerdown 很久以后才提交值，因此按提交
   * 时的当前位置重新武装，确保同步重渲染不改变滚动条。
   */
  preserve(pane: HTMLElement): void {
    this.ensureListeners(pane);
    const now = this.now();
    const armed = this.#armed;
    const scrollTop =
      armed !== undefined && armed.pane === pane && now <= armed.until
        ? armed.scrollTop
        : pane.scrollTop;
    this.#arm(pane, scrollTop, now);
  }

  /**
   * 确保容器挂载滚动/滚轮监听（幂等）。建议在面板 render 时对滚动容器调用一次，
   * 使稳定位置在用户首次交互前就绪。滚轮视为用户主动滚动，解除守卫。
   */
  ensureListeners(pane: HTMLElement): void {
    if (this.#attached.has(pane)) return;
    this.#attached.add(pane);
    this.#snapshots.set(pane, createInspectorScrollSnapshot(pane.scrollTop));
    const scroll = (): void => this.#onScroll(pane);
    const wheel = (): void => {
      if (this.#armed?.pane === pane) this.#armed = undefined;
      this.#pendingUserScroll.add(pane);
    };
    pane.addEventListener('scroll', scroll, { passive: true });
    pane.addEventListener('wheel', wheel, { passive: true });
    this.#cleanups.push(() => {
      pane.removeEventListener('scroll', scroll);
      pane.removeEventListener('wheel', wheel);
    });
  }

  cancel(): void {
    this.#armed = undefined;
  }

  /** 释放全部容器监听（元素 disconnect 时由宿主调用）。 */
  dispose(): void {
    this.#armed = undefined;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    // Designer 元素允许 disconnect 后重连；重置监听状态而不是永久禁用守卫。
    this.#attached = new WeakSet<HTMLElement>();
    this.#snapshots = new WeakMap<HTMLElement, InspectorScrollSnapshot>();
    this.#pendingUserScroll = new WeakSet<HTMLElement>();
  }

  #onScroll(pane: HTMLElement): void {
    const now = this.now();
    const armed = this.#armed;
    if (armed !== undefined && armed.pane === pane && now <= armed.until) {
      // 浏览器滚入视口或重渲染副作用：回滚到本次守卫固定的位置（幂等）。
      if (pane.scrollTop !== armed.scrollTop) pane.scrollTop = armed.scrollTop;
      return;
    }
    if (armed?.pane === pane) this.#armed = undefined;

    const snapshot = this.#snapshot(pane);
    const continuesIntentionalScroll =
      snapshot.intentional && now - snapshot.lastScrollAt <= INSPECTOR_SCROLL_BATCH_GAP_MS;
    const intentional = this.#pendingUserScroll.has(pane) || continuesIntentionalScroll;
    this.#pendingUserScroll.delete(pane);
    const startsNewBatch = now - snapshot.lastScrollAt > INSPECTOR_SCROLL_BATCH_GAP_MS;

    if (intentional) {
      snapshot.batchStart = pane.scrollTop;
    } else if (snapshot.intentional || startsNewBatch) {
      // 保留无 wheel 的滚动批次起点。浏览器若在 pointerdown 前执行内部
      // scrollIntoView，begin() 可据此恢复，而不是把异常位置当成新的稳定值。
      snapshot.batchStart = snapshot.scrollTop;
    }
    snapshot.scrollTop = pane.scrollTop;
    snapshot.lastScrollAt = now;
    snapshot.intentional = intentional;
  }

  #arm(pane: HTMLElement, scrollTop: number, now: number): void {
    const snapshot = this.#snapshot(pane);
    snapshot.scrollTop = scrollTop;
    snapshot.batchStart = scrollTop;
    snapshot.lastScrollAt = Number.NEGATIVE_INFINITY;
    snapshot.intentional = true;
    this.#armed = {
      pane,
      scrollTop,
      until: now + INSPECTOR_CLICK_SCROLL_GUARD_MS,
    };
    if (pane.scrollTop !== scrollTop) pane.scrollTop = scrollTop;
  }

  #snapshot(pane: HTMLElement): InspectorScrollSnapshot {
    const existing = this.#snapshots.get(pane);
    if (existing !== undefined) return existing;
    const snapshot = createInspectorScrollSnapshot(pane.scrollTop);
    this.#snapshots.set(pane, snapshot);
    return snapshot;
  }
}

interface InspectorScrollSnapshot {
  scrollTop: number;
  batchStart: number;
  lastScrollAt: number;
  intentional: boolean;
}

function createInspectorScrollSnapshot(scrollTop: number): InspectorScrollSnapshot {
  return {
    scrollTop,
    batchStart: scrollTop,
    lastScrollAt: Number.NEGATIVE_INFINITY,
    intentional: true,
  };
}

function wasControlMostlyVisibleBeforeScroll(
  pane: HTMLElement,
  control: HTMLElement,
  previousScrollTop: number,
): boolean {
  const paneRect = pane.getBoundingClientRect();
  const controlRect = control.getBoundingClientRect();
  const scrollDelta = pane.scrollTop - previousScrollTop;
  const previousTop = controlRect.top + scrollDelta;
  const previousBottom = controlRect.bottom + scrollDelta;
  const previousVisibleHeight = Math.max(
    0,
    Math.min(previousBottom, paneRect.bottom) - Math.max(previousTop, paneRect.top),
  );
  const tolerance = 1;
  const isVisibleNow =
    controlRect.top >= paneRect.top - tolerance &&
    controlRect.bottom <= paneRect.bottom + tolerance;
  const wasClipped = previousTop < paneRect.top || previousBottom > paneRect.bottom;
  return isVisibleNow && wasClipped && previousVisibleHeight >= controlRect.height / 2;
}

/**
 * 判定指针目标是否落在检查器表单域上。表单域通常渲染为
 * `<label class="designer-field"><input/select/textarea>`（label 包裹控件），
 * 点击 label 的文本/空白区域时事件目标是 label 本身——label 是控件的**祖先**，
 * `closest('input, ...')`（沿祖先链）不会命中；必须显式把 label 纳入选择器，
 * 否则 label 点击产生的焦点转移滚动（浏览器原生行为）无法被滚动守卫拦截。
 */
export function isInspectorFormControlTarget(target: EventTarget | null): boolean {
  const element = target as { readonly closest?: (selector: string) => Element | null } | null;
  const hit = element?.closest?.('input, select, textarea, label');
  return hit !== null && hit !== undefined;
}

/** 浏览器原生滚入视口的守卫窗口：pointerdown 后短时间内发生的滚动视为点击副作用。 */
export const INSPECTOR_CLICK_SCROLL_GUARD_MS = 160;

/** 浏览器内部 scrollIntoView 与随后 pointerdown 的最大关联间隔。 */
export const INSPECTOR_PRE_POINTER_SCROLL_WINDOW_MS = 80;

/** 同一连续滚动批次内相邻 scroll 事件的最大间隔。 */
const INSPECTOR_SCROLL_BATCH_GAP_MS = 120;
