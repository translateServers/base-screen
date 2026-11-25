import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { createDesignerButton, designerNotificationGlyph } from '../dom/designer-ui-primitives.js';

export type DesignerNotificationTone = 'error' | 'success';

/**
 * 自动消失时长：成功提示只是确认，4 秒足够读完；错误提示要给用户时间看清原因，留 8 秒。
 * 鼠标悬停或焦点在提示里时暂停计时，移开后按剩余时间继续。
 */
export const DESIGNER_NOTIFICATION_DURATION: Readonly<Record<DesignerNotificationTone, number>> = {
  success: 4000,
  error: 8000,
};

/** 同时最多保留的提示条数：再来新的就挤掉最早的一条，避免连续操作把画布右下角堆满。 */
export const DESIGNER_NOTIFICATION_LIMIT = 3;

interface NotificationTimer {
  handle: ReturnType<typeof setTimeout> | undefined;
  remaining: number;
  startedAt: number;
  paused: boolean;
}

export class DesignerNotificationController {
  #container: HTMLElement | undefined;
  readonly #timers = new Map<HTMLElement, NotificationTimer>();

  connect(container: HTMLElement): void {
    this.#container = container;
  }

  notify(message: string, tone: DesignerNotificationTone): void {
    const container = this.#container;
    if (container === undefined) return;
    const notification = container.ownerDocument.createElement('div');
    notification.className = 'designer-notification';
    notification.dataset.notificationTone = tone;
    notification.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    // 语义色只落在图标上（原型 .toast）：底色保持中性覆盖面，文字与边框不着色。
    notification.innerHTML = designerNotificationGlyph(tone);
    const text = container.ownerDocument.createElement('span');
    text.textContent = message;
    const close = createDesignerButton(container.ownerDocument, {
      className: 'designer-notification-close',
      text: DESIGNER_UI_TEXT.notification.close,
    });
    close.dataset.notificationDismiss = 'true';
    close.setAttribute('aria-label', DESIGNER_UI_TEXT.notification.closeAria);
    notification.append(text, close);
    container.appendChild(notification);
    this.#schedule(notification, DESIGNER_NOTIFICATION_DURATION[tone]);
    this.#trim(container);
  }

  dismiss(target: Element): boolean {
    const notification = target.closest<HTMLElement>('[data-notification-tone]');
    if (
      target.closest<HTMLButtonElement>('[data-notification-dismiss]') === null ||
      notification === null
    ) {
      return false;
    }
    this.#remove(notification);
    return true;
  }

  clear(): void {
    this.#clearTimers();
    this.#container?.replaceChildren();
  }

  /** 释放容器引用（元素 disconnect 时由宿主调用；重连时 connect 重新注入）。 */
  release(): void {
    this.#clearTimers();
    this.#container = undefined;
  }

  #schedule(notification: HTMLElement, duration: number): void {
    const timer: NotificationTimer = {
      handle: undefined,
      remaining: duration,
      startedAt: 0,
      paused: false,
    };
    this.#timers.set(notification, timer);
    const start = (): void => {
      timer.startedAt = Date.now();
      timer.handle = setTimeout(() => this.#remove(notification), timer.remaining);
    };
    const pause = (): void => {
      if (timer.paused || timer.handle === undefined) return;
      timer.paused = true;
      clearTimeout(timer.handle);
      timer.handle = undefined;
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
    };
    const resume = (): void => {
      if (!timer.paused) return;
      // 指针移开但焦点还在提示里（如键盘聚焦关闭按钮）时继续暂停。
      if (notification.matches?.(':hover, :focus-within') === true) return;
      timer.paused = false;
      start();
    };
    notification.addEventListener?.('pointerenter', pause);
    notification.addEventListener?.('focusin', pause);
    notification.addEventListener?.('pointerleave', resume);
    notification.addEventListener?.('focusout', resume);
    start();
  }

  /** 超出上限时从最早的开始移除。 */
  #trim(container: HTMLElement): void {
    const notifications = [...this.#timers.keys()];
    for (const notification of notifications.slice(
      0,
      Math.max(0, notifications.length - DESIGNER_NOTIFICATION_LIMIT),
    )) {
      if (notification.parentNode === container || notification.parentNode == null) {
        this.#remove(notification);
      }
    }
  }

  #remove(notification: HTMLElement): void {
    const timer = this.#timers.get(notification);
    if (timer?.handle !== undefined) clearTimeout(timer.handle);
    this.#timers.delete(notification);
    notification.remove();
  }

  #clearTimers(): void {
    for (const timer of this.#timers.values()) {
      if (timer.handle !== undefined) clearTimeout(timer.handle);
    }
    this.#timers.clear();
  }
}
