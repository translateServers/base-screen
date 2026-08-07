import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DesignerMenuController,
  type DesignerMenuControllerCallbacks,
} from '../../../src/browser/dom/designer-menu.js';
import { contextMenuHtml } from '../../../src/browser/dom/designer-workspace.js';

class FakeElement {
  readonly dataset: { baseScreenComponentId?: string };
  readonly chain: readonly string[];
  ariaExpanded: string | null = null;
  hidden = false;
  child: FakeElement | null = null;
  parent: FakeElement | null = null;
  offsetWidth = 0;
  offsetHeight = 0;
  readonly style: {
    left: string;
    right: string;
    top: string;
    bottom: string;
    maxHeight: string;
  } = {
    left: '',
    right: '',
    top: '',
    bottom: '',
    maxHeight: '',
  };
  readonly rect: DOMRectLike;
  constructor(
    chain: readonly string[] = [],
    componentId?: string,
    rect: DOMRectLike = { left: 0, top: 0, width: 0, height: 0 },
  ) {
    this.chain = chain;
    this.dataset = componentId === undefined ? {} : { baseScreenComponentId: componentId };
    this.rect = rect;
  }
  closest(selector: string): FakeElement | null {
    if (this.chain.includes(selector)) return this;
    return this.parent !== null ? this.parent.closest(selector) : null;
  }
  querySelector(selector: string): FakeElement | null {
    return this.child !== null && this.child.chain.includes(selector) ? this.child : null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return this.child !== null && this.child.chain.includes(selector) ? [this.child] : [];
  }
  getBoundingClientRect(): DOMRectLike {
    return this.rect;
  }
}

