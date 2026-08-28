import { describe, expect, it, vi } from 'vitest';
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

  querySelectorAll<T extends FakeElement>(selector: string): T[] {
    return this.descendants().filter((element) => matchesDataSelector(element, selector)) as T[];
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
  readonly historySummary: FakeElement;
} {
  const ownerDocument = new FakeDocument();
  const trigger = ownerDocument.createElement();
  trigger.dataset.errorConsoleToggle = '';
  const count = ownerDocument.createElement();
  count.dataset.errorConsoleCount = '';
  trigger.append(count);

  const dialog = ownerDocument.createElement();
  dialog.dataset.errorConsole = '';
  const summary = ownerDocument.createElement();
  summary.dataset.errorConsoleSummary = '';
  const historySummary = ownerDocument.createElement();
  historySummary.dataset.errorConsoleHistorySummary = '';
  const clear = ownerDocument.createElement();
  clear.dataset.errorConsoleClear = '';
  const close = ownerDocument.createElement();
  close.dataset.errorConsoleClose = '';
  const status = ownerDocument.createElement();
  status.dataset.materialLibraryStatus = '';
  const list = ownerDocument.createElement();
  list.dataset.errorConsoleList = '';
  dialog.append(summary, historySummary, clear, close, status, list);
  return { dialog, trigger, close, clear, list, status, historySummary };
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
      status
        .querySelectorAll('[data-material-library-action]')
        .map((action) => action.dataset.materialLibraryAction),
    ).toEqual(['retry', 'details']);
  });

  it('R1 bounds history and preserves the active error count after clearing records', () => {
    const { dialog, trigger, clear, list, status, historySummary } = createSurface();
    const controller = new DesignerErrorConsoleController();
    controller.connect(dialog as unknown as HTMLElement, trigger as unknown as HTMLButtonElement);

    for (let index = 1; index <= 51; index++) {
      controller.recordMaterialLibraryState({ status: 'error', failedCount: index });
    }
    controller.onClick(trigger as unknown as Element);

    expect(list.children).toHaveLength(50);
    expect(list.children[0]?.dataset.errorConsoleEntry).toBe('51');
    expect(list.children.at(-1)?.dataset.errorConsoleEntry).toBe('2');
    expect(historySummary.textContent).toBe('50 条记录');
    controller.onClick(clear as unknown as Element);
    expect(list.children).toHaveLength(1);
    expect(status.hidden).toBe(false);
    expect(trigger.querySelector('[data-error-console-count]')?.textContent).toBe('51');

    controller.recordMaterialLibraryState({ status: 'error', failedCount: 51 });
    expect(list.children).toHaveLength(1);
    expect(list.children[0]?.textContent).toContain('上方仍显示当前状态');
    controller.recordMaterialLibraryState({ status: 'ready' });
    controller.recordMaterialLibraryState({ status: 'error', failedCount: 51 });
    expect(list.children[0]?.dataset.errorConsoleEntry).toBe('52');
  });

  it('R3 traps Tab focus, closes with Escape or the backdrop, and restores the trigger', () => {
    const { dialog, trigger, clear, close, status } = createSurface();
    const controller = new DesignerErrorConsoleController();
    controller.connect(dialog as unknown as HTMLElement, trigger as unknown as HTMLButtonElement);
    controller.recordMaterialLibraryState({ status: 'partial', failedCount: 1 });
    controller.onClick(trigger as unknown as Element);

    const actions = status.querySelectorAll('[data-material-library-action]');
    const preventDefault = vi.fn();
    expect(
      controller.onKeyDown({
        key: 'Tab',
        target: close,
        shiftKey: true,
        preventDefault,
      } as unknown as KeyboardEvent),
    ).toBe(true);
    expect(clear.focused).toBe(true);
    expect(
      controller.onKeyDown({
        key: 'Tab',
        target: clear,
        shiftKey: true,
        preventDefault,
      } as unknown as KeyboardEvent),
    ).toBe(true);
    expect(actions.at(-1)?.focused).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(2);

    expect(
      controller.onKeyDown({ key: 'Escape', preventDefault: () => undefined } as KeyboardEvent),
    ).toBe(true);
    expect(dialog.hidden).toBe(true);
    expect(trigger.focused).toBe(true);

    controller.onClick(trigger as unknown as Element);
    expect(controller.onClick(dialog as unknown as Element)).toBe(true);
    expect(dialog.hidden).toBe(true);
  });

  it('R3 presents warning states without inflating the error count', () => {
    const { dialog, trigger, status } = createSurface();
    const controller = new DesignerErrorConsoleController();
    controller.connect(dialog as unknown as HTMLElement, trigger as unknown as HTMLButtonElement);
    controller.recordMaterialLibraryState({ status: 'offline' });

    expect(status.attributes.get('role')).toBe('status');
    expect(trigger.ariaLabel).toContain('有待处理状态');
    expect(trigger.querySelector('[data-error-console-count]')?.textContent).toBe('');
  });
});
