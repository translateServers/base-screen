import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { createDesignerButton, designerNotificationGlyph } from '../dom/designer-ui-primitives.js';

export type DesignerNotificationTone = 'error' | 'success';

export class DesignerNotificationController {
  #container: HTMLElement | undefined;

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
  }

  dismiss(target: Element): boolean {
    const notification = target.closest<HTMLElement>('[data-notification-tone]');
    if (
      target.closest<HTMLButtonElement>('[data-notification-dismiss]') === null ||
      notification === null
    ) {
      return false;
    }
    notification.remove();
    return true;
  }

  clear(): void {
    this.#container?.replaceChildren();
  }

  /** 释放容器引用（元素 disconnect 时由宿主调用；重连时 connect 重新注入）。 */
  release(): void {
    this.#container = undefined;
  }
}
