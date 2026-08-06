import { contextMenuHtml, type DesignerContextMenuAction } from './designer-workspace.js';

export interface DesignerMenuControllerCallbacks {
  readonly getRoot: () => ShadowRoot | null;
  readonly getContextMenu: () => HTMLElement | undefined;
  readonly getOperationState: (
    id: string,
  ) => { readonly available: boolean; readonly enabled: boolean } | undefined;
}

export interface DesignerOperationStateShape {
  readonly available: boolean;
  readonly enabled: boolean;
}

// 画布右键菜单按右键目标动态组合：空白画布与组件上显示不同菜单。
const DESIGNER_CONTEXT_MENU = {
  canvas: [
    'undo',
    'redo',
    'separator',
    'select-all',
    'paste',
    'separator',
    'zoom-in',
    'zoom-out',
    'zoom-reset',
    'zoom-fit',
    'separator',
    'toggle-grid',
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
  component: [
    'undo',
    'redo',
    'separator',
    'copy',
    'paste',
    'delete',
    'separator',
    'group',
    'ungroup',
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
};

// 画布右键菜单与下拉菜单（含帮助面板）的 DOM 编排。只依赖根节点与操作状态查询，
// 不直接耦合元素或操作注册表。
export class DesignerMenuController {
  constructor(private readonly callbacks: DesignerMenuControllerCallbacks) {}

  toggleMenuFromTarget(target: Element): boolean {
    const toggle = target.closest<HTMLButtonElement>('[data-menu-toggle]');
    if (toggle === null) return false;
    const menuId = toggle.dataset.menuToggle;
    const root = this.callbacks.getRoot();
    if (menuId === undefined || root === null) return true;
    for (const menu of root.querySelectorAll<HTMLElement>('[data-menu]')) {
      const open = menu.dataset.menu === menuId && menu.hidden;
      menu.hidden = !open;
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]')) {
      control.ariaExpanded = String(
        control === toggle && !root.querySelector<HTMLElement>(`[data-menu="${menuId}"]`)?.hidden,
      );
    }
    return true;
  }

  closeMenus(): boolean {
    const root = this.callbacks.getRoot();
    if (root === null) return false;
    let closed = false;
    for (const menu of root.querySelectorAll<HTMLElement>('[data-menu]')) {
      if (!menu.hidden) {
        menu.hidden = true;
        closed = true;
      }
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]')) {
      control.ariaExpanded = 'false';
    }
    return closed;
  }

  openContextMenu(event: MouseEvent): void {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined) return;
    const workspace = this.callbacks.getRoot()?.querySelector<HTMLElement>('.workspace');
    if (workspace === null || workspace === undefined) return;
    const target = event.target;
    const onComponent =
      target instanceof Element && target.closest('[data-base-screen-component-id]') !== null;
    menu.innerHTML = contextMenuHtml(
      onComponent ? DESIGNER_CONTEXT_MENU.component : DESIGNER_CONTEXT_MENU.canvas,
    );
    this.renderContextMenuState();
    menu.hidden = false;
    const bounds = workspace.getBoundingClientRect();
    const left = event.clientX - bounds.left;
    const top = event.clientY - bounds.top;
    menu.style.left = `${Math.max(0, Math.min(left, bounds.width - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(top, bounds.height - menu.offsetHeight))}px`;
    menu.focus();
  }

  renderContextMenuState(): void {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined) return;
    for (const control of menu.querySelectorAll<HTMLButtonElement>('[data-menu-action]')) {
      const id = control.dataset.menuAction;
      if (id === undefined) continue;
      const state = this.callbacks.getOperationState(id);
      if (state !== undefined) {
        control.hidden = !state.available;
        control.disabled = !state.enabled;
      }
    }
  }

  closeContextMenu(): boolean {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined || menu.hidden) return false;
    menu.hidden = true;
    return true;
  }

  toggleHelpPanel(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const help = root.querySelector<HTMLElement>('[data-menu="help"]');
    if (help === null || help === undefined) return;
    const open = help.hidden;
    this.closeMenus();
    help.hidden = !open;
    if (open) help.focus();
    const toggle = root.querySelector<HTMLElement>('[data-menu-toggle="help"]');
    if (toggle !== null) toggle.ariaExpanded = String(open);
  }
}
