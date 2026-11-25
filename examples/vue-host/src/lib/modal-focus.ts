export interface ModalFocusOptions {
  readonly initialFocus?: string;
  readonly onEscape?: () => void;
}

/** render() 整块重建前记下的焦点位置：按控件身份 + 同身份中的序号定位，重建后放回。 */
export interface ModalFocusSnapshot {
  readonly key: string;
  readonly occurrence: number;
  /** 控件身份变了（例如按钮文案从「测试」变成「测试中…」）时的兜底：在全部可聚焦项里的序号。 */
  readonly index: number;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.getClientRects().length > 0 &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.tabIndex >= 0,
  );
}

/** 页面上可见的模态层里最上面（DOM 顺序最后）的那个；没有可见模态层时为 undefined。 */
function topmostModal(): HTMLElement | undefined {
  const modals = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter(
    (element) => element.getClientRects().length > 0,
  );
  return modals[modals.length - 1];
}

export function trapModalFocus(
  container: HTMLElement,
  options: ModalFocusOptions = {},
): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  /** 这一层是否该接管焦点：仍在文档里，且上面没有更新打开的模态层（嵌套确认框）。 */
  const isTopmost = (): boolean => {
    if (!container.isConnected) return false;
    const top = topmostModal();
    return top === undefined || top === container;
  };
  const focusInitial = (): void => {
    const preferred =
      options.initialFocus === undefined
        ? null
        : container.querySelector<HTMLElement>(options.initialFocus);
    const target =
      preferred !== null && focusableElements(container).includes(preferred)
        ? preferred
        : focusableElements(container)[0];
    target?.focus({ preventScroll: true });
  };
  queueMicrotask(focusInitial);
  const observer = new MutationObserver(() => {
    if (container.contains(document.activeElement) || !isTopmost()) return;
    focusInitial();
  });
  observer.observe(container, { childList: true, subtree: true });

  const onKeyDown = (event: KeyboardEvent): void => {
    const inside = container.contains(document.activeElement);
    // 点了弹层里不可聚焦的区域时焦点落到 body：最上层弹层仍要接管 Esc / Tab，否则焦点会逃出模态层。
    if (!inside && !isTopmost()) return;
    if (event.key === 'Escape' && options.onEscape !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      options.onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableElements(container);
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    if (!inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  // 焦点被程序或辅助技术移到模态层之外时拉回来；嵌套确认框打开时这一层不是最上层，不抢焦点。
  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof Node) || container.contains(target) || !isTopmost()) return;
    focusInitial();
  };
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn, true);

  return () => {
    observer.disconnect();
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusin', onFocusIn, true);
    if (previous?.isConnected === true) previous.focus({ preventScroll: true });
  };
}

function focusKeyOf(element: HTMLElement): string {
  return [
    element.tagName,
    element.getAttribute('data-ds-field') ?? '',
    element.getAttribute('data-ds-mode') ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('name') ?? '',
    element.tagName === 'BUTTON' ? (element.textContent ?? '').trim() : '',
  ].join('|');
}

/** 整块重建 DOM 之前调用：记下焦点在哪个控件上（焦点不在容器内时返回 undefined）。 */
export function captureModalFocus(container: HTMLElement): ModalFocusSnapshot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !container.contains(active)) return undefined;
  const items = focusableElements(container);
  const index = items.indexOf(active);
  if (index < 0) return undefined;
  const key = focusKeyOf(active);
  const occurrence = items.filter((element) => focusKeyOf(element) === key).indexOf(active);
  return { key, occurrence, index };
}

/** 重建之后调用：把焦点放回同一控件；控件已不存在时返回 false，交给焦点陷阱兜底。 */
export function restoreModalFocus(
  container: HTMLElement,
  snapshot: ModalFocusSnapshot | undefined,
): boolean {
  if (snapshot === undefined) return false;
  if (container.contains(document.activeElement)) return true;
  const items = focusableElements(container);
  const matches = items.filter((element) => focusKeyOf(element) === snapshot.key);
  const target =
    matches[Math.min(snapshot.occurrence, matches.length - 1)] ??
    items[Math.min(snapshot.index, items.length - 1)];
  target?.focus({ preventScroll: true });
  return target !== undefined;
}