class FakeMenu extends FakeElement {
  innerHTML = '';
  override hidden = true;
  override offsetWidth = 220;
  override offsetHeight = 240;
  focus(): void {}
  override querySelectorAll(): FakeElement[] {
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

describe('DesignerMenuController submenu collapse behavior', () => {
  interface FakeSubmenu {
    hidden: boolean;
    readonly trigger: FakeElement;
    readonly items: readonly FakeElement[];
  }

  interface FakeMenubarRoot {
    host: { getBoundingClientRect(): DOMRectLike };
    querySelectorAll(selector: string): unknown[];
    querySelector(selector: string): unknown;
  }

  function createMenubarRoot(submenus: FakeSubmenu[]): FakeMenubarRoot {
    return {
      host: {
        getBoundingClientRect: (): DOMRectLike => ({ left: 0, top: 0, width: 800, height: 600 }),
      },
      querySelectorAll(selector: string): unknown[] {
        if (selector === '[data-menu]') return [];
        if (selector === '[data-submenu]') return submenus;
        if (selector === '[data-menu-toggle]') return [];
        if (selector === '[data-submenu-toggle]') return submenus.map((s) => s.trigger);
        return [];
      },
      querySelector(): unknown {
        return null;
      },
    } satisfies FakeMenubarRoot;
  }

  function submenu(): FakeSubmenu {
    const wrapper = new FakeElement(
      ['[data-submenu-toggle]', '.designer-menu-submenu-wrap'],
      undefined,
      { left: 520, top: 520, width: 120, height: 28 },
    );
    const menu = new FakeElement([
      '[data-submenu]',
      '.designer-menu-item:not(:disabled):not([hidden])',
    ]);
    wrapper.child = menu;
    menu.parent = wrapper;
    menu.hidden = true;
    return {
      get hidden(): boolean {
        return menu.hidden;
      },
      set hidden(value: boolean) {
        menu.hidden = value;
      },
      trigger: wrapper,
      items: [menu],
    };
  }

  it('expands and collapses a submenu on click toggle', () => {
    const submenus = [submenu()];
    const first = submenus[0]!;
    const controller = new DesignerMenuController({
      getRoot: () => createMenubarRoot(submenus) as unknown as ShadowRoot,
      getContextMenu: () => undefined,
      getSelectedComponentIds: () => [],
      getOperationState: () => undefined,
    });

    expect(controller.toggleMenuFromTarget(first.trigger as unknown as Element)).toBe(true);
    expect(first.hidden).toBe(false);
    expect(first.trigger.ariaExpanded).toBe('true');

    expect(controller.toggleMenuFromTarget(first.trigger as unknown as Element)).toBe(true);
    expect(first.hidden).toBe(true);
    expect(first.trigger.ariaExpanded).toBe('false');
  });

  it('expands on hover enter and collapses on hover leave', () => {
    const submenus = [submenu()];
    const first = submenus[0]!;
    const controller = new DesignerMenuController({
      getRoot: () => createMenubarRoot(submenus) as unknown as ShadowRoot,
      getContextMenu: () => undefined,
      getSelectedComponentIds: () => [],
      getOperationState: () => undefined,
    });

    controller.onSubmenuEnter(first.trigger as unknown as HTMLButtonElement);
    expect(first.hidden).toBe(false);
    expect(first.trigger.ariaExpanded).toBe('true');

    controller.onSubmenuLeave(first.trigger as unknown as HTMLButtonElement);
    expect(first.hidden).toBe(true);
    expect(first.trigger.ariaExpanded).toBe('false');
  });

  it('keeps a hover-open submenu open when the pointer click completes', () => {
    const submenus = [submenu()];
    const first = submenus[0]!;
    const controller = new DesignerMenuController({
      getRoot: () => createMenubarRoot(submenus) as unknown as ShadowRoot,
      getContextMenu: () => undefined,
      getSelectedComponentIds: () => [],
      getOperationState: () => undefined,
    });

    controller.onSubmenuEnter(first.trigger as unknown as HTMLButtonElement);
    controller.toggleMenuFromTarget(first.trigger as unknown as Element);
    expect(first.hidden).toBe(false);
    expect(first.trigger.ariaExpanded).toBe('true');

    controller.toggleMenuFromTarget(first.trigger as unknown as Element);
    expect(first.hidden).toBe(true);
  });

  it('keeps only one submenu open at a time within the same menu', () => {
    const first = submenu();
    const second = submenu();
    const root = createMenubarRoot([first, second]);
    const controller = new DesignerMenuController({
      getRoot: () => root as unknown as ShadowRoot,
      getContextMenu: () => undefined,
      getSelectedComponentIds: () => [],
      getOperationState: () => undefined,
    });

    controller.toggleMenuFromTarget(second.trigger as unknown as Element);
    expect(first.hidden).toBe(true);
    expect(second.hidden).toBe(false);
    expect(second.trigger.ariaExpanded).toBe('true');
  });

  it('keeps the submenu open when the pointer moves from the trigger onto a child item', () => {
    const submenus = [submenu()];
    const first = submenus[0]!;
    const controller = new DesignerMenuController({
      getRoot: () => createMenubarRoot(submenus) as unknown as ShadowRoot,
      getContextMenu: () => undefined,
      getSelectedComponentIds: () => [],
      getOperationState: () => undefined,
    });

    controller.onSubmenuEnter(first.trigger as unknown as HTMLButtonElement);
    expect(first.hidden).toBe(false);

    controller.onSubmenuPointerOut(
      first.trigger as unknown as HTMLButtonElement,
      first.items[0] as unknown as EventTarget,
    );
    expect(first.hidden).toBe(false);

    controller.onSubmenuPointerOut(first.trigger as unknown as HTMLButtonElement, null);
    expect(first.hidden).toBe(true);
  });

  it('flips a submenu upward and constrains its height near the bottom edge', () => {
    const submenus = [submenu()];
    const first = submenus[0]!;
    first.items[0]!.offsetHeight = 700;
    const controller = new DesignerMenuController({
      getRoot: () => createMenubarRoot(submenus) as unknown as ShadowRoot,
      getContextMenu: () => undefined,
      getSelectedComponentIds: () => [],
      getOperationState: () => undefined,
    });

    controller.onSubmenuEnter(first.trigger as unknown as HTMLButtonElement);

    expect(first.hidden).toBe(false);
    expect(first.trigger.ariaExpanded).toBe('true');
    expect(first.items[0]!.style.bottom).toBe('-1px');
    expect(first.items[0]!.style.top).toBe('auto');
    expect(first.items[0]!.style.maxHeight).toBe('540px');
  });
});

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
    expect(menu.innerHTML).toContain('data-submenu-toggle');
    expect(menu.innerHTML).not.toContain('data-menu-action="select-all"');
    expect(menu.innerHTML).not.toContain('data-menu-action="zoom-in"');
  });

  it('renders nested menu entries as accessible submenu controls', () => {
    const html = contextMenuHtml([
      {
        label: '排列',
        entries: ['align-left', 'separator', 'distribute-horizontal'],
      },
    ]);

    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('data-submenu');
    expect(html).toContain('data-menu-action="align-left"');
    expect(html).toContain('data-menu-action="distribute-horizontal"');
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
