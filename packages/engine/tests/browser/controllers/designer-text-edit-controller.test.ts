import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerTextEditController } from '../../../src/browser/controllers/designer-text-edit-controller.js';

class FakeElement {
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly listeners: Record<string, (event: unknown) => void> = {};
  textContent = '';
  title = '';
  querySelectorResult: FakeElement | null = null;
  focusCalls = 0;
  removeCalls = 0;
  removed = false;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
    private readonly rect: {
      readonly left: number;
      readonly top: number;
      readonly width: number;
      readonly height: number;
    },
  ) {}

  getBoundingClientRect(): {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  } {
    return this.rect;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners[type] = listener;
  }

  removeEventListener(type: string): void {
    delete this.listeners[type];
  }

  remove(): void {
    this.removeCalls++;
    this.removed = true;
  }

  focus(): void {
    this.focusCalls++;
  }

  setAttribute(): void {}

  querySelector<T extends FakeElement>(_selector: string): T | null {
    return this.querySelectorResult as T | null;
  }
}

class FakeDocument {
  readonly defaultView: undefined = undefined;
  readonly execCommand = vi.fn(() => true);

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this, { left: 0, top: 0, width: 0, height: 0 });
  }

  createRange(): { readonly selectNodeContents: () => void } {
    return { selectNodeContents: () => undefined };
  }

  getSelection(): { readonly removeAllRanges: () => void; readonly addRange: () => void } {
    return { removeAllRanges: () => undefined, addRange: () => undefined };
  }
}

function component(id: string, dataSource: ScreenComponentNode['dataSource']): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x: 80, y: 80 },
    size: { width: 320, height: 72 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

function document(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [component('title', { type: 'static', value: '旧标题' })],
    variables: [],
    blueprint: { rules: [] },
  };
}

function harness() {
  const commands: unknown[] = [];
  const reports: unknown[] = [];
  const editingChanges: boolean[] = [];
  const ownerDocument = new FakeDocument();
  const canvas = new FakeElement('div', ownerDocument, {
    left: 0,
    top: 0,
    width: 960,
    height: 540,
  });
  const material = new FakeElement('base-screen-text', ownerDocument, {
    left: 80,
    top: 80,
    width: 320,
    height: 72,
  });
  canvas.querySelectorResult = material;
  const controller = new DesignerTextEditController({
    getDocument: () => document(),
    getCanvas: () => canvas as unknown as HTMLElement,
    executeCommand: (command) => {
      commands.push(command);
      return { ok: true, value: document(), diagnostics: [] };
    },
    report: (result) => {
      reports.push(result);
    },
    onEditingChange: (editing) => {
      editingChanges.push(editing);
    },
  });
  return { canvas, material, commands, reports, editingChanges, ownerDocument, controller };
}

afterEach(() => vi.restoreAllMocks());

describe('designer text edit controller', () => {
  it('enters editing for a static-string text component and creates a full-selected overlay', () => {
    const { controller, canvas, material } = harness();
    const entered = controller.enter('title');

    expect(entered).toBe(true);
    expect(controller.editing).toBe(true);
    expect(controller.isEditing('title')).toBe(true);
    expect(canvas.children).toHaveLength(1);
    const overlay = canvas.children[0]!;
    expect(overlay.textContent).toBe('旧标题');
    expect(overlay.dataset.textEditOverlay).toBe('true');
    expect(overlay.focusCalls).toBe(1);
    expect(material.removeCalls).toBe(0);
    // 编辑期间隐藏物料本体，避免透明 overlay 下旧文本透出与编辑内容重叠。
    expect(material.style.visibility).toBe('hidden');
  });

  it('restores the material visibility when the session finishes', () => {
    const { controller, canvas, material } = harness();
    controller.enter('title');
    expect(material.style.visibility).toBe('hidden');
    const overlay = canvas.children[0]!;
    overlay.textContent = '新标题';
    overlay.listeners['keydown']!({
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(material.style.visibility).toBe('');
    expect(controller.editing).toBe(false);
  });

  it('rejects non-editable components without creating an overlay', () => {
    const { controller, canvas } = harness();
    const entered = controller.enter('missing');

    expect(entered).toBe(false);
    expect(controller.editing).toBe(false);
    expect(canvas.children).toHaveLength(0);
  });

  it('rejects entering when the canvas is missing', () => {
    const commands: unknown[] = [];
    const controller = new DesignerTextEditController({
      getDocument: () => document(),
      getCanvas: () => undefined,
      executeCommand: (command) => {
        commands.push(command);
        return { ok: true, value: document(), diagnostics: [] };
      },
      report: () => undefined,
      onEditingChange: () => undefined,
    });

    expect(controller.enter('title')).toBe(false);
    expect(commands).toHaveLength(0);
  });

  it('commits the edited text as a single update-components command on Enter', () => {
    const { controller, canvas, commands, editingChanges } = harness();
    controller.enter('title');
    const overlay = canvas.children[0]!;
    overlay.textContent = '新标题';
    overlay.listeners['keydown']!({
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'update-components',
      componentIds: ['title'],
      patch: { dataSource: { type: 'static', value: '新标题' } },
    });
    expect(overlay.removed).toBe(true);
    expect(controller.editing).toBe(false);
    expect(editingChanges).toEqual([true, false]);
  });

  it('skips the command when the text is unchanged', () => {
    const { controller, canvas, commands } = harness();
    controller.enter('title');
    const overlay = canvas.children[0]!;
    overlay.listeners['keydown']!({
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(commands).toHaveLength(0);
    expect(controller.editing).toBe(false);
  });

  it('cancels without executing a command on Escape', () => {
    const { controller, canvas, commands } = harness();
    controller.enter('title');
    const overlay = canvas.children[0]!;
    overlay.textContent = '改了但放弃';
    overlay.listeners['keydown']!({
      key: 'Escape',
      shiftKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(commands).toHaveLength(0);
    expect(controller.editing).toBe(false);
    expect(overlay.removed).toBe(true);
  });

  it('inserts a newline on Shift+Enter without committing', () => {
    const { controller, canvas, commands, ownerDocument } = harness();
    controller.enter('title');
    const overlay = canvas.children[0]!;
    overlay.listeners['keydown']!({
      key: 'Enter',
      shiftKey: true,
      isComposing: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(commands).toHaveLength(0);
    expect(controller.editing).toBe(true);
    expect(ownerDocument.execCommand).toHaveBeenCalledWith('insertText', false, '\n');
  });

  it('commits on blur', () => {
    const { controller, canvas, commands } = harness();
    controller.enter('title');
    const overlay = canvas.children[0]!;
    overlay.textContent = '失焦提交';
    overlay.listeners['blur']!({});

    expect(commands).toHaveLength(1);
    expect(controller.editing).toBe(false);
  });

  it('suppresses pointer and selection events inside the overlay', () => {
    const { controller, canvas } = harness();
    controller.enter('title');
    const overlay = canvas.children[0]!;
    expect(overlay.listeners['pointerdown']).toBeDefined();
    expect(overlay.listeners['selectstart']).toBeDefined();
    expect(overlay.listeners['keydown']).toBeDefined();
    expect(overlay.listeners['blur']).toBeDefined();
  });
});
