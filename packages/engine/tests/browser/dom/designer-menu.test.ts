import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DesignerMenuController,
  type DesignerMenuControllerCallbacks,
} from '../../../src/browser/dom/designer-menu.js';

class FakeElement {
  readonly dataset: { baseScreenComponentId?: string };
  readonly chain: readonly string[];
  constructor(chain: readonly string[] = [], componentId?: string) {
    this.chain = chain;
    this.dataset = componentId === undefined ? {} : { baseScreenComponentId: componentId };
  }
  closest(selector: string): FakeElement | null {
    return this.chain.includes(selector) ? this : null;
  }
}

class FakeMenu extends FakeElement {
  innerHTML = '';
  hidden = true;
  offsetWidth = 220;
  offsetHeight = 240;
  readonly style: { left: string; top: string } = { left: '', top: '' };
  focus(): void {}
  querySelectorAll(): FakeElement[] {
    return [];
  }
}

class FakeRoot {
  constructor(private readonly workspace: { getBoundingClientRect(): DOMRectLike }) {}
  querySelector(selector: string): { getBoundingClientRect(): DOMRectLike } | null {
    return selector === '.workspace' ? this.workspace : null;
  }
}

interface DOMRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'Element');
});

function createController(
  selectedIds: readonly string[],
  menu: FakeMenu,
  workspace: { getBoundingClientRect(): DOMRectLike },
): DesignerMenuController {
  return new DesignerMenuController({
    getRoot: () => new FakeRoot(workspace) as unknown as ShadowRoot,
    getContextMenu: () => menu as unknown as HTMLElement,
    getSelectedComponentIds: () => selectedIds,
    getOperationState: () => undefined,
  } satisfies DesignerMenuControllerCallbacks);
}

function openAt(
  controller: DesignerMenuController,
  target: FakeElement,
  clientX = 120,
  clientY = 80,
): void {
  controller.openContextMenu({
    target,
    clientX,
    clientY,
  } as unknown as MouseEvent);
}

describe('DesignerMenuController context menu resolution', () => {
  const workspace = {
    getBoundingClientRect: (): DOMRectLike => ({ left: 0, top: 0, width: 800, height: 600 }),
  };

  it('shows the multi-selection menu when right-clicking a component inside a box selection', () => {
    const menu = new FakeMenu();
    const controller = createController(['rectangle-1', 'rectangle-2'], menu, workspace);
    openAt(controller, new FakeElement(['[data-base-screen-component-id]'], 'rectangle-1'));

    expect(menu.innerHTML).toContain('data-menu-action="align-left"');
    expect(menu.innerHTML).toContain('data-menu-action="distribute-horizontal"');
    expect(menu.innerHTML).not.toContain('data-menu-action="select-all"');
    expect(menu.innerHTML).not.toContain('data-menu-action="zoom-in"');
  });

  it('shows the multi-selection menu when right-clicking the selection box gap', () => {
    const menu = new FakeMenu();
    const controller = createController(['rectangle-1', 'rectangle-2'], menu, workspace);
    openAt(controller, new FakeElement(['[data-selection]']));

    expect(menu.innerHTML).toContain('data-menu-action="align-left"');
  });

  it('keeps the single-component menu for a component outside the selection', () => {
    const menu = new FakeMenu();
    const controller = createController(['rectangle-1', 'rectangle-2'], menu, workspace);
    openAt(controller, new FakeElement(['[data-base-screen-component-id]'], 'text-1'));

    expect(menu.innerHTML).toContain('data-menu-action="copy"');
    expect(menu.innerHTML).not.toContain('data-menu-action="align-left"');
  });

  it('shows the single-component menu on the selection box of a single selection', () => {
    const menu = new FakeMenu();
    const controller = createController(['rectangle-1'], menu, workspace);
    openAt(controller, new FakeElement(['[data-selection]']));

    expect(menu.innerHTML).toContain('data-menu-action="copy"');
    expect(menu.innerHTML).not.toContain('data-menu-action="align-left"');
  });

  it('keeps the canvas menu for blank canvas right-clicks', () => {
    const menu = new FakeMenu();
    const controller = createController(['rectangle-1', 'rectangle-2'], menu, workspace);
    openAt(controller, new FakeElement([]));

    expect(menu.innerHTML).toContain('data-menu-action="select-all"');
    expect(menu.innerHTML).toContain('data-menu-action="zoom-in"');
    expect(menu.innerHTML).not.toContain('data-menu-action="copy"');
  });

  it('anchors an oversized menu at the cursor instead of snapping to the origin', () => {
    const menu = new FakeMenu();
    menu.offsetHeight = 700;
    menu.offsetWidth = 240;
    const controller = createController(['rectangle-1', 'rectangle-2'], menu, workspace);
    openAt(
      controller,
      new FakeElement(['[data-base-screen-component-id]'], 'rectangle-1'),
      300,
      400,
    );

    expect(menu.style.left).toBe('300px');
    expect(menu.style.top).toBe('400px');
  });

  it('clamps an in-bounds menu to the workspace edges', () => {
    const menu = new FakeMenu();
    const controller = createController(['rectangle-1', 'rectangle-2'], menu, workspace);
    openAt(
      controller,
      new FakeElement(['[data-base-screen-component-id]'], 'rectangle-1'),
      790,
      590,
    );

    expect(menu.style.left).toBe('580px');
    expect(menu.style.top).toBe('360px');
  });
});
