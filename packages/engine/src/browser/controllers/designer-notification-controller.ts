import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

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
    const text = container.ownerDocument.createElement('span');
    text.textContent = message;
    const close = container.ownerDocument.createElement('button');
    close.type = 'button';
    close.className = 'designer-control designer-button designer-notification-close';
    close.dataset.notificationDismiss = 'true';
    close.setAttribute('aria-label', DESIGNER_UI_TEXT.notification.closeAria);
    close.textContent = DESIGNER_UI_TEXT.notification.close;
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
}
