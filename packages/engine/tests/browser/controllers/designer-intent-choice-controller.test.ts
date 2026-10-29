import { describe, expect, it, vi } from 'vitest';
import { DesignerIntentChoiceController } from '../../../src/browser/controllers/designer-intent-choice-controller.js';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';

// 该套件在 node 环境运行：isEditableTarget 用 instanceof 判定可编辑目标，这里给最小替身。
class FakeTextArea {}

const globals = globalThis as {
  Element?: unknown;
  HTMLElement?: unknown;
  HTMLInputElement?: unknown;
  HTMLSelectElement?: unknown;
  HTMLTextAreaElement?: unknown;
};
globals.Element ??= class FakeElement {};
globals.HTMLElement ??= class FakeHtmlElement {};
globals.HTMLInputElement ??= class FakeInput {};
globals.HTMLSelectElement ??= class FakeSelect {};
globals.HTMLTextAreaElement ??= FakeTextArea;

class FakeStatus {
  readonly dataset: Record<string, string> = {};
  innerHTML = '';
  cleared = 0;

  querySelectorAll(): readonly unknown[] {
    return [];
  }

  replaceChildren(): void {
    this.innerHTML = '';
    this.cleared++;
  }
}

interface FakeMaterial {
  readonly dataset: { readonly baseScreenComponentId: string };
}

function canvasTarget(componentId: string): EventTarget {
  const material: FakeMaterial = { dataset: { baseScreenComponentId: componentId } };
  return {
    closest: (selector: string) =>
      selector === '[data-base-screen-component-id]' ? material : null,
  } as unknown as EventTarget;
}

function pointerEvent(): Event {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as Event;
}

function key(init: Partial<KeyboardEvent>): KeyboardEvent {
  return { target: null, preventDefault: vi.fn(), ...init } as unknown as KeyboardEvent;
}

function harness(initialSelection: readonly string[] = []) {
  const selection = [...initialSelection];
  const writes: string[][] = [];
  const controller = new DesignerIntentChoiceController({
    getSelectedComponentIds: () => [...selection],
    replaceSelection: (componentIds) => {
      selection.splice(0, selection.length, ...componentIds);
      writes.push([...componentIds]);
    },
  });
  const status = new FakeStatus();
  controller.connect(status as unknown as HTMLElement);
  return { controller, selection, writes, status };
}

