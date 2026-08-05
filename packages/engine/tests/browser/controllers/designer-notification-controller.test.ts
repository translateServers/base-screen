import { describe, expect, it } from 'vitest';
import { DesignerNotificationController } from '../../../src/browser/controllers/designer-notification-controller.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = '';
  textContent = '';
  type = '';
  removed = false;
  readonly attributes = new Map<string, string>();

  parent: FakeElement | undefined;

  constructor(readonly ownerDocument: FakeDocument) {}

  append(...children: FakeElement[]): void {
    children.forEach((child) => {
      child.parent = this;
    });
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  closest<T extends FakeElement>(selector: string): T | null {
    if (
      (selector === '[data-notification-tone]' && this.dataset.notificationTone !== undefined) ||
      (selector === '[data-notification-dismiss]' && this.dataset.notificationDismiss !== undefined)
    ) {
      return this as unknown as T;
    }
    return this.parent?.closest<T>(selector) ?? null;
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

describe('DesignerNotificationController', () => {
  it('R3 renders accessible error notifications and allows dismissal', () => {
    const ownerDocument = new FakeDocument();
    const container = new FakeElement(ownerDocument);
    const controller = new DesignerNotificationController();
    controller.connect(container as unknown as HTMLElement);

    controller.notify('操作未完成，请检查输入后重试。', 'error');

    const notification = container.children[0]!;
    const close = notification.children[1]!;
    expect(notification.dataset.notificationTone).toBe('error');
    expect(notification.attributes.get('role')).toBe('alert');
    expect(close.attributes.get('aria-label')).toBe('关闭通知');
    expect(controller.dismiss(close as unknown as Element)).toBe(true);
    expect(notification.removed).toBe(true);
  });

  it('R3 clears notifications with session surfaces', () => {
    const ownerDocument = new FakeDocument();
    const container = new FakeElement(ownerDocument);
    const controller = new DesignerNotificationController();
    controller.connect(container as unknown as HTMLElement);
    controller.notify('已保存修改。', 'success');

    controller.clear();

    expect(container.children).toEqual([]);
  });
});
