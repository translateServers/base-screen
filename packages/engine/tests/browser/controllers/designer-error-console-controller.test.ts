import { describe, expect, it } from 'vitest';
import { DesignerErrorConsoleController } from '../../../src/browser/controllers/designer-error-console-controller.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  className = '';
  textContent = '';
  type = '';
  hidden = false;
  disabled = false;
  ariaExpanded = 'false';
  ariaLabel = '';
  focused = false;
  parent: FakeElement | undefined;

  constructor(readonly ownerDocument: FakeDocument) {}

  append(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.append(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length);
    this.append(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  toggleAttribute(name: string, force?: boolean): boolean {
    const present = force ?? !this.attributes.has(name);
    if (present) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return present;
  }

  querySelector<T extends FakeElement>(selector: string): T | null {
    return (
      (this.descendants().find((element) => matchesDataSelector(element, selector)) as
        | T
        | undefined) ?? null
    );
  }

  closest<T extends FakeElement>(selector: string): T | null {
    if (matchesDataSelector(this, selector)) return this as unknown as T;
    return this.parent?.closest<T>(selector) ?? null;
  }

  focus(): void {
    this.focused = true;
  }

  private descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

function matchesDataSelector(element: FakeElement, selector: string): boolean {
  const match = selector.match(/^\[data-([a-z-]+)\]$/);
  if (match === null) return false;
  const key = match[1]!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return key in element.dataset;
}

function createSurface(): {
  readonly dialog: FakeElement;
  readonly trigger: FakeElement;
  readonly close: FakeElement;
  readonly clear: FakeElement;
  readonly list: FakeElement;
  readonly status: FakeElement;
} {
  const ownerDocument = new FakeDocument();
  const trigger = ownerDocument.createElement();
  trigger.dataset.errorConsoleToggle = '';
  const count = ownerDocument.createElement();
  count.dataset.errorConsoleCount = '';
  trigger.append(count);

  const dialog = ownerDocument.createElement();
  const summary = ownerDocument.createElement();
  summary.dataset.errorConsoleSummary = '';
  const clear = ownerDocument.createElement();
  clear.dataset.errorConsoleClear = '';
  const close = ownerDocument.createElement();
  close.dataset.errorConsoleClose = '';
  const status = ownerDocument.createElement();
  status.dataset.materialLibraryStatus = '';
  const list = ownerDocument.createElement();
  list.dataset.errorConsoleList = '';
  dialog.append(summary, clear, close, status, list);
  return { dialog, trigger, close, clear, list, status };
}

describe('DesignerErrorConsoleController', () => {
  it('R1 records deduplicated material failures and renders the current action surface', () => {
    const { dialog, trigger, list, status } = createSurface();
    const controller = new DesignerErrorConsoleController();
    controller.connect(dialog as unknown as HTMLElement, trigger as unknown as HTMLButtonElement);

    controller.recordMaterialLibraryState({ status: 'partial', failedCount: 2 });
    controller.recordMaterialLibraryState({ status: 'partial', failedCount: 2 });
    controller.onClick(trigger as unknown as Element);

    expect(dialog.hidden).toBe(false);
    expect(trigger.ariaExpanded).toBe('true');
    expect(list.children).toHaveLength(1);
    expect(status.hidden).toBe(false);
    expect(status.dataset.status).toBe('partial');
    expect(status.attributes.get('role')).toBe('alert');
    expect(
      status.children[1]?.children.map((action) => action.dataset.materialLibraryAction),
    ).toEqual(['retry', 'details']);
  });

  it('R1 bounds history and preserves the active error count after clearing records', () => {
    const { dialog, trigger, clear, list, status } = createSurface();
    const controller = new DesignerErrorConsoleController();
    controller.connect(dialog as unknown as HTMLElement, trigger as unknown as HTMLButtonElement);

    for (let index = 1; index <= 51; index++) {
      controller.recordMaterialLibraryState({ status: 'error', failedCount: index });
    }
    controller.onClick(trigger as unknown as Element);

    expect(list.children).toHaveLength(50);
    controller.onClick(clear as unknown as Element);
    expect(list.children).toHaveLength(1);
    expect(status.hidden).toBe(false);
    expect(trigger.querySelector('[data-error-console-count]')?.textContent).toBe('51');
  });

  it('R3 closes with Escape and returns focus to the status-bar trigger', () => {
    const { dialog, trigger, close, status } = createSurface();
    const controller = new DesignerErrorConsoleController();
    controller.connect(dialog as unknown as HTMLElement, trigger as unknown as HTMLButtonElement);
    controller.recordMaterialLibraryState({ status: 'offline' });
    controller.onClick(trigger as unknown as Element);

    expect(status.attributes.get('role')).toBe('status');
    expect(
      controller.onKeyDown({ key: 'Escape', preventDefault: () => undefined } as KeyboardEvent),
    ).toBe(true);
    expect(dialog.hidden).toBe(true);
    expect(trigger.focused).toBe(true);
    expect(controller.onClick(close as unknown as Element)).toBe(true);
  });
});