describe('designer intent choice controller', () => {
  it('settles a single candidate immediately without touching the selection', async () => {
    const { controller, selection, writes } = harness(['title']);

    await expect(controller.begin(['a'], '')).resolves.toBe('a');
    expect(controller.pending).toBe(false);
    expect(writes).toEqual([]);
    expect(selection).toEqual(['title']);
  });

  it('settles null when there is no candidate at all', async () => {
    const { controller } = harness(['title']);

    await expect(controller.begin([], '')).resolves.toBeNull();
    expect(controller.pending).toBe(false);
  });

  it('selects every candidate so they all light up, and shows the question', () => {
    const { controller, selection, writes, status } = harness(['title']);
    const choice = controller.begin(['a', 'b', 'c'], '');

    expect(controller.pending).toBe(true);
    // 候选一起进选区 = 一起高亮；提问前的选区不在这份写入里。
    expect(writes).toEqual([['a', 'b', 'c']]);
    expect(selection).toEqual(['a', 'b', 'c']);
    expect(status.innerHTML).toContain(
      DESIGNER_UI_TEXT.intent.choicePrompt(3).replace(/&/g, '&amp;'),
    );
    expect(status.innerHTML).toContain(DESIGNER_UI_TEXT.intent.choiceCancel);
    expect(status.innerHTML).toContain('data-intent-choice-cancel');
    controller.onKeyDown(key({ key: 'Escape' }));
    void choice;
  });

  it('shows the platform question verbatim when one is provided', () => {
    const { controller, status } = harness();
    const choice = controller.begin(['a', 'b'], '你指的是哪一个指标卡？');

    expect(status.innerHTML).toContain('你指的是哪一个指标卡？');
    expect(status.innerHTML).not.toContain(DESIGNER_UI_TEXT.intent.choicePrompt(2));
    controller.onKeyDown(key({ key: 'Escape' }));
    void choice;
  });

  it('settles on the candidate the user clicks on the canvas, leaving it selected', async () => {
    const { controller, selection } = harness(['title']);
    const choice = controller.begin(['a', 'b'], '');

    const handled = controller.onPointerDown(canvasTarget('b'), pointerEvent());

    expect(handled).toBe(true);
    await expect(choice).resolves.toBe('b');
    expect(selection).toEqual(['b']);
    expect(controller.pending).toBe(false);
  });

  it('ignores a canvas click that is not one of the candidates', async () => {
    const { controller, selection } = harness(['title']);
    const choice = controller.begin(['a', 'b'], '');

    expect(controller.onPointerDown(canvasTarget('other'), pointerEvent())).toBe(false);
    expect(controller.pending).toBe(true);
    expect(selection).toEqual(['a', 'b']);
    controller.onKeyDown(key({ key: 'Escape' }));
    await expect(choice).resolves.toBeNull();
  });

  it('settles when the selection narrows down to one candidate on its own', async () => {
    const { controller } = harness(['title']);
    const choice = controller.begin(['a', 'b', 'c'], '');

    controller.onSelectionChange(['a', 'c']);
    expect(controller.pending).toBe(true);
    controller.onSelectionChange(['c']);

    await expect(choice).resolves.toBe('c');
  });

  it('cancels on Escape, restores the selection it found and clears the question', async () => {
    const { controller, selection, status } = harness(['title', 'subtitle']);
    const choice = controller.begin(['a', 'b'], '');
    expect(selection).toEqual(['a', 'b']);

    expect(controller.onKeyDown(key({ key: 'Escape' }))).toBe(true);

    await expect(choice).resolves.toBeNull();
    expect(selection).toEqual(['title', 'subtitle']);
    expect(status.innerHTML).toBe('');
    expect(controller.pending).toBe(false);
  });

  it('cancels from the cancel action rendered next to the question', async () => {
    const { controller, selection } = harness(['title']);
    const choice = controller.begin(['a', 'b'], '');
    const cancelButton = {
      closest: (selector: string) => (selector === '[data-intent-choice-cancel]' ? {} : null),
    } as unknown as Element;

    expect(controller.onClick(cancelButton)).toBe(true);

    await expect(choice).resolves.toBeNull();
    expect(selection).toEqual(['title']);
  });

  it('settles the nth candidate when its index key is pressed', async () => {
    const { controller, selection } = harness();
    const choice = controller.begin(['a', 'b', 'c'], '');

    expect(controller.onKeyDown(key({ key: '2' }))).toBe(true);

    await expect(choice).resolves.toBe('b');
    expect(selection).toEqual(['b']);
  });

  it('leaves digits alone while the user is typing in a field', () => {
    const { controller } = harness();
    const choice = controller.begin(['a', 'b'], '');
    const typing = { target: new FakeTextArea() } as unknown as Partial<KeyboardEvent>;

    expect(controller.onKeyDown(key({ key: '1', ...typing }))).toBe(false);
    expect(controller.pending).toBe(true);
    controller.onKeyDown(key({ key: 'Escape' }));
    void choice;
  });

  it('settles the previous question with null when asked again, and still restores the first selection', async () => {
    const { controller, selection } = harness(['title']);
    const first = controller.begin(['a', 'b'], '');
    const second = controller.begin(['b', 'c'], '');

    await expect(first).resolves.toBeNull();
    expect(controller.pending).toBe(true);
    expect(selection).toEqual(['b', 'c']);

    controller.onKeyDown(key({ key: 'Escape' }));
    await expect(second).resolves.toBeNull();
    // 取消回到最初那次提问前的选区，而不是上一次的候选集。
    expect(selection).toEqual(['title']);
  });

  it('settles a hanging question with null when the element is released', async () => {
    const { controller, writes } = harness(['title']);
    const choice = controller.begin(['a', 'b'], '');
    const writesBeforeRelease = writes.length;

    controller.release();

    await expect(choice).resolves.toBeNull();
    expect(controller.pending).toBe(false);
    // 拆卸阶段画布正在逐层释放，不再回写选区，避免撞上半拆的控制器。
    expect(writes).toHaveLength(writesBeforeRelease);
  });

  it('stays out of the way when there is no question pending', () => {
    const { controller } = harness(['title']);

    expect(controller.onKeyDown(key({ key: 'Escape' }))).toBe(false);
    expect(controller.onPointerDown(canvasTarget('a'), pointerEvent())).toBe(false);
    expect(
      controller.onClick({
        closest: () => ({}),
      } as unknown as Element),
    ).toBe(false);
  });
});
